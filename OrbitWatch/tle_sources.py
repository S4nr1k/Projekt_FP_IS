"""Pobieranie danych TLE ze zrodel zewnetrznych (CelesTrak, Space-Track).

Ten modul zajmuje sie wylacznie sciaganiem i parsowaniem surowych danych
orbitalnych. Nie buduje katalogu ani nie obsluguje HTTP - to robi catalog.py
oraz app.py.
"""

import os
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

from satdb import get_info_bulk, load_config, ST_LOGIN, ST_BASE

# ---- Stale konfiguracyjne ----
CT_TIMEOUT = 8        # To ustawia limit czasu pojedynczego zapytania do CelesTrak
ST_TIMEOUT = 60       # To ustawia limit czasu pobierania calego katalogu Space-Track
HEADERS_CT = {"User-Agent": "OrbitWatch/1.0 (educational; contact: orbitwatch@example.com)"}
CT_BASE    = "https://celestrak.org/NORAD/elements/gp.php?GROUP={}&FORMAT=TLE"

# To buduje zapytanie do Space-Track o wszystkie obiekty z TLE nie starszym niz 30 dni
ST_TLE_URL = (ST_BASE
              + "/basicspacedata/query/class/gp/EPOCH/%3Enow-30"
              + "/orderby/NORAD_CAT_ID/format/3le")

# To okresla grupy CelesTrak i ich kategorie. Pokrywaja te same dane co
# Space-Track, ale CelesTrak ma zgode na publiczna redystrybucje.
FALLBACK_GROUPS = {
    "stations": "iss", "weather": "weather", "gps-ops": "gps",
    "glo-ops": "gps", "galileo": "gps", "beidou": "gps",
    "science": "science", "resource": "science", "planet": "science",
    "spire": "science", "satnogs": "science", "cubesat": "science",
    "sarsat": "science", "tdrss": "other", "argos": "other",
    "dmc": "science", "goes": "weather", "oneweb": "other",
    "iridium-NEXT": "other", "globalstar": "other", "intelsat": "other",
    "ses": "other", "telesat": "other", "geo": "other",
    "amateur": "other", "x-comm": "other", "other-comm": "other",
    "sbas": "gps", "nnss": "gps", "engineering": "science",
    "geodetic": "science", "education": "science",
    "starlink": "starlink", "active": "other",
    "cosmos-1408-debris": "other", "fengyun-1c-debris": "other",
    "iridium-33-debris": "other", "cosmos-2251-debris": "other",
    "last-30-days": "other",
}

# To przechowuje zalogowana sesje Space-Track miedzy zapytaniami
_st_session    = None
_st_session_ts = 0
_st_lock       = threading.Lock()

# To ustawia cache TLE na dysku. CelesTrak od 2026-03 wymusza jeden pobor
# na aktualizacje (co 2h) dla grup active/starlink - drugi zwraca HTTP 403.
CT_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".ct_cache")
CT_CACHE_TTL = 7200   # 2 godziny - tyle ile CelesTrak aktualizuje dane


# ---- Rozpoznawanie kategorii ----
def guess_cat(name):
    """To rozpoznaje kategorie satelity na podstawie jego nazwy."""
    n = name.upper()
    if "STARLINK" in n: return "starlink"
    if any(k in n for k in ("ISS", "ZARYA", "TIANGONG", "UNITY", "ZVEZDA", "DESTINY", "NAUKA")): return "iss"
    if any(k in n for k in ("NOAA", "GOES", "METOP", "METEOSAT", "HIMAWARI", "FENGYUN", "FY-", "MSG")): return "weather"
    if any(k in n for k in ("GPS", "GLONASS", "GALILEO", "BEIDOU", "NAVSTAR", "IRNSS", "QZSS")): return "gps"
    if any(k in n for k in ("HUBBLE", "HST", "TERRA", "AQUA", "AURA", "LANDSAT", "SENTINEL", "ICESAT",
                            "GRACE", "SWARM", "CRYOSAT", "JASON", "CLOUDSAT", "CALIPSO", "FLOCK",
                            "LEMUR", "DOVE", "CHEOPS", "AEOLUS", "FERMI", "SWIFT", "CHANDRA")): return "science"
    return "other"


# ---- Parser TLE ----
def parse_tle(text, default_cat="other"):
    """To parsuje tekst TLE (3-liniowy z nazwa lub 2-liniowy bez nazwy).

    Oba zrodla zwracaja format 3-liniowy (Space-Track z prefiksem "0 "). Brakujace nazwy
    sa uzupelniane z bazy SATCAT po sparsowaniu.
    """
    result = []
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("1 ") and len(line) >= 69:
            tle1 = line
            if i + 1 < len(lines) and lines[i + 1].startswith("2 "):
                tle2  = lines[i + 1]
                norad = tle1[2:7].strip()
                # Format 3-liniowy: poprzednia linia to nazwa
                name = ""
                if i > 0 and not lines[i - 1].startswith("1 ") and not lines[i - 1].startswith("2 "):
                    name = lines[i - 1].strip()
                    # To usuwa prefiks "0 " z linii nazwy w formacie 3LE Space-Track
                    if name.startswith("0 "):
                        name = name[2:].strip()
                result.append({"name": name, "norad": norad,
                               "cat": "other", "tle1": tle1, "tle2": tle2})
                i += 2
                continue
        i += 1

    # To uzupelnia brakujace nazwy z bazy SATCAT (jedno zapytanie dla wszystkich)
    if default_cat == "other":
        norads_missing = [d["norad"] for d in result if not d["name"]]
        if norads_missing:
            info_map = get_info_bulk(norads_missing)
            for d in result:
                if not d["name"]:
                    info = info_map.get(d["norad"].lstrip("0") or "0", {})
                    d["name"] = info.get("name") or (
                        info.get("obj_type_raw") == "ROCKET BODY" and f"R/B {d['norad']}" or
                        info.get("obj_type_raw") == "DEBRIS"      and f"DEB {d['norad']}"  or
                        f"OBJECT {d['norad']}"
                    )

    # To nadaje kategorie na podstawie ostatecznej nazwy
    for d in result:
        if default_cat != "other":
            d["cat"] = default_cat
        else:
            d["cat"] = guess_cat(d["name"])

    return result


# ---- Space-Track ----
def _get_st_session():
    """To zwraca zalogowana sesje Space-Track (loguje ponownie po 50 min)."""
    global _st_session, _st_session_ts
    with _st_lock:
        if _st_session and (time.time() - _st_session_ts) < 3000:
            return _st_session
        cfg  = load_config()
        user = cfg.get("spacetrack_user", "")
        pwd  = cfg.get("spacetrack_pass", "")
        if not user or not pwd:
            return None
        try:
            sess = requests.Session()
            r    = sess.post(ST_LOGIN,
                             data={"identity": user, "password": pwd},
                             timeout=20)
            if r.status_code != 200 or "Failed" in r.text:
                print(f"[ST] login failed: {r.text[:80]}")
                return None
            _st_session    = sess
            _st_session_ts = time.time()
            print("[ST] session created")
            return sess
        except Exception as e:
            print(f"[ST] login error: {e}")
            return None


def reset_st_session():
    """To kasuje sesje Space-Track, wymuszajac ponowne logowanie."""
    global _st_session, _st_session_ts
    _st_session = None
    _st_session_ts = 0


def fetch_st_tle():
    """To pobiera wszystkie TLE ze Space-Track (epoka nowsza niz 30 dni)."""
    sess = _get_st_session()
    if not sess:
        return []
    try:
        print("[ST] downloading TLE catalog (all objects, epoch <30d old)...")
        r = sess.get(ST_TLE_URL, timeout=ST_TIMEOUT)
        r.raise_for_status()
        if len(r.text.strip()) < 100:
            print(f"[ST] empty TLE response: {r.text[:80]}")
            return []
        data = parse_tle(r.text, "other")
        print(f"[ST] parsed {len(data)} TLEs")
        return data
    except Exception as e:
        print(f"[ST] TLE fetch error: {e}")
        return []


# ---- CelesTrak ----
def _ct_cache_path(group):
    """To zwraca sciezke pliku cache dla danej grupy CelesTrak."""
    return os.path.join(CT_CACHE_DIR, group.replace("/", "_") + ".tle")


def _ct_stale(cpath, cat):
    """To zwraca dane z cache nawet przeterminowanego (lepsze niz nic przy bledzie)."""
    try:
        if os.path.exists(cpath):
            with open(cpath, encoding="utf-8") as f:
                data = parse_tle(f.read(), cat)
            if data:
                print(f"[CT] using stale cache: {len(data)}")
            return data
    except Exception:
        pass
    return []


def fetch_ct(group, cat):
    """To pobiera jedna grupe CelesTrak, korzystajac z cache na dysku (2h)."""
    cpath = _ct_cache_path(group)
    # To probuje najpierw cache z dysku (swiezy ponizej 2h)
    try:
        if os.path.exists(cpath) and (time.time() - os.path.getmtime(cpath)) < CT_CACHE_TTL:
            with open(cpath, encoding="utf-8") as f:
                txt = f.read()
            data = parse_tle(txt, cat)
            if data:
                print(f"[CT] {group}: {len(data)} (cache)")
            return group, data
    except Exception:
        pass
    # To pobiera z sieci gdy brak swiezego cache
    url = CT_BASE.format(group)
    try:
        r = requests.get(url, headers=HEADERS_CT, timeout=CT_TIMEOUT)
        r.raise_for_status()
        if len(r.text.strip()) < 50 or "No GP data" in r.text:
            return group, []
        # To zapisuje pobrane dane do cache
        try:
            os.makedirs(CT_CACHE_DIR, exist_ok=True)
            with open(cpath, "w", encoding="utf-8") as f:
                f.write(r.text)
        except Exception:
            pass
        data = parse_tle(r.text, cat)
        if data:
            print(f"[CT] {group}: {len(data)}")
        return group, data
    except requests.exceptions.Timeout:
        print(f"[CT] {group}: timeout")
        return group, _ct_stale(cpath, cat)
    except Exception as e:
        print(f"[CT] {group}: {e}")
        # To uzywa starego cache przy bledzie (np. 403 od CelesTrak)
        return group, _ct_stale(cpath, cat)


def fetch_celestrak():
    """To pobiera pelny zestaw obiektow z CelesTrak (aktywne + szczatki)."""
    result, seen = [], set()

    def add(data):
        for d in data:
            if d["norad"] not in seen:
                seen.add(d["norad"])
                result.append(d)

    # To pobiera glowna mase obiektow: aktywne payloady i Starlink
    _, active = fetch_ct("active", "other")
    add(active)
    _, starlink = fetch_ct("starlink", "starlink")
    add(starlink)
    print(f"[CT] active+starlink: {len(result)}")

    # To dociaga grupy szczatkow i czlonow rakiet (nie sa w grupie 'active')
    debris_groups = [
        ("cosmos-1408-debris", "other"), ("fengyun-1c-debris", "other"),
        ("iridium-33-debris", "other"), ("cosmos-2251-debris", "other"),
        ("last-30-days", "other"), ("analyst", "other"),
    ]
    with ThreadPoolExecutor(max_workers=5) as ex:
        futures = {ex.submit(fetch_ct, g, c): g for g, c in debris_groups}
        for fut in as_completed(futures):
            _, data = fut.result()
            add(data)
    print(f"[CT] after debris groups: {len(result)}")

    # To jest awaryjne pobranie pozostalych grup gdy 'active' zawiodlo (np. 403)
    if len(active) < 500:
        print("[CT] active unavailable, fetching category groups...")
        groups = [(g, c) for g, c in FALLBACK_GROUPS.items()
                  if g not in ("active", "starlink")]
        for i in range(0, len(groups), 6):
            batch = groups[i:i + 6]
            with ThreadPoolExecutor(max_workers=6) as ex:
                futures = {ex.submit(fetch_ct, g, c): g for g, c in batch}
                for fut in as_completed(futures):
                    _, data = fut.result()
                    add(data)
            time.sleep(0.3)

    return result
