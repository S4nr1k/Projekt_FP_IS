#!/usr/bin/env sh
# To uruchamia OrbitWatch na Linux i macOS: tworzy srodowisko .venv, instaluje biblioteki i startuje serwer
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
    echo "Tworze srodowisko .venv..."
    python3 -m venv .venv
    .venv/bin/python -m pip install --upgrade pip >/dev/null
    .venv/bin/python -m pip install -r requirements.txt
fi
export ORBITWATCH_HOST="${ORBITWATCH_HOST:-127.0.0.1}"
echo "Otworz w przegladarce: http://127.0.0.1:5000"
exec .venv/bin/python serve.py
