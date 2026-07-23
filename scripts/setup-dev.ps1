# AVS Suite — Development Setup Script
# Run this after cloning both AVS-License-Server and avs-suite repositories.
#
# Usage (PowerShell):
#   .\scripts\setup-dev.ps1
#
# Prerequisites:
#   - Node.js >= 18.18.0
#   - Python >= 3.10
#   - Yarn >= 1.22.0
#   - PostgreSQL (for AVS-License-Server)
#   - Git

param(
    [string]$LicenseServerPath = "..\Avs-license-server",
    [string]$SuitePath = "."
)

$ErrorActionPreference = "Stop"

Write-Host "=== AVS Suite Development Setup ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Verify repositories exist ─────────────────────────────
Write-Host "[1/6] Verifying repositories..." -ForegroundColor Yellow

if (-not (Test-Path "$LicenseServerPath\packages\avs_license_sdk\__init__.py")) {
    Write-Error "AVS License Server not found at: $LicenseServerPath`nExpected: $LicenseServerPath\packages\avs_license_sdk\__init__.py"
    exit 1
}

if (-not (Test-Path "$SuitePath\package.json")) {
    Write-Error "AVS Suite not found at: $SuitePath"
    exit 1
}

Write-Host "  OK: Both repositories found." -ForegroundColor Green
Write-Host "  License Server: $LicenseServerPath" -ForegroundColor Gray
Write-Host "  AVS Suite:      $SuitePath" -ForegroundColor Gray

# ── 2. Install AVS License Server dependencies ───────────────
Write-Host ""
Write-Host "[2/6] Installing AVS License Server Python dependencies..." -ForegroundColor Yellow
Push-Location $LicenseServerPath
try {
    python -m pip install -r requirements.txt --quiet
    Write-Host "  OK: License Server dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

# ── 3. Install AVS License SDK (editable) ────────────────────
Write-Host ""
Write-Host "[3/6] Installing AVS License SDK (editable)..." -ForegroundColor Yellow
$SdkPath = Resolve-Path "$LicenseServerPath\packages\avs_license_sdk"
python -m pip install -e "$SdkPath" --quiet
Write-Host "  OK: SDK installed in editable mode from: $SdkPath" -ForegroundColor Green

# ── 4. Install AVS Suite backend dependencies ────────────────
Write-Host ""
Write-Host "[4/6] Installing AVS Suite backend Python dependencies..." -ForegroundColor Yellow
Push-Location "$SuitePath\backend"
try {
    python -m pip install -r requirements.txt --quiet
    Write-Host "  OK: Backend dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

# ── 5. Install AVS Suite Node.js dependencies ────────────────
Write-Host ""
Write-Host "[5/6] Installing AVS Suite Node.js dependencies..." -ForegroundColor Yellow
Push-Location $SuitePath
try {
    yarn install --frozen-lockfile
    Write-Host "  OK: Node.js dependencies installed." -ForegroundColor Green
} finally {
    Pop-Location
}

# ── 6. Create .env from template ─────────────────────────────
Write-Host ""
Write-Host "[6/6] Setting up environment configuration..." -ForegroundColor Yellow
if (-not (Test-Path "$SuitePath\.env")) {
    Copy-Item "$SuitePath\.env.example" "$SuitePath\.env"
    Write-Host "  Created .env from .env.example" -ForegroundColor Green
    Write-Host "  Edit $SuitePath\.env to configure your license server URL." -ForegroundColor Yellow
} else {
    Write-Host "  .env already exists — skipping." -ForegroundColor Gray
}

# ── Done ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start the AVS License Server:" -ForegroundColor White
Write-Host "     cd $LicenseServerPath" -ForegroundColor Gray
Write-Host "     python -m uvicorn app.main:app --reload" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start AVS Suite in development mode:" -ForegroundColor White
Write-Host "     cd $SuitePath" -ForegroundColor Gray
Write-Host "     yarn dev:pc-optimizer" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Run tests:" -ForegroundColor White
Write-Host "     License Server:  cd $LicenseServerPath && python -m pytest" -ForegroundColor Gray
Write-Host "     AVS Suite:       cd $SuitePath && yarn test" -ForegroundColor Gray
Write-Host "     AVS Suite backend: cd $SuitePath\backend && python -m pytest" -ForegroundColor Gray
