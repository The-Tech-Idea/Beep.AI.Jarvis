#!/bin/bash
# Jarvis Console - Linux/macOS Launcher
# Creates .venv, installs requirements, runs http server.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

PORT="${1:-${JARVIS_PORT:-8080}}"

echo ""
echo "============================================================"
echo "  Jarvis Console - Linux/macOS Launcher"
echo "============================================================"
echo ""

if ! command -v python3 &> /dev/null; then
  echo "[ERROR] Python 3 is not installed or not in PATH"
  echo "Please install Python 3.8 or higher"
  exit 1
fi

if [ ! -f ".venv/bin/python" ]; then
  echo "[INFO] Creating virtual environment..."
  python3 -m venv .venv
fi

echo "[INFO] Installing requirements..."
if [ -f "requirements.txt" ]; then
  .venv/bin/python -m pip install --upgrade pip --quiet
  .venv/bin/python -m pip install -r requirements.txt --quiet
fi

if [ "${JARVIS_IDENTITY}" = "1" ] && [ -f "requirements-identity.txt" ]; then
  echo "[INFO] Installing identity requirements..."
  .venv/bin/python -m pip install -r requirements-identity.txt --quiet
fi

echo "[INFO] Starting Jarvis Console at http://localhost:${PORT}"
echo ""
.venv/bin/python jarvis_app.py --port "${PORT}"
