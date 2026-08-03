@echo off
REM Deployment script for Hugging Face Spaces (Windows)
REM Usage: deploy.bat

setlocal enabledelayedexpansion

echo.
echo =========================================
echo  Pusat Arsip Anka - HF Deployment
echo =========================================
echo.

REM Check if git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git not found. Please install Git first.
    pause
    exit /b 1
)

REM Check git config
git config user.name >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git user not configured
    echo Please run:
    echo   git config user.email "your-email@example.com"
    echo   git config user.name "Your Name"
    pause
    exit /b 1
)

REM Get HF username
set /p hf_username="Enter your Hugging Face username: "
if "!hf_username!"=="" (
    echo ERROR: Username cannot be empty
    pause
    exit /b 1
)

set HF_SPACE_URL=https://huggingface.co/spaces/!hf_username!/e-arsipanka

echo.
echo Setting up Hugging Face remote...
git remote remove hf 2>nul
git remote add hf !HF_SPACE_URL!

echo.
echo Current git status:
git status --short

echo.
set /p confirm="Continue with deployment? (y/n): "
if /i not "!confirm!"=="y" (
    echo Deployment cancelled.
    exit /b 0
)

echo.
echo Cleaning up...
rmdir /s /q backend\tmp 2>nul
mkdir backend\tmp >nul 2>&1

echo.
echo Committing changes...
git add .
git commit -m "Deployment: %date% %time%" --allow-empty

echo.
echo Pushing to Hugging Face...
git push -u hf main

echo.
echo =========================================
echo  ✓ Deployment submitted!
echo =========================================
echo.
echo Space URL: !HF_SPACE_URL!
echo.
echo Next steps:
echo 1. Go to: !HF_SPACE_URL!/logs
echo 2. Wait for Docker build (2-5 minutes)
echo 3. Set environment variables in Space Settings:
echo    - SUPABASE_URL
echo    - SUPABASE_SERVICE_ROLE_KEY
echo    - JWT_SECRET
echo    - PORT (7860)
echo    - NODE_ENV (production)
echo.
echo 4. Access app when status is "Running"
echo.
pause
