#!/usr/bin/env bash
# .promo engine dependencies, installed into a private venv (engine/.venv) so it works on
# PEP 668 ("externally managed") systems. Needs python3 (with venv) and ffmpeg. No API keys, no telemetry.
# Run the engine afterwards with:  engine/.venv/bin/python engine/promo.py spec.json --stills out/
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HERE/.venv"
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo "ffmpeg and ffprobe are required (apt-get install -y ffmpeg)"; exit 1; }
if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV" || { echo "python3 -m venv failed (apt-get install -y python3-venv)"; exit 1; }
fi
PY="$VENV/bin/python"
"$PY" -m pip install -q --upgrade pip >/dev/null 2>&1 || true
"$PY" -m pip install -q -r "$HERE/requirements.txt" || { echo "pip install -r requirements.txt failed inside $VENV"; exit 1; }
"$PY" -m pip install -q "librosa>=0.10" >/dev/null 2>&1 || echo "librosa not installed; using the built-in numpy beat detector"
# Browser: an existing Google Chrome is used automatically (promo.py picks it up, or set PROMO_CHROME);
# Playwright's own Chromium is still attempted so the engine works where Chrome is absent.
CHROME="${PROMO_CHROME:-$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)}"
if [ -n "$CHROME" ]; then echo "Using browser: $CHROME"; echo "$CHROME" > "$VENV/promo_chrome"; fi
"$PY" -m playwright install chromium >/dev/null 2>&1 || { [ -n "$CHROME" ] || { echo "No browser: Playwright chromium download failed and no google-chrome found. Install Chrome or set PROMO_CHROME=/path/to/chrome"; exit 1; }; }
fc-list : family 2>/dev/null | grep -i '^Inter' >/dev/null || echo "Tip: install the Inter font (fonts-inter) for the intended look; falls back to Helvetica/Arial."
"$PY" -c "import numpy, scipy, PIL, playwright" || { echo "dependency check failed"; exit 1; }
echo ".promo engine ready. Run: $VENV/bin/python $HERE/promo.py spec.json --stills out/"
