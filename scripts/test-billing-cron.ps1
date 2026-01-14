Param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

$secret = $env:CRON_SECRET
if ([string]::IsNullOrWhiteSpace($secret)) {
  throw "CRON_SECRET is not set in environment. Add it to .env.local and restart dev server, or set it in this shell."
}

$uri = "$BaseUrl/api/cron/billing/run"

Write-Host "POST $uri" -ForegroundColor Cyan

$response = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ "x-cron-secret" = $secret }
$response | ConvertTo-Json -Depth 10
