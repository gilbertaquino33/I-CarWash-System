from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import cv2
import time

import camera

app = FastAPI()


def generate_frames():
    while True:

        with camera.FRAME_LOCK:
            if camera.LATEST_PROCESSED_FRAME is None:
                frame = None
            else:
                frame = camera.LATEST_PROCESSED_FRAME.copy()

        if frame is None:
            time.sleep(0.1)
            continue

        ok, buffer = cv2.imencode(".jpg", frame)

        if not ok:
            continue

        frame_bytes = buffer.tobytes()

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + frame_bytes
            + b"\r\n"
        )

        time.sleep(0.03)


@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "iCarWash CCTV processed video server is running"
    }


@app.get("/video")
def video():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )