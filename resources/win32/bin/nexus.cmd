@echo off
REM 无独立原生启动器二进制，ELECTRON_RUN_AS_NODE 直跑 tsc 编译的 CLI。
REM 布局：shim 位于 <appOutDir>\resources\bin\，主程序在 <appOutDir>\nexus-scaffold.exe。
setlocal
set "SCRIPT_DIR=%~dp0"
set "ELECTRON=%SCRIPT_DIR%..\..\nexus-scaffold.exe"
set "CLI=%SCRIPT_DIR%..\app.asar.unpacked\out\cli\index.js"

if not exist "%ELECTRON%" (
  echo Unable to locate the Nexus executable at "%ELECTRON%" 1>&2
  exit /b 1
)
if not exist "%CLI%" (
  echo Unable to locate the Nexus CLI entry at "%CLI%" 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
"%ELECTRON%" "%CLI%" %*
exit /b %ERRORLEVEL%
