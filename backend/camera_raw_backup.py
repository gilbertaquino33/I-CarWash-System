import cv2
import time

RTSP_URL = "rtsp://admin:pass@192.168.189.211:554/onvif1"


def generate_frames():
    print("[CAMERA] Starting CCTV connection...")

    cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

    print("[CAMERA] VideoCapture created")
    print("[CAMERA] OPENED:", cap.isOpened())

    if not cap.isOpened():
        print("[CAMERA] Cannot open CCTV")
        cap.release()
        return

    print("[CAMERA] CCTV CONNECTED!")

    try:
        while True:
            print("[CAMERA] Reading frame...")

            success, frame = cap.read()

            print("[CAMERA] READ:", success)

            if not success or frame is None:
                print("[CAMERA] Frame failed")
                break

            print("[CAMERA] Frame received:", frame.shape)

            success, buffer = cv2.imencode(".jpg", frame)

            if not success:
                print("[CAMERA] JPEG encoding failed")
                continue

            print("[CAMERA] JPEG encoded:", len(buffer))

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )

    finally:
        print("[CAMERA] Releasing CCTV...")
        cap.release()