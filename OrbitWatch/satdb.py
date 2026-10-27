"""Baza danych satelitow oparta o katalog SATCAT ze Space-Track i lokalny SQLite.

Dane logowania Space-Track sa w pliku config.json (lub zmiennych srodowiskowych).
Katalog SATCAT synchronizuje sie raz dziennie w watku w tle.
Pozostale moduly pobieraja dane satelity przez get_info(norad).
"""

import sqlite3
import json
import os
import time
import threading
import requests

DB_PATH     = os.path.join(os.path.dirname(__file__), "satcat.db")
CFG_PATH    = os.path.join(os.path.dirname(__file__), "config.json")
# Interwal resync katalogu SATCAT (metadane: nazwy, daty startu). Zmienia sie
# rzadko, domyslnie 24h. Konfigurowalny przez env (te sama zmienna co odswiezanie).
SYNC_TTL    = int(os.environ.get("ORBITWATCH_SATCAT_REFRESH_SECONDS", "86400"))
ST_BASE     = "https://www.space-track.org"
ST_LOGIN    = ST_BASE + "/ajaxauth/login"
ST_SATCAT   = ST_BASE + "/basicspacedata/query/class/satcat/orderby/NORAD_CAT_ID/format/json"
ST_TIMEOUT  = 30

_db_lock    = threading.Lock()
_sync_thread = None


# ---- Schemat bazy ----
def _init_db():
    with sqlite3.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS satcat (
                norad       TEXT PRIMARY KEY,
                name        TEXT,
                obj_type    TEXT,    -- PAYLOAD / ROCKET BODY / DEBRIS / UNKNOWN
                country     TEXT,
                launch_date TEXT,
                launch_site TEXT,
                decay_date  TEXT,    -- NULL = still in orbit
                period_min  REAL,
                inc_deg     REAL,
                apogee_km   INTEGER,
                perigee_km  INTEGER,
                rcs_size    TEXT,    -- SMALL / MEDIUM / LARGE
                updated_at  INTEGER
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        con.commit()


def _get_meta(key):
    with sqlite3.connect(DB_PATH) as con:
        row = con.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else None


def _set_meta(key, value):
    with sqlite3.connect(DB_PATH) as con:
        con.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", (key, str(value)))
        con.commit()


# ---- Konfiguracja (dane logowania) ----
def load_config():
    # Najpierw zmienne srodowiskowe (zalecane na produkcji), potem plik config.json.
    # Env: SPACETRACK_USER, SPACETRACK_PASS. Sekrety nie trafiaja do repo.
    env_user = os.environ.get("SPACETRACK_USER")
    env_pass = os.environ.get("SPACETRACK_PASS")
    cfg = {}
    if os.path.exists(CFG_PATH):
        try:
            with open(CFG_PATH) as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
    if env_user:
        cfg["spacetrack_user"] = env_user
    if env_pass:
        cfg["spacetrack_pass"] = env_pass
    return cfg


def save_config(cfg):
    with open(CFG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)


def has_credentials():
    cfg = load_config()
    return bool(cfg.get("spacetrack_user") and cfg.get("spacetrack_pass"))


def set_credentials(user, password):
    cfg = load_config()
    cfg["spacetrack_user"] = user
    cfg["spacetrack_pass"] = password
    save_config(cfg)
    print("[satdb] credentials saved")


# ---- Synchronizacja ze Space-Track ----
def _sync_satcat():
    cfg = load_config()
    user = cfg.get("spacetrack_user", "")
    pwd  = cfg.get("spacetrack_pass", "")
    if not user or not pwd:
        print("[satdb] no Space-Track credentials - skipping sync")
        return False

    print("[satdb] syncing SATCAT from Space-Track.org ...")
    try:
        sess = requests.Session()
        r = sess.post(ST_LOGIN,
                      data={"identity": user, "password": pwd},
                      timeout=ST_TIMEOUT)
        if "Failed" in r.text or r.status_code != 200:
            print(f"[satdb] login failed: {r.text[:120]}")
            return False

        r2 = sess.get(ST_SATCAT, timeout=60)
        r2.raise_for_status()
        records = r2.json()
        print(f"[satdb] received {len(records)} SATCAT records")

        def _s(v):
            """To zwraca pusty string dla None, w innym wypadku obcina spacje."""
            return str(v).strip() if v is not None else ""

        now = int(time.time())
        rows = []
        for rec in records:
            norad = _s(rec.get("NORAD_CAT_ID"))
            if not norad:
                continue   # skip records without NORAD ID
            rows.append((
                norad,
                _s(rec.get("OBJECT_NAME")),
                _s(rec.get("OBJECT_TYPE")),
                _s(rec.get("COUNTRY")),
                rec.get("LAUNCH") or None,
                _s(rec.get("SITE")),
                rec.get("DECAY") or None,
                _f(rec.get("PERIOD")),
                _f(rec.get("INCLINATION")),
                _i(rec.get("APOGEE")),
                _i(rec.get("PERIGEE")),
                _s(rec.get("RCS_SIZE")),
                now,
            ))

        with _db_lock:
            with sqlite3.connect(DB_PATH) as con:
                con.executemany("""
                    INSERT OR REPLACE INTO satcat
                    (norad,name,obj_type,country,launch_date,launch_site,
                     decay_date,period_min,inc_deg,apogee_km,perigee_km,rcs_size,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, rows)
                con.commit()

        _set_meta("last_sync", now)
        print(f"[satdb] sync complete - {len(rows)} rows stored")
        return True

    except Exception as e:
        print(f"[satdb] sync error: {e}")
        return False


def _f(v):
    try:    return float(v)
    except: return None


def _i(v):
    try:    return int(v)
    except: return None


# ---- Harmonogram synchronizacji w tle ----
def _scheduler():
    while True:
        last = _get_meta("last_sync")
        age  = time.time() - float(last) if last else SYNC_TTL + 1
        if age >= SYNC_TTL:
            _sync_satcat()
        # Sprawdzaj co 15 min - pozwala na krotkie interwaly odswiezania (np. 4h)
        time.sleep(900)


def start_background_sync():
    global _sync_thread
    _init_db()
    if _sync_thread and _sync_thread.is_alive():
        return
    _sync_thread = threading.Thread(target=_scheduler, daemon=True)
    _sync_thread.start()
    print("[satdb] background sync thread started")


# ---- Publiczne funkcje zapytan ----
_info_cache      = {}
_info_cache_lock = threading.Lock()

COUNTRY_NAMES = {
    "US": "USA", "CIS": "Rosja", "PRC": "Chiny", "ESA": "ESA (Europa)",
    "FR": "Francja", "DE": "Niemcy", "UK": "Wielka Brytania",
    "JP": "Japonia", "IN": "Indie", "CA": "Kanada", "AU": "Australia",
    "IT": "Włochy", "ES": "Hiszpania", "NL": "Holandia", "SE": "Szwecja",
    "NO": "Norwegia", "BR": "Brazylia", "KR": "Korea Pd.", "IL": "Izrael",
    "AR": "Argentyna", "UAE": "ZEA", "SA": "Arabia Saudyjska",
    "TK": "Turcja", "PL": "Polska", "UA": "Ukraina", "ISS": "Stacja ISS",
}

TYPE_PL = {
    "PAYLOAD":     "Satelita",
    "ROCKET BODY": "Człon rakiety",
    "DEBRIS":      "Szczątki kosmiczne",
    "UNKNOWN":     "Nieznany",
    "TBA":         "Do ustalenia",
}

RCS_PL = {
    "SMALL":  "mały (<0.1 m²)",
    "MEDIUM": "średni (0.1–1 m²)",
    "LARGE":  "duży (>1 m²)",
}


def get_info(norad: str) -> dict:
    """To zwraca dane satelity dla podanego numeru NORAD, lub {} gdy brak w bazie."""
    norad = str(norad).strip().lstrip("0") or "0"
    # To uzupelnia numer do 5 znakow dla zapytania do bazy
    norad_padded = norad.zfill(5) if len(norad) < 5 else norad

    with _info_cache_lock:
        if norad_padded in _info_cache:
            return _info_cache[norad_padded]

    row = None
    try:
        with _db_lock:
            with sqlite3.connect(DB_PATH) as con:
                # To probuje numer z zerami i bez zer
                row = con.execute(
                    "SELECT * FROM satcat WHERE norad=? OR norad=?",
                    (norad_padded, norad)
                ).fetchone()
    except Exception:
        pass

    if not row:
        return {}

    (norad_db, name, obj_type, country, launch_date, launch_site,
     decay_date, period_min, inc_deg, apogee_km, perigee_km,
     rcs_size, updated_at) = row

    # To zamienia kod kraju na czytelna nazwe
    country_name = COUNTRY_NAMES.get(country, country) if country else ""

    info = {
        "norad":        norad_db,
        "name":         name or "",
        "obj_type":     TYPE_PL.get(obj_type, obj_type) if obj_type else "",
        "obj_type_raw": obj_type or "",
        "country":      country_name,
        "country_code": country or "",
        "launch_date":  launch_date or "",
        "launch_site":  launch_site or "",
        "decay_date":   decay_date or "",
        "active":       not bool(decay_date),
        "period_min":   period_min,
        "inc_deg":      inc_deg,
        "apogee_km":    apogee_km,
        "perigee_km":   perigee_km,
        "rcs_size":     RCS_PL.get(rcs_size, rcs_size) if rcs_size else "",
        "rcs_size_raw": rcs_size or "",
    }

    with _info_cache_lock:
        _info_cache[norad_padded] = info

    return info


def get_by_launch_site(site_code: str, limit: int = 2000) -> list:
    """To zwraca satelity wystrzelone z danego kosmodromu (np. 'AFETR').

    Zwraca liste slownikow posortowana: najpierw aktywne, potem wg daty startu malejaco.
    """
    if not site_code:
        return []
    rows = []
    try:
        with _db_lock:
            with sqlite3.connect(DB_PATH) as con:
                rows = con.execute(
                    "SELECT norad, name, launch_date, launch_site, decay_date, "
                    "apogee_km, perigee_km, obj_type FROM satcat "
                    "WHERE launch_site = ? "
                    "ORDER BY "
                    "  CASE WHEN decay_date IS NULL OR decay_date='' THEN 0 ELSE 1 END, "
                    "  launch_date DESC LIMIT ?",
                    (site_code, limit)
                ).fetchall()
    except Exception:
        pass
    result = []
    for (norad, name, launch_date, launch_site, decay_date,
         apogee_km, perigee_km, obj_type) in rows:
        result.append({
            "norad":       norad.lstrip("0") or "0",
            "name":        name or "",
            "launch_date": launch_date or "",
            "launch_site": launch_site or "",
            "decay_date":  decay_date or "",
            "active":      not bool(decay_date),
            "apogee_km":   apogee_km,
            "perigee_km":  perigee_km,
            "obj_type":    obj_type or "",
        })
    return result


def get_info_bulk(norads: list) -> dict:
    """To zwraca {norad: dane} dla listy numerow NORAD (szybsze niz get_info w petli)."""
    if not norads:
        return {}

    padded = [str(n).zfill(5) for n in norads]
    placeholders = ",".join("?" * len(padded))

    rows = []
    try:
        with _db_lock:
            with sqlite3.connect(DB_PATH) as con:
                rows = con.execute(
                    f"SELECT * FROM satcat WHERE norad IN ({placeholders})",
                    padded
                ).fetchall()
    except Exception:
        pass

    result = {}
    for row in rows:
        (norad_db, name, obj_type, country, launch_date, launch_site,
         decay_date, period_min, inc_deg, apogee_km, perigee_km,
         rcs_size, updated_at) = row
        country_name = COUNTRY_NAMES.get(country, country) if country else ""
        result[norad_db.lstrip("0") or "0"] = {
            "norad":        norad_db,
            "name":         name or "",
            "obj_type":     TYPE_PL.get(obj_type, obj_type) if obj_type else "",
            "obj_type_raw": obj_type or "",
            "country":      country_name,
            "country_code": country or "",
            "launch_date":  launch_date or "",
            "launch_site":  launch_site or "",
            "decay_date":   decay_date or "",
            "active":       not bool(decay_date),
            "period_min":   period_min,
            "inc_deg":      inc_deg,
            "apogee_km":    apogee_km,
            "perigee_km":   perigee_km,
            "rcs_size":     RCS_PL.get(rcs_size, rcs_size) if rcs_size else "",
            "rcs_size_raw": rcs_size or "",
        }
    return result


def db_stats() -> dict:
    try:
        with _db_lock:
            with sqlite3.connect(DB_PATH) as con:
                total   = con.execute("SELECT COUNT(*) FROM satcat").fetchone()[0]
                payloads = con.execute(
                    "SELECT COUNT(*) FROM satcat WHERE obj_type='PAYLOAD'"
                ).fetchone()[0]
                debris  = con.execute(
                    "SELECT COUNT(*) FROM satcat WHERE obj_type='DEBRIS'"
                ).fetchone()[0]
        last_sync = _get_meta("last_sync")
        age_h = round((time.time() - float(last_sync)) / 3600, 1) if last_sync else None
        return {
            "total": total, "payloads": payloads, "debris": debris,
            "last_sync_age_h": age_h,
            "has_credentials": has_credentials(),
        }
    except Exception as e:
        return {"error": str(e)}
