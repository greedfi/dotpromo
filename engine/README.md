# .promo engine

Turns a JSON spec into four preview stills and a polished keynote-style promo MP4 (H.264 + AAC, 30 fps).
Product-agnostic: every word, image, color and song comes from the spec. Runs fully offline (the render page blocks all network requests); no API keys, no telemetry.

## Install
```
bash install.sh          # numpy scipy pillow playwright (+ optional librosa), Playwright chromium
```
Needs `python3` and `ffmpeg`. If Playwright's browser can't be downloaded, set `PROMO_CHROME=/path/to/chrome`.

## Verify before running
Pin the engine by **full commit SHA** (tags can move) and check every file:
```
sha256sum -c SHA256SUMS      # must print OK for every file; stop on any mismatch
```

## Run
```
python3 promo.py spec.json --stills out/            # still-N-sceneK.png per scene + out/qa.json
python3 promo.py spec.json --video out/promo.mp4    # full render (~4-8 min for 30 s on a small box)
```
`qa.json` lists, per still, any text that overflows, words cut off, overlaps between text / foreground / caption, off-stage elements and images that failed to load. Empty lists = clean.

## Spec
Plain JSON data, validated against a whitelist with length limits (unknown fields are rejected; nothing is evaluated or passed to a shell). Asset paths are local files relative to the spec.

| field | values |
|---|---|
| `product` | `{name ≤40, link ≤300}` |
| `style` | `keynote` · `bold` · `minimal` · `playful`, or `{preset, custom:{grid,glow,slab,blobs: bool, motion: calm/punchy/bouncy, scale 0.7–1.3, bg, colors:{bg,ink,sub,card,soft}, description}}` for "describe my own" (the bot maps the vibe to these knobs) |
| `theme` | `light` (default; off-white stage, near-black ink, soft gray cards) · `dark` |
| `foreground` | `phone` · `browser` · `laptop` · `product` · `none` (builder names "Browser window", "Product shot", "Logo only" also accepted) |
| `aspect` | `16:9` (1920×1080) · `9:16` (1080×1920) · `1:1` (1080×1080) |
| `length` | `15` · `30` · `45` |
| `accent` | `blue yellow pink purple orange green` or `#rrggbb` |
| `brand_colors` | `"from_logo"` (dominant colors via `palette.py`) or up to 5 `#rrggbb` |
| `logo`, `logo_has_name` | logo image path; set `logo_has_name` true if the logo already contains the name |
| `captions` | `{on: bool, style: pop-in · word highlight · lower third}` |
| `cuts_on_beat` | snap the 3 scene cuts to bar starts (else beats) of the song |
| `scene_order` | permutation of `[1,2,3,4]` |
| `scenes[1..4]` | `{kicker ≤40, title ≤80 (wrap words in *stars* for accent color), sub ≤140, caption ≤90, bullets ≤4×60, cta ≤40, shot}` |
| `screenshots` | up to 6 local images (scene 2 uses #1, scene 3 uses #2 unless `shot` is set) |
| `music`, `music_start`, `music_credit` | local audio file you have the rights to; omit to use a clean synthesized beat |

Scene roles: **1** hero (logo + headline), **2** showcase (foreground + copy), **3** features (foreground + bullets), **4** call to action (logo + link pill). Text auto-shrinks to fit; tall screenshots scroll gently inside the frame.

## Music policy
Never bundle or download copyrighted music. Use either the owner's own file (they confirm they have the rights) or a track with a clear free license (e.g. Pixabay Music under the Pixabay Content License, YouTube Audio Library tracks marked "no attribution required", or CC0). Record the license and put any required credit in `music_credit` and in the delivery message. With no music the engine synthesizes an original, clean 120 BPM beat (`synth_beat.py`). Audio is trimmed, faded and loudness-normalised to −14 LUFS.

## Beat detection
`beats.py`: built-in numpy spectral-flux onset detector (autocorrelation tempo, sub-frame refined) → librosa if installed → fixed 120 BPM grid.

## Privacy
Screenshots end up in a public video: capture with a demo account or sample data, never real customer or personal info.
