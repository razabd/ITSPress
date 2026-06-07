# windows-setup.ps1
# Jalankan sekali untuk update dependency dan build semua binary.
# Requires: Go 1.21+ terinstall, TIDAK perlu GCC/MinGW.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "=== Readium LCP Server - Windows Setup ===" -ForegroundColor Cyan

$env:CGO_ENABLED = "0"

Write-Host "`n[1/2] Updating dependencies..." -ForegroundColor Yellow
go mod tidy
if ($LASTEXITCODE -ne 0) { Write-Error "go mod tidy failed"; exit 1 }

Write-Host "`n[2/2] Building binaries..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path bin | Out-Null

$targets = @("lcpserver", "lsdserver", "lcpencrypt")
foreach ($t in $targets) {
    Write-Host "  Building $t.exe..."
    go build -tags nofitz -o "bin\$t.exe" ".\$t"
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed: $t"; exit 1 }
}

Write-Host "`nSelesai! Jalankan server dengan: .\run-lcp.ps1" -ForegroundColor Green
