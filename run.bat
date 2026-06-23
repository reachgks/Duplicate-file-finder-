@echo off
title DocuFlow Bootstrapper
echo ==============================================================
echo           DocuFlow: AI Document Organizer ^& Renamer
echo ==============================================================
echo.

:: Check for Python
where python >nul 2>nul
if %errorlevel% equ 0 goto python_ok
echo [ERROR] Python was not found on your system!
echo Please install Python 3.8 or newer (and check "Add Python to PATH" during install).
echo Download: https://www.python.org/downloads/
echo.
pause
exit /b 1

:python_ok
:: Create Virtual Environment if not exists
if exist ".venv" goto venv_ok
echo Creating Python Virtual Environment .venv...
python -m venv .venv
if %errorlevel% equ 0 goto venv_ok
echo [ERROR] Failed to create virtual environment.
pause
exit /b 1

:venv_ok
:: Install Dependencies
echo Activating Virtual Environment and Installing Dependencies...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r backend\requirements.txt
if %errorlevel% equ 0 goto pip_ok
echo [ERROR] Failed to install dependencies from backend\requirements.txt
pause
exit /b 1

:pip_ok
echo.
echo Launching DocuFlow Application...
:: Background task: wait 3 seconds for server to start, then open standard browser
start /b cmd /c "ping 127.0.0.1 -n 4 > nul && start http://127.0.0.1:8000"

:: Start Uvicorn Server
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
