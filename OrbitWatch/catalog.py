"""Budowanie katalogu satelitow z roznych zrodel i zarzadzanie cache.

Ten modul laczy dane z CelesTrak i Space-Track w jeden katalog, trzyma go
w pamieci podrecznej i pilnuje polityki redystrybucji (ktore zrodlo jest
aktywne). Pobieranie surowych danych robi tle_sources.py.
"""

import os
import time
import threading

from tle_extra import EXTRA_TLE
from satdb import has_credentials
from tle_sources import fetch_st_tle, fetch_celestrak, fetch_ct

# To ustawia interwal odswiezania danych orbitalnych (domyslnie 4h).
# TLE u zrodla aktualizowane sa 1-2 razy dziennie, czesciej nie ma sensu.
CACHE_TTL = int(os.environ.get("ORBITWATCH_REFRESH_SECONDS", "14400"))

# To grupuje wbudowane TLE wedlug kategorii (uzywane jako uzupelnienie)
BUNDLED_BY_CAT = {}
for _d in EXTRA_TLE:
    BUNDLED_BY_CAT.setdefault(_d["cat"], []).append(_d)

# To przechowuje zbudowany katalog w pamieci i jego znacznik czasu
_cache      = {}
_cache_lock = threading.Lock()
_build_lock = threading.Lock()

# To wymusza zrodlo danych: None=auto, "celestrak", "spacetrack" (ustawiane z UI)
_force_source = None


def build():
    """To buduje katalog satelitow (z cache) lacząc Space-Track i CelesTrak."""
    now = time.time()
    with _cache_lock:
        entry = _cache.get("__all__")
        if entry and (now - entry["ts"]) < CACHE_TTL:
            return entry["data"]

    with _build_lock:
        # To sprawdza cache ponownie po zajeciu blokady (inny watek mogl zbudowac)
        with _cache_lock:
            entry = _cache.get("__all__")
            if entry and (now - entry["ts"]) < CACHE_TTL:
                return entry["data"]

        result = []
        seen   = set()
        source = "celestrak"   # domyslnie CelesTrak (ma zgode na redystrybucje)

        def add(data):
            for d in data:
                if d["norad"] not in seen:
                    seen.add(d["norad"])
                    result.append(d)

        # To decyduje czy uzyc Space-Track (sa dane logowania i nie wymuszono CT)
        use_st = has_credentials() and _force_source != "celestrak"

        # To pobiera dane ze Space-Track jako pierwszy wybor
        if use_st:
            st_data = fetch_st_tle()
            if st_data:
                add(st_data)
                source = "spacetrack"   # dane z ST - redystrybucja ograniczona
                print(f"[build] Space-Track: {len(result)} objects")

        # To pobiera z CelesTrak gdy brak danych ST albo wymuszono CelesTrak
        if len(result) < 500:
            ct_data = fetch_celestrak()
            add(ct_data)
            source = "celestrak"
            print(f"[build] after CelesTrak: {len(result)} objects")
        else:
            # To dociaga z CelesTrak swieze TLE stacji i satelitow pogodowych
            for grp, cat in [("stations", "iss"), ("weather", "weather")]:
                _, d = fetch_ct(grp, cat)
                add(d)

        # To uzupelnia Starlink z danych wbudowanych gdy ich brakuje
        sl_count = sum(1 for d in result if d["cat"] == "starlink")
        if sl_count < 100:
            for d in BUNDLED_BY_CAT.get("starlink", []):
                if d["norad"] not in seen:
                    seen.add(d["norad"])
                    result.append(d)
            print("[build] Starlink supplemented from bundled")

        print(f"[build] total unique: {len(result)}")
        with _cache_lock:
            _cache["__all__"] = {"data": result, "ts": time.time()}
            _cache["__source__"] = source
        return result


def current_source():
    """To zwraca aktualne zrodlo danych (celestrak lub spacetrack)."""
    with _cache_lock:
        return _cache.get("__source__", "celestrak")


def get_force_source():
    """To zwraca wymuszone zrodlo (None gdy tryb automatyczny)."""
    return _force_source


def set_force_source(src):
    """To ustawia wymuszone zrodlo i czysci cache. Zwraca True przy sukcesie."""
    global _force_source
    if src == "auto":
        _force_source = None
    elif src in ("celestrak", "spacetrack"):
        _force_source = src
    else:
        return False
    with _cache_lock:
        _cache.pop("__all__", None)
    return True


def clear_cache():
    """To czysci caly cache katalogu (wymusza ponowne pobranie)."""
    with _cache_lock:
        _cache.clear()


def cache_info():
    """To zwraca wiek i liczbe obiektow w cache (None gdy pusty)."""
    with _cache_lock:
        entry = _cache.get("__all__")
        if entry:
            return {"age_s": int(time.time() - entry["ts"]),
                    "count": len(entry["data"])}
    return None
