@echo off
REM Jarvis Console - Windows Launcher
REM Downloads embedded Python, creates .venv, installs requirements, runs http server.

setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=%JARVIS_PORT%"
if "%PORT%"=="" set "PORT=8080"

echo.
echo ============================================================
echo   Jarvis Console - Windows Launcher
echo ============================================================
echo.

REM Check if embedded Python exists and is functional
if exist "python-embedded\python.exe" (
    echo [INFO] Embedded Python found, verifying installation...
    python-embedded\python.exe --version >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Embedded Python found but not functional. Reinstalling...
        goto :download_python
    )
    REM Verify python311._pth is configured correctly (critical for venv module)
    findstr /C:"import site" "python-embedded\python311._pth" >nul 2>&1
    if errorlevel 1 (
        echo [WARN] python311._pth not configured correctly. Reconfiguring...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content 'python-embedded\python311._pth') -replace '#import site', 'import site' | Set-Content 'python-embedded\python311._pth'"
    )
    python-embedded\python.exe -m pip --version >nul 2>&1
    if errorlevel 1 (
        echo [WARN] Pip not found in embedded Python. Installing pip...
        goto :install_pip
    )
    echo [INFO] Embedded Python is ready
    goto :ensure_venv
)

:download_python

REM Embedded Python not found - download it automatically
echo [INFO] Embedded Python not found. Downloading automatically...
echo.

if not exist "python-embedded" mkdir python-embedded

echo [INFO] Downloading Python 3.11.7 Embedded (64-bit)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.7/python-3.11.7-embed-amd64.zip' -OutFile 'python-embedded.zip'"

if not exist "python-embedded.zip" (
    echo [ERROR] Failed to download Python!
    echo Please check your internet connection and try again.
    pause
    exit /b 1
)

echo [INFO] Extracting Python...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'python-embedded.zip' -DestinationPath 'python-embedded' -Force"
del python-embedded.zip

echo [INFO] Configuring embedded Python...
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content 'python-embedded\python311._pth') -replace '#import site', 'import site' | Set-Content 'python-embedded\python311._pth'"

:install_pip
echo [INFO] Installing pip...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'python-embedded\get-pip.py'"
if errorlevel 1 (
    echo [ERROR] Failed to download get-pip.py!
    echo Please check your internet connection.
    pause
    exit /b 1
)

python-embedded\python.exe python-embedded\get-pip.py
if errorlevel 1 (
    echo [ERROR] Failed to install pip!
    pause
    exit /b 1
)
del python-embedded\get-pip.py

echo [INFO] Embedded Python installed successfully!
echo.

:ensure_venv
if not exist ".venv\Scripts\python.exe" (
    echo [INFO] Creating virtual environment...
    python-embedded\python.exe -m venv .venv
    if errorlevel 1 (
        echo [WARN] venv failed. Installing virtualenv...
        python-embedded\python.exe -m pip install virtualenv --quiet --no-warn-script-location
        python-embedded\python.exe -m virtualenv .venv
    )
)

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Failed to create .venv
    pause
    exit /b 1
)

echo [INFO] Installing requirements...
if exist "requirements.txt" (
    .venv\Scripts\python.exe -m pip install --upgrade pip --quiet --no-warn-script-location
    if errorlevel 1 (
        echo [ERROR] Failed to upgrade pip.
        pause
        exit /b 1
    )
    .venv\Scripts\python.exe -m pip install -r requirements.txt --quiet --no-warn-script-location --only-binary :all:
    if errorlevel 1 (
        echo [ERROR] Failed to install base requirements.
        pause
        exit /b 1
    )
)

if /I "%JARVIS_IDENTITY%"=="1" (
    if exist "requirements-identity.txt" (
        echo [INFO] Installing identity requirements...
        .venv\Scripts\python.exe -m pip install -r requirements-identity.txt --quiet --no-warn-script-location --only-binary :all:
        if errorlevel 1 (
            echo [ERROR] Failed to install identity requirements.
            pause
            exit /b 1
        )
    )
)

echo [INFO] Starting Jarvis Console at http://localhost:%PORT%
echo.
.venv\Scripts\python.exe jarvis_app.py --port %PORT%

endlocal
