@echo off
:: hosts-toggle.bat — Toggle proxy redirect no hosts
:: USO: Executar como Administrador

setlocal enabledelayedexpansion

set "PROXY_IP=192.168.1.86"
set "HOSTNAME=lt-account-01.gnjoylatam.com"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "ENTRY=%PROXY_IP% %HOSTNAME%"
set "FOUND=0"
set "TMPFILE=%TEMP%\hosts_tmp_%RANDOM%.txt"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERRO] Executar como Administrador!
    pause
    exit /b 1
)

findstr /i /c:"%HOSTNAME%" "%HOSTS%" >nul 2>&1
if %errorlevel% equ 0 set "FOUND=1"

if "%FOUND%"=="1" (
    echo.
    echo  [*] Removendo entrada do hosts...
    type nul ^> "%TMPFILE%"
    for /f "usebackq delims=" %%L in ("%HOSTS%") do (
        echo %%L ^| findstr /i /c:"%HOSTNAME%" ^>nul 2^>^&1
        if errorlevel 1 echo %%L^>^>"%TMPFILE%"
    )
    copy /y "%TMPFILE%" "%HOSTS%" >nul
    del "%TMPFILE%" >nul 2>&1
    echo  [OK] Proxy DESATIVADO
    ipconfig /flushdns >nul 2>&1
    echo  [*] DNS limpo.
) else (
    echo.
    echo  [*] Adicionando entrada no hosts...
    echo.>>"%HOSTS%"
    echo %ENTRY%>>"%HOSTS%"
    echo  [OK] Proxy ATIVADO
    ipconfig /flushdns >nul 2>&1
    echo  [*] DNS limpo.
)

echo.
echo  Estado atual:
findstr /i "gnjoy" "%HOSTS%" 2>nul
if %errorlevel% neq 0 echo  (nenhuma entrada gnjoy)
echo.
pause