

import os
import sys
import cv2
import json

# ------------------------------------------------------------------
# Keep these in sync with camera.py
# ------------------------------------------------------------------

VIDEO_SOURCE = os.getenv(
    "VIDEO_SOURCE",
    "C:\\Users\\Gilbert T. Aquino\\I-CarWash-System\\assets\\videos\\Testing.mp4"
    # "rtsp://admin:pass@192.168.189.211:8000:554/onvif1"
)

SHOP_ID = 2
BAY_ZONES_TABLE = "bay_zones"

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hybszzpgtbuubdotqkqq.supabase.co")
SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "SUPABASE_KEY_HERE"
)

WINDOW_NAME = "Bay Calibration - click 4 corners per bay, 'n' = next bay, 'r' = refresh frame, 'q' = quit"


MAX_DISPLAY_WIDTH = 1280
MAX_DISPLAY_HEIGHT = 720


def grab_frame():
    cap = cv2.VideoCapture(VIDEO_SOURCE, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        print(f"[ERROR] Could not open video source: {VIDEO_SOURCE}")
        sys.exit(1)

    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None:
        print("[ERROR] Could not read a frame from the camera.")
        sys.exit(1)

    return frame


def main():
    print(f"[INFO] Connecting to: {VIDEO_SOURCE}")
    frame = grab_frame()
    height, width = frame.shape[:2]
    print(f"[INFO] Live frame size: {width}x{height}")

    # Scale factor to fit the frame on screen for display only. Clicks are
    # captured in display coordinates and divided by this scale to recover
    # true pixel coordinates, so calibration stays accurate at full res.
    display_scale = min(
        MAX_DISPLAY_WIDTH / width,
        MAX_DISPLAY_HEIGHT / height,
        1.0,  # never upscale
    )
    display_width = int(width * display_scale)
    display_height = int(height * display_scale)
    print(f"[INFO] Display size: {display_width}x{display_height} "
          f"(scale={display_scale:.3f})")

    bays = {}          # bay_name -> list of (x_norm, y_norm), TRUE pixel-derived
    current_points = []  # TRUE pixel points for the bay being drawn

    def to_display(pt):
        x, y = pt
        return (int(x * display_scale), int(y * display_scale))

    def redraw():
        base = frame if display_scale == 1.0 else cv2.resize(
            frame, (display_width, display_height), interpolation=cv2.INTER_AREA
        )
        display = base.copy()

        # already-finished bays
        for name, pts_norm in bays.items():
            pts = [to_display((x * width, y * height)) for x, y in pts_norm]
            if len(pts) >= 2:
                cv2.polylines(display, [cv2_pts(pts)], True, (0, 255, 0), 2)
            if pts:
                cv2.putText(display, name, pts[0], cv2.FONT_HERSHEY_SIMPLEX,
                            0.7, (0, 255, 0), 2, cv2.LINE_AA)

        # bay currently being clicked (current_points are TRUE pixels)
        display_current = [to_display(p) for p in current_points]
        if len(display_current) >= 2:
            cv2.polylines(display, [cv2_pts(display_current)], False, (0, 165, 255), 2)
        for p in display_current:
            cv2.circle(display, p, 5, (0, 0, 255), -1)

        cv2.imshow(WINDOW_NAME, display)

    def cv2_pts(pts):
        import numpy as np
        arr = np.array(pts, np.int32)
        return arr.reshape((-1, 1, 2))

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            # x,y arrive in display coordinates; convert back to true pixels
            true_x = int(x / display_scale)
            true_y = int(y / display_scale)
            current_points.append((true_x, true_y))
            redraw()

    cv2.namedWindow(WINDOW_NAME)
    cv2.setMouseCallback(WINDOW_NAME, on_mouse)
    redraw()

    print()
    print("Controls: left-click = add corner | 'n' = save this bay & start next")
    print("          'r' = grab a fresh frame | 'q' = quit and export")
    print()

    while True:
        key = cv2.waitKey(20) & 0xFF

        if key == ord('r'):
            new_frame = grab_frame()
            if new_frame.shape != frame.shape:
                print("[WARN] New frame has a different size than the first "
                      "one; restart the script instead of refreshing to "
                      "avoid inconsistent normalized coordinates.")
            else:
                frame[:] = new_frame
                current_points.clear()
                redraw()
                print("[INFO] Frame refreshed.")

        elif key == ord('n'):
            if len(current_points) < 3:
                print("[WARN] Need at least 3 points before saving a bay. Keep clicking.")
                continue

            bay_name = input("Bay name for these points (e.g. 'Bay 1'): ").strip()
            if not bay_name:
                print("[WARN] Empty name, skipping.")
                current_points.clear()
                continue

            bays[bay_name] = [
                (round(x / width, 4), round(y / height, 4))
                for x, y in current_points
            ]

            print(f"[INFO] Saved '{bay_name}' with {len(current_points)} points.")
            current_points.clear()
            redraw()

        elif key == ord('q'):
            break

    cv2.destroyAllWindows()

    if not bays:
        print("[INFO] No bays defined. Exiting without changes.")
        return

    # ----------------------------------------------------------------
    # Print Python dict (paste into _FALLBACK_BAY_POLYGONS_NORM if needed)
    # ----------------------------------------------------------------

    print()
    print("=" * 60)
    print("Paste this into camera.py if you want a matching fallback:")
    print("=" * 60)
    print("BAY_POLYGONS_NORM = {")
    for name, pts in bays.items():
        print(f'    "{name}": {pts},')
    print("}")
    print()

    # ----------------------------------------------------------------
    # Offer to push straight to Supabase (same table camera.py reads)
    # ----------------------------------------------------------------

    answer = input(
        f"Push these {len(bays)} bay(s) to Supabase table "
        f"'{BAY_ZONES_TABLE}' for shop_id={SHOP_ID} now? [y/N]: "
    ).strip().lower()

    if answer != "y":
        print("[INFO] Skipped Supabase push. Nothing else to do.")
        return

    try:
        from supabase import create_client
    except ImportError:
        print("[ERROR] supabase package not installed here. "
              "Run: pip install supabase --break-system-packages")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    rows = [
        {
            "shop_id": SHOP_ID,
            "bay_name": name,
            "polygon": pts,  # list of [x_norm, y_norm]
        }
        for name, pts in bays.items()
    ]

    try:
        supabase.table(BAY_ZONES_TABLE).upsert(
            rows, on_conflict="shop_id,bay_name"
        ).execute()
        print(f"[INFO] Pushed {len(rows)} bay zone(s) to Supabase.")
        print("[INFO] Restart camera.py (or wait for its next "
              "load_bay_polygons_from_supabase() call) to pick these up.")
    except Exception as e:
        print(f"[ERROR] Failed to push to Supabase: {e}")


if __name__ == "__main__":
    main()