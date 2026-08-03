# Task 6: Cloud Run Deployment Verification Script
# This script automates all verification steps for the Terabox file sync fix deployment

# Configuration
$PROJECT_ID = "arsipanka"
$REGION = "asia-southeast1"
$SERVICE_NAME = "arsipankabaru"
$COLORS = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
}

# Helper Functions
function Write-Success { param($msg) Write-Host "✅ $msg" -ForegroundColor $COLORS.Success }
function Write-Error { param($msg) Write-Host "❌ $msg" -ForegroundColor $COLORS.Error }
function Write-Warning { param($msg) Write-Host "⚠️  $msg" -ForegroundColor $COLORS.Warning }
function Write-Info { param($msg) Write-Host "ℹ️  $msg" -ForegroundColor $COLORS.Info }

function Separator { Write-Host "`n" + ("="*60) + "`n" -ForegroundColor Blue }

# Main Verification Script
Separator
Write-Host "Task 6: Cloud Run Deployment Verification" -ForegroundColor Magenta -BackgroundColor Black
Write-Host "Service: $SERVICE_NAME | Project: $PROJECT_ID | Region: $REGION" -ForegroundColor Cyan
Separator

# Check 1: Verify gcloud CLI is installed
Write-Host "CHECK 1: Verifying gcloud CLI..." -ForegroundColor Yellow
try {
    $version = gcloud --version
    Write-Success "gcloud CLI installed"
    Write-Info "Version: $($version[0])"
} catch {
    Write-Error "gcloud CLI not found. Install Google Cloud SDK and try again."
    exit 1
}

# Check 2: Verify GCP project is set
Write-Host "CHECK 2: Verifying GCP project..." -ForegroundColor Yellow
try {
    $currentProject = gcloud config get-value project
    if ($currentProject -ne $PROJECT_ID) {
        Write-Warning "Current project: $currentProject, switching to $PROJECT_ID"
        gcloud config set project $PROJECT_ID
    }
    Write-Success "GCP project set to: $PROJECT_ID"
} catch {
    Write-Error "Failed to verify GCP project: $_"
    exit 1
}

# Check 3: Verify deployment succeeded
Write-Host "CHECK 3: Verifying deployment status..." -ForegroundColor Yellow
try {
    $deployment = gcloud run describe $SERVICE_NAME `
        --region=$REGION `
        --project=$PROJECT_ID `
        --format="value(status.url,status.updateTime,metadata.generation)"
    
    if ($deployment) {
        $parts = $deployment.Split([Environment]::NewLine)
        $serviceUrl = $parts[0]
        $updateTime = $parts[1]
        $generation = $parts[2]
        
        Write-Success "Service deployed successfully"
        Write-Info "Service URL: $serviceUrl"
        Write-Info "Last updated: $updateTime"
        Write-Info "Generation: $generation"
    } else {
        Write-Error "Service not found or deployment failed"
        exit 1
    }
} catch {
    Write-Error "Failed to verify deployment: $_"
    exit 1
}

# Check 4: Test health check endpoint
Separator
Write-Host "CHECK 4: Testing health check endpoint..." -ForegroundColor Yellow
try {
    $response = curl -s -w "`n%{http_code}" "$serviceUrl/api/heartbeat"
    $lines = $response.Split("`n")
    $httpCode = $lines[-1]
    $body = $lines[0..$($lines.Count - 2)] -join "`n"
    
    if ($httpCode -eq "200") {
        Write-Success "Health check endpoint responding"
        Write-Info "HTTP Status: $httpCode"
        Write-Info "Response: $body"
        
        # Verify response format
        try {
            $json = $body | ConvertFrom-Json
            if ($json.status -eq "alive") {
                Write-Success "Health check response valid"
                Write-Info "Version: $($json.version)"
            } else {
                Write-Warning "Health check response missing expected fields"
            }
        } catch {
            Write-Warning "Could not parse health check response as JSON"
        }
    } else {
        Write-Error "Health check failed with HTTP $httpCode"
        Write-Info "Response: $body"
    }
} catch {
    Write-Error "Failed to test health check: $_"
}

# Check 5: Test stats endpoint
Write-Host "CHECK 5: Testing stats endpoint..." -ForegroundColor Yellow
try {
    $response = curl -s -w "`n%{http_code}" "$serviceUrl/api/stats/storage"
    $lines = $response.Split("`n")
    $httpCode = $lines[-1]
    $body = $lines[0..$($lines.Count - 2)] -join "`n"
    
    if ($httpCode -eq "200") {
        Write-Success "Stats endpoint responding"
        Write-Info "HTTP Status: $httpCode"
        
        # Verify response format and file count
        try {
            $json = $body | ConvertFrom-Json
            
            $totalFiles = 0
            $zonesCount = 0
            
            foreach ($zone in $json.zones) {
                $zonesCount++
                $totalFiles += $zone.total_files
                Write-Info "Zone $($zone.zona_id): $($zone.total_files) files, $($zone.total_size)"
            }
            
            if ($totalFiles -gt 0) {
                Write-Success "Stats endpoint shows files: $totalFiles total files across $zonesCount zones"
            } else {
                Write-Warning "Stats endpoint shows 0 files (database may be empty or Alist connection failed)"
            }
        } catch {
            Write-Warning "Could not parse stats response: $body"
        }
    } else {
        Write-Error "Stats endpoint failed with HTTP $httpCode"
        Write-Info "Response: $body"
    }
} catch {
    Write-Error "Failed to test stats endpoint: $_"
}

# Check 6: Retrieve and analyze logs
Separator
Write-Host "CHECK 6: Retrieving initialization logs..." -ForegroundColor Yellow
try {
    $logs = gcloud run logs read $SERVICE_NAME `
        --limit=200 `
        --region=$REGION `
        --project=$PROJECT_ID
    
    Write-Info "Retrieved logs (last 200 lines)"
    
    # Check for success indicators
    $successIndicators = @(
        "Initializing storage credentials",
        "Storage credentials loaded from",
        "Alist authenticated",
        "Backend listening on port"
    )
    
    $errorIndicators = @(
        "401 Unauthorized",
        "Alist login failed",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "Credential initialization error"
    )
    
    $foundErrors = @()
    $foundSuccesses = @()
    
    foreach ($indicator in $successIndicators) {
        if ($logs -match $indicator) {
            $foundSuccesses += $indicator
        }
    }
    
    foreach ($indicator in $errorIndicators) {
        if ($logs -match $indicator) {
            $foundErrors += $indicator
        }
    }
    
    # Display results
    Write-Host "`nLog Analysis:" -ForegroundColor Yellow
    
    if ($foundSuccesses.Count -gt 0) {
        Write-Success "Found success indicators:"
        foreach ($success in $foundSuccesses) {
            Write-Info "  ✓ $success"
        }
    }
    
    if ($foundErrors.Count -gt 0) {
        Write-Error "Found error indicators:"
        foreach ($error in $foundErrors) {
            Write-Info "  ✗ $error"
        }
    } else {
        Write-Success "No error indicators found in logs"
    }
    
} catch {
    Write-Error "Failed to retrieve logs: $_"
}

# Check 7: Detailed log search for credentials
Write-Host "CHECK 7: Verifying credential initialization..." -ForegroundColor Yellow
try {
    $credLogs = gcloud run logs read $SERVICE_NAME `
        --limit=500 `
        --region=$REGION `
        --project=$PROJECT_ID | Select-String -Pattern "(Secret|credential|Alist authenticated|FALLBACK|ENV|SECRET_MANAGER)" -ErrorAction SilentlyContinue
    
    if ($credLogs) {
        Write-Success "Credential logs found:"
        foreach ($line in $credLogs) {
            if ($line -match "SECRET_MANAGER") {
                Write-Success "  Loaded from SECRET_MANAGER: $line"
            } elseif ($line -match "ENV") {
                Write-Warning "  Loaded from ENV: $line"
            } elseif ($line -match "FALLBACK") {
                Write-Warning "  Loaded from FALLBACK: $line"
            } else {
                Write-Info "  $line"
            }
        }
    } else {
        Write-Warning "No credential initialization logs found"
    }
} catch {
    Write-Error "Failed to search credential logs: $_"
}

# Check 8: Summary
Separator
Write-Host "VERIFICATION SUMMARY" -ForegroundColor Magenta
Write-Host "Service URL: $serviceUrl" -ForegroundColor Cyan
Write-Host "Status: $(@("PASSED", "FAILED")[([int]($foundErrors.Count -gt 0))])" -ForegroundColor $(if ($foundErrors.Count -eq 0) { $COLORS.Success } else { $COLORS.Error })

Write-Host "`nDeployment Checklist:" -ForegroundColor Yellow
Write-Host "  [$(if ($httpCode -eq '200') { '✅' } else { '❌' })] Health check endpoint (HTTP $httpCode)"
Write-Host "  [$(if ($totalFiles -gt 0) { '✅' } else { '❌' })] Stats endpoint shows files ($totalFiles total)"
Write-Host "  [$(if ($foundErrors.Count -eq 0) { '✅' } else { '❌' })] No error indicators in logs"
Write-Host "  [$(if ($foundSuccesses.Count -gt 0) { '✅' } else { '❌' })] Success indicators found ($($foundSuccesses.Count) items)"

# Final recommendation
Write-Host "`nRECOMMENDATIONS:" -ForegroundColor Magenta
if ($foundErrors.Count -gt 0) {
    Write-Error "Issues detected! Review the error indicators above."
    Write-Info "Common issues:"
    Write-Info "  - 401 Unauthorized → Check Secret Manager password"
    Write-Info "  - ECONNREFUSED → Check if Alist service started"
    Write-Info "  - Stats showing 0/0 → Check database or Alist connection"
} elseif ($totalFiles -eq 0) {
    Write-Warning "Deployment successful but stats showing 0 files"
    Write-Info "Possible causes:"
    Write-Info "  1. Database is empty (Terabox sync not run)"
    Write-Info "  2. Query error (check logs for SQL errors)"
    Write-Info "  3. Alist connection issue (check logs for 401)"
} else {
    Write-Success "Deployment verified successfully!"
    Write-Info "All checks passed. Service is ready for production use."
}

Separator
Write-Host "Verification complete at $(Get-Date)" -ForegroundColor Cyan
