import matplotlib
matplotlib.use("Agg")

import cv2
import os
import time
import json
import numpy as np
from datetime import datetime, timezone

from ultralytics import YOLO
from inference_sdk import InferenceHTTPClient
from supabase import create_client


# ============================================================
# SUPABASE
# ============================================================

SUPABASE_URL = "https://hybszzpgtbuubdotqkqq.supabase.co"

# IMPORTANT:
# Replace this with your EXISTING working Supabase anon key.
SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "SUPABASE_ANON_KEY_REDACTED"
)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ============================================================
# STATUS
# ============================================================

STATUS_WAITING = "Waiting"
STATUS_WASHING = "Washing"
STATUS_COMPLETED = "Completed"
STATUS_CANCELLED = "Cancelled"

FINAL_STATUSES = {
    STATUS_COMPLETED,
    STATUS_CANCELLED
}


# ============================================================
# DATABASE TABLES
# ============================================================

BAYS_TABLE = "bays"
BAY_ZONES_TABLE = "bay_zones"
SHOP_PROFILE_TABLE = "shop_profile_setup"

SHOP_ID = 2
SHOP_NAME = ""


# ============================================================
# DATABASE RETRIES
# ============================================================

DB_MAX_RETRIES = 3
DB_RETRY_BASE_DELAY = 0.8


def run_with_retries(
    fn,
    *args,
    max_retries=DB_MAX_RETRIES,
    base_delay=DB_RETRY_BASE_DELAY,
    **kwargs
):
    last_error = None

    for attempt in range(1, max_retries + 1):
        try:
            return fn(*args, **kwargs)

        except Exception as e:
            last_error = e

            print(
                f"[WARN] {fn.__name__} "
                f"attempt {attempt}/{max_retries} failed: {e}"
            )

            if attempt < max_retries:
                time.sleep(base_delay * attempt)

    raise last_error


# ============================================================
# SHOP
# ============================================================

def load_shop_name_from_supabase():
    global SHOP_NAME

    try:
        response = run_with_retries(
            lambda: supabase
            .table(SHOP_PROFILE_TABLE)
            .select("shop_name")
            .eq("id", SHOP_ID)
            .maybe_single()
            .execute(),
            max_retries=2,
        )

    except Exception as e:
        print(
            f"[WARN] Could not load shop_name "
            f"for shop_id={SHOP_ID}: {e}"
        )

        SHOP_NAME = ""
        return

    if response and response.data:
        shop_name = response.data.get("shop_name")

        if shop_name:
            SHOP_NAME = shop_name

            print(
                f"[INFO] Loaded shop_name='{SHOP_NAME}' "
                f"for shop_id={SHOP_ID}"
            )

            return

    print(
        f"[WARN] No shop profile found for shop_id={SHOP_ID}. "
        "SHOP_NAME will remain empty."
    )

    SHOP_NAME = ""


# ============================================================
# BAY DATABASE
# ============================================================

def sync_bays_table():

    rows = [
        {
            "bay_name": bay_name,
            "shop_id": SHOP_ID,
            "occupied": False
        }
        for bay_name in BAY_POLYGONS_NORM
    ]

    if not rows:
        return

    try:
        run_with_retries(
            lambda: supabase
            .table(BAYS_TABLE)
            .upsert(
                rows,
                on_conflict="shop_id,bay_name"
            )
            .execute()
        )

        print(
            f"[INFO] Synced {len(rows)} bay(s) "
            f"to '{BAYS_TABLE}'."
        )

    except Exception as e:
        print(
            f"[WARN] Failed to sync bays table: {e}"
        )


def push_bay_live_status(
    bay_name,
    occupied,
    car_type="",
    clear_reserved=False
):

    payload = {
        "occupied": occupied,
        "car_type": car_type if occupied else "",
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }

    if clear_reserved:
        payload["reserved"] = False

    try:

        run_with_retries(
            lambda: supabase
            .table(BAYS_TABLE)
            .update(payload)
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .execute(),
            max_retries=2,
        )

        print(
            f"[INFO] Bay {bay_name}: "
            f"occupied={occupied}, "
            f"type={car_type or '-'}"
        )

    except Exception as e:

        print(
            f"[ERROR] Failed to push bay status "
            f"for {bay_name}: {e}"
        )


def is_bay_reserved(bay_name):

    try:

        response = run_with_retries(
            lambda: supabase
            .table(BAYS_TABLE)
            .select("reserved")
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .maybe_single()
            .execute(),
            max_retries=2,
        )

        if response.data:
            return bool(
                response.data.get(
                    "reserved",
                    False
                )
            )

    except Exception as e:

        print(
            f"[WARN] Failed to check reservation "
            f"for {bay_name}: {e}"
        )

    return False


# ============================================================
# RESERVATION
# ============================================================

def attach_to_existing_reservation(
    bay_name,
    vehicle_type
):

    try:

        response = run_with_retries(
            lambda: supabase
            .table("reservation")
            .select("id")
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .eq("status", STATUS_WAITING)
            .eq("occupied", False)
            .order(
                "created_at",
                desc=False
            )
            .limit(1)
            .execute(),
            max_retries=2,
        )

        if response.data:

            reservation_id = response.data[0]["id"]

            run_with_retries(
                lambda: supabase
                .table("reservation")
                .update(
                    {
                        "occupied": True,
                        "washing_started_at":
                            datetime.now(
                                timezone.utc
                            ).isoformat(),
                    }
                )
                .eq(
                    "id",
                    reservation_id
                )
                .execute()
            )

            print(
                f"[INFO] Matched arriving vehicle "
                f"at {bay_name} to reservation "
                f"id={reservation_id}"
            )

            return reservation_id

    except Exception as e:

        print(
            f"[WARN] Failed to attach reservation "
            f"for {bay_name}: {e}"
        )

    return None


def _insert_vehicle(
    vehicle_type,
    bay_name
):

    today_date = datetime.now().strftime(
        "%Y-%m-%d"
    )

    return (
        supabase
        .table("reservation")
        .insert(
            {
                "shop_id": SHOP_ID,
                "shop_name": SHOP_NAME,
                "vehicle_type": vehicle_type,
                "bay_name": bay_name,
                "status": STATUS_WAITING,
                "occupied": True,
                "service_timer": "00:00:00",
                "reservation_date": today_date,
            }
        )
        .execute()
    )


def _insert_walkin_transaction(
    reservation_id,
    shop_id,
    shop_name,
    vehicle_type,
    bay_name
):

    today_date = datetime.now().strftime(
        "%Y-%m-%d"
    )

    return (
        supabase
        .table("walkin_transactions")
        .insert(
            {
                "reservation_id": reservation_id,
                "shop_id": shop_id,
                "shop_name": shop_name,
                "vehicle_type": vehicle_type,
                "bay_name": bay_name,
                "price": 0,
                "reservation_date": today_date,
                "service_timer": "00:00:00"
            }
        )
        .execute()
    )


def save_vehicle(
    vehicle_type,
    bay_name
):

    response = run_with_retries(
        _insert_vehicle,
        vehicle_type,
        bay_name
    )

    if response.data:

        reservation_id = (
            response.data[0].get("id")
        )

        try:

            run_with_retries(
                _insert_walkin_transaction,
                reservation_id,
                SHOP_ID,
                SHOP_NAME,
                vehicle_type,
                bay_name,
                max_retries=2
            )

            print(
                "[INFO] Auto-created "
                "walkin_transactions record "
                f"for reservation_id={reservation_id}"
            )

        except Exception as e:

            print(
                "[ERROR] Failed to insert "
                f"walkin_transactions: {e}"
            )

        return reservation_id

    return None


def get_reservation_status(
    reservation_id
):

    if reservation_id is None:
        return None

    try:

        response = run_with_retries(
            lambda: supabase
            .table("reservation")
            .select("status")
            .eq("id", reservation_id)
            .maybe_single()
            .execute(),
            max_retries=2,
        )

        if response.data:
            return response.data.get(
                "status"
            )

    except Exception as e:

        print(
            f"[WARN] Failed to fetch reservation "
            f"{reservation_id}: {e}"
        )

    return None


def finalize_vehicle(
    reservation_id,
    service_seconds
):

    if reservation_id is None:
        return

    current_status = (
        get_reservation_status(
            reservation_id
        )
    )

    formatted_timer = format_duration(
        service_seconds
    )

    if current_status in FINAL_STATUSES:

        print(
            f"[INFO] Reservation "
            f"{reservation_id} already finalized "
            f"as '{current_status}'."
        )

        try:

            run_with_retries(
                lambda: supabase
                .table("reservation")
                .update(
                    {
                        "occupied": False,
                        "service_timer":
                            formatted_timer,
                    }
                )
                .eq(
                    "id",
                    reservation_id
                )
                .execute()
            )

        except Exception as e:

            print(
                f"[ERROR] Failed to clear "
                f"reservation {reservation_id}: {e}"
            )

        return

    final_status = (
        STATUS_COMPLETED
        if current_status == STATUS_WASHING
        else STATUS_CANCELLED
    )

    try:

        run_with_retries(
            lambda: supabase
            .table("reservation")
            .update(
                {
                    "status": final_status,
                    "occupied": False,
                    "service_timer":
                        formatted_timer,
                }
            )
            .eq(
                "id",
                reservation_id
            )
            .execute()
        )

        print(
            f"[INFO] Reservation "
            f"{reservation_id} -> {final_status}"
        )

        run_with_retries(
            lambda: supabase
            .table("walkin_transactions")
            .update(
                {
                    "service_timer":
                        formatted_timer,
                    "completed_at":
                        datetime.now(
                            timezone.utc
                        ).isoformat(),
                }
            )
            .eq(
                "reservation_id",
                reservation_id
            )
            .execute(),
            max_retries=2
        )

        print(
            f"[INFO] Walkin transaction "
            f"{reservation_id} updated."
        )

    except Exception as e:

        print(
            "[ERROR] Failed to finalize "
            f"reservation {reservation_id}: {e}"
        )


# ============================================================
# AI / YOLO / ROBOFLOW
# ============================================================

ROBOFLOW_API_KEY = os.getenv(
    "ROBOFLOW_API_KEY",
    "zRrS2mLKuvtvmLjGkHYh"
)

VEHICLE_MODEL_PATH = "yolov8n.pt"

VEHICLE_CLASSES = {
    "car",
    "truck",
    "bus",
    "motorcycle"
}

BODY_STYLE_MODEL_ID = (
    "vehicle-body-style-dataset/4"
)

BODY_STYLE_VOTE_MIN_CONFIDENCE = 0.5


ALLOWED_APP_VEHICLE_TYPES = [
    "SUV",
    "Sedan",
    "Hatchback",
    "Crossover",
    "Pickup",
    "Convertible",
    "Cabriolet",
    "Wagon",
    "Coupe",
    "Sport",
    "Van",
    "Oversize Van",
    "Motorcycle",
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


def estimate_body_style_from_shape(
    vx1,
    vy1,
    vx2,
    vy2
):

    w = max(
        1,
        vx2 - vx1
    )

    h = max(
        1,
        vy2 - vy1
    )

    ratio = h / w

    if ratio >= SHAPE_RATIO_TALL_THRESHOLD:
        return (
            "SUV",
            SHAPE_VOTE_WEIGHT_TALL
        )

    if ratio <= SHAPE_RATIO_LOW_THRESHOLD:
        return (
            "Sports",
            SHAPE_VOTE_WEIGHT_LOW
        )

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

        entry = tally.setdefault(
            cls,
            {
                "count": 0,
                "weight": 0.0
            }
        )

        entry["count"] += 1
        entry["weight"] += conf

    total_weight = sum(
        v["weight"]
        for v in tally.values()
    )

    winner_cls, winner_stats = max(
        tally.items(),
        key=lambda kv: kv[1]["weight"]
    )

    return (
        winner_cls,
        winner_stats["count"],
        winner_stats["weight"],
        total_weight
    )


def resolve_coco_class(
    coco_class_votes,
    default_class="car"
):

    valid_votes = [
        (cls, conf)
        for cls, conf
        in coco_class_votes
        if conf >= COCO_VOTE_MIN_CONFIDENCE
    ]

    if len(valid_votes) < COCO_MIN_VALID_VOTES:

        if coco_class_votes:
            return max(
                coco_class_votes,
                key=lambda v: v[1]
            )[0]

        return default_class

    (
        winner_cls,
        winner_count,
        winner_weight,
        total_weight
    ) = weighted_vote(valid_votes)

    if (
        total_weight <= 0
        or
        (
            winner_weight /
            total_weight
        ) < COCO_MIN_WINNER_SHARE
    ):

        return max(
            valid_votes,
            key=lambda v: v[1]
        )[0]

    print(
        f"[DEBUG] COCO vote: {winner_cls} "
        f"({winner_count}/{len(valid_votes)})"
    )

    return winner_cls


def classify_body_style_single(
    client,
    vehicle_crop,
    coco_class=None
):

    if (
        vehicle_crop is None
        or vehicle_crop.size == 0
    ):
        return None, 0.0

    try:

        result = client.infer(
            vehicle_crop,
            model_id=BODY_STYLE_MODEL_ID
        )

    except Exception as e:

        print(
            f"[WARN] Body-style inference failed: {e}"
        )

        return None, 0.0

    predictions = result.get(
        "predictions",
        []
    )

    for p in predictions:

        print(
            "[DEBUG] Body style: "
            f"{p.get('class')} "
            f"{p.get('confidence', 0):.2f}"
        )

    predictions = [
        p
        for p in predictions
        if p.get(
            "confidence",
            0
        ) >= BODY_STYLE_VOTE_MIN_CONFIDENCE
    ]

    if not predictions:
        return None, 0.0

    best = max(
        predictions,
        key=lambda p: p.get(
            "confidence",
            0
        )
    )

    return (
        best.get("class", ""),
        best.get("confidence", 0)
    )


def classify_body_style_from_votes(
    coco_class_votes,
    body_style_votes
):

    resolved_coco_class = resolve_coco_class(
        coco_class_votes
    )

    fallback = COCO_CLASS_FALLBACK.get(
        resolved_coco_class,
        "Sedan"
    )

    valid_votes = [
        (cls, conf)
        for cls, conf
        in body_style_votes
        if cls
    ]

    if (
        len(valid_votes)
        < BODY_STYLE_MIN_VALID_VOTES
    ):

        print(
            f"[DEBUG] Body-style votes="
            f"{len(valid_votes)}. "
            f"Fallback={fallback}"
        )

        return fallback

    (
        winner_cls,
        winner_count,
        winner_weight,
        total_weight
    ) = weighted_vote(valid_votes)

    if (
        total_weight <= 0
        or
        (
            winner_weight /
            total_weight
        ) < BODY_STYLE_MIN_WINNER_SHARE
    ):

        print(
            "[DEBUG] Body-style vote "
            "inconclusive. "
            f"Fallback={fallback}"
        )

        return fallback

    print(
        f"[DEBUG] Body-style winner="
        f"{winner_cls} "
        f"({winner_count}/{len(valid_votes)})"
    )

    return BODY_STYLE_TO_APP_TYPE.get(
        winner_cls,
        fallback
    )


# ============================================================
# CCTV
# ============================================================

VIDEO_SOURCE = (
    "rtsp://admin:pass@192.168.189.211:554/onvif1"
)

VIDEO_SOURCE_IS_LIVE = True

LOOP_VIDEO_FILE = True


VEHICLE_CONFIDENCE = 0.6

MIN_VEHICLE_BOX_AREA_RATIO = 0.01

OUTPUT_JSON_PATH = "bay_status.json"


# ============================================================
# BAY ZONES
# ============================================================

BAY_POLYGONS_NORM = {}

_FALLBACK_BAY_POLYGONS_NORM = {

    "Bay 1": [
        (0.024, 0.3222),
        (0.4385, 0.3185),
        (0.4396, 0.8426),
        (0.0208, 0.8315)
    ],

    "Bay 2": [
        (0.4953, 0.3204),
        (0.5073, 0.8528),
        (0.9635, 0.8519),
        (0.9578, 0.325)
    ],
}


def load_bay_polygons_from_supabase():

    global BAY_POLYGONS_NORM

    try:

        response = run_with_retries(
            lambda: supabase
            .table(BAY_ZONES_TABLE)
            .select(
                "bay_name, polygon"
            )
            .eq(
                "shop_id",
                SHOP_ID
            )
            .execute(),
            max_retries=2,
        )

    except Exception as e:

        print(
            f"[WARN] Could not load bay zones: {e}"
        )

        BAY_POLYGONS_NORM = dict(
            _FALLBACK_BAY_POLYGONS_NORM
        )

        return

    rows = response.data or []

    if not rows:

        print(
            "[WARN] No calibrated bay zones "
            "found. Using fallback zones."
        )

        BAY_POLYGONS_NORM = dict(
            _FALLBACK_BAY_POLYGONS_NORM
        )

        return

    loaded = {}

    for row in rows:

        bay_name = row.get(
            "bay_name"
        )

        polygon = row.get(
            "polygon"
        )

        if not bay_name or not polygon:
            continue

        loaded[bay_name] = [
            (
                float(pt[0]),
                float(pt[1])
            )
            for pt in polygon
        ]

    if not loaded:

        print(
            "[WARN] Bay zone rows invalid. "
            "Using fallback."
        )

        BAY_POLYGONS_NORM = dict(
            _FALLBACK_BAY_POLYGONS_NORM
        )

        return

    BAY_POLYGONS_NORM = loaded

    print(
        f"[INFO] Loaded "
        f"{len(BAY_POLYGONS_NORM)} bay zones: "
        f"{', '.join(BAY_POLYGONS_NORM.keys())}"
    )


# ============================================================
# DETECTION SETTINGS
# ============================================================

MAX_DISPLAY_WIDTH = 1280
MAX_DISPLAY_HEIGHT = 720

ENTRY_CONFIRM_FRAMES = 20

EXIT_CONFIRM_SECONDS = 5

BAY_OVERLAP_THRESHOLD = 0.65

CLASSIFY_EVERY_N_CANDIDATE_FRAMES = 1


# ============================================================
# HELPERS
# ============================================================

def prediction_to_xyxy(pred):

    x = pred["x"]
    y = pred["y"]

    w = pred["width"]
    h = pred["height"]

    x1 = int(x - w / 2)
    y1 = int(y - h / 2)

    x2 = int(x + w / 2)
    y2 = int(y + h / 2)

    return (
        x1,
        y1,
        x2,
        y2
    )


def clamp_box(
    x1,
    y1,
    x2,
    y2,
    width,
    height
):

    x1 = max(
        0,
        min(x1, width - 1)
    )

    y1 = max(
        0,
        min(y1, height - 1)
    )

    x2 = max(
        0,
        min(x2, width - 1)
    )

    y2 = max(
        0,
        min(y2, height - 1)
    )

    return (
        x1,
        y1,
        x2,
        y2
    )


def format_duration(seconds):

    seconds = int(seconds)

    hrs = seconds // 3600

    mins = (
        seconds % 3600
    ) // 60

    secs = seconds % 60

    return (
        f"{hrs:02d}:"
        f"{mins:02d}:"
        f"{secs:02d}"
    )


def draw_label(
    frame,
    text,
    x,
    y,
    color
):

    text_width = max(
        160,
        len(text) * 9
    )

    y = max(
        25,
        y
    )

    cv2.rectangle(
        frame,
        (x, y - 22),
        (x + text_width, y),
        color,
        -1
    )

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


def polygon_to_mask(
    polygon_pts,
    width,
    height
):

    mask = np.zeros(
        (height, width),
        dtype=np.uint8
    )

    cv2.fillPoly(
        mask,
        [polygon_pts],
        255
    )

    return mask


def box_overlap_ratio(
    box_xyxy,
    bay_mask
):

    x1, y1, x2, y2 = box_xyxy

    if (
        x2 <= x1
        or
        y2 <= y1
    ):
        return 0.0

    box_area = (
        x2 - x1
    ) * (
        y2 - y1
    )

    if box_area <= 0:
        return 0.0

    region = bay_mask[
        y1:y2,
        x1:x2
    ]

    inside_pixels = int(
        np.count_nonzero(region)
    )

    return (
        inside_pixels /
        box_area
    )


# ============================================================
# GLOBAL AI OBJECTS
# ============================================================

vehicle_model = None

roboflow_client = None

camera_initialized = False


def initialize_ai():

    global vehicle_model
    global roboflow_client

    if vehicle_model is None:

        print(
            "[AI] Loading YOLOv8 vehicle detector..."
        )

        vehicle_model = YOLO(
            VEHICLE_MODEL_PATH
        )

        print(
            "[AI] YOLOv8 loaded!"
        )

    if roboflow_client is None:

        print(
            "[AI] Connecting to Roboflow..."
        )

        roboflow_client = (
            InferenceHTTPClient(
                api_url=
                "https://serverless.roboflow.com",
                api_key=
                ROBOFLOW_API_KEY,
            )
        )

        print(
            "[AI] Roboflow client ready!"
        )


# ============================================================
# MAIN GENERATOR
# ============================================================

def generate_frames():

    global camera_initialized

    print(
        "[CAMERA] Starting CCTV + YOLO..."
    )

    # --------------------------------------------------------
    # Initialize AI
    # --------------------------------------------------------

    try:

        initialize_ai()

    except Exception as e:

        print(
            f"[AI ERROR] Failed to initialize AI: {e}"
        )

        return

    # --------------------------------------------------------
    # Load database configuration
    # --------------------------------------------------------

    try:

        load_shop_name_from_supabase()

        load_bay_polygons_from_supabase()

        sync_bays_table()

    except Exception as e:

        print(
            f"[WARN] Database initialization issue: {e}"
        )

        if not BAY_POLYGONS_NORM:

            BAY_POLYGONS_NORM = dict(
                _FALLBACK_BAY_POLYGONS_NORM
            )

    if not BAY_POLYGONS_NORM:

        print(
            "[ERROR] No bay zones available."
        )

        return

    # --------------------------------------------------------
    # CCTV connection
    # --------------------------------------------------------

    cap = cv2.VideoCapture(
        VIDEO_SOURCE,
        cv2.CAP_FFMPEG
    )

    print(
        "[CAMERA] VideoCapture created"
    )

    print(
        "[CAMERA] OPENED:",
        cap.isOpened()
    )

    if not cap.isOpened():

        print(
            "[CAMERA] Cannot open CCTV"
        )

        cap.release()

        return

    print(
        "[CAMERA] CCTV CONNECTED!"
    )

    camera_initialized = True

    # --------------------------------------------------------
    # Bay state
    # --------------------------------------------------------

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

    cached_masks = {}

    cached_mask_size = None

    print(
        "[CV] Computer Vision monitor started."
    )

    print(
        "[CV] YOLO vehicle detection ACTIVE."
    )

    try:

        while True:

            # =================================================
            # READ CCTV FRAME
            # =================================================

            ok, frame = cap.read()

            if not ok or frame is None:

                print(
                    "[CAMERA] Frame failed. "
                    "Trying to reconnect..."
                )

                cap.release()

                time.sleep(1)

                cap = cv2.VideoCapture(
                    VIDEO_SOURCE,
                    cv2.CAP_FFMPEG
                )

                continue

            height, width = frame.shape[:2]

            frame_area = (
                width * height
            )

            # =================================================
            # BAY MASKS
            # =================================================

            if cached_mask_size != (
                width,
                height
            ):

                cached_masks = {}

                cached_mask_size = (
                    width,
                    height
                )

            bay_polygons = {}

            for (
                bay_id,
                norm_polygon
            ) in BAY_POLYGONS_NORM.items():

                polygon = [

                    (
                        int(nx * width),
                        int(ny * height)
                    )

                    for nx, ny
                    in norm_polygon
                ]

                pts = np.array(
                    polygon,
                    np.int32
                )

                pts = pts.reshape(
                    (-1, 1, 2)
                )

                bay_polygons[
                    bay_id
                ] = pts

                if bay_id not in cached_masks:

                    cached_masks[
                        bay_id
                    ] = polygon_to_mask(
                        pts,
                        width,
                        height
                    )

                bay = bay_state[
                    bay_id
                ]

                if bay["occupied"]:

                    zone_color = (
                        0,
                        255,
                        0
                    )

                else:

                    zone_color = (
                        80,
                        80,
                        80
                    )

                cv2.polylines(
                    frame,
                    [pts],
                    True,
                    zone_color,
                    3
                )

                label_x = polygon[0][0]

                label_y = polygon[0][1]

                draw_label(
                    frame,
                    bay_id,
                    label_x,
                    label_y,
                    zone_color
                )

            # =================================================
            # YOLO DETECTION
            # =================================================

            print(
                "[YOLO] Detecting vehicles..."
            )

            try:

                yolo_results = (
                    vehicle_model(
                        frame,
                        verbose=False,
                        iou=0.5
                    )[0]
                )

            except Exception as e:

                print(
                    f"[YOLO ERROR] {e}"
                )

                continue

            raw_vehicle_preds = []

            for box in yolo_results.boxes:

                cls_id = int(
                    box.cls[0]
                )

                cls_name = (
                    yolo_results.names[
                        cls_id
                    ]
                )

                if cls_name not in VEHICLE_CLASSES:
                    continue

                bx1, by1, bx2, by2 = map(
                    int,
                    box.xyxy[0]
                )

                conf = float(
                    box.conf[0]
                )

                box_area = max(
                    0,
                    bx2 - bx1
                ) * max(
                    0,
                    by2 - by1
                )

                if (
                    frame_area > 0
                    and
                    (
                        box_area /
                        frame_area
                    )
                    < MIN_VEHICLE_BOX_AREA_RATIO
                ):
                    continue

                raw_vehicle_preds.append(
                    {
                        "x":
                            (bx1 + bx2) / 2,

                        "y":
                            (by1 + by2) / 2,

                        "width":
                            bx2 - bx1,

                        "height":
                            by2 - by1,

                        "confidence":
                            conf,

                        "class":
                            cls_name,
                    }
                )

            vehicles = [

                p
                for p
                in raw_vehicle_preds

                if p.get(
                    "confidence",
                    0
                ) >= VEHICLE_CONFIDENCE

            ]

            # =================================================
            # DETECTED BAYS
            # =================================================

            detected_now = {
                bay_id: False
                for bay_id
                in BAY_POLYGONS_NORM
            }

            # =================================================
            # PROCESS EACH VEHICLE
            # =================================================

            for vehicle in vehicles:

                (
                    vx1,
                    vy1,
                    vx2,
                    vy2
                ) = prediction_to_xyxy(
                    vehicle
                )

                (
                    vx1,
                    vy1,
                    vx2,
                    vy2
                ) = clamp_box(
                    vx1,
                    vy1,
                    vx2,
                    vy2,
                    width,
                    height
                )

                vehicle_class = vehicle.get(
                    "class",
                    "vehicle"
                )

                vehicle_conf = vehicle.get(
                    "confidence",
                    0
                )

                matched_bay = None

                best_ratio = 0.0

                # ---------------------------------------------
                # FIND BAY
                # ---------------------------------------------

                for bay_id in bay_polygons:

                    ratio = box_overlap_ratio(
                        (
                            vx1,
                            vy1,
                            vx2,
                            vy2
                        ),
                        cached_masks[
                            bay_id
                        ]
                    )

                    if ratio > best_ratio:

                        best_ratio = ratio

                        matched_bay = bay_id

                if (
                    best_ratio
                    < BAY_OVERLAP_THRESHOLD
                ):

                    matched_bay = None

                # ---------------------------------------------
                # DRAW YOLO BOX
                # ---------------------------------------------

                if matched_bay:

                    box_color = (
                        255,
                        120,
                        0
                    )

                else:

                    box_color = (
                        120,
                        120,
                        120
                    )

                cv2.rectangle(
                    frame,
                    (
                        vx1,
                        vy1
                    ),
                    (
                        vx2,
                        vy2
                    ),
                    box_color,
                    3
                )

                label_text = (
                    f"{vehicle_class} "
                    f"{vehicle_conf:.2f}"
                )

                if matched_bay:

                    label_text += (
                        f" -> {matched_bay} "
                        f"({best_ratio:.0%})"
                    )

                draw_label(
                    frame,
                    label_text,
                    vx1,
                    vy1,
                    box_color
                )

                # ---------------------------------------------
                # VEHICLE NOT IN BAY
                # ---------------------------------------------

                if matched_bay is None:
                    continue

                detected_now[
                    matched_bay
                ] = True

                bay = bay_state[
                    matched_bay
                ]

                # =================================================
                # NEW VEHICLE CANDIDATE
                # =================================================

                if not bay["occupied"]:

                    bay[
                        "candidate_count"
                    ] += 1

                    bay[
                        "coco_class_votes"
                    ].append(
                        (
                            vehicle_class,
                            vehicle_conf
                        )
                    )

                    # ---------------------------------------------
                    # BODY STYLE CLASSIFICATION
                    # ---------------------------------------------

                    if (
                        bay["candidate_count"]
                        %
                        CLASSIFY_EVERY_N_CANDIDATE_FRAMES
                        == 0
                    ):

                        vehicle_crop = frame[
                            vy1:vy2,
                            vx1:vx2
                        ].copy()

                        raw_class, conf = (
                            classify_body_style_single(
                                roboflow_client,
                                vehicle_crop,
                                vehicle_class
                            )
                        )

                        if raw_class:

                            bay[
                                "classification_votes"
                            ].append(
                                (
                                    raw_class,
                                    conf
                                )
                            )

                        shape_class, shape_conf = (
                            estimate_body_style_from_shape(
                                vx1,
                                vy1,
                                vx2,
                                vy2
                            )
                        )

                        if shape_class:

                            bay[
                                "classification_votes"
                            ].append(
                                (
                                    shape_class,
                                    shape_conf
                                )
                            )

                    # =================================================
                    # CONFIRMED VEHICLE
                    # =================================================

                    if (
                        bay["candidate_count"]
                        >= ENTRY_CONFIRM_FRAMES
                    ):

                        specific_type = (
                            classify_body_style_from_votes(
                                bay[
                                    "coco_class_votes"
                                ],
                                bay[
                                    "classification_votes"
                                ]
                            )
                        )

                        bay["occupied"] = True

                        bay["start_time"] = (
                            time.time()
                        )

                        bay["car_type"] = (
                            specific_type
                        )

                        bay[
                            "candidate_count"
                        ] = 0

                        bay[
                            "coco_class_votes"
                        ] = []

                        bay[
                            "classification_votes"
                        ] = []

                        print(
                            "[CV] VEHICLE CONFIRMED:"
                            f" {matched_bay} "
                            f"-> {specific_type}"
                        )

                        # -----------------------------------------
                        # DATABASE RESERVATION
                        # -----------------------------------------

                        reservation_id = None

                        if is_bay_reserved(
                            matched_bay
                        ):

                            reservation_id = (
                                attach_to_existing_reservation(
                                    matched_bay,
                                    specific_type
                                )
                            )

                            if (
                                reservation_id
                                is None
                            ):

                                try:

                                    reservation_id = (
                                        save_vehicle(
                                            specific_type,
                                            matched_bay
                                        )
                                    )

                                except Exception as e:

                                    print(
                                        "[ERROR] Failed "
                                        "to save reservation:",
                                        e
                                    )

                        else:

                            try:

                                reservation_id = (
                                    save_vehicle(
                                        specific_type,
                                        matched_bay
                                    )
                                )

                                print(
                                    "[INFO] New walk-in "
                                    f"reservation created "
                                    f"for {matched_bay}: "
                                    f"{specific_type}"
                                )

                            except Exception as e:

                                print(
                                    "[ERROR] Failed "
                                    "to save reservation:",
                                    e
                                )

                        bay[
                            "reservation_id"
                        ] = reservation_id

                        # -----------------------------------------
                        # PUSH LIVE STATUS
                        # -----------------------------------------

                        push_bay_live_status(
                            matched_bay,
                            True,
                            specific_type
                        )

                bay[
                    "last_seen"
                ] = time.time()

            # =================================================
            # UPDATE BAY STATES
            # =================================================

            now = time.time()

            for (
                bay_id,
                bay
            ) in bay_state.items():

                if detected_now[
                    bay_id
                ]:

                    if (
                        bay["occupied"]
                        and
                        bay["start_time"]
                        is not None
                    ):

                        bay[
                            "service_seconds"
                        ] = (
                            now -
                            bay["start_time"]
                        )

                        bay[
                            "service_timer"
                        ] = format_duration(
                            bay[
                                "service_seconds"
                            ]
                        )

                else:

                    # ---------------------------------------------
                    # Candidate disappeared before confirmation
                    # ---------------------------------------------

                    if not bay["occupied"]:

                        bay[
                            "candidate_count"
                        ] = 0

                        bay[
                            "coco_class_votes"
                        ] = []

                        bay[
                            "classification_votes"
                        ] = []

                    # ---------------------------------------------
                    # Occupied vehicle disappeared
                    # ---------------------------------------------

                    if bay["occupied"]:

                        last_seen = bay.get(
                            "last_seen"
                        )

                        if (
                            last_seen is not None
                            and
                            (
                                now -
                                last_seen
                            )
                            >
                            EXIT_CONFIRM_SECONDS
                        ):

                            print(
                                "[CV] Vehicle left "
                                f"{bay_id}"
                            )

                            finalize_vehicle(
                                bay[
                                    "reservation_id"
                                ],
                                bay[
                                    "service_seconds"
                                ]
                            )

                            bay["occupied"] = False

                            bay["start_time"] = None

                            bay[
                                "service_seconds"
                            ] = 0

                            bay[
                                "service_timer"
                            ] = "00:00:00"

                            bay[
                                "car_type"
                            ] = ""

                            bay[
                                "reservation_id"
                            ] = None

                            bay[
                                "candidate_count"
                            ] = 0

                            bay[
                                "coco_class_votes"
                            ] = []

                            bay[
                                "classification_votes"
                            ] = []

                            push_bay_live_status(
                                bay_id,
                                False,
                                clear_reserved=True
                            )

            # =================================================
            # STATUS PANEL
            # =================================================

            panel_y = 30

            for (
                bay_id,
                bay
            ) in bay_state.items():

                status = (
                    "OCCUPIED"
                    if bay["occupied"]
                    else "VACANT"
                )

                text = (
                    f"{bay_id}: "
                    f"{status} | "
                    f"Timer: "
                    f"{bay['service_timer']} | "
                    f"Type: "
                    f"{bay['car_type'] or '-'}"
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

            # =================================================
            # YOLO STATUS
            # =================================================

            cv2.putText(
                frame,
                "YOLO: ACTIVE",
                (
                    20,
                    height - 45
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2,
                cv2.LINE_AA
            )

            cv2.putText(
                frame,
                f"Vehicles: {len(vehicles)}",
                (
                    20,
                    height - 15
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 255),
                2,
                cv2.LINE_AA
            )

            # =================================================
            # SAVE JSON STATUS
            # =================================================

            json_safe_state = {

                bay_id: {

                    k: v

                    for k, v
                    in bay.items()

                    if k not in (
                        "classification_votes",
                        "coco_class_votes"
                    )
                }

                for bay_id, bay
                in bay_state.items()
            }

            try:

                with open(
                    OUTPUT_JSON_PATH,
                    "w"
                ) as f:

                    json.dump(
                        json_safe_state,
                        f,
                        indent=2
                    )

            except Exception as e:

                print(
                    f"[WARN] Failed to write "
                    f"bay_status.json: {e}"
                )

            # =================================================
            # RESIZE STREAM
            # =================================================

            display_frame = frame

            scale = min(
                MAX_DISPLAY_WIDTH / width,
                MAX_DISPLAY_HEIGHT / height,
                1.0
            )

            if scale < 1.0:

                display_frame = cv2.resize(
                    frame,
                    (
                        int(
                            width * scale
                        ),
                        int(
                            height * scale
                        )
                    ),
                    interpolation=
                    cv2.INTER_AREA
                )

            # =================================================
            # JPEG STREAM
            # =================================================

            success, buffer = (
                cv2.imencode(
                    ".jpg",
                    display_frame,
                    [
                        int(
                            cv2.IMWRITE_JPEG_QUALITY
                        ),
                        80
                    ]
                )
            )

            if not success:

                print(
                    "[STREAM] JPEG encoding failed."
                )

                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                +
                buffer.tobytes()
                +
                b"\r\n"
            )

    finally:

        print(
            "[CAMERA] Cleaning up..."
        )

        # -----------------------------------------------------
        # Finalize occupied bays
        # -----------------------------------------------------

        for (
            bay_id,
            bay
        ) in bay_state.items():

            if bay["occupied"]:

                print(
                    f"[CAMERA] Cleaning up "
                    f"occupied {bay_id}..."
                )

                finalize_vehicle(
                    bay[
                        "reservation_id"
                    ],
                    bay[
                        "service_seconds"
                    ]
                )

                push_bay_live_status(
                    bay_id,
                    False,
                    clear_reserved=True
                )

        cap.release()

        print(
            "[CAMERA] CCTV released."
        )
if __name__ == "__main__":
    print("[INFO] camera.py is a module for api.py")
    print("[INFO] Run: python -m uvicorn api:app --host 0.0.0.0 --port 8000")
