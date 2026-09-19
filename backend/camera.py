import matplotlib
matplotlib.use("Agg")

import cv2
import os
import time
import json
import threading
import numpy as np
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

import torch
from ultralytics import YOLO
from inference_sdk import InferenceHTTPClient, InferenceConfiguration
from supabase import create_client




SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hybszzpgtbuubdotqkqq.supabase.co")


SUPABASE_KEY = (os.getenv("SUPABASE_KEY") or "").strip() or "SUPABASE_KEY_HERE"

ROBOFLOW_API_KEY = os.getenv(
    "ROBOFLOW_API_KEY",
    "zRrS2mLKuvtvmLjGkHYh"
)

ROBOFLOW_API_URL = os.getenv("ROBOFLOW_API_URL", "https://serverless.roboflow.com")

if SUPABASE_KEY == "SUPABASE_KEY_HERE":
    print(
        "\n=============================================================\n"
        "[FATAL] SUPABASE_KEY is not set -- every Supabase call will 401.\n"
        "  Set your SERVICE ROLE / SECRET key and restart, e.g.:\n"
        '    $env:SUPABASE_KEY = "sb_secret_xxxxx"   (PowerShell)\n'
        "    set SUPABASE_KEY=sb_secret_xxxxx        (cmd)\n"
        "=============================================================\n"
    )

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


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
CV_HEARTBEAT_TABLE = "cv_heartbeat"
BAY_ZONES_TABLE = "bay_zones"
SHOP_PROFILE_TABLE = "shop_profile_setup"

SHOP_ID = 2
SHOP_NAME = ""




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
            "occupied": False,
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
    car_type=""
):

    payload = {
        "occupied": occupied,
        "car_type": car_type if occupied else "",
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }

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


def push_bay_cv_occupied(
    bay_name,
    detected
):
    # bays.cv_occupied is the ONLY "a car is physically in this bay" flag
    # -- written from here and nowhere else. bays.occupied is also set by
    # the staff app and the reservation queue RPCs (a QR scan claims a bay
    # before the car parks), so it can't be used for "X / Y bays in use".

    try:
        run_with_retries(
            lambda: supabase
            .table(BAYS_TABLE)
            .update({"cv_occupied": detected})
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .execute(),
            max_retries=2,
        )

    except Exception as e:
        # Older Supabase projects may not have the optional CV column yet.
        # The app falls back to `occupied`, so avoid turning this into a
        # repeated camera error until the migration is applied.
        if "cv_occupied" not in str(e):
            print(f"[ERROR] Failed to push CV occupancy for {bay_name}: {e}")


def clear_all_bay_cv_occupied():
    # On shutdown the camera can no longer vouch for ANY bay, so none may
    # stay counted as in use.

    try:
        supabase.table(BAYS_TABLE).update(
            {"cv_occupied": False}
        ).eq("shop_id", SHOP_ID).execute()

    except Exception as e:
        if "cv_occupied" not in str(e):
            print(f"[WARN] Failed to clear CV occupancy: {e}")


_heartbeat_ok_logged = False


def push_cv_heartbeat():
    # "The camera is alive" ping. The staff New Walk-in / Reservation
    # screens only treat CV as online when this is fresh (< ~90s old).
    # It's written for shop_id=SHOP_ID -- the staff/admin account you view
    # the app with MUST belong to that same shop, or the app won't see it.
    global _heartbeat_ok_logged
    try:
        supabase.table(CV_HEARTBEAT_TABLE).upsert(
            {
                "shop_id": SHOP_ID,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
        if not _heartbeat_ok_logged:
            print(f"[CV] Heartbeat OK -> cv_heartbeat (shop_id={SHOP_ID}). App can now see 'camera online'.")
            _heartbeat_ok_logged = True
    except Exception as e:
        _heartbeat_ok_logged = False
        print(f"[WARN] Failed to push CV heartbeat: {e}")


def clear_cv_heartbeat():
    # Called on a clean shutdown so the app knows the camera stopped
    # immediately, instead of waiting for the heartbeat to go stale.
    try:
        supabase.table(CV_HEARTBEAT_TABLE).delete().eq(
            "shop_id", SHOP_ID
        ).execute()
    except Exception as e:
        print(f"[WARN] Failed to clear CV heartbeat: {e}")


def free_or_claim_bay(bay_name):
    # Called whenever a vehicle leaves a bay, instead of clearing
    # bays.occupied/reserved directly. Gives the oldest arrived-but-
    # unassigned reserved customer (arrived_at set, bay_name still null)
    # first claim on this bay before it's opened back up to walk-ins. If
    # nobody is waiting, the RPC just frees the bay exactly like before.

    try:

        run_with_retries(
            lambda: supabase
            .rpc(
                "claim_bay_for_reserved_or_free",
                {
                    "p_bay_name": bay_name,
                    "p_shop_id": SHOP_ID,
                },
            )
            .execute(),
            max_retries=2,
        )

    except Exception as e:

        print(
            f"[ERROR] Failed to free/claim bay "
            f"{bay_name}: {e}"
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

# How far from a reservation's booked time (scheduled_at) an arriving
# vehicle is still accepted as that reservation's arrival. Mirrors the
# 15-minute grace period confirm_reservation_arrival() already uses for
# `is_late` (see supabase/sql/2026-09_reservation_queue.sql) -- same
# tolerance, just also enforced here on the CV side before we commit a
# physically-arrived vehicle to someone else's booking.
RESERVATION_ARRIVAL_WINDOW_BEFORE_MINUTES = 15
RESERVATION_ARRIVAL_WINDOW_AFTER_MINUTES = 15


def _normalize_vehicle_type(value):
    return (value or "").strip().lower()


# Body-style "families" -- CV commonly confuses members of the same family
# (a Sedan read as a Coupe, an SUV as a Crossover/Pickup). An exact match
# is the strongest signal; a same-family match still counts as "probably
# the right car" for a medium-confidence attach.
_VEHICLE_TYPE_FAMILIES = [
    {"sedan", "coupe", "hatchback", "wagon", "convertible", "cabriolet",
     "sport", "muscle", "roadster", "micro"},
    {"suv", "crossover", "pickup", "off-road", "van", "oversize van",
     "limousine", "minivan", "mpv"},
    {"motorcycle", "big bike"},
]


def _grade_vehicle_type_match(expected, detected):
    # Returns 'exact', 'family', or 'none'.
    exp = _normalize_vehicle_type(expected)
    det = _normalize_vehicle_type(detected)

    if not exp or not det:
        return "none"

    if exp == det:
        return "exact"

    for family in _VEHICLE_TYPE_FAMILIES:
        if exp in family and det in family:
            return "family"

    return "none"


def _release_mismatched_bay_hold(bay_name, reservation_id):
    # The vehicle physically sitting in this bay does not match the
    # reservation that QR-confirmation attached to it (wrong vehicle type
    # and/or outside the booking's arrival window). Undo the hold so the
    # real reserved customer can still be queued/claimed normally, and let
    # the vehicle that's actually here be recorded as a walk-in instead.

    try:

        run_with_retries(
            lambda: supabase
            .table(BAYS_TABLE)
            .update(
                {
                    "occupied": False,
                    "reserved": False,
                    "reserved_reservation_id": None,
                    "updated_at":
                        datetime.now(
                            timezone.utc
                        ).isoformat(),
                }
            )
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .execute(),
            max_retries=2,
        )

        run_with_retries(
            lambda: supabase
            .table("reservation")
            .update(
                {
                    "bay_name": None,
                    "occupied": False,
                    "status": STATUS_WAITING,
                }
            )
            .eq("id", reservation_id)
            .execute(),
            max_retries=2,
        )

    except Exception as e:

        print(
            f"[ERROR] Failed to release mismatched "
            f"bay hold for {bay_name}: {e}"
        )


def attach_to_existing_reservation(
    bay_name,
    vehicle_type
):
    # Decide whether the vehicle CV just confirmed inside `bay_name` is the
    # customer who reserved it, and how sure we are.
    #
    # The DECIDING signal is the QR hold: `bays.reserved_reservation_id` is
    # set by the confirm_reservation_arrival / claim_bay_for_reserved_or_free
    # RPCs the moment staff scan a customer's QR (or a checked-in customer
    # claims a freed bay). No hold at all -> nobody presented a QR for this
    # bay -> walk-in (return None).
    #
    # When there IS a hold, the CV-detected body style and the arrival-time
    # window are cross-checked against the booking to GRADE the match:
    #   high   -> exact vehicle-type match, inside the time window
    #   medium -> same-family type match, or an exact type but slightly
    #             outside the window (early/late arrival)
    #   low    -> inside the window but the body style disagrees -- we still
    #             trust the human QR scan and attach, but flag it
    # Only a WRONG type AND a WRONG time together is treated as "not them":
    # the hold is released and the vehicle falls through to the walk-in path.

    try:

        bay_response = run_with_retries(
            lambda: supabase
            .table(BAYS_TABLE)
            .select("reserved_reservation_id")
            .eq("shop_id", SHOP_ID)
            .eq("bay_name", bay_name)
            .maybe_single()
            .execute(),
            max_retries=2,
        )

        reservation_id = (
            bay_response.data.get("reserved_reservation_id")
            if bay_response.data else None
        )

        if not reservation_id:
            # No QR was presented for this bay -> walk-in.
            return None

        reservation_response = run_with_retries(
            lambda: supabase
            .table("reservation")
            .select("vehicle_type, scheduled_at, customer_name")
            .eq("id", reservation_id)
            .maybe_single()
            .execute(),
            max_retries=2,
        )

        reservation = (
            reservation_response.data
            if reservation_response else None
        )

        if not reservation:

            print(
                f"[WARN] reserved_reservation_id={reservation_id} "
                f"on {bay_name} has no matching reservation row."
            )

            return None

        expected_type = reservation.get("vehicle_type")
        detected_type = vehicle_type

        type_grade = _grade_vehicle_type_match(
            expected_type,
            detected_type
        )

        scheduled_at_raw = reservation.get("scheduled_at")

        # No scheduled_at (shouldn't happen for a QR-held bay) -> don't let
        # the time check veto an otherwise-good match.
        time_matches = True

        if scheduled_at_raw:

            scheduled_at = datetime.fromisoformat(
                scheduled_at_raw.replace("Z", "+00:00")
            )

            now = datetime.now(timezone.utc)

            window_start = scheduled_at - timedelta(
                minutes=RESERVATION_ARRIVAL_WINDOW_BEFORE_MINUTES
            )

            window_end = scheduled_at + timedelta(
                minutes=RESERVATION_ARRIVAL_WINDOW_AFTER_MINUTES
            )

            time_matches = window_start <= now <= window_end

        # Wrong car AND wrong time -> this is not the reserved customer.
        if type_grade == "none" and not time_matches:

            print(
                f"[CV] WALK-IN (reservation mismatch) at {bay_name}: "
                f"reservation id={reservation_id} expected="
                f"'{_normalize_vehicle_type(expected_type) or '?'}' "
                f"detected='{_normalize_vehicle_type(detected_type)}' "
                f"type_grade={type_grade} time_match={time_matches}. "
                "Releasing bay hold."
            )

            _release_mismatched_bay_hold(
                bay_name,
                reservation_id
            )

            return None

        if type_grade == "exact" and time_matches:
            confidence = "high"
        elif type_grade in ("exact", "family"):
            # right car / same family, but arrived early or late
            confidence = "medium"
        else:
            # inside the window, but CV's body style disagrees --
            # trust the human QR scan, flag for staff
            confidence = "low"

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
                    "cv_match_confidence": confidence,
                    "cv_detected_vehicle_type": detected_type,
                }
            )
            .eq(
                "id",
                reservation_id
            )
            .execute()
        )

        print(
            "[CV] RESERVED ARRIVAL confirmed at "
            f"{bay_name}: reservation id={reservation_id} "
            f"customer='{reservation.get('customer_name') or '?'}' "
            f"booked='{_normalize_vehicle_type(expected_type)}' "
            f"detected='{_normalize_vehicle_type(detected_type)}' "
            f"type_grade={type_grade} time_match={time_matches} "
            f"-> confidence={confidence.upper()}"
        )

        return reservation_id

    except Exception as e:

        print(
            f"[WARN] Failed to attach reservation "
            f"for {bay_name}: {e}"
        )

    return None


# How wide a window around "now" a pending reservation counts as
# "expected around now" -- for CV's read-only awareness log only.
AWARENESS_WINDOW_BEFORE_MINUTES = 20
AWARENESS_WINDOW_AFTER_MINUTES = 30


def note_pending_reservation_overlap(bay_name, vehicle_type):
    # READ-ONLY. A vehicle with NO QR just parked in this bay -- it will be
    # recorded as a walk-in (policy: no QR = walk-in, always). But if a
    # matching reservation is ALSO expected around now, log it so it shows
    # up in the CV logs and staff can double-check they aren't giving a
    # reserved customer's bay away. Never writes, never claims.
    try:
        now = datetime.now(timezone.utc)
        window_start = (
            now - timedelta(minutes=AWARENESS_WINDOW_BEFORE_MINUTES)
        ).isoformat()
        window_end = (
            now + timedelta(minutes=AWARENESS_WINDOW_AFTER_MINUTES)
        ).isoformat()

        resp = run_with_retries(
            lambda: supabase
            .table("reservation")
            .select("id, vehicle_type, scheduled_at, customer_name")
            .eq("shop_id", SHOP_ID)
            .eq("status", STATUS_WAITING)
            .is_("arrived_at", "null")
            .is_("bay_name", "null")
            .gte("scheduled_at", window_start)
            .lte("scheduled_at", window_end)
            .execute(),
            max_retries=2,
        )

        detected = _normalize_vehicle_type(vehicle_type)
        matches = [
            r for r in (resp.data or [])
            if _normalize_vehicle_type(r.get("vehicle_type")) == detected
        ]

        if matches:
            names = ", ".join(
                f"id={m['id']} ({m.get('customer_name') or '?'})"
                for m in matches
            )
            print(
                f"[CV] NOTE: walk-in '{detected}' parked in {bay_name}, but a "
                f"matching reservation is also expected around now -> {names}. "
                "Recorded as walk-in (no QR). Staff: verify."
            )

    except Exception as e:
        print(f"[WARN] reservation-overlap note failed for {bay_name}: {e}")


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
                # No QR was presented -> CV logged this as a walk-in. Keep
                # what CV saw for parity with the reserved-arrival path.
                "cv_detected_vehicle_type": vehicle_type,
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

    departed_at = datetime.now(timezone.utc).isoformat()

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
                    "completed_at":
                        departed_at,
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
                        departed_at,
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


VEHICLE_MODEL_PATH = "best.pt"

VEHICLE_CLASSES = {
    "Motorcycle",
    "SUV",
    "Van",
    "sedan",
    "Pickup"
}

BODY_STYLE_MODEL_ID = (
    "gilberts-workspace-jb8ik/carwash-model-2-yolo26s-t1"
    #"vehicle-body-style-dataset/4"
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
    # Generic COCO-style classes
    "car": "Sedan",
    "truck": "Pickup",
    "bus": "Van",
    "motorcycle": "Motorcycle",

    # Custom YOLO11n V8 classes
    "Motorcycle": "Motorcycle",
    "SUV": "SUV",
    "Van": "Van",
    "sedan": "Sedan",
    "Pickup": "Pickup",
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



VIDEO_SOURCE = os.getenv(
    "VIDEO_SOURCE",
    #"C:\\Users\\Gilbert T. Aquino\\I-CarWash-System\\assets\\videos\\Testing.mp4"
    "rtsp://admin:pass@192.168.122.211:554/onvif1"
    #"rtsp://admin:pass@100.107.155.126:554/onvif1"
)


# Auto-detect a live network source (RTSP/HTTP) instead of trusting a
# possibly-forgotten VIDEO_SOURCE_IS_LIVE env var. Getting this wrong for a
# real camera is silently bad: on a dropped frame the code falls into the
# "local video file ended" branch and seeks to frame 0, which does nothing
# useful on an RTSP stream instead of actually reconnecting. The env var
# still wins when explicitly set.
def _looks_like_live_source(source):
    return isinstance(source, str) and source.lower().startswith(
        ("rtsp://", "rtsps://", "http://", "https://")
    )


_video_source_is_live_env = os.getenv("VIDEO_SOURCE_IS_LIVE")

VIDEO_SOURCE_IS_LIVE = (
    _video_source_is_live_env.lower() == "true"
    if _video_source_is_live_env is not None
    else _looks_like_live_source(VIDEO_SOURCE)
)

LOOP_VIDEO_FILE = os.getenv("LOOP_VIDEO_FILE", "true").lower() == "true"

# Force the RTSP demuxer onto TCP (FFmpeg defaults to UDP) and turn off its
# internal frame queuing. UDP drops packets on any flaky Wi-Fi/LAN hop,
# which decodes as gray/blocky "blur" glitches on the stream -- TCP
# retransmits instead of losing the packet. `nobuffer`/`low_delay` stop
# FFmpeg from queuing decoded frames, which is what makes a live RTSP
# stream drift further and further behind real time ("slow motion that
# never catches up") whenever this file's processing loop (YOLO +
# Roboflow + Supabase writes, all below) can't keep up with the camera's
# native frame rate -- unread frames pile up instead of being dropped.
if VIDEO_SOURCE_IS_LIVE and VIDEO_SOURCE.lower().startswith("rtsp"):
    os.environ.setdefault(
        "OPENCV_FFMPEG_CAPTURE_OPTIONS",
        "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000",
    )


VEHICLE_CONFIDENCE = 0.6

MIN_VEHICLE_BOX_AREA_RATIO = 0.01

OUTPUT_JSON_PATH = "bay_status.json"


DEDUPE_IOU_THRESHOLD = 0.6


CANDIDATE_MISS_TOLERANCE_FRAMES = 8

# Reconnect backoff for a live camera/RTSP source that drops.
RECONNECT_BASE_DELAY = 1.0
RECONNECT_MAX_DELAY = 15.0


# ============================================================
# BAY ZONES
# ============================================================

BAY_POLYGONS_NORM = {}

_FALLBACK_BAY_POLYGONS_NORM = {

    "Bay 1": [
        (0.025, 0.35),
        (0.225, 0.35),
        (0.225, 0.82),
        (0.025, 0.82)
    ],


    "Bay 2": [
        (0.235, 0.34),
        (0.455, 0.34),
        (0.455, 0.83),
        (0.235, 0.83)
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

# Classify a bit more often than before (was 5). With ENTRY_CONFIRM_FRAMES=20
# this now yields up to ~5 classification attempts (candidate_count 4, 8,
# 12, 16, 20) x 2 votes each (Roboflow + shape heuristic) = up to 10 votes,
# comfortably above BODY_STYLE_MIN_VALID_VOTES (4). At the old value of 5
# there were exactly 4 attempts, i.e. zero margin: a single failed Roboflow
# call could push a vehicle below the minimum-votes threshold and force a
# fallback classification even when a normal vote would have succeeded.
CLASSIFY_EVERY_N_CANDIDATE_FRAMES = 4


# ============================================================
# PLAYBACK / THROUGHPUT SETTINGS
# ============================================================
# When playing back a recorded video (not a live camera), OpenCV reads the
# next frame as fast as it can - there's no built-in throttle to the
# video's real frame rate. What actually slows things down to a crawl is
# the PER-FRAME PROCESSING: a YOLO forward pass on every single frame, plus
# a blocking network call to Roboflow every few "candidate" frames. If one
# loop iteration takes longer than the video's native frame interval, the
# stream falls behind and looks like slow motion even though the video
# file itself is untouched.
#
# These three knobs bring that back down, from biggest impact to smallest:

# 1) GPU vs CPU. YOLO on CPU is dramatically slower than on a CUDA GPU.
#    Auto-detects; override with env var YOLO_DEVICE=cpu to force CPU, or
#    YOLO_DEVICE=0 / "0,1" to force a specific GPU index.
YOLO_DEVICE = os.getenv("YOLO_DEVICE") or ("0" if torch.cuda.is_available() else "cpu")

# 2) Inference resolution. Smaller = faster but slightly less accurate on
#    small/far vehicles. 640 is the original value.
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))

# 3) Detection frame skip. 1 = run YOLO on every captured frame (original
#    behavior, most accurate, slowest). Set to 2 or 3 to run YOLO on every
#    2nd/3rd frame and reuse the last detection result in between - the
#    video still advances and displays every frame (so playback speed
#    improves a lot), you just get fresh bounding boxes slightly less
#    often. Good default for reviewing/training footage where you don't
#    need frame-perfect boxes.
DETECTION_EVERY_N_FRAMES = max(1, int(os.getenv("DETECTION_EVERY_N_FRAMES", "1")))

# Roboflow body-style classification is a network call and can take
# hundreds of milliseconds. It's dispatched to this background thread pool
# instead of blocking the main video loop while waiting for a response.
_classification_executor = ThreadPoolExecutor(
    max_workers=2,
    thread_name_prefix="body-style-classify"
)


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


def box_iou(box_a, box_b):

    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    iw = max(0, ix2 - ix1)
    ih = max(0, iy2 - iy1)

    inter_area = iw * ih

    if inter_area <= 0:
        return 0.0

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)

    union_area = area_a + area_b - inter_area

    if union_area <= 0:
        return 0.0

    return inter_area / union_area


def deduplicate_vehicle_boxes(preds, iou_threshold=DEDUPE_IOU_THRESHOLD):
    """Collapse overlapping detections of the same physical vehicle down to
    the single highest-confidence box. This was previously defined but never
    called anywhere in the pipeline."""

    if not preds:
        return preds

    sorted_preds = sorted(
        preds,
        key=lambda p: p.get("confidence", 0),
        reverse=True
    )

    kept_preds = []
    kept_boxes = []

    for pred in sorted_preds:

        box = prediction_to_xyxy(pred)

        is_duplicate = False

        for kb in kept_boxes:

            if box_iou(box, kb) >= iou_threshold:
                is_duplicate = True
                break

        if not is_duplicate:
            kept_preds.append(pred)
            kept_boxes.append(box)

    return kept_preds


vehicle_model = None

roboflow_client = None

camera_initialized = False


def initialize_ai():

    global vehicle_model
    global roboflow_client

    if vehicle_model is None:

        print(
             "[AI] Loading YOLO26s 5-class vehicle detector..."
        )

        vehicle_model = YOLO(
            VEHICLE_MODEL_PATH
        )

        print(
             f"[AI] Custom YOLO model loaded! Classes: {vehicle_model.names}"
        )

    if roboflow_client is None:

        print(
            "[AI] Connecting to Roboflow..."
        )

        roboflow_client = (
            InferenceHTTPClient(
                api_url=ROBOFLOW_API_URL,
                api_key=ROBOFLOW_API_KEY,
            )
        )

        print(
            "[AI] Roboflow client ready!"
        )


class _LatestFrameReader:
    """Wraps a live cv2.VideoCapture so callers always get the most recently
    decoded frame instead of the next one in an internal queue.

    A plain `cap.read()` blocks until the next frame is available. When the
    caller (the detection loop below) processes frames slower than the
    camera sends them -- a YOLO forward pass + Roboflow calls + Supabase
    writes per candidate frame add up fast -- RTSP/FFmpeg queues the
    backlog instead of dropping it, so `.read()` keeps returning
    older-and-older frames and the displayed stream drifts further and
    further behind real time ("slow motion" that never catches up).

    This instead reads continuously on a background thread and keeps only
    the single newest frame, so `.read()` here always returns what the
    camera is showing right now -- at the cost of (correctly) dropping
    frames the main loop couldn't get to in time, instead of queuing them.
    """

    # How long read() waits for a NEW frame before reporting failure. FFmpeg
    # gives up on a stalled stream after ~30s on its own, so wait a bit
    # longer than that instead of declaring the stream dead while the reader
    # thread is still legitimately connecting / buffering.
    READ_TIMEOUT = 35.0

    def __init__(self, cap):
        self._cap = cap
        self._cond = threading.Condition()
        self._frame = None
        self._seq = 0
        self._last_returned_seq = 0
        self._failed = False
        self._stopped = False
        self._thread = threading.Thread(
            target=self._run,
            name="rtsp-frame-reader",
            daemon=True,
        )
        self._thread.start()

    def _run(self):
        try:
            while not self._stopped:
                try:
                    ok, frame = self._cap.read()
                except cv2.error as e:
                    # A broken H.264 stream can make FFmpeg throw instead of
                    # returning False. Treat it as a dead stream so the main
                    # loop reconnects, instead of letting this thread die
                    # with an uncaught exception.
                    print(f"[CAMERA] Reader error: {e}")
                    ok, frame = False, None

                with self._cond:
                    if ok and frame is not None:
                        self._frame = frame
                        self._seq += 1
                    else:
                        self._failed = True
                    self._cond.notify_all()

                if not ok:
                    return
        finally:
            # The capture is released HERE, on the thread that reads it --
            # never from release() on the main thread. cap.read() can block
            # for up to ~30s on a stalled stream, and freeing the capture
            # underneath an in-progress read is what crashes FFmpeg
            # ("Unknown C++ exception from OpenCV code").
            self._cap.release()

    def isOpened(self):
        return self._cap.isOpened()

    def read(self):
        # Wait for a frame newer than the one last handed out. Without this,
        # the first read() right after connecting finds no frame yet and the
        # main loop immediately tears the fresh connection down again --
        # an endless "Frame failed. Reconnecting..." loop even though the
        # camera is fine.
        with self._cond:
            got_new = self._cond.wait_for(
                lambda: self._seq > self._last_returned_seq or self._failed,
                timeout=self.READ_TIMEOUT,
            )
            if not got_new or self._seq <= self._last_returned_seq:
                return False, None
            self._last_returned_seq = self._seq
            return True, self._frame.copy()

    def release(self):
        self._stopped = True
        with self._cond:
            self._cond.notify_all()
        # Don't wait for a read that may be stuck for ~30s; the reader thread
        # releases the capture itself as soon as that read returns.
        self._thread.join(timeout=2.0)


def _open_capture():
    cap = cv2.VideoCapture(VIDEO_SOURCE, cv2.CAP_FFMPEG)

    try:
        # Ask the backend to keep at most 1 frame queued. Not every backend
        # honors this, but it costs nothing to ask -- it's the other half
        # (with the nobuffer/low_delay ffmpeg options above) of stopping
        # frames from queuing up and the stream drifting behind real time.
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass

    if VIDEO_SOURCE_IS_LIVE:
        # Decouple network reads from the (often much slower) YOLO /
        # Roboflow / Supabase processing loop below -- see
        # _LatestFrameReader's docstring.
        return _LatestFrameReader(cap)

    return cap


# ============================================================
# CORE DETECTION LOOP (yields raw JPEG bytes, no MJPEG framing)
# ============================================================

def _run_detection_loop():

    global camera_initialized
    global BAY_POLYGONS_NORM

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

    cap = _open_capture()

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

    push_cv_heartbeat()
    last_heartbeat = time.time()
    HEARTBEAT_EVERY_SECONDS = 10

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

            "candidate_miss_streak": 0,

            "coco_class_votes": [],

            "classification_votes": [],
        }

    cached_masks = {}

    cached_mask_size = None

    reconnect_delay = RECONNECT_BASE_DELAY

    # Frame-skip state: reused detection results for frames where we don't
    # run a fresh YOLO pass.
    frame_index = 0

    cached_vehicles = []

    print(
        f"[AI] YOLO device={YOLO_DEVICE}, imgsz={YOLO_IMGSZ}, "
        f"detection_every_n_frames={DETECTION_EVERY_N_FRAMES}"
    )

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

                if not VIDEO_SOURCE_IS_LIVE and LOOP_VIDEO_FILE:

                    # This is a local video file that reached its end,
                    # not a dropped connection - just rewind it instead
                    # of tearing down and reopening the whole capture.
                    print(
                        "[CAMERA] End of video file reached. Looping."
                    )

                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

                    continue

                if not VIDEO_SOURCE_IS_LIVE:

                    # Local file, not set to loop -> stop cleanly.
                    print(
                        "[CAMERA] End of video file reached. Stopping."
                    )

                    break

                print(
                    "[CAMERA] Frame failed. "
                    f"Reconnecting in {reconnect_delay:.1f}s..."
                )

                cap.release()

                time.sleep(reconnect_delay)

                reconnect_delay = min(
                    reconnect_delay * 2,
                    RECONNECT_MAX_DELAY
                )

                cap = _open_capture()

                continue

            # Successful read - reset reconnect backoff.
            reconnect_delay = RECONNECT_BASE_DELAY

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
            # YOLO DETECTION (with optional frame-skip)
            # =================================================

            run_detection_this_frame = (
                frame_index % DETECTION_EVERY_N_FRAMES == 0
            )

            frame_index += 1

            if run_detection_this_frame:

                print(
                    "[YOLO] Detecting vehicles..."
                )

                try:

                    yolo_results = (
                        vehicle_model(
                            frame,
                            imgsz=YOLO_IMGSZ,
                             device=YOLO_DEVICE,
                             verbose=False,
                             iou=0.5,
                             agnostic_nms=True
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

                # Collapse overlapping duplicate boxes (e.g. the same
                # vehicle detected under two labels, or a doubled box from
                # agnostic NMS not fully merging) down to one box per
                # physical vehicle BEFORE confidence filtering, so a
                # low-confidence duplicate never survives just because its
                # twin got filtered out.
                raw_vehicle_preds = deduplicate_vehicle_boxes(
                    raw_vehicle_preds
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

                cached_vehicles = vehicles

            else:

                # Reuse the last detection result. The video frame itself
                # still advances and gets displayed/encoded normally below
                # - only the (expensive) YOLO forward pass is skipped this
                # iteration - so playback speed improves without the
                # stream visibly dropping frames.
                vehicles = cached_vehicles


            detected_now = {
                bay_id: False
                for bay_id
                in BAY_POLYGONS_NORM
            }


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

                    bay["candidate_miss_streak"] = 0

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

                        # Roboflow classification is a network round-trip
                        # (often 100-500ms+). Running it inline here would
                        # stall the whole video loop for every candidate
                        # frame, which is a major contributor to the
                        # "slow motion" playback effect. Dispatch it to a
                        # background thread instead; the vote gets appended
                        # to this bay's list whenever the response arrives,
                        # well before ENTRY_CONFIRM_FRAMES worth of frames
                        # have passed in practice. list.append() from a
                        # worker thread is safe under the GIL, so no lock
                        # is needed here.
                        votes_list = bay["classification_votes"]

                        def _classify_async(
                            crop=vehicle_crop,
                            votes=votes_list,
                            coco_hint=vehicle_class
                        ):

                            raw_class, conf = classify_body_style_single(
                                roboflow_client,
                                crop,
                                coco_hint
                            )

                            if raw_class:
                                votes.append((raw_class, conf))

                        _classification_executor.submit(_classify_async)

                        # The shape heuristic is pure local math (no I/O),
                        # so it stays synchronous - it's effectively free.
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

                        bay["candidate_miss_streak"] = 0

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

                        # 1) QR hold on this bay? Confirm it against the
                        #    physical vehicle (type + arrival window).
                        if is_bay_reserved(matched_bay):
                            reservation_id = (
                                attach_to_existing_reservation(
                                    matched_bay,
                                    specific_type
                                )
                            )

                        # 2) No QR presented -> ALWAYS a walk-in. CV keeps a
                        #    baseline awareness of pending reservations, but
                        #    it only LOGS an overlap for staff to check --
                        #    it never auto-claims a booking without a QR.
                        if reservation_id is None:
                            note_pending_reservation_overlap(
                                matched_bay,
                                specific_type
                            )
                            try:
                                reservation_id = save_vehicle(
                                    specific_type,
                                    matched_bay
                                )
                                print(
                                    "[CV] WALK-IN recorded at "
                                    f"{matched_bay} ({specific_type}) -- "
                                    "no QR presented."
                                )
                            except Exception as e:
                                print(
                                    "[ERROR] Failed to save reservation:",
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

                        push_bay_cv_occupied(
                            matched_bay,
                            True
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
                    # Candidate not seen this frame - use a miss
                    # tolerance instead of resetting instantly, so a
                    # single dropped/occluded frame doesn't erase all
                    # entry-confirmation progress for that bay.
                    # ---------------------------------------------

                    if not bay["occupied"]:

                        bay["candidate_miss_streak"] += 1

                        if (
                            bay["candidate_count"] > 0
                            and bay["candidate_miss_streak"]
                            > CANDIDATE_MISS_TOLERANCE_FRAMES
                        ):

                            bay[
                                "candidate_count"
                            ] = 0

                            bay["candidate_miss_streak"] = 0

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

                            bay["candidate_miss_streak"] = 0

                            bay[
                                "coco_class_votes"
                            ] = []

                            bay[
                                "classification_votes"
                            ] = []

                            # Car is gone -- clear it BEFORE the bay may be
                            # re-claimed by the queue (which sets occupied,
                            # but there's still no car in it).
                            push_bay_cv_occupied(
                                bay_id,
                                False
                            )

                            free_or_claim_bay(
                                bay_id
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
            # CV HEARTBEAT (throttled)
            # =================================================

            if time.time() - last_heartbeat >= HEARTBEAT_EVERY_SECONDS:
                push_cv_heartbeat()
                last_heartbeat = time.time()

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
            # JPEG ENCODE
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

            yield buffer.tobytes()

    finally:

        print(
            "[CAMERA] Cleaning up..."
        )

        clear_cv_heartbeat()

        clear_all_bay_cv_occupied()

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

                free_or_claim_bay(
                    bay_id
                )

        cap.release()

        print(
            "[CAMERA] CCTV released."
        )


# ============================================================
# SINGLE-WORKER STREAMING
# ============================================================
#
# The original generate_frames() opened its own cv2.VideoCapture and ran
# the full detection loop from scratch every time it was called. In a
# typical FastAPI/Flask MJPEG endpoint, generate_frames() is invoked once
# PER HTTP CLIENT - so two people viewing the dashboard at once would spin
# up two independent capture + detection loops. Each loop would run its
# own entry/exit confirmation and its own DB writes, which could create
# duplicate reservations and flapping bay statuses, and would also double
# the load on the camera/RTSP source and the GPU/CPU.
#
# CameraWorker below runs the detection loop exactly once in a background
# thread, no matter how many viewers connect, and each HTTP client just
# reads the latest processed JPEG frame from shared memory.

class CameraWorker:

    def __init__(self):
        self._start_lock = threading.Lock()
        self._frame_lock = threading.Lock()
        self._thread = None
        self._running = False
        self._latest_frame = None

    def start(self):
        with self._start_lock:
            if self._running:
                return
            self._running = True
            self._thread = threading.Thread(
                target=self._run,
                name="camera-detection-loop",
                daemon=True,
            )
            self._thread.start()

    def _run(self):
        try:
            for jpeg_bytes in _run_detection_loop():
                with self._frame_lock:
                    self._latest_frame = jpeg_bytes
        except Exception as e:
            print(f"[CAMERA] Detection loop crashed: {e}")
        finally:
            with self._start_lock:
                self._running = False

    def mjpeg_frames(self, poll_interval=0.01):
        """Generator for one HTTP client: starts the shared worker if it
        isn't already running, then streams whatever the worker most
        recently produced, framed as multipart/x-mixed-replace."""

        self.start()

        last_sent = None

        while True:

            with self._frame_lock:
                frame = self._latest_frame

            if frame is not None and frame is not last_sent:

                last_sent = frame

                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame
                    + b"\r\n"
                )

            else:

                time.sleep(poll_interval)


_camera_worker = CameraWorker()


def ensure_camera_running():
    """Start the shared CV detection loop if it isn't already running.
    Called by api.py on startup so the CV heartbeat (cv_heartbeat table)
    begins the moment the FastAPI app boots -- the mobile app's New
    Walk-in / Reservation screens then see 'camera online' right away,
    without anyone needing to open the /video stream first."""
    _camera_worker.start()


def is_camera_running():
    return _camera_worker._running


def generate_frames():

    yield from _camera_worker.mjpeg_frames()


if __name__ == "__main__":
    print("[INFO] camera.py is a module for api.py")
    print("[INFO] Run: python -m uvicorn api:app --host 0.0.0.0 --port 8001")