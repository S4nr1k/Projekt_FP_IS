"""Uruchomienie produkcyjne OrbitWatch przez serwer waitress.

Serwer deweloperski Flaska (python app.py) obsluguje zapytania pojedynczo i nie
nadaje sie na ruch publiczny. Waitress obsluguje wiele zapytan rownoczesnie
w watkach i dziala tak samo na Windows i Linux.

Uruchomienie:

    pip install waitress
    python serve.py

Liczbe watkow mozna ustawic zmienna srodowiskowa ORBITWATCH_THREADS
(domyslnie 8). Port zmienia ORBITWATCH_PORT (domyslnie 5000).
"""

import os
from waitress import serve
from app import app

if __name__ == "__main__":
    host    = os.environ.get("ORBITWATCH_HOST", "0.0.0.0")
    port    = int(os.environ.get("ORBITWATCH_PORT", "5000"))
    threads = int(os.environ.get("ORBITWATCH_THREADS", "8"))
    print(f"[waitress] start: http://{'127.0.0.1' if host in ('0.0.0.0', '127.0.0.1') else host}:{port}  (watkow: {threads}, Ctrl+C konczy)")
    # To uruchamia serwer produkcyjny obslugujacy wiele zapytan rownoczesnie
    serve(app, host=host, port=port, threads=threads)
