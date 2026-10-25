@echo off
title Apex Dyno Lab - Mobile Server
cd /d "%~dp0"

echo ============================================================
echo   APEX DYNO LAB - MOBILE PWA SERVER
echo ============================================================
echo.

:: Get local IP address so user can connect from phone
echo Detectando o IP da sua rede local (Wi-Fi)...
set "LOCAL_IP=localhost"
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0.*0.0.0.0') do (
    set "LOCAL_IP=%%a"
)

echo.
echo ============================================================
echo   COMO ABRIR NO CELULAR (MESMO WI-FI):
echo   Abra o navegador do seu celular e acesse:
echo.
echo        http://%LOCAL_IP%:8282/index.html
echo.
echo   Ou no seu computador:
echo        http://localhost:8282/index.html
echo ============================================================
echo.
echo Pressione CTRL+C para parar o servidor.
echo.

python -m http.server 8282 --bind 0.0.0.0
pause
