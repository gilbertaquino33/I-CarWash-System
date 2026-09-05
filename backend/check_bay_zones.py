"""
check_bay_zones.py
-------------------
Quick diagnostic: directly queries the Supabase `bay_zones` table and
prints exactly what's stored for SHOP_ID, so we can confirm whether
calibrate_bays.py actually saved anything (and whether it looks right)
BEFORE we touch camera.py again.

Run:  python check_bay_zones.py
"""

import os
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hybszzpgtbuubdotqkqq.supabase.co")
SUPABASE_KEY = os.getenv(
    "SUPABASE_KEY",
    "SUPABASE_KEY_HERE"
)

SHOP_ID = 2
BAY_ZONES_TABLE = "bay_zones"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def main():
    print(f"[INFO] Querying '{BAY_ZONES_TABLE}' for shop_id={SHOP_ID} ...")

    try:
        response = (
            supabase
            .table(BAY_ZONES_TABLE)
            .select("*")
            .eq("shop_id", SHOP_ID)
            .execute()
        )
    except Exception as e:
        print(f"[ERROR] Query failed: {e}")
        print("[HINT] This usually means bad credentials, wrong table "
              "name, or a network/RLS (row-level security) issue.")
        return

    rows = response.data or []

    if not rows:
        print(f"[RESULT] EMPTY. No rows found for shop_id={SHOP_ID}.")
        print("[HINT] This means calibrate_bays.py either wasn't run, "
              "the push failed silently, or you answered 'N' to the "
              "push prompt. camera.py WILL use the fallback polygons "
              "in this case -- that's expected behavior, not a bug.")
        return

    print(f"[RESULT] Found {len(rows)} row(s):\n")

    for row in rows:
        bay_name = row.get("bay_name")
        polygon = row.get("polygon")
        print(f"  bay_name = {bay_name!r}")
        print(f"  polygon  = {polygon}")
        print(f"  (all columns: {row})")
        print()

    names = [r.get("bay_name") for r in rows]
    print(f"[SUMMARY] Bay names in DB: {names}")

    if len(rows) == 1:
        print("[WARNING] Only ONE bay zone found. If you meant to "
              "calibrate 2 separate bays (Bay 1 and Bay 2), it looks "
              "like only one combined polygon was saved -- re-run "
              "calibrate_bays.py and press 'n' after EACH bay "
              "separately (4 corners for Bay 1 -> 'n' -> name it -> "
              "4 corners for Bay 2 -> 'n' -> name it -> then 'q').")


if __name__ == "__main__":
    main()
