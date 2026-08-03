#!/usr/bin/env pwsh
# Google Cloud Run Deployment Script for arsip-anka
# This script automates the deployment process

param(
    [string]$ProjectId = "arsipanka",
    [string]$ServiceName = "arsip-anka",
    [string]$Region = "asia-southeast1",
    [string]$Memory = "512Mi",
    [string]$Cpu = "1",
    [string]$Timeout = "300",
    [switch]$SkipSecretSetup = $false,
    [switch]$SkipDeploy = $false,
    [switch]$OnlyViewLogs = $false
)

# Colors for output
$GREEN = "`e[32m"
$RED = "`e[31m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

function Write-Success {
    Write-Host "${GREEN}✓ $args${RESET}"
}

function Write-Error {
    Write-Host "${RED}✗ $args${RESET}"
}

function Write-Info {
    Write-Host "${BLUE}ℹ $args${RESET}"
}

function Write-Warning {
    Write-Host "${YELLOW}⚠ $args${RESET}"
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "    Google Cloud Run Deployment Script"
Write-Host "════════════════════════════════════════════════════════════"
Write-Host ""

# Step 1: Check gcloud CLI
Write-Info "Checking gcloud CLI..."
try {
    $version = gcloud --version 2>&1 | Select-Object -First 1
    Write-Success "gcloud CLI found: $version"
} catch {
    Write-Error "gcloud CLI not found. Please install from: https://cloud.google.com/sdk/docs/install"
    exit 1
}

# Step 2: Set project
Write-Info "Setting GCP project to: $ProjectId"
gcloud config set project $ProjectId
$currentProject = gcloud config get-value project
if ($currentProject -eq $ProjectId) {
    Write-Success "Project set to: $ProjectId"
} else {
    Write-Error "Failed to set project"
    exit 1
}

# Step 3: Check APIs
Write-Info "Checking required APIs..."
$apis = @(
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "containerregistry.googleapis.com"
)

foreach ($api in $apis) {
    $enabled = gcloud services list --enabled --filter="name:$api" --format="value(name)"
    if ($enabled) {
        Write-Success "$api is enabled"
    } else {
        Write-Warning "$api is not enabled. Enabling..."
        gcloud services enable $api
    }
}

# Step 4: Check secrets (unless skipped)
if (-not $SkipSecretSetup) {
    Write-Info "Checking required secrets..."
    $secrets = @(
        "arsip-supabase-url",
        "arsip-supabase-key",
        "arsip-jwt-secret",
        "arsip-terabox-url",
        "arsip-terabox-user",
        "arsip-terabox-pass",
        "arsip-terabox-crypt"
    )
    
    $missingSecrets = @()
    foreach ($secret in $secrets) {
        try {
            $exists = gcloud secrets describe $secret 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Secret exists: $secret"
            } else {
                $missingSecrets += $secret
                Write-Warning "Secret missing: $secret"
            }
        } catch {
            $missingSecrets += $secret
            Write-Warning "Secret missing: $secret"
        }
    }
    
    if ($missingSecrets.Count -gt 0) {
        Write-Error "Missing secrets: $($missingSecrets -join ', ')"
        Write-Info "Create them using:"
        foreach ($secret in $missingSecrets) {
            Write-Host "  echo 'VALUE' | gcloud secrets create $secret --data-file=-"
        }
        exit 1
    }
} else {
    Write-Info "Skipping secret setup"
}

# Step 5: Deploy (unless skipped)
if (-not $SkipDeploy) {
    Write-Info "Deploying to Cloud Run..."
    Write-Info "Service: $ServiceName"
    Write-Info "Region: $Region"
    Write-Info "Memory: $Memory"
    Write-Info "CPU: $Cpu"
    Write-Info "Timeout: $Timeout seconds"
    Write-Host ""
    
    try {
        gcloud run deploy $ServiceName `
            --source=. `
            --platform managed `
            --region $Region `
            --allow-unauthenticated `
            --memory $Memory `
            --cpu $Cpu `
            --timeout $Timeout `
            --port 8080 `
            --set-env-vars NODE_ENV=production `
            --set-secrets SUPABASE_URL=arsip-supabase-url:latest `
            --set-secrets SUPABASE_SERVICE_ROLE_KEY=arsip-supabase-key:latest `
            --set-secrets JWT_SECRET=arsip-jwt-secret:latest `
            --set-secrets TERABOX_WEBDAV_URL=arsip-terabox-url:latest `
            --set-secrets TERABOX_USER=arsip-terabox-user:latest `
            --set-secrets TERABOX_PASS=arsip-terabox-pass:latest `
            --set-secrets TERABOX_CRYPT_PASSWORD=arsip-terabox-crypt:latest
        
        Write-Success "Deployment started!"
    } catch {
        Write-Error "Deployment failed: $_"
        exit 1
    }
} else {
    Write-Info "Skipping deployment"
}

# Step 6: Get service URL
Write-Info "Getting service URL..."
try {
    $url = gcloud run services describe $ServiceName --region $Region --format='value(status.url)'
    Write-Success "Service URL: $url"
    Write-Host ""
} catch {
    Write-Warning "Could not retrieve service URL. Check deployment manually."
}

# Step 7: View logs
Write-Info "Recent logs:"
Write-Host ""
gcloud run services logs read $ServiceName --region $Region --limit 30

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Success "Deployment process completed!"
Write-Host ""
Write-Info "Next steps:"
Write-Host "  1. Check service status:"
Write-Host "     gcloud run services describe $ServiceName --region $Region"
Write-Host ""
Write-Host "  2. Test health check:"
Write-Host "     curl `"$url/api/heartbeat`""
Write-Host ""
Write-Host "  3. View real-time logs:"
Write-Host "     gcloud run services logs read $ServiceName --region $Region --follow"
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Host ""
