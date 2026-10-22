# .promo

.promo turns your product into a short launch video. Pick a style, a foreground (phone, laptop, browser window, product shot or logo), music, length and aspect, preview it live, then paste one request into your bot chat. The bot shows you preview stills before the full render.

![.promo](assets/stills/1-cover.png)

## The builder Page

`canvas/builder.tsx` is the source of the **.promo builder** Page: a self-contained Grok Bot canvas (imports only from `grok/canvas`, no network, nothing saved). It has a live animated preview, a timeline with draggable scenes and beat markers, caption styles, accent colors, and a "Paste this in your bot chat" request.

### How a bot installs it

1. Download the pinned file:
   ```
   curl -fsSL https://raw.githubusercontent.com/greedfi/dotpromo/v3/canvas/builder.tsx -o builder.tsx
   ```
2. Verify it:
   ```
   echo "d9ab5626aa72e09bfc01190f32f87234225f6e09d771a8862cb6c3ca32f92276  builder.tsx" | sha256sum -c -
   ```
3. Write it as a canvas exactly as downloaded, unmodified, titled `.promo builder` (reuse the existing Page if there is one).

If the download or the hash check fails, stop and report it. Never rewrite the code.

## The render engine

`engine/` turns a JSON spec into preview stills and a promo MP4 (Playwright + ffmpeg, beat-synced cuts, brand colors from a logo, light/dark themes). Bots pin it by **full commit SHA** (release tag `engine-v1`) and verify every file with `engine/SHA256SUMS` before running. See [engine/README.md](engine/README.md).

## Assets

- `assets/stills/`: preview stills
- `assets/styles/style-5.png`: the holographic .promo character

## License

MIT, see [LICENSE](LICENSE).
