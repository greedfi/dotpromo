#!/usr/bin/env bash
# .promo engine dependencies. Needs python3 and ffmpeg. No API keys, no telemetry.
set -euo pipefail
command -v ffmpeg >/dev/null || { echo "ffmpeg is required (apt-get install -y ffmpeg)"; exit 1; }
python3 -m pip install --user -q -r "$(dirname "$0")/requirements.txt"
python3 -m pip install --user -q "librosa>=0.10" || echo "librosa not installed; using the built-in numpy beat detector"
python3 -m playwright install chromium || echo "Playwright chromium download failed; set PROMO_CHROME=/path/to/chrome or install google-chrome"
fc-list : family | grep -qi '^Inter' || echo "Tip: install the Inter font (fonts-inter) for the intended look; falls back to Helvetica/Arial."
echo ".promo engine ready"
