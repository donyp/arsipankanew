@echo off
title Pusat Arsip Anka - Localhost Manager
echo Memulai semua server localhost (Alist, Backend, Frontend)...

:: Start Alist Server
echo Starting Alist...
start "Alist (Port 5244)" cmd /k "cd /d "%~dp0" && .\alist\alist.exe server"

:: Start Backend API
echo Starting Backend API...
start "Backend (Port 4000)" cmd /k "cd /d "%~dp0backend" && node server.js"

:: Start Frontend UI
echo Starting Frontend...
start "Frontend (Port 3000)" cmd /k "cd /d "%~dp0" && node static_server.js"

echo.
echo ====================================================
echo Semua layanan sedang dijalankan di jendela terpisah!
echo.
echo 🌐 Akses melalui browser:
echo - Frontend Aplikasi    : http://localhost:3000
echo - Backend API          : http://localhost:4000
echo - Alist Drive Manager  : http://localhost:5244
echo.
echo Untuk mematikan server, cukup tutup/silang (X) jendela terminal hitam yang muncul.
echo ====================================================
pause
