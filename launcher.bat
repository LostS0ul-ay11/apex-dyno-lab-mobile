@echo off
title Apex Dyno Lab - Iniciar Servidor
cd /d "%~dp0"

echo ============================================================
echo           APEX DYNO LAB - SERVIDOR LOCAL
echo ============================================================
echo.
echo Iniciando o servidor na porta 8181...
echo.

:: Abre o navegador automaticamente apos 1 segundo
start "" "http://localhost:8181/index.html"

:: Mantem o servidor ativo na janela
python -m http.server 8181
pause
