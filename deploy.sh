#!/bin/bash

# Deployment script to push to Hugging Face Spaces
# Usage: ./deploy.sh

set -e

echo "🚀 Pusat Arsip Anka - Hugging Face Deployment"
echo "=============================================="

# Check if git is configured
if ! git config user.name > /dev/null; then
    echo "❌ Git user not configured"
    echo "Please run:"
    echo "  git config user.email 'your-email@example.com'"
    echo "  git config user.name 'Your Name'"
    exit 1
fi

# Get HF username
read -p "Enter your Hugging Face username: " hf_username
HF_SPACE_URL="https://huggingface.co/spaces/${hf_username}/pusat-arsip-anka"

# Check if remote exists
if ! git remote | grep -q "^hf$"; then
    echo "📌 Adding Hugging Face remote..."
    git remote add hf "$HF_SPACE_URL"
else
    echo "📌 Updating Hugging Face remote..."
    git remote set-url hf "$HF_SPACE_URL"
fi

# Status check
echo ""
echo "📊 Git Status:"
git status --short || true

# Confirmation
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

# Clean before push
echo "🧹 Cleaning build artifacts..."
rm -rf backend/tmp/* 2>/dev/null || true

# Commit
echo "📝 Creating commit..."
git add .
git commit -m "Deployment: $(date '+%Y-%m-%d %H:%M:%S')" --allow-empty

# Push
echo "⬆️  Pushing to Hugging Face..."
git push -u hf main:main

echo ""
echo "✅ Deployment submitted!"
echo "📍 Space URL: $HF_SPACE_URL"
echo ""
echo "Next steps:"
echo "1. Check space logs at: $HF_SPACE_URL/logs"
echo "2. Wait for Docker build (usually 2-5 minutes)"
echo "3. Access app when status is 'Running'"
echo ""
echo "🔐 Don't forget to set environment variables in Space Settings!"
