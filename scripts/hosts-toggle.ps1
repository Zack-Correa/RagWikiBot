#Requires -RunAsAdministrator
# hosts-toggle.ps1 — Toggle proxy redirect
# powershell -ExecutionPolicy Bypass -File hosts-toggle.ps1

$ProxyIP   = "192.168.1.86"
$Hostname  = "lt-account-01.gnjoylatam.com"
$HostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$Entry     = "$ProxyIP $Hostname"

Write-Host ""
Write-Host "  hosts-toggle - Proxy de captura de token" -ForegroundColor Cyan
Write-Host ""

$content = Get-Content $HostsPath -ErrorAction Stop
$found = $content | Where-Object { $_ -match [regex]::Escape($Hostname) }

if ($found) {
    Write-Host "  [*] Removendo..." -ForegroundColor Yellow
    $newContent = $content | Where-Object { $_ -notmatch [regex]::Escape($Hostname) }
    $newContent | Set-Content $HostsPath -Force
    Write-Host "  [OK] Proxy DESATIVADO" -ForegroundColor Green
} else {
    Write-Host "  [*] Adicionando..." -ForegroundColor Yellow
    Add-Content $HostsPath "`n$Entry"
    Write-Host "  [OK] Proxy ATIVADO ($Hostname -> $ProxyIP)" -ForegroundColor Green
}

Write-Host ""
ipconfig /flushdns | Out-Null
Write-Host "  [*] DNS limpo." -ForegroundColor DarkGray

$check = Get-Content $HostsPath | Where-Object { $_ -match "gnjoy" }
if ($check) { $check | ForEach-Object { Write-Host "    $_" } }
else { Write-Host "    (nenhuma entrada gnjoy)" -ForegroundColor DarkGray }

Write-Host ""
Read-Host "  Enter para fechar"