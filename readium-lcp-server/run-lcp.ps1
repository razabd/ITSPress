# run-lcp.ps1
# Jalankan LCP Server dan LSD Server secara bersamaan di dua window terpisah.
# Harus dijalankan dari folder readium-lcp-server.

$root = $PSScriptRoot

Write-Host "Memulai LCP Server  (port 8989)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:READIUM_LCPSERVER_CONFIG='$root\run\config.yaml'; & '$root\bin\lcpserver.exe'"
) -WindowStyle Normal

Start-Sleep -Milliseconds 800

Write-Host "Memulai LSD Server  (port 8990)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "`$env:READIUM_LSDSERVER_CONFIG='$root\run\config.yaml'; & '$root\bin\lsdserver.exe'"
) -WindowStyle Normal

Start-Sleep -Milliseconds 1200

Write-Host "`nMengecek status server..." -ForegroundColor Yellow
try {
    $ping = Invoke-WebRequest -Uri "http://localhost:8989/ping" -UseBasicParsing -TimeoutSec 3
    Write-Host "LCP Server: OK - $($ping.Content)" -ForegroundColor Green
} catch {
    Write-Host "LCP Server: belum merespons (tunggu beberapa detik lalu coba lagi)" -ForegroundColor Yellow
}
