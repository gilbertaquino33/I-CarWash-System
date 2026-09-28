#!/usr/bin/env bash
# Installs the Carwash CCTV backend on a Raspberry Pi (64-bit OS).
#
# Made for a shaky internet connection:
#   * every download is retried automatically when the connection drops
#   * finished steps are skipped, so you can simply run it again
#   * it gets its own Python 3.12 (Raspberry Pi OS Trixie ships 3.13, which
#     inference-sdk does not support yet)
#
# Run it in the background so an SSH disconnect cannot stop it:
#     nohup bash setup-pi.sh > setup.log 2>&1 &
#     tail -f setup.log
#
# Copy these to ~/carwash-backend first: api.py camera.py requirements-pi.txt
# setup-pi.sh .env  and the best_ncnn_model folder.

set -u
cd "$(dirname "$0")" || exit 1

say() { printf '\n=== %s ===\n' "$*"; }

# retry <tries> <command...>  -- runs the command until it succeeds.
retry() {
  local tries=$1 n=1
  shift
  until "$@"; do
    if [ "$n" -ge "$tries" ]; then
      echo "[FAIL] gave up after $tries tries: $*"
      return 1
    fi
    echo "[RETRY $n/$tries] probably the connection dropped -- waiting 20s, then trying again..."
    n=$((n + 1))
    sleep 20
  done
}

# --- 0. Checks ---------------------------------------------------------------
say "Checking this Pi"

if [ "$(uname -m)" != "aarch64" ]; then
  echo "[FAIL] This needs the 64-bit Raspberry Pi OS ('uname -m' must say aarch64, it says $(uname -m))."
  exit 1
fi

for f in api.py camera.py requirements-pi.txt .env; do
  if [ ! -e "$f" ]; then
    echo "[FAIL] Missing file: $f -- copy it from the PC first."
    exit 1
  fi
done

if [ ! -d best_ncnn_model ] && [ ! -f best.pt ]; then
  echo "[FAIL] No model found. Copy the best_ncnn_model folder (or best.pt) from the PC."
  exit 1
fi

chmod 600 .env

# OpenCV needs these two system libraries (they are small). We cannot use
# sudo from here (no keyboard in the background), so ask the user to do it.
missing=""
ldconfig -p 2>/dev/null | grep -q 'libGL.so.1' || missing="$missing libgl1"
ldconfig -p 2>/dev/null | grep -q 'libgthread-2.0.so.0' || missing="$missing libglib2.0-0"
if [ -n "$missing" ]; then
  echo "[STOP] Missing system libraries:$missing"
  echo "       Run this ONE line, then run this script again:"
  echo "       until sudo apt-get -o Acquire::ForceIPv4=true -o Acquire::Retries=5 install -y$missing; do sleep 10; done"
  exit 1
fi
echo "[OK] 64-bit OS, files present, system libraries present."

# --- 1. uv (small tool that can give us Python 3.12) --------------------------
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  say "Installing uv"
  retry 15 sh -c 'curl -4 -LsSf -o /tmp/uv-install.sh https://astral.sh/uv/install.sh && sh /tmp/uv-install.sh' || exit 1
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "[FAIL] uv is not available after installing it."
  exit 1
fi
echo "[OK] $(uv --version)"

# --- 2. Python 3.12 environment ----------------------------------------------
if [ -x .venv/bin/python ] && .venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info[:2] in ((3, 11), (3, 12)) else 1)'; then
  echo "[OK] .venv already uses $(.venv/bin/python --version)"
else
  say "Creating the Python 3.12 environment (downloads Python, about 35 MB)"
  rm -rf .venv
  retry 15 uv venv --python 3.12 .venv || exit 1
fi

# --- 3. Packages --------------------------------------------------------------
# requirements-pi.txt uses the CPU build of torch (about 160 MB). The normal
# PyPI torch would pull several GB of NVIDIA CUDA files that a Pi cannot use.
say "Installing packages (about 400 MB) -- it resumes by itself if the connection drops"
export UV_HTTP_TIMEOUT=120
retry 30 uv pip install --python .venv/bin/python --index-strategy unsafe-best-match -r requirements-pi.txt || exit 1

# --- 4. Does it import? -------------------------------------------------------
say "Testing the install (importing torch takes a while on a Pi 4)"
if ! .venv/bin/python - <<'PY'
import cv2, fastapi, ncnn, torch, ultralytics
print("torch", torch.__version__, "| CUDA available:", torch.cuda.is_available(),
      "| opencv", cv2.__version__, "| ultralytics", ultralytics.__version__)
PY
then
  echo "[FAIL] The packages installed but Python cannot import them. Send the lines above to the developer."
  exit 1
fi

# --- 5. Can the Pi see the camera? -------------------------------------------
say "Checking that the camera can be reached"
CAM="$(.venv/bin/python - <<'PY'
from urllib.parse import urlparse

src = ""
for line in open(".env"):
    if line.startswith("VIDEO_SOURCE="):
        src = line.split("=", 1)[1].strip()
u = urlparse(src)
print(f"{u.hostname or ''} {u.port or 554}")
PY
)"
set -- $CAM
cam_host="${1:-}"
cam_port="${2:-554}"
if [ -z "$cam_host" ]; then
  echo "[WARN] VIDEO_SOURCE is not set in .env"
elif timeout 6 bash -c "exec 3<>/dev/tcp/$cam_host/$cam_port" 2>/dev/null; then
  echo "[OK] Camera $cam_host:$cam_port answers."
else
  echo "[WARN] Cannot reach the camera at $cam_host:$cam_port from this Pi."
  echo "       The Pi and the camera must be on the SAME network (same router)."
fi

say "DONE"
echo "Next: test-run the backend by hand:"
echo "  cd ~/carwash-backend && source .venv/bin/activate"
echo "  set -a; source .env; set +a"
echo "  python -m uvicorn api:app --host 0.0.0.0 --port 8001"
