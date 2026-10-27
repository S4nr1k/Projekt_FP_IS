"""Aplikacja Flask OrbitWatch - serwer HTTP i punkty koncowe API.

Ten plik definiuje wylacznie endpointy webowe i serwowanie frontendu.
Logike pobierania danych ma tle_sources.py, budowanie katalogu catalog.py,
a baze SATCAT satdb.py.
"""

import hmac
import os
import re
import threading
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from tle_extra import EXTRA_TLE
from satdb import (start_background_sync, get_info, get_info_bulk,
                   get_by_launch_site, set_credentials, has_credentials,
                   db_stats, _sync_satcat)
import catalog
from tle_sources import reset_st_session

# To wylacza automatyczne serwowanie calego katalogu projektu.
# Wczesniej static_folder="." udostepnial .env, config.json, satcat.db i kod
# backendu. Teraz pliki frontendu sa serwowane tylko z jawnie wskazanych folderow.
app = Flask(__name__, static_folder=None)
_BASE = os.path.dirname(os.path.abspath(__file__))
_FRONTEND_DIRS = ("js", "css", "vendor")

# ---- Konfiguracja bezpieczenstwa ----

# To okresla dozwolone domeny dla CORS. Domyslnie tylko lokalne (dev).
# Na produkcji ustaw zmienna ORBITWATCH_CORS_ORIGINS na wlasna domene.
_cors_origins = os.environ.get(
    "ORBITWATCH_CORS_ORIGINS",
    "http://localhost:5000,http://127.0.0.1:5000"
).split(",")
CORS(app, origins=[o.strip() for o in _cors_origins if o.strip()])

# To jest token administratora chroniacy endpointy zmieniajace stan.
# Ustaw ORBITWATCH_ADMIN_TOKEN na produkcji. Gdy pusty, endpointy POST sa
# dostepne tylko lokalnie (z tego samego hosta).
ADMIN_TOKEN = os.environ.get("ORBITWATCH_ADMIN_TOKEN", "")

# To rozpoznaje poprawny numer NORAD (1-9 cyfr, ewentualnie z zerami wiodacymi).
_norad_re = re.compile(r"^\d{1,9}$")
# To rozpoznaje poprawny kod kosmodromu (litery, cyfry, myslnik, do 16 znakow).
_site_re = re.compile(r"^[A-Za-z0-9\-]{1,16}$")


def _origin_ok():
    """To przepuszcza zadania bez naglowka Origin, z tego samego zrodla albo z listy CORS.

    Przegladarka dolacza Origin do kazdego zadania POST wyslanego przez skrypt
    lub formularz innej strony, wiec obca strona nie przejdzie tej kontroli (CSRF).
    """
    origin = request.headers.get("Origin")
    if not origin:
        return True
    return origin == request.host_url.rstrip("/") or origin in _cors_origins


def require_admin(fn):
    """To chroni endpoint: wymaga tokenu admina albo zadania z lokalnego hosta."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # To odrzuca zadania wyslane przez obce strony (ochrona przed CSRF)
        if not _origin_ok():
            return jsonify({"ok": False, "error": "cross-origin request rejected"}), 403
        # Gdy token skonfigurowany - wymagaj naglowka X-Admin-Token (porownanie w stalym czasie)
        if ADMIN_TOKEN:
            if not hmac.compare_digest(request.headers.get("X-Admin-Token", ""), ADMIN_TOKEN):
                return jsonify({"ok": False, "error": "unauthorized"}), 403
        else:
            # Bez tokenu - dopuszczaj tylko zadania z lokalnego hosta
            if request.remote_addr not in ("127.0.0.1", "::1", "localhost"):
                return jsonify({"ok": False, "error": "admin token required"}), 403
        return fn(*args, **kwargs)
    return wrapper


@app.after_request
def add_security_headers(resp):
    """To dodaje naglowki bezpieczenstwa do kazdej odpowiedzi."""
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # CSP: skrypty, fonty i tekstury wylacznie z wlasnego hosta (vendor/)
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "worker-src 'self' blob:"
    )
    # To ustawia cache przegladarki. Kod aplikacji (js/, css/) ma no-cache:
    # przegladarka przy kazdym wejsciu pyta, czy plik sie zmienil, i zwykle
    # dostaje krotka odpowiedz 304, wiec nowa wersja kodu dziala od razu.
    # Biblioteki, fonty i tekstury w vendor/ sie nie zmieniaja - cache 7 dni.
    # Odpowiedzi z bledem (np. 404 przed wygenerowaniem tekstur) nie moga byc
    # zapamietane, inaczej przegladarka podaje stary blad mimo istnienia pliku.
    path = request.path
    if resp.status_code >= 400:
        resp.headers["Cache-Control"] = "no-store"
    elif path.startswith("/js/") or path.startswith("/css/"):
        resp.headers["Cache-Control"] = "no-cache"
    elif path.startswith("/vendor/"):
        resp.headers["Cache-Control"] = "public, max-age=604800"
    return resp


# To wlacza ograniczenie liczby zapytan na adres IP (ochrona przed DoS i
# nadmiernym obciazeniem). Dziala gdy zainstalowano flask-limiter; bez niego
# aplikacja dziala dalej bez limitow (z ostrzezeniem w logu).
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["200 per minute"],
        storage_uri="memory://",
    )
    _has_limiter = True
except ImportError:
    print("[security] flask-limiter niezainstalowany - brak rate limitingu")
    limiter = None
    _has_limiter = False


def limit(rule):
    """To naklada limit na endpoint gdy limiter dostepny, inaczej nic nie robi."""
    def deco(fn):
        return limiter.limit(rule)(fn) if _has_limiter else fn
    return deco



# ---- Punkty koncowe: dane TLE ----
@app.route("/api/satellites")
@limit("30 per minute")
def satellites():
    """To zwraca pelny katalog satelitow (budowany z cache)."""
    return jsonify(catalog.build())


@app.route("/api/policy")
def policy():
    """To zwraca polityke redystrybucji - czy wolno eksportowac surowe TLE.

    Gdy dane pochodza ze Space-Track, eksport TLE jest zabroniony
    (redystrybucja wymaga zgody USSPACECOM). Dla CelesTrak jest dozwolony.
    """
    src = catalog.current_source()
    return jsonify({
        "source": src,
        "allow_tle_export": (src == "celestrak"),
        "spacetrack_available": has_credentials(),
        "forced": catalog.get_force_source(),
    })


@app.route("/api/source", methods=["POST"])
@require_admin
def set_source():
    """To przelacza zrodlo danych. Body: {"source": celestrak|spacetrack|auto}."""
    # To przyjmuje wylacznie JSON z naglowkiem application/json (wymusza kontrole CORS)
    if not request.is_json:
        return jsonify({"ok": False, "error": "application/json required"}), 415
    body = request.get_json(silent=True) or {}
    src = body.get("source", "auto")
    if not catalog.set_force_source(src):
        return jsonify({"ok": False, "error": "invalid source"}), 400
    return jsonify({"ok": True, "source": catalog.get_force_source() or "auto"})


@app.route("/api/satellites/bundled")
def satellites_bundled():
    """To zwraca wbudowane TLE (uzywane offline gdy brak sieci)."""
    return jsonify(EXTRA_TLE)


# ---- Punkty koncowe: informacje o satelitach ----
@app.route("/api/satinfo/<norad>")
def satinfo(norad):
    """To zwraca dane katalogowe jednego satelity po numerze NORAD."""
    if not _norad_re.match(norad):
        return jsonify({"error": "invalid norad"}), 400
    return jsonify(get_info(norad))


@app.route("/api/satinfo/bulk", methods=["POST"])
def satinfo_bulk():
    """To zwraca dane katalogowe dla wielu satelitow naraz."""
    norads = request.get_json(force=True) or []
    # To ogranicza wielkosc zapytania (ochrona przed nadmiernym obciazeniem)
    if not isinstance(norads, list) or len(norads) > 50000:
        return jsonify({"error": "invalid request"}), 400
    # To odrzuca numery o niepoprawnym formacie
    norads = [str(n) for n in norads if _norad_re.match(str(n))]
    return jsonify(get_info_bulk(norads))


@app.route("/api/launch_site/<site>")
def by_launch_site(site):
    """To zwraca liste satelitow wystrzelonych z danego kosmodromu."""
    if not _site_re.match(site):
        return jsonify({"error": "invalid site"}), 400
    return jsonify(get_by_launch_site(site, limit=2000))


# ---- Punkty koncowe: zarzadzanie Space-Track ----
@app.route("/api/spacetrack/credentials", methods=["POST"])
@require_admin
def st_credentials():
    """To zapisuje dane logowania Space-Track i uruchamia synchronizacje."""
    if not request.is_json:
        return jsonify({"ok": False, "error": "application/json required"}), 415
    body = request.get_json(silent=True) or {}
    user = body.get("user", "").strip()
    pwd  = body.get("password", "").strip()
    if not user or not pwd:
        return jsonify({"ok": False, "error": "user and password required"}), 400
    set_credentials(user, pwd)
    reset_st_session()      # To wymusza ponowne logowanie przy nastepnym zapytaniu
    catalog.clear_cache()   # To czysci cache aby pobrac dane ze Space-Track
    threading.Thread(target=_sync_satcat, daemon=True).start()
    return jsonify({"ok": True,
                    "message": "Credentials saved. SATCAT sync started. "
                               "TLE cache cleared - next satellite load will use Space-Track."})


@app.route("/api/spacetrack/status")
def st_status():
    """To zwraca stan bazy SATCAT (liczba obiektow, wiek danych)."""
    return jsonify(db_stats())


@app.route("/api/spacetrack/sync", methods=["POST"])
@require_admin
def st_sync():
    """To uruchamia synchronizacje katalogu SATCAT w tle."""
    if not has_credentials():
        return jsonify({"ok": False, "error": "No credentials configured"}), 400
    threading.Thread(target=_sync_satcat, daemon=True).start()
    return jsonify({"ok": True, "message": "SATCAT sync started"})


@app.route("/api/spacetrack/refresh_tle", methods=["POST"])
@require_admin
def st_refresh_tle():
    """To czysci cache TLE aby nastepne zapytanie pobralo swieze dane."""
    catalog.clear_cache()
    return jsonify({"ok": True, "message": "TLE cache cleared"})


# ---- Punkt koncowy: stan serwera ----
@app.route("/api/health")
def health():
    """To zwraca stan serwera, zrodlo danych i informacje o cache."""
    return jsonify({
        "status":     "ok",
        "tle_source": "space-track" if has_credentials() else "celestrak",
        "tle_cache":  catalog.cache_info(),
        "satdb":      db_stats(),
    })


@app.route("/")
def index():
    """To serwuje glowna strone aplikacji."""
    return send_from_directory(_BASE, "index.html")


@app.route("/<folder>/<path:filename>")
def frontend_file(folder, filename):
    """To serwuje pliki frontendu wylacznie z folderow js/, css/ i vendor/."""
    if folder not in _FRONTEND_DIRS:
        return jsonify({"error": "not found"}), 404
    return send_from_directory(os.path.join(_BASE, folder), filename)


# ---- Uruchomienie ----
start_background_sync()   # To uruchamia watek synchronizujacy SATCAT w tle

if __name__ == "__main__":
    # to pozwala zawezic nasluch do wlasnego komputera (ORBITWATCH_HOST=127.0.0.1)
    app.run(host=os.environ.get("ORBITWATCH_HOST", "0.0.0.0"),
            port=int(os.environ.get("ORBITWATCH_PORT", "5000")), debug=False)
