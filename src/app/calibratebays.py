"""
Bay Calibration Tool
=====================
Paggamit:
    1. Palitan ang VIDEO_SOURCE sa ibaba ng path ng video mo (same source
       na gamit mo sa camera.py).
    2. Patakbuhin: python calibrate_bays.py
    3. Isang frame mula sa video ang lalabas -- awtomatiko na itong
       nag-a-adjust ng laki para bumagay sa screen mo (hindi na sobrang
       laki/zoomed in kahit high-res ang video).
    4. I-click ang 4 na sulok (corners) ng Bay 1, sunod-sunod
       (kahit anong direksyon basta pabilog: e.g. upper-left -> upper-right
       -> lower-right -> lower-left).
    5. Pagkatapos ng 4 clicks, awtomatikong lilipat sa Bay 2.
    6. Ulitin hanggang sa lahat ng bay (tingnan NUM_BAYS / BAY_NAMES sa
       baba) ay ma-click na.
    7. Pindutin ang 'r' anumang oras para i-reset ang kasalukuyang bay
       (kung nagkamali ka ng click).
    8. Pagkatapos ng lahat, ipi-print ang resulta sa terminal --
       kopyahin mo lang yun papunta sa BAY_POLYGONS_NORM sa camera.py.

Tip: I-zoom/screenshot muna yung video para makita mo talaga kung saan
eksakto nagsisimula/nagtatapos ang bawat physical bay (huwag isama ang
espasyo ng katabing sasakyan/pickup na wala namang bay).
"""

import cv2

# ---- IBAHIN MO ITO PARA TUMUGMA SA camera.py ----
VIDEO_SOURCE = "C:/Users/Gilbert T. Aquino/carwash_app/assets/videos/Testing.mp4"
FRAME_TO_GRAB = 30  # kumuha ng frame na medyo malayo sa simula (may laman na)

BAY_NAMES = ["Bay 1", "Bay 2"]

# ---- SIZE NG WINDOW (para hindi sobrang laki/zoomed in ang window) ----
# I-adjust kung gusto mo mas malaki/maliit. Awtomatiko lang itong bababaan
# kung mas malaki ang orihinal na video sa mga values na ito -- kung
# mas maliit na ang video, hindi na ito pinapalaki (para hindi mag-blur).
MAX_DISPLAY_WIDTH = 1280
MAX_DISPLAY_HEIGHT = 720
# --------------------------------------------------

WINDOW_NAME = "Bay Calibration - click 4 corners per bay, r=reset, ESC=quit"

current_bay_index = 0
current_points = []
all_bays = {}
frame = None
display = None
scale = 1.0  # display_size = original_size * scale


def compute_scale(frame_h, frame_w):
    """Kunin yung scale factor para bumagay ang video sa MAX_DISPLAY_*.
    Hindi ito papalakihin kung maliit na ang video (max scale = 1.0)."""
    scale_w = MAX_DISPLAY_WIDTH / frame_w
    scale_h = MAX_DISPLAY_HEIGHT / frame_h
    return min(scale_w, scale_h, 1.0)


def redraw():
    global display

    # Gumuhit tayo sa ORIGINAL resolution muna (para tama ang points),
    # tapos i-resize lang ang final image bago ipakita.
    canvas = frame.copy()

    # i-draw lahat ng completed bays
    for name, pts in all_bays.items():
        for i in range(len(pts)):
            cv2.circle(canvas, pts[i], 6, (0, 255, 0), -1)
            if i > 0:
                cv2.line(canvas, pts[i - 1], pts[i], (0, 255, 0), 2)
        if len(pts) == 4:
            cv2.line(canvas, pts[3], pts[0], (0, 255, 0), 2)
        if pts:
            cv2.putText(canvas, name, pts[0], cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (0, 255, 0), 2, cv2.LINE_AA)

    # i-draw yung kasalukuyang ginagawa
    for i in range(len(current_points)):
        cv2.circle(canvas, current_points[i], 6, (0, 0, 255), -1)
        if i > 0:
            cv2.line(canvas, current_points[i - 1], current_points[i], (0, 0, 255), 2)

    if current_bay_index < len(BAY_NAMES):
        label = f"Click corners for: {BAY_NAMES[current_bay_index]} ({len(current_points)}/4)"
    else:
        label = "DONE! Check terminal for output. Press ESC to exit."

    cv2.rectangle(canvas, (0, 0), (canvas.shape[1], 40), (0, 0, 0), -1)
    cv2.putText(canvas, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX,
                0.8, (255, 255, 255), 2, cv2.LINE_AA)

    # I-resize na lang papuntang display size (hindi na naa-apektuhan
    # yung na-save nang points dahil original-resolution sila).
    disp_w = max(1, int(canvas.shape[1] * scale))
    disp_h = max(1, int(canvas.shape[0] * scale))
    display = cv2.resize(canvas, (disp_w, disp_h), interpolation=cv2.INTER_AREA)

    cv2.imshow(WINDOW_NAME, display)


def mouse_callback(event, x, y, flags, param):
    global current_points, current_bay_index

    if event != cv2.EVENT_LBUTTONDOWN:
        return

    if current_bay_index >= len(BAY_NAMES):
        return

    # I-convert pabalik yung click (na nasa DISPLAY/scaled coordinates)
    # papunta sa ORIGINAL frame coordinates, para tama pa rin ang
    # normalized na output sa camera.py.
    orig_x = int(round(x / scale))
    orig_y = int(round(y / scale))
    current_points.append((orig_x, orig_y))

    if len(current_points) == 4:
        all_bays[BAY_NAMES[current_bay_index]] = current_points.copy()
        current_points.clear()
        current_bay_index += 1
        print_results(partial=True)

    redraw()


def print_results(partial=False):
    h, w = frame.shape[:2]
    print("\n" + "=" * 60)
    print("PARTIAL RESULT" if partial else "FINAL RESULT")
    print("Kopyahin mo ito papunta sa BAY_POLYGONS_NORM sa camera.py:")
    print("=" * 60)
    print("BAY_POLYGONS_NORM = {")
    for name, pts in all_bays.items():
        norm_pts = [(round(px / w, 4), round(py / h, 4)) for px, py in pts]
        print(f'    "{name}": {norm_pts},')
    print("}")
    print("=" * 60 + "\n")


def main():
    global frame, scale

    cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        print("[ERROR] Hindi mabuksan ang video source. Check mo yung VIDEO_SOURCE path.")
        return

    # i-skip papunta sa isang frame na may laman na (may sasakyan/tao)
    for _ in range(FRAME_TO_GRAB):
        ok, frame = cap.read()
        if not ok:
            print("[ERROR] Naubusan ng frames bago pa maabot ang FRAME_TO_GRAB.")
            cap.release()
            return

    cap.release()

    h, w = frame.shape[:2]
    scale = compute_scale(h, w)
    print(f"[INFO] Original video size: {w}x{h} -> Display size: "
          f"{int(w * scale)}x{int(h * scale)} (scale={scale:.3f})")

    # WINDOW_NORMAL para resizable/hindi awtomatikong sumobra sa laki,
    # tapos i-set natin mismo yung window size sa resizeWindow.
    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW_NAME, int(w * scale), int(h * scale))
    cv2.setMouseCallback(WINDOW_NAME, mouse_callback)

    redraw()

    while True:
        key = cv2.waitKey(20) & 0xFF

        if key == 27:  # ESC
            break
        elif key == ord('r'):
            # reset kasalukuyang bay lang
            current_points.clear()
            if current_bay_index < len(BAY_NAMES) and BAY_NAMES[current_bay_index] in all_bays:
                del all_bays[BAY_NAMES[current_bay_index]]
            redraw()

    cv2.destroyAllWindows()

    if all_bays:
        print_results(partial=False)
    else:
        print("[INFO] Walang na-save na bay. Wala tayong output.")


if __name__ == "__main__":
    main()