import cv2
import time

RTSP_URL = "rtsp://192.168.1.8:554/onvif1"


def generate_frames():
    while True:
        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

        if not cap.isOpened():
            print("Cannot open CCTV. Retrying in 5 seconds...")
            time.sleep(5)
            continue

        print("CCTV Connected!")

        while True:
            success, frame = cap.read()

            if not success:
                print("Connection lost. Reconnecting...")
                cap.release()
                break

            _, buffer = cv2.imencode(".jpg", frame)

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )