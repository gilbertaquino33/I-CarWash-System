import cv2
import time

RTSP_URL = "rtsp://admin:pass@192.168.189.211:554/onvif1"


def generate_frames():
    while True:
        print("Connecting to CCTV...", flush=True)

        cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

        # Reduce buffering
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not cap.isOpened():
            print("Cannot open CCTV. Retrying in 3 seconds...", flush=True)
            cap.release()
            time.sleep(3)
            continue

        print("CCTV Connected!", flush=True)

        while True:
            success, frame = cap.read()

            if not success or frame is None:
                print("Frame read failed. Reconnecting...", flush=True)
                cap.release()
                time.sleep(2)
                break

            success, buffer = cv2.imencode(".jpg", frame)

            if not success:
                print("JPEG encoding failed.", flush=True)
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )
            