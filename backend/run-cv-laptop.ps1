# Runs the CV backend on this laptop using a recorded video instead of the
# live CCTV. Keys (SUPABASE_KEY, ROBOFLOW_API_KEY) are read from .env.pi;
# the camera source and model are overridden for the laptop.
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\backend\run-cv-laptop.ps1
#         powershell -ExecutionPolicy Bypass -File .\backend\run-cv-laptop.ps1 -Video TestType.mp4
# Then open http://localhost:8001/video in a browser.

param(
    [string]$Video = "Test2.mp4",
    [int]$Port = 8001
)

$Backend = $PSScriptRoot
$Root = Split-Path $Backend -Parent
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$VideoPath = Join-Path $Root "assets\videos\$Video"

if (-not (Test-Path $Python)) { Write-Host "[FATAL] $Python not found." -ForegroundColor Red; exit 1 }
if (-not (Test-Path $VideoPath)) { Write-Host "[FATAL] Video not found: $VideoPath" -ForegroundColor Red; exit 1 }

# Load keys from .env.pi (skip the Pi-only camera/model settings).
$skip = @("VIDEO_SOURCE", "VEHICLE_MODEL_PATH", "YOLO_IMGSZ")
Get-Content (Join-Path $Backend ".env.pi") | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $name = $Matches[1]; $value = $Matches[2].Trim().Trim('"').Trim("'")
        if ($skip -notcontains $name) { Set-Item -Path "Env:$name" -Value $value }
    }
}

# Laptop overrides.
$env:VIDEO_SOURCE = $VideoPath
$env:VIDEO_SOURCE_IS_LIVE = "false"
$env:LOOP_VIDEO_FILE = "true"
# best.pt barely detects the cars in the recorded videos; the stock COCO
# yolov8m.pt finds both bays reliably. Roboflow still decides the body style.
$env:VEHICLE_MODEL_PATH = (Join-Path $Root "yolov8m.pt")
$env:YOLO_IMGSZ = "640"
$env:VEHICLE_CONFIDENCE = "0.45"
# Confirm a car after 12 detection frames instead of 20 (faster turn-green),
# and ask Roboflow for the body style on every candidate frame so it collects
# the 4 votes it needs (otherwise COCO "truck" falls back to Pickup).
$env:ENTRY_CONFIRM_FRAMES = "12"
$env:CLASSIFY_EVERY_N_CANDIDATE_FRAMES = "1"
# If Roboflow can't be reached, treat a COCO "truck" as SUV (the Fortuner in
# the test videos) instead of Pickup.
$env:COCO_TRUCK_FALLBACK = "SUV"
$env:PYTHONUNBUFFERED = "1"

Write-Host ""
Write-Host "=== Carwash CV (laptop, video file) ===" -ForegroundColor Cyan
Write-Host "Video : $VideoPath"
Write-Host "Model : $env:VEHICLE_MODEL_PATH"
Write-Host "View  : http://localhost:$Port/video" -ForegroundColor Green
Write-Host "Ctrl+C to stop."
Write-Host ""

Set-Location $Backend
& $Python -m uvicorn api:app --host 0.0.0.0 --port $Port
