# OrbitWatch

Interaktywny symulator propagacji orbit satelitów na niskiej orbicie okołoziemskiej (LEO) w postaci aplikacji internetowej SPA. Aplikacja pokazuje w przeglądarce, na globusie 3D, aktualne położenie kilkunastu tysięcy obiektów. Położenia liczy algorytmem SGP4 z danych orbitalnych TLE.

Autor: Ihor Skrypnyk

## Wymagania

- Python 3.9 lub nowszy (https://www.python.org/downloads/). Na Windows przy instalacji zaznacz opcję „Add python.exe to PATH”.
- Przeglądarka z obsługą WebGL (Chrome, Edge, Firefox).
- Dostęp do internetu przy pierwszym uruchomieniu (instalacja bibliotek i pobranie danych z CelesTrak). Bez internetu aplikacja użyje wbudowanego zestawu około 500 satelitów.

## Uruchomienie

Rozpakuj archiwum, otwórz konsolę w folderze `OrbitWatch` i wpisz:

Windows (cmd lub PowerShell):

    start.bat

Linux lub macOS:

    ./start.sh

Skrypt przy pierwszym uruchomieniu tworzy w folderze środowisko `.venv` i instaluje do niego biblioteki z `requirements.txt` (trwa to około minuty). Następnie uruchamia serwer. Kolejne uruchomienia startują od razu.

Gdy w konsoli pojawi się adres, otwórz w przeglądarce:

    http://127.0.0.1:5000

Pierwsze pobranie katalogu z CelesTrak trwa kilkanaście sekund. Serwer zatrzymuje się klawiszami Ctrl+C.

## Uruchomienie ręczne

Jeśli skrypt nie zadziała, te same kroki można wykonać ręcznie:

    python -m venv .venv
    .venv\Scripts\activate          (Windows)
    source .venv/bin/activate       (Linux, macOS)
    pip install -r requirements.txt
    python serve.py

## Ustawienia (opcjonalne)

Aplikacja nie wymaga konfiguracji. Domyślnym źródłem danych jest publiczny serwis CelesTrak. Ustawienia przekazuje się zmiennymi środowiskowymi przed uruchomieniem, na przykład w cmd: `set ORBITWATCH_PORT=8080`.

| Zmienna | Znaczenie | Domyślnie |
|---|---|---|
| `ORBITWATCH_PORT` | port serwera | 5000 |
| `ORBITWATCH_HOST` | adres nasłuchu; `0.0.0.0` udostępnia aplikację w sieci lokalnej | 127.0.0.1 (w skryptach startowych) |
| `SPACETRACK_USER`, `SPACETRACK_PASS` | konto Space-Track.org, włącza źródło Space-Track i dane SATCAT | brak |

Danych logowania nie należy zapisywać w plikach przekazywanych innym osobom.

## Struktura

| Element | Rola |
|---|---|
| `app.py` | serwer Flask: API, nagłówki bezpieczeństwa, limit żądań |
| `catalog.py` | budowa katalogu obiektów i pamięć podręczna |
| `tle_sources.py` | pobieranie danych TLE z CelesTrak i Space-Track.org |
| `satdb.py` | lokalna baza SATCAT (SQLite) |
| `tle_extra.py` | wbudowany zestaw awaryjny danych TLE |
| `serve.py` | uruchomienie przez serwer Waitress |
| `index.html`, `css/`, `js/` | aplikacja w przeglądarce (propagacja SGP4 w Web Workerze, rendering WebGL) |
| `vendor/` | lokalne kopie biblioteki satellite.js, czcionki i tekstury Ziemi |

## Licencje

Zasady korzystania z aplikacji opisuje plik `LICENSE`. Komponenty zewnętrzne: satellite.js (MIT), czcionka JetBrains Mono (SIL OFL 1.1), tekstura Ziemi Solar System Scope (CC BY 4.0, https://www.solarsystemscope.com/textures), dane orbitalne CelesTrak i Space-Track.org.
