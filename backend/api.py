from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from camera import generate_frames

app = FastAPI()


@app.get("/")
def home():
    return {"message": "Carwash CCTV API Running"}


@app.get("/video")
def video():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )