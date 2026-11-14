@echo off
title Activador Windows 10
color 0A

echo ============================================
echo        ACTIVADOR DE WINDOWS 10
echo ============================================
echo.
echo Selecciona tu version de Windows 10:
echo.
echo  [1] Windows 10 Home
echo  [2] Windows 10 Pro
echo  [3] Windows 10 Enterprise
echo  [4] Windows 10 Education
echo  [5] Windows 10 Enterprise LTSB
echo  [6] Windows 10 Enterprise LTSC
echo.
set /p opcion="Ingresa el numero de tu opcion (1-6): "

if "%opcion%"=="1" set CLAVE=TX9XD-98N7V-6WMQ6-BX7FG-H8Q99
if "%opcion%"=="2" set CLAVE=W269N-WFGWX-YVC9B-4J6C9-T83GX
if "%opcion%"=="3" set CLAVE=NPPR9-FWDCX-D2C8J-H872K-2YT43
if "%opcion%"=="4" set CLAVE=NW6C2-QMPVW-D7KKK-3GKT6-VCFB2
if "%opcion%"=="5" set CLAVE=WNMTR-4C88C-JK8YV-HQ7T2-76DF9
if "%opcion%"=="6" set CLAVE=M7XTQ-FN8P6-TTKYV-9D4CC-J462D

if "%CLAVE%"=="" (
    echo.
    echo  [!] Opcion invalida. Ejecuta el archivo de nuevo.
    pause
    exit
)

echo.
echo ============================================
echo  Iniciando activacion...
echo ============================================
echo.

echo [1/3] Instalando clave de producto...
slmgr /ipk %CLAVE%
timeout /t 5 /nobreak >nul

echo.
echo [2/3] Configurando servidor KMS...
slmgr /skms kms.digiboy.ir
timeout /t 5 /nobreak >nul

echo.
echo [3/3] Activando Windows...
slmgr /ato
timeout /t 5 /nobreak >nul

echo.
echo ============================================
echo  Proceso completado.
echo ============================================
timeout /t 3 /nobreak >nul
exit
