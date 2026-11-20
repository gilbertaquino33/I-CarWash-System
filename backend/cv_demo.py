"""
Demo helper for running the CV on a recorded video WITHOUT leaving test data.

    python cv_demo.py mark      # remember where the demo starts
    python cv_demo.py cleanup   # delete only what the demo created

`mark` saves the newest reservation id and the start time. `cleanup` then
deletes ONLY camera walk-ins of this shop (no customer, id after the mark,
created after the start) plus their walkin_transactions, frees the bays and
marks the camera offline. Customer reservations, home services, manual
walk-ins made before the demo and all other data are never touched.

Used by run-cv-demo.ps1; can also be run by hand.
"""

import json
import os
import sys
from datetime import datetime, timezone

from supabase import create_client

HERE = os.path.dirname(os.path.abspath(__file__))
SESSION_FILE = os.path.join(HERE, ".cv_demo_session.json")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hybszzpgtbuubdotqkqq.supabase.co")
SHOP_ID = 2  # same as camera.py


def load_key():
    key = (os.getenv("SUPABASE_KEY") or "").strip()
    if key:
        return key
    with open(os.path.join(HERE, ".env.pi"), encoding="utf-8") as f:
        for line in f:
            if line.startswith("SUPABASE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("SUPABASE_KEY not found (env var or backend/.env.pi).")


sb = create_client(SUPABASE_URL, load_key())


def mark():
    newest = sb.table("reservation").select("id").order("id", desc=True).limit(1).execute().data
    session = {
        "max_id": newest[0]["id"] if newest else 0,
        "start": datetime.now(timezone.utc).isoformat(),
    }
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        json.dump(session, f)
    print(f"[DEMO] Marked start: records after id {session['max_id']} will be cleaned up.")


def cleanup():
    if not os.path.exists(SESSION_FILE):
        print("[DEMO] No demo session to clean up (nothing was marked). Nothing deleted.")
        return
    with open(SESSION_FILE, encoding="utf-8") as f:
        session = json.load(f)

    rows = (
        sb.table("reservation")
        .select("id, bay_name, vehicle_type, status, price")
        .eq("shop_id", SHOP_ID)
        .gt("id", session["max_id"])
        .gte("created_at", session["start"])
        .is_("customer_id", "null")
        .execute()
        .data
        or []
    )
    ids = [r["id"] for r in rows]
    if ids:
        sb.table("walkin_transactions").delete().in_("reservation_id", ids).execute()
        sb.table("reservation").delete().in_("id", ids).execute()
    print(f"[DEMO] Deleted {len(ids)} demo walk-in(s): {ids}")

    # Bays back to empty (a reserved customer's QR hold is kept), camera offline.
    sb.table("bays").update({"cv_occupied": False}).eq("shop_id", SHOP_ID).execute()
    sb.table("bays").update({"occupied": False, "car_type": ""}).eq("shop_id", SHOP_ID).eq(
        "reserved", False
    ).execute()
    sb.table("cv_heartbeat").delete().eq("shop_id", SHOP_ID).execute()
    os.remove(SESSION_FILE)
    print("[DEMO] Bays cleared and CCTV set back to offline. Done.")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    if action == "mark":
        mark()
    elif action == "cleanup":
        cleanup()
    else:
        print("Usage: python cv_demo.py mark | cleanup")
