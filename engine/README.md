# .promo engine

Turns a JSON spec into preview stills and a keynote-style launch film (H.264 + AAC, 30 fps).

**v2 look** (every video): one continuous spatial shot, no fades or hard cuts. The owner's logo pops in with a bouncy spring, the wordmark forms from liquid ink blobs, the tagline reveals with motion blur. 3D phone / laptop frames (glare, soft shadows) enter at a Y-axis angle and spring flat; the laptop slides out from behind the phone. Bold two-line headlines (last words in the accent color) swap as crisp cuts on downbeats while devices move, about every 3.5 s. A translucent touch ring taps the UI, chips break out beside the device, glossy spheres float with depth of field. Outro: devices slide out, the logo glides from the corner to the centre while it scales up (never oversized or off-frame), blinks and glances when it has eyes, the wordmark re-forms, and a static CTA lockup holds to the end. Light mode by default, 16:9 by default. Nothing .promo-branded appears on the owner's video (no credit line, watermark or end card).
**v3** (engine-v3): venv install, burned-in captions (bold / clean / pop), automatic logo keying, eyeless logos animate without eye moves, 4% safe margins at full camera push (devices, chips, buddies, captions), chips beside screens, outro logo glides to centre before scaling up, `zoom` for legible laptop/phone screens, exact 15/30/45 s length with up to 12 moments, strict QA on stills and every 2nd video frame.

Product-agnostic: every word, image, color and song comes from the spec. Runs fully offline (the render page blocks all network requests); no API keys, no telemetry.

## Install
```
bash engine/install.sh   # creates engine/.venv; numpy scipy pillow playwright (+ optional librosa) inside it
```
Needs `python3` (with `venv`) and `ffmpeg`/`ffprobe`. Everything is installed into a private venv, so it works on PEP 668 ("externally managed") systems; nothing touches the system Python. An installed Google Chrome / Chromium is used automatically (recorded in `.venv/promo_chrome`, or set `PROMO_CHROME=/path/to/chrome`); Playwright's own Chromium is still attempted, and a failed pip step never skips it. No `file` command is needed: media is checked with Pillow and ffprobe.

## Verify before running
Pin the engine by **full commit SHA** (tags can move) and check every file:
```
sha256sum -c SHA256SUMS      # must print OK for every file; stop on any mismatch
```

## Run (always through the venv)
```
engine/.venv/bin/python engine/promo.py spec.json --stills out/          # still-01-intro.png, still-02-moment1.png … still-NN-outro.png + out/qa.json
engine/.venv/bin/python engine/promo.py spec.json --video out/promo.mp4  # full render (~1-8 min for 30 s) + out/promo.qa.json
```
QA is strict and visible: any issue is printed as `QA FAILED` / `VIDEO QA FAILED` on stderr with the still or the frame times, and the command exits with status **2** (outputs are still written so you can look). Empty lists = clean, exit 0.
- `qa.json` (per still) and `promo.qa.json` (every 2nd video frame) check: headline off-stage or over two lines, text overlapping a device, images that failed to load, media whose aspect does not fit its screen, **anything outside the 4% safe area** (settled devices, chips, logo buddies, captions, the CTA lockup), **chips overlapping a device screen**, **logo buddies covering a screen**, **captions over a screen** (landscape), and **an opaque logo background** that could not be keyed out. Devices are checked once they have settled (entrances and exits move through the frame edge by design).
- Warnings about length (too few / too many moments) are listed under `general`.

## Spec
Plain JSON data, validated against a whitelist with length limits (unknown fields are rejected; nothing is evaluated or passed to a shell). Asset paths are local files relative to the spec.

| field | values |
|---|---|
| `product` | `{name ≤40, link ≤300}` |
| `style` | `keynote` · `bold` · `minimal` · `playful`, or `{preset, custom:{grid,glow,slab,blobs: bool, motion: calm/punchy/bouncy, scale 0.7–1.3, bg, colors:{bg,ink,sub,card,soft}, description}}` for "describe my own" (the bot maps the vibe to these knobs) |
| `theme` | `light` (default; off-white stage, near-black ink, soft gray cards) · `dark` |
| `foreground` | `phone` · `browser` · `laptop` · `product` · `none` (builder names "Browser window", "Product shot", "Logo only" also accepted) |
| `aspect` | `16:9` (1920×1080) · `9:16` (1080×1920) · `1:1` (1080×1080) |
| `length` | `15` · `30` · `45`, hit exactly with the built-in beat (8 / 16 / 24 bars at 128 BPM). Moments are fitted to it: 2 bars (≈3.75 s) each when they fit, 1–1.5 bars when many, up to 2.5 bars and then a longer end-card hold when few. Best counts: 15 s → 1 moment (max 2), 30 s → 5 (max 10), 45 s → 9 (max 12). Extra moments beyond the max are left out with a QA warning. |
| `accent` | `blue yellow pink purple orange green` or `#rrggbb` |
| `brand_colors` | `"from_logo"` (dominant colors via `palette.py`) or up to 5 `#rrggbb` |
| `logo`, `logo_has_name` | logo image path (SVG or transparent PNG preferred); set `logo_has_name` true if the logo already contains the name. A raster logo with an opaque background (e.g. a white apple-touch-icon) is keyed out automatically (flood-fill from the border with tolerance, soft edge, trimmed); if the border is not one colour it is flagged in QA |
| `captions` | `{on: bool, style: bold · clean · pop}` (older names still accepted: `pop-in` → pop, `bold pop-in` → bold, `word highlight` → pop, `lower third` → clean). Burned into the video when on, using each moment's `caption` verbatim (v1: a scene's `caption` when it also has a `sub`). They appear one beat after the moment's downbeat and leave before the next, screen-fixed in the safe area: bottom-left under the text column on landscape, bottom-centre on portrait/square, max two balanced lines. `bold` white on a dark pill (dark on white in dark mode), `clean` plain ink text with a soft halo, `pop` words pop in on the half-beats with the current word in the accent |
| `cuts_on_beat` | snap the 3 scene cuts to bar starts (else beats) of the song |
| `scene_order` | permutation of `[1,2,3,4]` |
| `scenes[1..4]` | `{kicker ≤40, title ≤80 (wrap words in *stars* for accent color), sub ≤140, caption ≤90, bullets ≤4×60, cta ≤40, shot}` |
| `screenshots` | up to 6 local images (scene 2 uses #1, scene 3 uses #2 unless `shot` is set) |
| `music`, `music_start`, `music_credit` | local audio file you have the rights to; omit to use a clean synthesized beat. The soundtrack is normalised to −14 LUFS (two-pass, true peak ≤ −1.5 dBTP) |

### v2 fields (optional; v1 specs keep working)
| field | values |
|---|---|
| `moments` | 1–12 beats of the middle section, each `{title ≤80, sub ≤140, caption ≤90, device, media, media_start, phone_media, phone_media_start, focus, phone_focus, zoom, phone_zoom, chips, taps}`. `title`: use `\n` for the two-line break and `*stars*` for the accent words. `device`: `phone` · `laptop` · `both` (laptop slides out from behind the phone) · `none`. `media`: local image **or video** (mp4/mov/m4v/webm/mkv, decoded from `media_start` s); in `both` it fills the laptop and `phone_media` fills the phone. `focus` / `phone_focus`: `[x%, y%]` crop point. `zoom` / `phone_zoom` (1–3): show a zoomed, readable crop of the media around the focus point (use it so UI text reaches ≈9 px x-height at 1080p: for a 1280×800 desktop capture at 2× that means `zoom` ≈2–2.2 on the region that matters, or a crop that holds no small text; pick a crop that does not cut any element in half). The visible window starts at `(zoom−1)/zoom × focus` of the image on each axis. `taps` are in % of the visible (zoomed) screen. `chips`: up to 4 labels ≤30 that pop out beside the device (left of a lone phone, in rows under the laptop, never over a screen). `taps`: up to 6 `[seconds, x%, y%]` (optional 4th item `"phone"`/`"laptop"`) for the touch-ring cursor |
| `media` per device | `media` may be `{phone, laptop}` (or use `phone_src` / `laptop_src`): the phone always gets the mobile capture, the laptop the desktop one. **Engine rule:** every screen shows media in its own format. promo.py measures each source and stops with a clear error when a phone has no mobile media or any source's aspect differs from its screen by more than 10% (phone 390×844 portrait ≈ 0.46, laptop 16:10 ≈ 1.62) — it never silently crops a desktop page onto a phone. The bot then captures the product link at mobile size (headless Chromium, 390×844 viewport @3x DPR, touch on; record the same states as the beat: typing, taps, scrolls) or asks the owner for phone screenshots. `qa.json` repeats the check per still. v1 specs without portrait screenshots now use the laptop only |
| `logo_parts` | `{base, eyes}`: the logo split into two same-size images (body without eyes, eyes only). Enables the eye moves: eyes close on every bounce landing, blink and glance. **Logos without eyes** (no `logo_parts`) get no eye moves at all — no blink, glance or eye-close, and no eyes are ever added; the body still squashes, stretches and wobbles |
| `wordmark` | text formed next to the logo (default `product.name`; empty when `logo_has_name`) |
| `tagline` | `{title, sub}` under the intro logo (default scene 1 title/sub) |
| `cta` | `{title, sub}` for the final lockup (default scene 4 title + sub/cta/link) |
| `animations` | list of presets, each a name or `{type, moment: 1-8}` to pin it to a beat (otherwise the engine picks a fitting beat). Default when omitted: `["logo_buddies", "word_swap", "copy_burst"]`. All are beat-synced: |
| | `logo_buddies` little characters made from the owner's logo (blink only when `logo_parts` gives them eyes), kept inside the safe area and off the screens, pop in one per beat, hop on each bar, blink and glance, and gather into the logo at the outro |
| | `word_swap` accent words flip on beat 6 of each moment; write `*first|second*` in a title to flip to new words, otherwise the same words flip |
| | `copy_burst` eight copies of one product screen fan out from behind the device on beat 3 and fold back before the next beat (default: first laptop/both moment) |
| | `fly_through` the camera dives into the screen at the end of a moment and emerges into the next one (default: first middle boundary not used by copy_burst) |
| | `chip_rain` chips drop from above and stack/settle with a bounce instead of popping |
| | `device_spin` the phone spins 90° away and the laptop spins in at its place (default: first laptop moment that follows a phone) |
| `intro` | optional; `bounce` (default): the logo character bounces in from the left like a rubber ball — ballistic arcs with energy loss, squash on impact / stretch along velocity, anticipation crouch, rolling, height-aware contact shadow on a subtle ground plane, impacts on beats 1, 3, 4, 5; with `logo_parts`, on every landing it squeezes its eyes shut into happy ^ ^ arcs through the squash and pops them open on launch; impacts squash hard (≈0.62 tall / 1.4 wide at the first landing, scaled by impact speed, held ~3 frames), rebound into a ≈1.25 stretch and jiggle out on a damped spring; in the air it stretches along its velocity (up to ≈1.16, strongest near the ground, round at the apex), tilts into its travel, and the eyes lag and settle (follow-through); the last landing ends in an anticipation squat, a small hop and jelly wobbles; (with eyes) it glances toward the wordmark, which then forms from ink blobs to its right (intro = 3 bars). `pop`: the logo springs up from zero in place (intro = 2 bars) |
| `custom` | free-text notes from the builder per section, `{style, animations, music, captions, scenes, devices, logo, outro, text, theme, aspect, pacing, other}` ≤500 chars each. The engine never interprets them (it only validates and echoes them); the bot maps them to parameters as below |

Without `moments`, beats are derived from scenes 2–3 (title/sub, bullets become chips, then one beat per bullet) in `scene_order`, with devices picked from `foreground` (`phone` → phone-first for mobile apps; `browser`/`laptop` → laptop and phone+laptop; `none` → headlines only). Scene 1 feeds the intro tagline, scene 4 the CTA. v1 `captions` are burned in when on; a scene's `caption` stands in for a missing `sub` (and is then not repeated as a caption). Style presets set the motion (`keynote`/`bold` punchy, `minimal` calm with fewer spheres, `playful` bouncy with more); `custom` keys `grid`, `glow`, `blobs` (spheres on/off), `motion`, `scale`, `bg`, `colors` still apply (`slab` is ignored). `cuts_on_beat` snaps each beat to bar starts of the song.

Timeline: intro 2 bars, one moment per 2 bars (≈ 3.75 s at 128 BPM; 1.5 or 1 bar when many moments must fit), outro 3 bars. Device entrances start on the moment's downbeat; headline line 1 lands on the downbeat and line 2 two beats later (short motion-blur slide), the sub on beat 4, chips pop one per beat from beat 4, taps snap to the beat grid. Devices are fitted into a 4% safe margin that holds at the camera's maximum push-in and drift. The camera pushes in and drifts continuously (parallax on spheres and background) and settles for the static CTA lockup. A `.` in `wordmark` is drawn as a round ink dot. Built-in UI micro-animations on every video: the phone's first screen opens with an app-style zoom, stills drift slowly (anchored at the focus row, so a top crop never cuts the top bar), the screen bumps on each tap, and phone beats get default taps when none are given. Headlines auto-balance to two lines and shrink to fit.

## Translating `custom` descriptions (for the bot)
Before rendering, turn every `custom.*` note into the closest engine parameters, then tell the owner in one short list what was mapped and what **can't** be done, and get a yes before rendering.
1. **style**: pick the nearest preset (`keynote` calm-premium, `bold` big type and punchy, `minimal` sparse, `playful` bouncy), then tune `style.custom` (`motion` calm/punchy/bouncy, `scale` 0.7–1.3 for type size, `bg`, `colors`, `grid`, `glow`, `blobs`) and `accent`/`brand_colors` for colour words ("warm", "neon green" → nearest hex).
2. **animations**: map verbs to presets ("explode/fan out" → `copy_burst`, "zoom into the screen" → `fly_through`, "mascots/characters" → `logo_buddies`, "flip/swap words" → `word_swap` with `*a|b*`, "falling tags" → `chip_rain`, "flip the phone" → `device_spin`); pin with `moment` when the note names a scene.
3. **music**: the owner's own file → `music` (+ `music_start`); "energetic/house/pop" → synthesized default (128 BPM house/pop); other genres, vocals, a named commercial song or exact tempo → not possible with the synth: ask for a licensed file.
4. **captions / text**: wording goes into `tagline`, `moments[].title/sub` (`\n` for the line break, `*stars*` for accent), `cta`. Captions: `captions` on + `moments[].caption` (verbatim). Voice-over → not supported.
5. **scenes / pacing / devices**: build `moments` (≤12, ≈3.75 s each; 15 s → 1, 30 s → 5, 45 s → 9 fit best), `device` per moment, `media` (stills or a video clip with `media_start`), `chips`, `taps`.
6. **theme / aspect / logo / outro**: `theme` light/dark, `aspect` 16:9/9:16/1:1, `logo` + `logo_parts` (split body/eyes for blinking), `wordmark`, `cta`.
**Flag as not possible** (tell the owner before rendering): voice-over or vocals, a specific copyrighted song, 3D models other than phone/laptop, live web capture during render, transitions other than the six presets, fades/hard cuts (by design), more than 12 beats, lengths other than 15/30/45 s, text in images the owner didn't supply, logos with animated parts other than eyes.

## Music policy
Never bundle or download copyrighted music. Use either the owner's own file (they confirm they have the rights) or a track with a clear free license (e.g. Pixabay Music under the Pixabay Content License, YouTube Audio Library tracks marked "no attribution required", or CC0). Record the license and put any required credit in `music_credit` and in the delivery message. With no music the engine synthesizes an original beat written to the picture (`synth_beat.py`: punchy kick with click, claps, hats, side-chained offbeat bass, bright chord stabs; filtered intro that drops when the first device lands, a one-beat stop into the outro and a clean final hit under the CTA; no pads, noise risers, reverb wash or pitch effects). It is a modern house/pop track at 128 BPM in a major key (layered kick on every beat, real-style clap on 2 and 4, off-beat open hats, warm saw+sub bass side-chained to the kick, bright supersaw chord stabs C–F–G–F; no square waves or minor chords), and the timeline is laid on its bar grid, so with no song the film is exactly the requested length (`15`/`30`/`45` s = 8/16/24 bars). No credit line is added. Audio is trimmed and loudness-normalised to −14 LUFS (owner songs also get a short fade after the CTA lands).

## Beat detection
`beats.py`: built-in numpy spectral-flux onset detector (autocorrelation tempo, sub-frame refined) → librosa if installed → fixed 120 BPM grid.

## Privacy
Screenshots end up in a public video: capture with a demo account or sample data, never real customer or personal info.
