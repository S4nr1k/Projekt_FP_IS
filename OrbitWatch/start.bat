@echo off
rem To uruchamia OrbitWatch na Windows: tworzy srodowisko .venv, instaluje biblioteki i startuje serwer
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
if not exist .venv (
    echo Tworze srodowisko .venv...
    %PY% -m venv .venv || goto blad
    .venv\Scripts\python -m pip install --upgrade pip >nul
    .venv\Scripts\python -m pip install -r requirements.txt || goto blad
)
if "%ORBITWATCH_HOST%"=="" set ORBITWATCH_HOST=127.0.0.1
echo Otworz w przegladarce: http://127.0.0.1:5000
.venv\Scripts\python serve.py
goto :eof
:blad
echo Blad. Sprawdz, czy jest zainstalowany Python 3.9 lub nowszy.
pause
