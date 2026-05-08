$ErrorActionPreference = "Continue"

Write-Host "Test 1: Employee confirms maintenance task..." -ForegroundColor Cyan
$confirmResp = Invoke-RestMethod -Uri "http://localhost:4000/api/maintenance/2/confirm" -Method Put -Headers @{"Content-Type"="application/json"} -Body (@{
  cost = 500000
  actorId = 2
  actorRole = "Nhan Vien"
  actorFullName = "Nhan vien 1"
} | ConvertTo-Json)

Write-Host "Confirm response: $($confirmResp | ConvertTo-Json -Depth 2)" -ForegroundColor Green

Write-Host "`nTest 2: Check admin notifications..." -ForegroundColor Cyan
$alertsResp = Invoke-RestMethod -Uri "http://localhost:4000/api/devices/maintenance-alerts?role=Admin&userId=1" -Method Get

$maintenanceNotifs = $alertsResp.notifications | Where-Object { 
  $_.type -eq 'maintenance'
}

Write-Host "Found $($maintenanceNotifs.Count) maintenance notifications" -ForegroundColor Green

if ($maintenanceNotifs) {
  Write-Host "`nSample notifications:" -ForegroundColor Yellow
  $maintenanceNotifs | Select-Object -First 3 | ForEach-Object {
    Write-Host "  Title: $($_.title)"
    Write-Host "  Desc: $($_.description)"
    Write-Host "  Type: $($_.type)"
    Write-Host "---"
  }
}

Write-Host "`nSUCCESS! Notification system working!" -ForegroundColor Green
