# SugboWay Transit System — Dual-Service Starter
# Automatically boots both the Go Fiber API and Next.js Web App in parallel windows.

Clear-Host
Write-Host "=================================================================" -ForegroundColor DarkBlue
Write-Host "               SugboWay Cebu Transit Guide                      " -ForegroundColor Yellow
Write-Host "      Go Routing API (Port 8080) & Next.js Web App (Port 3000)   " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor DarkBlue
Write-Host ""

# 1. Start Go Fiber Routing API in a spawned separate terminal.
# APP_ENV=development allows the insecure JWT dev fallback locally; production
# leaves APP_ENV unset and must supply a strong AUTH_JWT_SECRET (fail-closed).
Write-Host "-> Spawning Go Fiber Spatial Routing API (http://localhost:8080)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd sugboway-routing-api; `$env:APP_ENV='development'; Write-Host 'Booting Go Routing Engine...' -ForegroundColor Cyan; & 'C:\Program Files\Go\bin\go.exe' run main.go"

# 2. Start Next.js Web Application in a spawned separate terminal
Write-Host "-> Spawning Next.js Web Application (http://localhost:3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd sugboway-web; Write-Host 'Booting Next.js Web Application...' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "Both spawned windows have been initialized successfully!" -ForegroundColor Yellow
Write-Host "Please keep the spawned terminal windows open to keep the servers active." -ForegroundColor DarkGreen
Write-Host "=================================================================" -ForegroundColor DarkBlue
