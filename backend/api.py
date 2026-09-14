from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from camera import generate_frames

try:
    from camera import ensure_camera_running, is_camera_running
except ImportError:
    # Older camera.py without these helpers -- the worker still auto-starts
    # on the first /video request, so degrade gracefully.
    def ensure_camera_running():
        return None

    def is_camera_running():
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the CV detection loop the moment the API boots -- so the camera
    # heartbeat (cv_heartbeat table) starts immediately and the app's
    # New Walk-in / Reservation screens flip to "camera online" within a
    # few seconds, WITHOUT anyone needing to open /video first.
    try:
        ensure_camera_running()
        print("[API] CV detection loop starting on boot.")
    except Exception as e:
        print(f"[API] Could not auto-start camera worker: {e}")
    yield


app = FastAPI(lifespan=lifespan)

# Allow the mobile app's WebView (any origin) to load the MJPEG stream.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {
        "message": "Carwash CCTV API Running",
        "camera_running": is_camera_running(),
    }


@app.get("/status")
def status():
    # Lightweight liveness/status probe.
    return {"camera_running": is_camera_running()}


@app.get("/video")
def video():
    # Also (re)start the worker if it somehow isn't running.
    ensure_camera_running()
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
