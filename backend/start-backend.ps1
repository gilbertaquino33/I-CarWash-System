# Starts the Carwash CCTV backend so the stream is reachable from anywhere.
#
# Binds to 0.0.0.0 (every interface, including the Tailscale one) so the
# /video MJPEG stream is reachable over the Tailscale address as well as the
# LAN. The Tailscale address does NOT change when this PC moves to another
# Wi-Fi or hotspot, which is what makes the stream survive a network change.
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-backend.ps1

$Port = 8001
$Tailscale = "C:\Program Files\Tailscale\tailscale.exe"

Write-Host ""
Write-Host "=== Carwash CCTV backend ===" -ForegroundColor Cyan

# --- Tailscale check -------------------------------------------------------
# Without Tailscale up, the stream is only reachable on the current LAN.
$tsIp = $null
if (Test-Path $Tailscale) {
    try {
        $tsIp = (& $Tailscale ip -4 2>$null | Select-Object -First 1).Trim()
    } catch {
        $tsIp = $null
    }
}

if ([string]::IsNullOrWhiteSpace($tsIp)) {
    Write-Host "[WARN] Tailscale is not running or not logged in." -ForegroundColor Yellow
    Write-Host "       The stream will only work on this same network." -ForegroundColor Yellow
    Write-Host "       Open the Tailscale app and connect, then re-run this script." -ForegroundColor Yellow
} else {
    Write-Host "[OK]   Tailscale is up. Remote access address:" -ForegroundColor Green
    Write-Host "         http://$($tsIp):$Port/video" -ForegroundColor White
    Write-Host "       This address stays the same on any network." -ForegroundColor Gray
}

# --- LAN address (informational) -------------------------------------------
# Changes on every reconnect -- only useful while on this same router.
$lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -notlike "100.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress
if ($lanIp) {
    Write-Host "[INFO] Same-network address: http://$($lanIp):$Port/video" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Starting uvicorn on 0.0.0.0:$Port ... (Ctrl+C to stop)" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot
python -m uvicorn api:app --host 0.0.0.0 --port $Port
