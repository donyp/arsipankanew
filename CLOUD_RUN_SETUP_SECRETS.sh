#!/bin/bash
# Setup Google Cloud Secrets for arsip-anka
# Run this script to create all required secrets in Secret Manager

set -e

PROJECT_ID="arsipanka"
REGION="asia-southeast1"

echo "════════════════════════════════════════════════════════════"
echo "Google Cloud Secret Manager Setup"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID
echo ""

# Enable Secret Manager API
echo "Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com
echo ""

# Function to create secret
create_secret() {
    local secret_name=$1
    local prompt_text=$2
    
    echo "Creating secret: $secret_name"
    echo "Prompt: $prompt_text"
    
    # Check if secret already exists
    if gcloud secrets describe $secret_name &> /dev/null; then
        echo "  Secret already exists. Creating new version..."
        read -sp "  Enter value: " secret_value
        echo ""
        echo "$secret_value" | gcloud secrets versions add $secret_name --data-file=-
    else
        echo "  Secret does not exist. Creating..."
        read -sp "  Enter value: " secret_value
        echo ""
        echo "$secret_value" | gcloud secrets create $secret_name --data-file=-
    fi
    
    echo "✓ Secret created: $secret_name"
    echo ""
}

# Create all required secrets
echo "════════════════════════════════════════════════════════════"
echo "Creating Supabase Secrets"
echo "════════════════════════════════════════════════════════════"
echo ""

create_secret "arsip-supabase-url" \
    "Enter SUPABASE_URL (find in Supabase dashboard → Settings → API → Project URL)"

create_secret "arsip-supabase-key" \
    "Enter SUPABASE_SERVICE_ROLE_KEY (find in Supabase dashboard → Settings → API → service_role secret key)"

create_secret "arsip-jwt-secret" \
    "Enter JWT_SECRET (same as your current .env)"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "Creating Rclone/Terabox Secrets"
echo "════════════════════════════════════════════════════════════"
echo ""

create_secret "arsip-terabox-url" \
    "Enter TERABOX_WEBDAV_URL (your Terabox WebDAV URL)"

create_secret "arsip-terabox-user" \
    "Enter TERABOX_USER (your Baidu/Terabox username)"

create_secret "arsip-terabox-pass" \
    "Enter TERABOX_PASS (your Terabox password)"

create_secret "arsip-terabox-crypt" \
    "Enter TERABOX_CRYPT_PASSWORD (encryption password for Terabox)"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✓ All secrets created successfully!"
echo "════════════════════════════════════════════════════════════"
echo ""

# List created secrets
echo "Created secrets:"
gcloud secrets list --filter="name:arsip-*" --format="table(name,created)"
echo ""

echo "You can now proceed with Cloud Run deployment using:"
echo "  ./CLOUD_RUN_DEPLOYMENT_SCRIPT.ps1"
echo ""
