# Use Node.js 18 slim as base image
FROM node:18-slim

# Set working directory early
WORKDIR /app

# Update apt and install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    rclone \
    git \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Removed: Alist installation
# Using direct Rclone WebDAV connection to Terabox instead
# Rclone is already installed via apt-get above

# Copy backend dependencies first (better layer caching)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production && npm cache clean --force

# Copy frontend files
COPY css ./css
COPY js ./js
COPY *.html ./
COPY *.md ./

# Copy backend application
COPY backend ./backend
COPY start.sh ./
COPY generate-rclone-config.js ./

# Rclone config will be generated at runtime from environment variables
# No need to copy rclone.conf (it's in .gitignore anyway)

# Ensure scripts are executable
RUN chmod +x /app/start.sh

# Create data directories
RUN mkdir -p /app/data/log /app/data/temp /app/backend/data/log /app/backend/data/temp

# Environment variables
# Cloud Run uses PORT environment variable (default 8080)
# But we keep 7860 as default for local/Hugging Face compatibility
ENV PORT=${PORT:-8080}
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=512

# Expose port (8080 for Cloud Run / Node backend)
# Rclone connects directly to Terabox WebDAV (no local service needed)
EXPOSE 8080

# Add Health Check for Cloud Run / Kubernetes environments
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/api/heartbeat || exit 1

# Note on Different Environments:
# - Cloud Run: Uses PORT env var (8080), Health check enabled
# - Hugging Face Spaces: Uses PORT=7860, relies on port binding
# - Local/K8s: Uses PORT env var, Health check enabled
# - The app handles all scenarios via PORT environment variable

# Start application
CMD ["/bin/bash", "/app/start.sh"]
