#!/bin/bash

# Pusat Arsip Anka - Startup Script
# This script starts the Node.js backend with Rclone WebDAV (no Alist service)

echo "=========================================="
echo "Starting Pusat Arsip Anka"
echo "=========================================="

# Create necessary directories
mkdir -p /app/data/log
mkdir -p /app/data/temp
mkdir -p /app/backend/data/log
mkdir -p /app/backend/data/temp
mkdir -p /app/backend/tmp
chmod 777 /app/data /app/data/log /app/data/temp /app/backend/tmp

# Export PORT for Hugging Face (default 7860) / Cloud Run (8080)
export PORT=${PORT:-7860}
export NODE_ENV=production

echo "[INIT] PORT is set to: $PORT"
echo "[INIT] NODE_ENV is set to: $NODE_ENV"

# Generate rclone.conf from environment variables
echo "[INIT] Generating rclone.conf from environment variables..."
node /app/generate-rclone-config.js

# Function to clean up processes
cleanup() {
    echo "[SHUTDOWN] Cleaning up processes..."
    exit 0
}

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT

# Navigate to backend and start Node server
echo "[INIT] Starting Node.js backend server..."
cd /app/backend

# Start Node in foreground
# Rclone will connect directly to Terabox WebDAV (no Alist middleware)
node server.js 2>&1

# Node exited, clean up and exit
echo "[SHUTDOWN] Node.js server exited"
cleanup
