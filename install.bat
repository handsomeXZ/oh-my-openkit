@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "INSTALL_SCRIPT=%ROOT_DIR%script\install.ps1"

if not exist "%INSTALL_SCRIPT%" (
  echo install.ps1 was not found: %INSTALL_SCRIPT%
  if /I not "%OMO_INSTALL_NO_PAUSE%"=="1" pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Installer finished successfully.
) else (
  echo Installer failed with exit code %EXIT_CODE%.
)

if /I not "%OMO_INSTALL_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
