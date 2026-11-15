"""
DEMO LANG -- pang-video. Ginagaya ang ginagawa ng camera.py sa database
para mag-mukhang LIVE ang CCTV kahit hindi ito naka-connect.

    .venv\\Scripts\\python backend\\demo_cctv_sim.py

Habang tumatakbo:
  * nagpapadala ng "camera online" heartbeat kada 10s (gaya ng camera.py)
  * 1 / 2  -> may SEDAN na "na-detect" sa Bay 1 / Bay 2  (lalabas: Occupied)
             Sa app, i-tap ang "Basic Wash" -> Washing (tatakbo ang timer)
  * o1/o2  -> "umalis" ang sasakyan sa Bay 1 / Bay 2       (-> Completed)
  * q      -> tapusin ang demo: babalik sa OFFLINE (dating flow)
  * c      -> tapusin + BURAHIN ang demo records (para hindi masama sa kita)

Ang mga ID ng demo records ay naka-save sa demo_cctv_sim_ids.json.
Burahin ang file na ito pagkatapos ng video.
"""

import json
import os
import threading
import time
from datetime import datetime, timezone

from supabase import create_client

HERE = os.path.dirname(os.path.abspath(__file__))
IDS_FILE = os.path.join(HERE, "demo_cctv_sim_ids.json")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://hybszzpgtbuubdotqkqq.supabase.co")
SHOP_ID = 2  # same as camera.py
VEHICLE = "Sedan"
BAYS = {"1": "Bay 1", "2": "Bay 2"}


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
now_iso = lambda: datetime.now(timezone.utc).isoformat()

# bay_name -> {"id": reservation id, "since": epoch secs}
active = {}
stop_event = threading.Event()


def load_ids():
    try:
        with open(IDS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_id(rid):
    ids = load_ids()
    ids.append(rid)
    with open(IDS_FILE, "w", encoding="utf-8") as f:
        json.dump(ids, f)


def heartbeat_loop():
    while not stop_event.is_set():
        try:
            sb.table("cv_heartbeat").upsert({"shop_id": SHOP_ID, "updated_at": now_iso()}).execute()
        except Exception as e:
            print(f"\n[WARN] heartbeat failed: {e}")
        stop_event.wait(10)


def shop_name():
    try:
        r = sb.table("shop_profile_setup").select("shop_name").eq("id", SHOP_ID).maybe_single().execute()
        return (r.data or {}).get("shop_name") or ""
    except Exception:
        return ""


def car_enters(bay):
    if bay in active:
        print(f"  {bay} may sasakyan na.")
        return
    today = datetime.now().strftime("%Y-%m-%d")
    res = sb.table("reservation").insert({
        "shop_id": SHOP_ID,
        "shop_name": SHOP,
        "vehicle_type": VEHICLE,
        "bay_name": bay,
        "status": "Waiting",
        "occupied": True,
        "service_timer": "00:00:00",
        "reservation_date": today,
        "cv_detected_vehicle_type": VEHICLE,
    }).execute()
    rid = res.data[0]["id"]
    save_id(rid)
    try:
        sb.table("walkin_transactions").insert({
            "reservation_id": rid, "shop_id": SHOP_ID, "shop_name": SHOP,
            "vehicle_type": VEHICLE, "bay_name": bay, "price": 0,
            "reservation_date": today, "service_timer": "00:00:00",
        }).execute()
    except Exception as e:
        print(f"  [WARN] walkin_transactions insert failed: {e}")
    sb.table("bays").update({"occupied": True, "car_type": VEHICLE, "updated_at": now_iso()}) \
        .eq("shop_id", SHOP_ID).eq("bay_name", bay).execute()
    sb.table("bays").update({"cv_occupied": True}).eq("shop_id", SHOP_ID).eq("bay_name", bay).execute()
    active[bay] = {"id": rid, "since": time.time()}
    print(f"  [CV] SEDAN detected in {bay} (reservation {rid}). I-tap ang Basic Wash sa app.")


def car_leaves(bay):
    info = active.get(bay)
    if not info:
        print(f"  Walang sasakyan sa {bay}.")
        return
    rid = info["id"]
    row = sb.table("reservation").select("status, washing_started_at").eq("id", rid).maybe_single().execute().data or {}
    status = row.get("status")
    if status == "Waiting":
        print(f"  [!] {bay} ay hindi pa naka-Basic Wash. I-tap muna ang Basic Wash sa app,")
        print("      kung hindi ay magiging Cancelled ito imbes na Completed.")
        if input("      Ituloy pa rin? (y/N): ").strip().lower() != "y":
            return
    secs = int(time.time() - info["since"])
    if row.get("washing_started_at"):
        started = datetime.fromisoformat(row["washing_started_at"].replace("Z", "+00:00"))
        secs = int((datetime.now(timezone.utc) - started).total_seconds())
    timer = f"{secs // 3600:02d}:{(secs % 3600) // 60:02d}:{secs % 60:02d}"
    final = "Completed" if status == "Washing" else ("Cancelled" if status == "Waiting" else status)
    departed = now_iso()
    sb.table("reservation").update({
        "status": final, "occupied": False, "service_timer": timer, "completed_at": departed,
    }).eq("id", rid).execute()
    sb.table("walkin_transactions").update({"service_timer": timer, "completed_at": departed}) \
        .eq("reservation_id", rid).execute()
    sb.table("bays").update({"cv_occupied": False}).eq("shop_id", SHOP_ID).eq("bay_name", bay).execute()
    try:
        sb.rpc("claim_bay_for_reserved_or_free", {"p_bay_name": bay, "p_shop_id": SHOP_ID}).execute()
    except Exception as e:
        print(f"  [WARN] free bay failed: {e}")
    del active[bay]
    print(f"  [CV] Sedan left {bay} -> {final} ({timer}).")


def go_offline():
    stop_event.set()
    for bay in BAYS.values():
        try:
            sb.table("bays").update({"cv_occupied": False}).eq("shop_id", SHOP_ID).eq("bay_name", bay).execute()
        except Exception:
            pass
    try:
        sb.table("cv_heartbeat").delete().eq("shop_id", SHOP_ID).execute()
    except Exception as e:
        print(f"[WARN] clear heartbeat failed: {e}")
    print("CCTV balik OFFLINE (manual mode).")


def cleanup_records():
    ids = load_ids()
    if not ids:
        print("Walang demo records na buburahin.")
        return
    sb.table("walkin_transactions").delete().in_("reservation_id", ids).execute()
    sb.table("reservation").delete().in_("id", ids).execute()
    for bay in BAYS.values():
        try:
            sb.rpc("claim_bay_for_reserved_or_free", {"p_bay_name": bay, "p_shop_id": SHOP_ID}).execute()
        except Exception:
            pass
    os.remove(IDS_FILE)
    print(f"Nabura ang {len(ids)} demo record(s): {ids}")


SHOP = shop_name()

MENU = """
  1  = Sedan pumasok sa Bay 1      o1 = Umalis ang sasakyan sa Bay 1
  2  = Sedan pumasok sa Bay 2      o2 = Umalis ang sasakyan sa Bay 2
  q  = Tapusin demo (balik offline) c  = Tapusin + burahin demo records
"""

if __name__ == "__main__":
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    print(f"[DEMO] CCTV 'online' para sa shop_id={SHOP_ID} {SHOP!r}. Heartbeat kada 10s.")
    print(MENU)
    try:
        while True:
            cmd = input("> ").strip().lower()
            if cmd in BAYS:
                car_enters(BAYS[cmd])
            elif cmd in ("o1", "o2"):
                car_leaves(BAYS[cmd[1]])
            elif cmd == "q":
                break
            elif cmd == "c":
                go_offline()
                cleanup_records()
                raise SystemExit
            else:
                print(MENU)
    except (KeyboardInterrupt, EOFError):
        print()
    go_offline()
