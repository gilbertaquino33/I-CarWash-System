import cv2
import os
import time
import json
import numpy as np
from datetime import datetime, timezone
from ultralytics import YOLO
from inference_sdk import InferenceHTTPClient
from supabase import create_client


SUPABASE_URL = "https://hybszzpgtbuubdotqkqq.supabase.co"
SUPABASE_KEY = "sb_secret_BWV74FRWT2O0M-K719lanA_8IF8rBwZ"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


STATUS_WAITING = "Waiting"
STATUS_WASHING = "Washing"
STATUS_COMPLETED = "Completed"
STATUS_CANCELLED = "Cancelled"


FINAL_STATUSES = {STATUS_COMPLETED, STATUS_CANCELLED}

BAYS_TABLE = "bays"

# ---------------------------------------------------------------------------
# IMPORTANT: this must match the "id" column of THIS carwash branch's row in
# the shop_profile_setup table. Every bay this camera manages belongs to this
# shop_id, and the customer app uses shop_id to know which bays belong to
# which branch when it shows "1/2 slots available" / "No slot".
# ---------------------------------------------------------------------------
SHOP_ID = 1

DB_MAX_RETRIES = 3
DB_RETRY_BASE_DELAY = 0.8


def run_with_retries(fn, *args, max_retries=DB_MAX_RETRIES, base_delay=DB_RETRY_BASE_DELAY, **kwargs):
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            last_error = e
            print(f"[WARN] {fn.__name__} attempt {attempt}/{max_retries} failed: {e}")
            if attempt < max_retries:
                time.sleep(base_delay * attempt)
    raise last_error


def sync_bays_table():
    """Registers/refreshes the bay rows for this shop. Runs once at startup,
    so every bay starts as vacant (occupied=False) here -- live occupancy is
    then kept up to date by push_bay_live_status() while the app runs.
    NOTE: we intentionally do NOT touch "reserved" here -- if a bay was left
    reserved from a previous run (app customer waiting), a startup sync
    should not wipe that out from under them."""
    rows = [
        {"bay_name": bay_name, "shop_id": SHOP_ID, "occupied": False}
        for bay_name in BAY_POLYGONS_NORM
    ]

    try:
        run_with_retries(
            lambda: supabase.table(BAYS_TABLE)
            .upsert(rows, on_conflict="shop_id,bay_name")
            .execute()
        )
        print(f"[INFO] Synced {len(rows)} bay(s) to '{BAYS_TABLE}' table for shop_id={SHOP_ID}.")
    except Exception as e:
        print(f"[WARN] Failed to sync bays table (does it exist yet? see supabase_migration.sql): {e}")


def push_bay_live_status(bay_name, occupied, car_type="", clear_reserved=False):
    """Pushes the current occupied/vacant status of a single bay to Supabase
    so the customer dashboard can compute slot availability in real time.

    clear_reserved=True is passed whenever a bay becomes vacant (car left or
    finished washing), so it frees up "reserved" too -- otherwise a bay that
    was booked through the app would stay permanently blocked even after
    that reservation is done."""
    payload = {
        "occupied": occupied,
        "car_type": car_type if occupied else "",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if clear_reserved:
        payload["reserved"] = False

    try:
        run_with_retries(
            lambda: supabase.table(BAYS_TABLE)
            .update(payload)
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .execute(),
            max_retries=2,
        )
        print(f"[INFO] Pushed live status for {bay_name}: occupied={occupied} type={car_type or '-'}")
    except Exception as e:
        print(f"[ERROR] Failed to push live status for {bay_name}: {e}")


def is_bay_reserved(bay_name):
    """Checks if this bay currently has a pending app reservation (reserved
    = TRUE in the bays table, set by checkout.tsx's create_customer_reservation
    RPC when a customer books ahead of time)."""
    try:
        response = run_with_retries(
            lambda: supabase.table(BAYS_TABLE)
            .select("reserved")
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .maybe_single()
            .execute(),
            max_retries=2,
        )
        if response.data:
            return bool(response.data.get("reserved", False))
    except Exception as e:
        print(f"[WARN] Failed to check bay reservation status for {bay_name}: {e}")
    return False


def attach_to_existing_reservation(bay_name, vehicle_type):
    """Called when a vehicle physically arrives at a bay that already has a
    pending app reservation (reserved=True). Instead of creating a brand-new
    walk-in reservation row, this finds that pending reservation and marks
    it as physically occupied -- so the app customer's booking is the one
    that gets used, and we don't end up with a duplicate row for the same
    bay/customer. Returns the reservation id, or None if no match was found."""
    try:
        response = run_with_retries(
            lambda: supabase.table("reservation")
            .select("id")
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .eq("status", STATUS_WAITING)
            .eq("occupied", False)
            .order("created_at", desc=False)
            .limit(1)
            .execute(),
            max_retries=2,
        )
        if response.data:
            reservation_id = response.data[0]["id"]
            run_with_retries(
                lambda: supabase.table("reservation")
                .update(
                    {
                        "occupied": True,
                        "washing_started_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                .eq("id", reservation_id)
                .execute()
            )
            print(f"[INFO] Matched arriving vehicle at {bay_name} to existing reservation id={reservation_id}")
            return reservation_id
    except Exception as e:
        print(f"[WARN] Failed to attach to existing reservation for {bay_name}: {e}")
    return None


def _insert_vehicle(vehicle_type, bay_name):
    return (
        supabase.table("reservation")
        .insert(
            {
                "shop_id": SHOP_ID,
                "vehicle_type": vehicle_type,
                "bay_name": bay_name,
                "status": STATUS_WAITING,
                "occupied": True,
                "service_timer": "00:00:00",
            }
        )
        .execute()
    )


def save_vehicle(vehicle_type, bay_name):
    """Creates a brand-new WALK-IN reservation row (no customer_id, since
    walk-ins don't go through the app). Only called when the bay was NOT
    already reserved by an app customer -- see is_bay_reserved() usage in
    main()."""
    response = run_with_retries(_insert_vehicle, vehicle_type, bay_name)

    if response.data:
        return response.data[0].get("id")
    return None


def get_reservation_status(reservation_id):
    if reservation_id is None:
        return None

    try:
        response = run_with_retries(
            lambda: supabase.table("reservation")
            .select("status")
            .eq("id", reservation_id)
            .maybe_single()
            .execute(),
            max_retries=2,
        )
        if response.data:
            return response.data.get("status")
    except Exception as e:
        print(f"[WARN] Failed to fetch reservation status for {reservation_id}: {e}")

    return None


def finalize_vehicle(reservation_id, service_seconds):
    if reservation_id is None:
        return

    current_status = get_reservation_status(reservation_id)

    if current_status in FINAL_STATUSES:
        print(
            f"[INFO] Reservation {reservation_id} already finalized as "
            f"'{current_status}'; leaving status untouched."
        )
        try:
            run_with_retries(
                lambda: supabase.table("reservation")
                .update(
                    {
                        "occupied": False,
                        "service_timer": format_duration(service_seconds),
                    }
                )
                .eq("id", reservation_id)
                .execute()
            )
        except Exception as e:
            print(f"[ERROR] Failed to clear occupied flag for {reservation_id}: {e}")
        return

    final_status = STATUS_COMPLETED if current_status == STATUS_WASHING else STATUS_CANCELLED

    try:
        run_with_retries(
            lambda: supabase.table("reservation")
            .update(
                {
                    "status": final_status,
                    "occupied": False,
                    "service_timer": format_duration(service_seconds),
                }
            )
            .eq("id", reservation_id)
            .execute()
        )
        print(f"[INFO] Reservation {reservation_id} -> {final_status}")
    except Exception as e:
        print(f"[ERROR] Failed to finalize reservation {reservation_id}: {e}")


ROBOFLOW_API_KEY = "zRrS2mLKuvtvmLjGkHYh"


VEHICLE_MODEL_PATH = "yolov8m.pt"
VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}


BODY_STYLE_MODEL_ID = "vehicle-body-style-dataset/3"
BODY_STYLE_VOTE_MIN_CONFIDENCE = 0.5


ALLOWED_APP_VEHICLE_TYPES = [
    "SUV", "Sedan", "Hatchback", "Crossover", "Pickup", "Convertible",
    "Cabriolet", "Wagon", "Coupe", "Sport", "Van", "Oversize Van", "Motorcycle",
]


BODY_STYLE_TO_APP_TYPE = {
    "SUV": "SUV",
    "Crossover": "SUV",
    "Sedan": "Sedan",
    "Hatchback": "Hatchback",
    "Pickup Truck": "Pickup",
    "Convertible": "Convertible",
    "Hardtop Convertible": "Cabriolet",
    "Wagon": "Wagon",
    "Fastback": "Coupe",
    "Sports": "Sport",
    "MPV": "Van",
    "Minibus": "Oversize Van",
}


SHAPE_VOTE_WEIGHT_TALL = 0.35
SHAPE_VOTE_WEIGHT_LOW = 0.3
SHAPE_RATIO_TALL_THRESHOLD = 0.85
SHAPE_RATIO_LOW_THRESHOLD = 0.55


def estimate_body_style_from_shape(vx1, vy1, vx2, vy2):
    w = max(1, vx2 - vx1)
    h = max(1, vy2 - vy1)
    ratio = h / w

    if ratio >= SHAPE_RATIO_TALL_THRESHOLD:
        return "SUV", SHAPE_VOTE_WEIGHT_TALL
    elif ratio <= SHAPE_RATIO_LOW_THRESHOLD:
        return "Sports", SHAPE_VOTE_WEIGHT_LOW
    return None, 0.0


COCO_CLASS_FALLBACK = {
    "car": "Sedan",
    "truck": "Pickup",
    "bus": "Van",
    "motorcycle": "Motorcycle",
}


COCO_VOTE_MIN_CONFIDENCE = 0.5
COCO_MIN_VALID_VOTES = 3
COCO_MIN_WINNER_SHARE = 0.45

BODY_STYLE_MIN_VALID_VOTES = 4
BODY_STYLE_MIN_WINNER_SHARE = 0.4


def weighted_vote(votes):
    if not votes:
        return None, 0, 0.0, 0.0

    tally = {}
    for cls, conf in votes:
        entry = tally.setdefault(cls, {"count": 0, "weight": 0.0})
        entry["count"] += 1
        entry["weight"] += conf

    total_weight = sum(v["weight"] for v in tally.values())
    winner_cls, winner_stats = max(tally.items(), key=lambda kv: kv[1]["weight"])

    return winner_cls, winner_stats["count"], winner_stats["weight"], total_weight


def resolve_coco_class(coco_class_votes, default_class="car"):
    valid_votes = [(cls, conf) for cls, conf in coco_class_votes if conf >= COCO_VOTE_MIN_CONFIDENCE]

    if len(valid_votes) < COCO_MIN_VALID_VOTES:
        if coco_class_votes:
            return max(coco_class_votes, key=lambda v: v[1])[0]
        return default_class

    winner_cls, winner_count, winner_weight, total_weight = weighted_vote(valid_votes)

    if total_weight <= 0 or (winner_weight / total_weight) < COCO_MIN_WINNER_SHARE:
        return max(valid_votes, key=lambda v: v[1])[0]

    print(
        f"[DEBUG] coco-class vote result: {winner_cls} "
        f"({winner_count}/{len(valid_votes)} votes, "
        f"weight_share={winner_weight / total_weight:.2f})"
    )

    return winner_cls


def classify_body_style_single(client, vehicle_crop, coco_class=None):
    if vehicle_crop is None or vehicle_crop.size == 0:
        return None, 0.0

    try:
        result = client.infer(vehicle_crop, model_id=BODY_STYLE_MODEL_ID)
    except Exception as e:
        print(f"[WARN] Body-style inference failed: {e}")
        return None, 0.0

    for p in result.get("predictions", []):
        print(f"[DEBUG] body-style raw prediction: class={p.get('class')} "
              f"conf={p.get('confidence', 0):.2f}")

    predictions = [
        p for p in result.get("predictions", [])
        if p.get("confidence", 0) >= BODY_STYLE_VOTE_MIN_CONFIDENCE
    ]

    if not predictions:
        return None, 0.0

    best = max(predictions, key=lambda p: p.get("confidence", 0))
    return best.get("class", ""), best.get("confidence", 0)


def classify_body_style_from_votes(coco_class_votes, body_style_votes):
    resolved_coco_class = resolve_coco_class(coco_class_votes)
    fallback = COCO_CLASS_FALLBACK.get(resolved_coco_class, "Sedan")

    valid_votes = [(cls, conf) for cls, conf in body_style_votes if cls]

    if len(valid_votes) < BODY_STYLE_MIN_VALID_VOTES:
        print(
            f"[DEBUG] Only {len(valid_votes)} valid body-style vote(s), "
            f"below minimum {BODY_STYLE_MIN_VALID_VOTES}. Using fallback: {fallback}"
        )
        return fallback

    winner_cls, winner_count, winner_weight, total_weight = weighted_vote(valid_votes)

    if total_weight <= 0 or (winner_weight / total_weight) < BODY_STYLE_MIN_WINNER_SHARE:
        print(
            f"[DEBUG] body-style vote inconclusive "
            f"(winner_share={0 if total_weight <= 0 else winner_weight / total_weight:.2f}). "
            f"Using fallback: {fallback}"
        )
        return fallback

    print(
        f"[DEBUG] body-style vote result: {winner_cls} "
        f"({winner_count}/{len(valid_votes)} votes, "
        f"weight_share={winner_weight / total_weight:.2f})"
    )

    return BODY_STYLE_TO_APP_TYPE.get(winner_cls, fallback)


VIDEO_SOURCE = "C:/Users/Gilbert T. Aquino/carwash_app/assets/videos/Test2.mp4"
#VIDEO_SOURCE = "rtsp://admin:pass@192.168.5.211:554/onvif1"


VIDEO_SOURCE_IS_LIVE = False


def get_now(cap):
    if VIDEO_SOURCE_IS_LIVE:
        return time.time()

    pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
    return pos_msec / 1000.0


VEHICLE_CONFIDENCE = 0.5
MIN_VEHICLE_BOX_AREA_RATIO = 0.01

OUTPUT_JSON_PATH = "bay_status.json"


BAY_POLYGONS_NORM = {
    "Bay 1": [(0.024, 0.3222), (0.4385, 0.3185), (0.4396, 0.8426), (0.0208, 0.8315)],
    "Bay 2": [(0.4953, 0.3204), (0.5073, 0.8528), (0.9635, 0.8519), (0.9578, 0.325)],
}


MAX_DISPLAY_WIDTH = 1280
MAX_DISPLAY_HEIGHT = 720


ENTRY_CONFIRM_FRAMES = 12
EXIT_CONFIRM_SECONDS = 5

BAY_OVERLAP_THRESHOLD = 0.55

CLASSIFY_EVERY_N_CANDIDATE_FRAMES = 1


def prediction_to_xyxy(pred):
    x = pred["x"]
    y = pred["y"]
    w = pred["width"]
    h = pred["height"]

    x1 = int(x - w / 2)
    y1 = int(y - h / 2)
    x2 = int(x + w / 2)
    y2 = int(y + h / 2)

    return x1, y1, x2, y2


def clamp_box(x1, y1, x2, y2, width, height):
    x1 = max(0, min(x1, width - 1))
    y1 = max(0, min(y1, height - 1))
    x2 = max(0, min(x2, width - 1))
    y2 = max(0, min(y2, height - 1))
    return x1, y1, x2, y2


def format_duration(seconds):
    seconds = int(seconds)
    hrs = seconds // 3600
    mins = (seconds % 3600) // 60
    secs = seconds % 60
    return f"{hrs:02d}:{mins:02d}:{secs:02d}"


def draw_label(frame, text, x, y, color):
    text_width = max(160, len(text) * 9)

    cv2.rectangle(frame, (x, y - 22), (x + text_width, y), color, -1)

    cv2.putText(
        frame,
        text,
        (x + 5, y - 6),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (255, 255, 255),
        1,
        cv2.LINE_AA,
    )


def polygon_to_mask(polygon_pts, width, height):
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [polygon_pts], 255)
    return mask


def box_overlap_ratio(box_xyxy, bay_mask):
    x1, y1, x2, y2 = box_xyxy

    if x2 <= x1 or y2 <= y1:
        return 0.0

    box_area = (x2 - x1) * (y2 - y1)
    if box_area <= 0:
        return 0.0

    region = bay_mask[y1:y2, x1:x2]
    inside_pixels = int(np.count_nonzero(region))

    return inside_pixels / box_area


def main():
    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com",
        api_key=ROBOFLOW_API_KEY,
    )

    sync_bays_table()

    print("[INFO] Loading YOLOv8 vehicle detector...")
    vehicle_model = YOLO(VEHICLE_MODEL_PATH)

    cap = cv2.VideoCapture(VIDEO_SOURCE)

    if not cap.isOpened():
        print("[ERROR] Cannot open video source.")
        return

    bay_state = {}

    for bay_id in BAY_POLYGONS_NORM:
        bay_state[bay_id] = {
            "occupied": False,
            "start_time": None,
            "service_seconds": 0,
            "service_timer": "00:00:00",
            "car_type": "",
            "last_seen": None,
            "reservation_id": None,
            "candidate_count": 0,
            "coco_class_votes": [],
            "classification_votes": [],
        }

    frame_count = 0

    cached_masks = {}
    cached_mask_size = None

    print("[INFO] Bay monitor started. Press Q to quit.")

    try:
        while True:
            ok, frame = cap.read()

            if not ok:
                print("[WARN] No frame received.")
                break

            frame_count += 1
            height, width = frame.shape[:2]
            frame_area = width * height

            bay_polygons = {}

            if cached_mask_size != (width, height):
                cached_masks = {}
                cached_mask_size = (width, height)

            for bay_id, norm_polygon in BAY_POLYGONS_NORM.items():
                polygon = [(int(nx * width), int(ny * height)) for nx, ny in norm_polygon]
                pts = np.array(polygon, np.int32)
                pts = pts.reshape((-1, 1, 2))

                bay_polygons[bay_id] = pts

                if bay_id not in cached_masks:
                    cached_masks[bay_id] = polygon_to_mask(pts, width, height)

                color = (0, 255, 0) if bay_state[bay_id]["occupied"] else (80, 80, 80)

                cv2.polylines(frame, [pts], True, color, 2)

                label_x = polygon[0][0]
                label_y = polygon[0][1]

                draw_label(frame, bay_id, label_x, label_y, color)

            yolo_results = vehicle_model(frame, verbose=False, iou=0.5)[0]

            raw_vehicle_preds = []
            for box in yolo_results.boxes:
                cls_id = int(box.cls[0])
                cls_name = yolo_results.names[cls_id]

                if cls_name not in VEHICLE_CLASSES:
                    continue

                bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])

                box_area = max(0, bx2 - bx1) * max(0, by2 - by1)
                if frame_area > 0 and (box_area / frame_area) < MIN_VEHICLE_BOX_AREA_RATIO:
                    continue

                raw_vehicle_preds.append(
                    {
                        "x": (bx1 + bx2) / 2,
                        "y": (by1 + by2) / 2,
                        "width": bx2 - bx1,
                        "height": by2 - by1,
                        "confidence": conf,
                        "class": cls_name,
                    }
                )

            vehicles = [
                p for p in raw_vehicle_preds if p.get("confidence", 0) >= VEHICLE_CONFIDENCE
            ]

            detected_now = {bay_id: False for bay_id in BAY_POLYGONS_NORM}

            for vehicle in vehicles:
                vx1, vy1, vx2, vy2 = prediction_to_xyxy(vehicle)
                vx1, vy1, vx2, vy2 = clamp_box(vx1, vy1, vx2, vy2, width, height)

                vehicle_class = vehicle.get("class", "vehicle")
                vehicle_conf = vehicle.get("confidence", 0)

                matched_bay = None
                best_ratio = 0.0

                for bay_id in bay_polygons:
                    ratio = box_overlap_ratio((vx1, vy1, vx2, vy2), cached_masks[bay_id])
                    if ratio > best_ratio:
                        best_ratio = ratio
                        matched_bay = bay_id

                if best_ratio < BAY_OVERLAP_THRESHOLD:
                    matched_bay = None

                color = (255, 120, 0) if matched_bay else (120, 120, 120)
                cv2.rectangle(frame, (vx1, vy1), (vx2, vy2), color, 2)
                label_text = f"{vehicle_class} {vehicle_conf:.2f}"
                if matched_bay:
                    label_text += f" -> {matched_bay} ({best_ratio:.0%})"
                draw_label(frame, label_text, vx1, vy1, color)

                if matched_bay is None:
                    continue

                detected_now[matched_bay] = True
                bay = bay_state[matched_bay]

                if not bay["occupied"]:
                    bay["candidate_count"] += 1
                    bay["coco_class_votes"].append((vehicle_class, vehicle_conf))

                    if bay["candidate_count"] % CLASSIFY_EVERY_N_CANDIDATE_FRAMES == 0:
                        vehicle_crop = frame[vy1:vy2, vx1:vx2].copy()
                        raw_class, conf = classify_body_style_single(client, vehicle_crop, vehicle_class)
                        if raw_class:
                            bay["classification_votes"].append((raw_class, conf))

                        shape_class, shape_conf = estimate_body_style_from_shape(vx1, vy1, vx2, vy2)
                        if shape_class:
                            bay["classification_votes"].append((shape_class, shape_conf))

                    if bay["candidate_count"] >= ENTRY_CONFIRM_FRAMES:
                        specific_type = classify_body_style_from_votes(
                            bay["coco_class_votes"], bay["classification_votes"]
                        )

                        bay["occupied"] = True
                        bay["start_time"] = get_now(cap)
                        bay["car_type"] = specific_type
                        bay["candidate_count"] = 0
                        bay["coco_class_votes"] = []
                        bay["classification_votes"] = []

                        # ------------------------------------------------------------------
                        # FIX: bago tayo gumawa ng bagong WALK-IN reservation, tingnan muna
                        # kung ang bay na ito ay may naka-pending nang RESERVATION mula sa app
                        # (bays.reserved = True). Kung meron, ang dumating na kotse ay malamang
                        # yung mismong customer na yun -- i-attach na lang natin sa reservation
                        # niya sa halip na gumawa ng panibagong duplicate na walk-in row.
                        # Kung wala namang naka-reserve (bakante talaga bago dumating), saka
                        # lang tayo gagawa ng bagong walk-in reservation, gaya ng dati.
                        # ------------------------------------------------------------------
                        if is_bay_reserved(matched_bay):
                            reservation_id = attach_to_existing_reservation(matched_bay, specific_type)
                            if reservation_id is None:
                                # Safety net lang ito kung sakaling walang na-match
                                # (hal. na-cancel na pala ang reservation) -- gawa na
                                # lang tayo ng bagong walk-in record.
                                try:
                                    reservation_id = save_vehicle(specific_type, matched_bay)
                                except Exception as e:
                                    print(f"[ERROR] Failed to save reservation: {e}")
                                    reservation_id = None
                        else:
                            try:
                                reservation_id = save_vehicle(specific_type, matched_bay)
                                print(f"[INFO] New walk-in reservation created for {matched_bay}: {specific_type}")
                            except Exception as e:
                                print(f"[ERROR] Failed to save reservation: {e}")
                                reservation_id = None

                        bay["reservation_id"] = reservation_id

                        # Tell Supabase this bay is now occupied so the customer
                        # app immediately reflects reduced slot availability.
                        push_bay_live_status(matched_bay, True, specific_type)

                bay["last_seen"] = get_now(cap)

            now = get_now(cap)

            for bay_id, bay in bay_state.items():
                if detected_now[bay_id]:
                    if bay["occupied"] and bay["start_time"] is not None:
                        bay["service_seconds"] = now - bay["start_time"]
                        bay["service_timer"] = format_duration(bay["service_seconds"])
                else:
                    if not bay["occupied"]:
                        bay["candidate_count"] = 0
                        bay["coco_class_votes"] = []
                        bay["classification_votes"] = []

                    if bay["occupied"]:
                        last_seen = bay.get("last_seen")

                        if last_seen is not None and now - last_seen > EXIT_CONFIRM_SECONDS:
                            finalize_vehicle(bay["reservation_id"], bay["service_seconds"])

                            bay["occupied"] = False
                            bay["start_time"] = None
                            bay["service_seconds"] = 0
                            bay["service_timer"] = "00:00:00"
                            bay["car_type"] = ""
                            bay["reservation_id"] = None
                            bay["candidate_count"] = 0
                            bay["coco_class_votes"] = []
                            bay["classification_votes"] = []

                            # Bay just freed up -- push it back to vacant AND clear
                            # "reserved" so the customer app can show the slot as
                            # available again (whether it was a walk-in or a
                            # completed app reservation that just left).
                            push_bay_live_status(bay_id, False, clear_reserved=True)

            panel_y = 30

            for bay_id, bay in bay_state.items():
                status = "OCCUPIED" if bay["occupied"] else "VACANT"
                text = (
                    f"{bay_id}: {status} | "
                    f"Timer: {bay['service_timer']} | "
                    f"Type: {bay['car_type'] or '-'}"
                )

                cv2.putText(
                    frame,
                    text,
                    (20, panel_y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 255),
                    2,
                    cv2.LINE_AA,
                )

                panel_y += 28

            json_safe_state = {
                bay_id: {
                    k: v for k, v in bay.items()
                    if k not in ("classification_votes", "coco_class_votes")
                }
                for bay_id, bay in bay_state.items()
            }
            with open(OUTPUT_JSON_PATH, "w") as f:
                json.dump(json_safe_state, f, indent=2)

            display_frame = frame
            scale = min(MAX_DISPLAY_WIDTH / width, MAX_DISPLAY_HEIGHT / height, 1.0)

            if scale < 1.0:
                display_frame = cv2.resize(
                    frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA
                )

            cv2.imshow("Bay Occupancy Monitor", display_frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        for bay_id, bay in bay_state.items():
            if bay["occupied"]:
                print(f"[INFO] Cleaning up still-occupied {bay_id} on exit...")
                finalize_vehicle(bay["reservation_id"], bay["service_seconds"])
                push_bay_live_status(bay_id, False, clear_reserved=True)

        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()