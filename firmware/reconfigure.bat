@echo off
rem Re-run CMake configure so idf_component.yml dependencies are resolved.
set "MSYSTEM="
if "%IDF_PATH%"=="" set "IDF_PATH=C:\Espressif\frameworks\esp-idf-v5.5.2"
call "%IDF_PATH%\export.bat"
if errorlevel 1 exit /b %errorlevel%

cd /d "%~dp0"
idf.py reconfigure
