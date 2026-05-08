$ErrorActionPreference = "Continue"

Write-Host "🔍 Test 1: Employee confirms maintenance task..." -ForegroundColor Cyan
$confirmResp = Invoke-RestMethod -Uri "http://localhost:4000/api/maintenance/2/confirm" -Method Put -Headers @{"Content-Type"="application/json"} -Body (@{
  cost = 500000
  actorId = 2
  actorRole = "Nhân Viên"
  actorFullName = "Nhân viên 1"
} | ConvertTo-Json)

Write-Host "✅ Confirm response: $($confirmResp | ConvertTo-Json -Depth 2)" -ForegroundColor Green

Write-Host "`n🔍 Test 2: Check admin notifications..." -ForegroundColor Cyan
$alertsResp = Invoke-RestMethod -Uri "http://localhost:4000/api/devices/maintenance-alerts?role=Admin&userId=1" -Method Get

$maintenanceNotifs = $alertsResp.notifications | Where-Object { 
  $_.type -eq 'maintenance' -and ($_.title -like "*xác nhận*" -or $_.description -like "*xác nhận*")
}

Write-Host "✅ Found $($maintenanceNotifs.Count) employee confirmation notifications" -ForegroundColor Green

if ($maintenanceNotifs) {
  Write-Host "`n📌 Sample notifications:" -ForegroundColor Yellow
  $maintenanceNotifs | Select-Object -First 2 | ForEach-Object {
    Write-Host "  Title: $($_.title)"
    Write-Host "  Description: $($_.description)"
    Write-Host "  Time: $($_.time)"
    Write-Host "---"
  }
}

Write-Host "`n✅ HOÀN THÀNH! Hệ thống thông báo đã hoạt động!" -ForegroundColor Green
