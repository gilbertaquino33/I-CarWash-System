# CV DEMO: runs the CV on a recorded video (YOLO boxes + detections show in
# the staff app), then deletes everything the demo created when you stop it.
#
# Usage (from the project folder):
#   powershell -ExecutionPolicy Bypass -File .\backend\run-cv-demo.ps1
#   powershell -ExecutionPolicy Bypass -File .\backend\run-cv-demo.ps1 -Video Testing.mp4
#
# View the YOLO video at http://localhost:8001/video
# Press Ctrl+C to stop -> demo walk-ins are deleted and the CCTV goes offline.
# If the window was closed instead, clean up with:
#   .\.venv\Scripts\python.exe .\backend\cv_demo.py cleanup

param(
    [string]$Video = "Test2.mp4",
    [int]$Port = 8001
)

$Backend = $PSScriptRoot
$Root = Split-Path $Backend -Parent
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$Helper = Join-Path $Backend "cv_demo.py"

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "[FATAL] Port $Port is already in use -- the CV is already running somewhere. Stop it first." -ForegroundColor Red
    exit 1
}

# Enables the "vehicle left" demo buttons:
#   http://localhost:8001/demo/leave?bay=Bay 1   (car drives out -> Completed)
#   http://localhost:8001/demo/back?bay=Bay 1    (car comes back)
$env:CV_DEMO_MODE = "1"

# Leftovers from a demo whose window was closed? Clean them first.
& $Python $Helper cleanup
& $Python $Helper mark

try {
    & (Join-Path $Backend "run-cv-laptop.ps1") -Video $Video -Port $Port
}
finally {
    Write-Host ""
    Write-Host "=== Cleaning up the demo ===" -ForegroundColor Cyan
    # Make sure the CV server is really gone before cleaning.
    $pids = (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
    foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    & $Python $Helper cleanup
}
