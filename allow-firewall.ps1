# اجازه دادن به پورت ۳۰۰۰ در فایروال ویندوز
# این فایل را راست‌کلیک کن و "Run with PowerShell" بزن (نیاز به دسترسی ادمین دارد)

$rule = "Fridge Detective 3000"
if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) {
    Write-Host "رول فایروال از قبل وجود دارد." -ForegroundColor Yellow
} else {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP `
        -LocalPort 3000 -Action Allow -Profile Private | Out-Null
    Write-Host "رول فایروال ساخته شد: پورت 3000 برای شبکه خصوصی باز است." -ForegroundColor Green
}

Write-Host ""
Write-Host "آدرس‌هایی که از گوشی می‌توانی امتحان کنی:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  ForEach-Object { Write-Host ("   http://" + $_.IPAddress + ":3000   (" + $_.InterfaceAlias + ")") }
Write-Host ""
Read-Host "برای بستن Enter بزن"
