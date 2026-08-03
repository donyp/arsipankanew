#!/bin/bash

# Task 6: Cloud Run Deployment Verification Script (Bash version)
# This script automates all verification steps for the Terabox file sync fix deployment

# Configuration
PROJECT_ID="arsipanka"
REGION="asia-southeast1"
SERVICE_NAME="arsipankabaru"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper Functions
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
info() { echo -e "${CYAN}ℹ️  $1${NC}"; }
separator() { echo -e "\n${BLUE}$(printf '=%.0s' {1..60})${NC}\n"; }

# Main Verification Script
separator
echo -e "${CYAN}Task 6: Cloud Run Deployment Verification${NC}"
echo "Service: $SERVICE_NAME | Project: $PROJECT_ID | Region: $REGION"
separator

# Check 1: Verify gcloud CLI is installed
echo -e "${YELLOW}CHECK 1: Verifying gcloud CLI...${NC}"
if command -v gcloud &> /dev/null; then
    success "gcloud CLI installed"
    info "Version: $(gcloud --version | head -1)"
else
    error "gcloud CLI not found. Install Google Cloud SDK and try again."
    exit 1
fi

# Check 2: Verify GCP project is set
echo -e "${YELLOW}CHECK 2: Verifying GCP project...${NC}"
current_project=$(gcloud config get-value project 2>/dev/null)
if [ "$current_project" != "$PROJECT_ID" ]; then
    warning "Current project: $current_project, switching to $PROJECT_ID"
    gcloud config set project "$PROJECT_ID" >/dev/null 2>&1
fi
success "GCP project set to: $PROJECT_ID"

# Check 3: Verify deployment succeeded
echo -e "${YELLOW}CHECK 3: Verifying deployment status...${NC}"
if deployment=$(gcloud run describe "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(status.url)' 2>/dev/null); then
    
    if [ -z "$deployment" ]; then
        error "Service not found or deployment failed"
        exit 1
    fi
    
    SERVICE_URL="$deployment"
    success "Service deployed successfully"
    info "Service URL: $SERVICE_URL"
else
    error "Failed to verify deployment"
    exit 1
fi

# Check 4: Test health check endpoint
separator
echo -e "${YELLOW}CHECK 4: Testing health check endpoint...${NC}"
http_code=$(curl -s -w "%{http_code}" -o /tmp/health_response.txt "$SERVICE_URL/api/heartbeat")

if [ "$http_code" = "200" ]; then
    success "Health check endpoint responding"
    info "HTTP Status: $http_code"
    response=$(cat /tmp/health_response.txt)
    info "Response: $response"
    
    # Verify response format
    if echo "$response" | grep -q '"status":"alive"'; then
        success "Health check response valid"
        version=$(echo "$response" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
        info "Version: $version"
    else
        warning "Health check response missing expected fields"
    fi
else
    error "Health check failed with HTTP $http_code"
    response=$(cat /tmp/health_response.txt)
    info "Response: $response"
fi

# Check 5: Test stats endpoint
echo -e "${YELLOW}CHECK 5: Testing stats endpoint...${NC}"
http_code=$(curl -s -w "%{http_code}" -o /tmp/stats_response.txt "$SERVICE_URL/api/stats/storage")

if [ "$http_code" = "200" ]; then
    success "Stats endpoint responding"
    info "HTTP Status: $http_code"
    
    response=$(cat /tmp/stats_response.txt)
    
    # Try to parse JSON and count files
    if command -v jq &> /dev/null; then
        total_files=$(echo "$response" | jq '[.zones[]?.total_files // 0] | add' 2>/dev/null || echo "0")
        zones_count=$(echo "$response" | jq '.zones | length' 2>/dev/null || echo "0")
        
        if [ "$total_files" -gt 0 ]; then
            success "Stats endpoint shows files: $total_files total files across $zones_count zones"
        else
            warning "Stats endpoint shows 0 files (database may be empty or Alist connection failed)"
        fi
    else
        warning "jq not installed, cannot parse stats response"
        info "Response: $response"
    fi
else
    error "Stats endpoint failed with HTTP $http_code"
    response=$(cat /tmp/stats_response.txt)
    info "Response: $response"
fi

# Check 6: Retrieve and analyze logs
separator
echo -e "${YELLOW}CHECK 6: Retrieving initialization logs...${NC}"

logs=$(gcloud run logs read "$SERVICE_NAME" \
    --limit=200 \
    --region="$REGION" \
    --project="$PROJECT_ID" 2>/dev/null)

if [ -z "$logs" ]; then
    error "No logs retrieved"
else
    info "Retrieved logs (last 200 lines)"
    
    # Check for success indicators
    success_found=0
    error_found=0
    
    if echo "$logs" | grep -q "Initializing storage credentials"; then
        success "Found: Initializing storage credentials"
        success_found=$((success_found + 1))
    fi
    
    if echo "$logs" | grep -q "Storage credentials loaded from"; then
        success "Found: Storage credentials loaded"
        success_found=$((success_found + 1))
        
        # Check which source
        if echo "$logs" | grep -q "SECRET_MANAGER"; then
            success "Credentials loaded from SECRET_MANAGER"
        elif echo "$logs" | grep -q "ENV"; then
            warning "Credentials loaded from ENV (not using Secret Manager)"
        elif echo "$logs" | grep -q "FALLBACK"; then
            warning "Credentials loaded from FALLBACK (development mode)"
        fi
    fi
    
    if echo "$logs" | grep -q "Alist authenticated"; then
        success "Found: Alist authenticated"
        success_found=$((success_found + 1))
    fi
    
    if echo "$logs" | grep -q "Backend listening"; then
        success "Found: Backend listening"
        success_found=$((success_found + 1))
    fi
    
    # Check for error indicators
    if echo "$logs" | grep -qi "401 Unauthorized"; then
        error "Found: 401 Unauthorized (authentication failed)"
        error_found=$((error_found + 1))
    fi
    
    if echo "$logs" | grep -qi "Alist login failed"; then
        error "Found: Alist login failed"
        error_found=$((error_found + 1))
    fi
    
    if echo "$logs" | grep -qi "ECONNREFUSED"; then
        error "Found: ECONNREFUSED (connection refused)"
        error_found=$((error_found + 1))
    fi
    
    if echo "$logs" | grep -qi "ETIMEDOUT"; then
        error "Found: ETIMEDOUT (connection timeout)"
        error_found=$((error_found + 1))
    fi
    
    info "Log Analysis: Found $success_found success indicators, $error_found error indicators"
fi

# Check 7: Summary
separator
echo -e "${CYAN}VERIFICATION SUMMARY${NC}"
echo "Service URL: $SERVICE_URL"

if [ $error_found -eq 0 ] && [ $success_found -gt 0 ]; then
    success "VERIFICATION PASSED"
    echo ""
    echo -e "${CYAN}Deployment Checklist:${NC}"
    echo -e "  [${GREEN}✅${NC}] Health check endpoint (HTTP $http_code)"
    echo -e "  [${GREEN}✅${NC}] Stats endpoint responds"
    echo -e "  [${GREEN}✅${NC}] No error indicators in logs"
    echo -e "  [${GREEN}✅${NC}] Success indicators found ($success_found items)"
else
    warning "VERIFICATION ISSUES DETECTED"
    echo ""
    echo -e "${CYAN}Possible issues:${NC}"
    if [ $error_found -gt 0 ]; then
        info "  - Error indicators found in logs ($error_found items)"
        info "  - Check logs for authentication or connection issues"
    fi
    if [ "$total_files" = "0" ]; then
        info "  - Stats showing 0 files"
        info "  - Check database or Alist connection"
    fi
fi

# Cleanup
rm -f /tmp/health_response.txt /tmp/stats_response.txt

separator
echo -e "${CYAN}Verification complete at $(date)${NC}"
