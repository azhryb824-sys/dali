@echo off
setlocal enabledelayedexpansion

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" exit /b 10

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALL=%%i"
if not defined VS_INSTALL exit /b 11

call "%VS_INSTALL%\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 12

if not exist "%~dp0bin" mkdir "%~dp0bin"

cl.exe /nologo /std:c++20 /permissive- /EHsc /O2 /MT /DUNICODE /D_UNICODE ^
  "%~dp0DaliNativeShare.cpp" ^
  /Fo:"%~dp0bin\DaliNativeShare.obj" ^
  /Fe:"%~dp0bin\DaliNativeShare.exe" ^
  /link /SUBSYSTEM:WINDOWS windowsapp.lib user32.lib shell32.lib crypt32.lib
if errorlevel 1 exit /b 13

if not exist "%~dp0bin\DaliNativeShare.exe" exit /b 14
exit /b 0
