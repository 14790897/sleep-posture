@echo off
rem Local convenience wrapper: Git Bash injects MSYSTEM, which breaks export.bat.
set "MSYSTEM="
if "%IDF_PATH%"=="" set "IDF_PATH=C:\Espressif\frameworks\esp-idf-v5.5.2"
call "%IDF_PATH%\export.bat"
if errorlevel 1 exit /b %errorlevel%

cd /d "%~dp0"
if not exist "sdkconfig" (
    idf.py set-target esp32c3
)
idf.py build
