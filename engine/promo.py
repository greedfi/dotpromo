#!/usr/bin/env python3
""".promo render engine. Usage:
  python3 promo.py spec.json --stills OUTDIR          # one PNG per scene + QA report
  python3 promo.py spec.json --video OUT.mp4 [--stills OUTDIR]
See README.md for the spec format."""
import argparse, asyncio, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import beats as B, palette as PAL

ACCENTS = {'blue': '#1d9bf0', 'yellow': '#ffd400', 'pink': '#f91880', 'purple': '#7856ff', 'orange': '#ff7a00', 'green': '#00ba7c'}
SIZES = {'16:9': (1920, 1080), '9:16': (1080, 1920), '1:1': (1080, 1080)}
FPS = 30

ENUMS = {'theme': {'light', 'dark'}, 'aspect': set(SIZES), 'foreground': {'phone', 'browser', 'laptop', 'product', 'none', 'browser window', 'product shot', 'logo only'},
         'preset': {'keynote', 'bold', 'bold launch', 'minimal', 'playful', 'custom'}, 'cap': {'pop-in', 'bold pop-in', 'word highlight', 'lower third'}}
TOP = {'product', 'style', 'theme', 'foreground', 'aspect', 'length', 'accent', 'brand_colors', 'logo', 'logo_has_name', 'captions', 'cuts_on_beat',
       'beat_pulse', 'scene_order', 'screenshots', 'music', 'music_start', 'music_credit', 'scenes', 'font',
       # v2 (all optional)
       'moments', 'logo_parts', 'wordmark', 'tagline', 'cta', 'animations', 'custom', 'intro'}
ANIMS = ('logo_buddies', 'copy_burst', 'fly_through', 'word_swap', 'chip_rain', 'device_spin')
DEFAULT_ANIMS = ['logo_buddies', 'word_swap', 'copy_burst']
CUSTOM_KEYS = {'style', 'animations', 'music', 'captions', 'scenes', 'devices', 'logo', 'outro', 'text', 'theme', 'aspect', 'pacing', 'other'}
DEVICES = {'phone', 'laptop', 'both', 'none'}
VIDEO_EXT = ('.mp4', '.mov', '.m4v', '.webm', '.mkv')
HEX = __import__('re').compile(r'^#[0-9a-fA-F]{6}$')

def validate(spec):
    """Whitelist + length limits. The spec is plain data; nothing in it is ever evaluated or passed to a shell."""
    def bad(m): raise SystemExit('spec rejected: ' + m)
    def txt(v, n, k):
        if v is None: return
        if not isinstance(v, str) or len(v) > n: bad(f'{k} must be text up to {n} chars')
    if not isinstance(spec, dict): bad('not an object')
    for k in spec:
        if k not in TOP: bad('unknown field ' + k)
    st = spec.get('style', 'keynote')
    if isinstance(st, dict):
        if str(st.get('preset', 'keynote')).lower() not in ENUMS['preset']: bad('style.preset')
        c = st.get('custom', {}) or {}
        for k, v in c.items():
            if k in ('grid', 'glow', 'slab', 'blobs'): 
                if not isinstance(v, bool): bad('style.custom.' + k)
            elif k == 'motion':
                if v not in ('calm', 'punchy', 'bouncy'): bad('style.custom.motion')
            elif k == 'scale':
                if not isinstance(v, (int, float)) or not .7 <= v <= 1.3: bad('style.custom.scale')
            elif k in ('bg',):
                if not HEX.match(str(v)): bad('style.custom.bg must be #rrggbb')
            elif k == 'colors':
                for ck, cv in v.items():
                    if ck not in ('bg', 'ink', 'sub', 'card', 'soft') or not HEX.match(str(cv)): bad('style.custom.colors')
            elif k == 'description': txt(v, 300, k)
            else: bad('unknown style.custom.' + k)
    elif str(st).lower() not in ENUMS['preset']: bad('style')
    for k, e in (('theme', 'theme'), ('aspect', 'aspect'), ('foreground', 'foreground')):
        if k in spec and str(spec[k]).lower() not in ENUMS[e]: bad(k)
    if spec.get('length', 30) not in (15, 30, 45): bad('length must be 15, 30 or 45')
    a = str(spec.get('accent', 'blue')).lower()
    if a not in ACCENTS and not HEX.match(a): bad('accent')
    bc = spec.get('brand_colors', [])
    if not (bc == 'from_logo' or (isinstance(bc, list) and len(bc) <= 5 and all(HEX.match(str(c)) for c in bc))): bad('brand_colors')
    cap = spec.get('captions', {})
    if not isinstance(cap, dict) or set(cap) - {'on', 'style'} or str(cap.get('style', 'pop-in')).lower() not in ENUMS['cap']: bad('captions')
    so = spec.get('scene_order', [1, 2, 3, 4])
    if sorted(so) != [1, 2, 3, 4]: bad('scene_order must be a permutation of 1-4')
    p = spec.get('product', {})
    if set(p) - {'name', 'link'}: bad('product fields')
    txt(p.get('name'), 40, 'product.name'); txt(p.get('link'), 300, 'product.link')
    if p.get('link') and not __import__('re').match(r'^(https?://)?[\w.-]+\.[a-z]{2,}(/\S*)?$', p['link'], 2): bad('product.link')
    sc = spec.get('scenes', [])
    if not isinstance(sc, list) or len(sc) > 4: bad('scenes: up to 4')
    for i, x in enumerate(sc):
        if set(x) - {'kicker', 'title', 'sub', 'caption', 'bullets', 'cta', 'shot'}: bad(f'scenes[{i}] fields')
        for k, n in (('kicker', 40), ('title', 80), ('sub', 140), ('caption', 90), ('cta', 40), ('shot', 300)): txt(x.get(k), n, f'scenes[{i}].{k}')
        if len(x.get('bullets', [])) > 4: bad('bullets: up to 4')
        for b in x.get('bullets', []): txt(b, 60, 'bullet')
    for k in ('logo', 'music'): txt(spec.get(k), 300, k)
    shots = spec.get('screenshots', [])
    if not isinstance(shots, list) or len(shots) > 6: bad('screenshots: up to 6')
    for x in shots: txt(x, 300, 'screenshot')
    txt(spec.get('music_credit'), 200, 'music_credit')
    for k in ('logo', 'music', *(['screenshots'] * 0)):
        v = spec.get(k)
        if v and str(v).startswith(('http:', 'https:')): bad(k + ' must be a local file (download it first)')
    for x in shots:
        if str(x).startswith(('http:', 'https:')): bad('screenshots must be local files')

def validate_v2(spec):
    def bad(m): raise SystemExit('spec rejected: ' + m)
    def txt(v, n, k):
        if v is None: return
        if not isinstance(v, str) or len(v) > n: bad(f'{k} must be text up to {n} chars')
    def local(v, k):
        txt(v, 300, k)
        if v and str(v).startswith(('http:', 'https:')): bad(k + ' must be a local file (download it first)')
    def num(v, k, lo, hi):
        if v is None: return
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi: bad(f'{k} must be a number {lo}-{hi}')
    def xy(v, k):
        if v is None: return
        if not isinstance(v, list) or len(v) != 2: bad(k + ' must be [x%, y%]')
        for c in v: num(c, k, 0, 100)
    lp = spec.get('logo_parts')
    if lp is not None:
        if not isinstance(lp, dict) or set(lp) - {'base', 'eyes'} or not lp.get('base') or not lp.get('eyes'): bad('logo_parts must be {base, eyes}')
        local(lp['base'], 'logo_parts.base'); local(lp['eyes'], 'logo_parts.eyes')
    txt(spec.get('wordmark'), 24, 'wordmark')
    for k in ('tagline', 'cta'):
        v = spec.get(k)
        if v is None: continue
        if not isinstance(v, dict) or set(v) - {'title', 'sub'}: bad(k + ' must be {title, sub}')
        txt(v.get('title'), 80, k + '.title'); txt(v.get('sub'), 140, k + '.sub')
    if spec.get('intro', 'bounce') not in ('bounce', 'pop'): bad('intro must be bounce or pop')
    an = spec.get('animations')
    if an is not None:
        if not isinstance(an, list) or len(an) > 8: bad('animations: list of up to 8')
        for a in an:
            ty = a.get('type') if isinstance(a, dict) else a
            if ty not in ANIMS: bad('animations: unknown preset ' + str(ty) + ' (use ' + ', '.join(ANIMS) + ')')
            if isinstance(a, dict):
                if set(a) - {'type', 'moment'}: bad('animations items are a name or {type, moment}')
                num(a.get('moment'), 'animations.moment', 1, 8)
    cu = spec.get('custom')
    if cu is not None:
        if not isinstance(cu, dict) or set(cu) - CUSTOM_KEYS: bad('custom: object with keys ' + ', '.join(sorted(CUSTOM_KEYS)))
        for k2, v in cu.items(): txt(v, 500, 'custom.' + k2)
    ms = spec.get('moments')
    if ms is None: return
    if not isinstance(ms, list) or not 1 <= len(ms) <= 8: bad('moments: 1 to 8')
    for i, m in enumerate(ms):
        k = f'moments[{i}]'
        if not isinstance(m, dict) or set(m) - {'title', 'sub', 'device', 'media', 'media_start', 'phone_media', 'phone_media_start', 'phone_src', 'laptop_src', 'focus', 'phone_focus', 'chips', 'taps'}: bad(k + ' fields')
        txt(m.get('title'), 80, k + '.title'); txt(m.get('sub'), 140, k + '.sub')
        if str(m.get('device', 'phone')).lower() not in DEVICES: bad(k + '.device must be phone, laptop, both or none')
        if isinstance(m.get('media'), dict):
            if set(m['media']) - {'phone', 'laptop'}: bad(k + '.media object takes phone and laptop')
            for dk, dv in m['media'].items(): local(dv, k + '.media.' + dk)
        else: local(m.get('media'), k + '.media')
        local(m.get('phone_media'), k + '.phone_media'); local(m.get('phone_src'), k + '.phone_src'); local(m.get('laptop_src'), k + '.laptop_src')
        num(m.get('media_start'), k + '.media_start', 0, 36000); num(m.get('phone_media_start'), k + '.phone_media_start', 0, 36000)
        xy(m.get('focus'), k + '.focus'); xy(m.get('phone_focus'), k + '.phone_focus')
        ch = m.get('chips', [])
        if not isinstance(ch, list) or len(ch) > 4: bad(k + '.chips: up to 4')
        for c in ch: txt(c, 30, k + '.chip')
        tp = m.get('taps', [])
        if not isinstance(tp, list) or len(tp) > 6: bad(k + '.taps: up to 6')
        for t in tp:
            if not isinstance(t, list) or len(t) not in (3, 4): bad(k + '.taps items are [seconds, x%, y%] or [seconds, x%, y%, "phone"|"laptop"]')
            num(t[0], k + '.tap time', 0, 20); num(t[1], k + '.tap x', 0, 100); num(t[2], k + '.tap y', 0, 100)
            if len(t) == 4 and t[3] not in ('phone', 'laptop'): bad(k + '.tap device')

def resolve(spec, base):
    validate(spec); validate_v2(spec)
    s = json.loads(json.dumps(spec))
    s.setdefault('theme', 'light'); s.setdefault('font', None)
    st = s.get('style', 'keynote'); s['style'] = st if isinstance(st, dict) else {'preset': str(st).lower().replace(' launch', '')}
    if s['style']['preset'] == 'custom': s['style']['preset'] = 'keynote'
    s['style'].setdefault('preset', 'keynote')
    s['foreground'] = {'browser window': 'browser', 'product shot': 'product', 'logo only': 'none'}.get(str(s.get('foreground', 'browser')).lower(), str(s.get('foreground', 'browser')).lower())
    s['aspect'] = s.get('aspect', '16:9'); s['_w'], s['_h'] = SIZES[s['aspect']]
    s['length'] = float(s.get('length', 30))
    a = str(s.get('accent', 'blue')).lower(); s['accent'] = ACCENTS.get(a, a if a.startswith('#') else '#1d9bf0')
    cap = s.get('captions', {'on': True, 'style': 'pop-in'})
    cap['style'] = {'bold pop-in': 'pop-in'}.get(str(cap.get('style', 'pop-in')).lower(), str(cap.get('style', 'pop-in')).lower()); s['captions'] = cap
    s.setdefault('cuts_on_beat', True); s.setdefault('scene_order', [1, 2, 3, 4]); s.setdefault('product', {})
    p = lambda v: (Path(base) / v).resolve() if v and not str(v).startswith(('http', 'data:', 'file:')) else v
    s['logo'] = p(s.get('logo')); s['screenshots'] = [p(x) for x in s.get('screenshots', [])]
    for sc in s.get('scenes', []):
        if sc.get('shot'): sc['shot'] = p(sc['shot'])
    bc = s.get('brand_colors', [])
    if bc == 'from_logo' or (isinstance(bc, dict) and bc.get('from_logo')):
        bc = PAL.brand_colors(str(s['logo'])) if s.get('logo') else []
    s['brand_colors'] = bc
    s['music'] = str(p(s['music'])) if s.get('music') else None
    for k in ('logo',): s[k] = Path(s[k]).as_uri() if s.get(k) and isinstance(s[k], Path) else s.get(k)
    s['screenshots'] = [x.as_uri() if isinstance(x, Path) else x for x in s['screenshots']]
    for sc in s.get('scenes', []):
        if isinstance(sc.get('shot'), Path): sc['shot'] = sc['shot'].as_uri()
    if s.get('logo_parts'): s['logo_parts'] = {k: p(v).as_uri() for k, v in s['logo_parts'].items()}
    s['_moments'] = derive_moments(s)
    for m in s['_moments']:
        for k in ('media', 'phone_media'):
            if m.get(k) and not str(m[k]).startswith(('file:', 'data:')): m[k] = str(p(m[k]))
    sc = s.get('scenes', [])
    g = lambda i, k: (sc[i].get(k) if len(sc) > i else None)
    s['tagline'] = s.get('tagline') or {'title': g(0, 'title') or (s['product'].get('name') or ''), 'sub': g(0, 'sub')}
    s['cta'] = s.get('cta') or {'title': g(3, 'title') or ('Try *' + s['product'].get('name', '') + '*' if s['product'].get('name') else 'Try it today'),
                                'sub': g(3, 'sub') or g(3, 'cta') or (s['product'].get('link') or '').replace('https://', '').replace('http://', '') or None}
    s['wordmark'] = s.get('wordmark') or ('' if s.get('logo_has_name') else s['product'].get('name', ''))
    s['theme'] = str(s['theme']).lower()
    s['_intro'] = s.get('intro', 'bounce')
    an = s.get('animations', DEFAULT_ANIMS)
    s['_anims'] = [a if isinstance(a, dict) else {'type': a} for a in an]
    return s

def derive_moments(s):
    """v2 moments. Explicit `moments` win; otherwise they are derived from v1 `scenes` 2-3 (+ bullets) so old specs still render."""
    fg = s['foreground']; dev0 = {'phone': 'phone', 'browser': 'laptop', 'laptop': 'laptop', 'product': 'phone', 'none': 'none'}.get(fg, 'phone')
    if s.get('moments'):
        out = [dict(m) for m in s['moments']]
        for m in out:
            m['device'] = str(m.get('device', dev0)).lower()
            md = m.get('media'); ph = m.pop('phone_src', None); lp = m.pop('laptop_src', None)
            if isinstance(md, dict): ph = ph or md.get('phone'); lp = lp or md.get('laptop'); md = None
            if m['device'] == 'phone': m['media'] = ph or md or m.get('phone_media')
            else: m['media'] = lp or md
            if m['device'] == 'both': m['phone_media'] = ph or m.get('phone_media')
        return out
    sc = s.get('scenes', []); order = [i - 1 for i in s['_order_tmp']] if s.get('_order_tmp') else [0, 1, 2, 3]
    mids = [sc[i] for i in order if 0 < i < 3 and i < len(sc)]
    shots = s['screenshots']
    cand = []
    for j, x in enumerate(mids):
        shot = x.get('shot') or (shots[j % len(shots)] if shots else None)
        cand.append({'title': x.get('title') or x.get('kicker') or '', 'sub': x.get('sub') or x.get('caption'), 'chips': (x.get('bullets') or [])[:3], 'media': shot})
    for j, x in enumerate(mids):
        for b in (x.get('bullets') or []):
            cand.append({'title': b, 'media': shots[(len(cand)) % len(shots)] if shots else None})
    n = max(2, min(8, int(round((s['length'] - 9) / 3.5))))
    cand = cand[:n] or [{'title': s['product'].get('name', '')}]
    portrait = [x for x in shots if media_aspect(x) and media_aspect(x) < .8]
    seq = {'phone': ['phone'], 'laptop': ['laptop', 'both'] if portrait else ['laptop'], 'none': ['none']}[dev0 if dev0 in ('phone', 'laptop') else 'none']
    for i, m in enumerate(cand):
        m['device'] = seq[i % len(seq)]
        if m['device'] == 'both': m['phone_media'] = portrait[i % len(portrait)]
    return cand

SCREEN_ASPECT = {'phone': 390 / 844, 'laptop': 1160 / 716}
def media_aspect(v):
    """width/height of an image or video file (None if unreadable)."""
    if not v: return None
    path = v[7:] if str(v).startswith('file://') else str(v)
    try:
        if path.lower().endswith(VIDEO_EXT):
            o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip().split(',')
            return int(o[0]) / int(o[1])
        from PIL import Image
        with Image.open(path) as im: return im.width / im.height
    except Exception: return None

def check_fit(s):
    """Engine rule: every device shows media in its own format. A landscape desktop capture on a portrait phone
    (or the reverse) is an error, never a silent crop. Mismatch tolerance 10%."""
    errs = []
    for i, m in enumerate(s['_moments']):
        need = {'phone': [('phone', m.get('media'))], 'laptop': [('laptop', m.get('media'))], 'both': [('laptop', m.get('media')), ('phone', m.get('phone_media'))]}.get(m['device'], [])
        for dev, v in need:
            if not v:
                if dev == 'phone': errs.append(f'moment {i + 1}: the phone has no mobile media. Capture the product at mobile size (390x844 portrait, e.g. headless Chromium @3x) or ask the owner for phone screenshots; desktop captures are not used on phones.')
                continue
            a = media_aspect(v)
            if a and abs(a / SCREEN_ASPECT[dev] - 1) > .10:
                kind = 'landscape' if a > 1 else 'portrait'
                errs.append(f'moment {i + 1}: {dev} media {Path(str(v)).name} is {kind} ({a:.2f}) but the {dev} screen is {SCREEN_ASPECT[dev]:.2f}; mismatch > 10%. '
                            + ('Capture a mobile view (390x844) for the phone.' if dev == 'phone' else 'Use a desktop capture (16:10, e.g. 1280x800) for the laptop.'))
    if errs: raise SystemExit('media does not fit the devices:\n  ' + '\n  '.join(errs))

def plan_v2(s, beats, bpm):
    """Timeline for the one-shot v2 film: intro (logo), N moments on downbeats, outro, final hit."""
    L, n = s['length'], len(s['_moments'])
    bar = 240 / bpm
    if s.get('_synth'):
        # music is written to the picture: intro 2 bars, each moment 2 bars (3-4 s), outro the rest
        # everything on the bar grid: intro 2 bars, each moment 2 bars (1.5 or 1 if the length can't fit), outro 3 bars
        beat = bar / 4; mb = next((b for b in (8, 6, 4) if ((12 if s.get('intro', 'bounce') == 'bounce' else 8) + n * b + 12) * beat <= L + 4.5), 4)
        ib = 12 if s.get('intro', 'bounce') == 'bounce' else 8
        intro = ib * beat; mlen = mb * beat
        bounds = [round(intro + i * mlen, 4) for i in range(n + 1)]
        L = s['length'] = round(bounds[-1] + 12 * beat, 4)
    else:
        intro = 5.4 if s.get('intro', 'bounce') == 'bounce' else 3.4; mlen = (L - intro - 6.0) / n
        bounds = [intro + i * mlen for i in range(n + 1)]
        if s['cuts_on_beat'] and beats:
            out = []
            for i, c in enumerate(bounds):
                bars = beats[::4]
                cand = [b for b in bars if abs(b - c) <= .55] or [b for b in beats if abs(b - c) <= .4]
                c2 = min(cand, key=lambda b: abs(b - c)) if cand else c
                out.append(round(max(c2, (out[-1] + 2.2) if out else 2.4), 4))
            bounds = out
    outro = bounds[-1]
    beat = bar / 4
    hit = outro + 7 * beat if s.get('_synth') else outro + 3.6
    if not s.get('_synth') and beats:
        cand = [b for b in beats if outro + 3.4 <= b <= outro + 4.2]
        if cand: hit = cand[0]
    hit = min(hit, L - 1.6)
    return {'intro': bounds[0], 'moments': [[bounds[i], bounds[i + 1]] for i in range(n)], 'outro': outro, 'hit': round(hit, 4), 'L': L, 'bar': bar}

def extract_media(s, work):
    """Video media is pre-decoded to frames so the render is frame-exact and deterministic."""
    P = s['_plan']
    for i, m in enumerate(s['_moments']):
        t0, t1 = P['moments'][i]
        for k, sk in (('media', 'media_start'), ('phone_media', 'phone_media_start')):
            v = m.get(k)
            if not v: m['_' + k] = None; continue
            path = v[7:] if v.startswith('file://') else v
            if path.lower().endswith(VIDEO_EXT):
                d = Path(work) / f'm{i}-{k}'; d.mkdir(parents=True, exist_ok=True)
                dur = (t1 - t0) + 1.2
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(float(m.get(sk) or 0)), '-i', path, '-t', str(dur), '-vf', f'fps={FPS}',
                                '-q:v', '2', str(d / '%04d.jpg')], check=True)
                nf = len(list(d.glob('*.jpg')))
                if not nf: raise SystemExit(f'no frames decoded from {path}')
                m['_' + k] = {'kind': 'video', 'dir': d.as_uri(), 'n': nf, 'fps': FPS}
            else:
                m['_' + k] = {'kind': 'image', 'src': Path(path).as_uri() if not v.startswith(('file:', 'data:')) else v}

def plan_cuts(s, beats):
    L, n = s['length'], 4; ideal = [L * i / n for i in range(n + 1)]
    cuts = [0.0]
    for i in range(1, n):
        c = ideal[i]
        if s['cuts_on_beat'] and beats:
            # prefer bar starts (every 4th beat), else any beat, within 35% of a scene
            win = L / n * .35; bars = beats[::4]
            cand = [b for b in bars if abs(b - c) <= win] or [b for b in beats if abs(b - c) <= win]
            if cand: c = min(cand, key=lambda b: abs(b - c))
        cuts.append(round(max(c, cuts[-1] + 1.5), 4))
    cuts.append(L); return cuts

def prepare(spec_path, work):
    spec = json.load(open(spec_path)); s = resolve(spec, Path(spec_path).parent)
    s['_order'] = [int(x) for x in s['scene_order']]
    if not spec.get('moments'): s['_order_tmp'] = s['_order']; s['_moments'] = derive_moments(s)
    for m in s['_moments']:
        for k in ('media', 'phone_media'):
            if m.get(k) and not str(m[k]).startswith(('file:', 'data:', '/')): m[k] = str((Path(spec_path).parent / m[k]).resolve())
    check_fit(s)
    n = len(s['_moments'])
    if not s['music']:
        # no song given: write an original beat to the picture (no credit line, nothing branded on the owner's video)
        s['_synth'] = True
        bpm = 128.0  # energetic, consistent: four-on-the-floor at 128
        P = plan_v2(s, [], bpm)
        s['music'] = str(Path(work) / 'beat.wav')
        subprocess.run([sys.executable, str(HERE / 'synth_beat.py'), '--length', str(s['length']), '--bpm', str(bpm), '--drop', str(P['intro']),
                        '--outro', str(P['outro']), '--hit', str(P['hit']), '--out', s['music']], check=True, capture_output=True)
        bt = B.fixed_grid(s['length'] + 1, bpm)
    else:
        bt = B.detect(s['music'], s['length'] + float(s.get('music_start', 0)))
    off = 0.0 if s.get('_synth') else float(s.get('music_start', 0))
    s['_beats'] = [round(b - off, 4) for b in bt['beats'] if b >= off]; s['_bpm'] = bt['bpm']; s['_beat_method'] = bt['method']
    s['_cuts'] = plan_cuts(s, s['_beats'])
    s['_plan'] = plan_v2(s, s['_beats'], float(bt['bpm']))
    extract_media(s, work)
    return s

async def with_page(s, fn):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        kw = {}
        if os.environ.get('PROMO_CHROME'): kw['executable_path'] = os.environ['PROMO_CHROME']
        try: b = await p.chromium.launch(args=['--allow-file-access-from-files'], **kw)
        except Exception:
            b = await p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'), args=['--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': s['_w'], 'height': s['_h']})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        # offline: the stage may only load local files; any network request is blocked (nothing phones home)
        await pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith(('file:', 'data:')) else r.abort())
        await pg.add_init_script('window.SPEC=' + json.dumps(s))
        await pg.goto((HERE / 'stage.html').as_uri()); await pg.wait_for_load_state('networkidle')
        await pg.evaluate('document.fonts.ready'); await pg.evaluate('ready()'); await pg.evaluate('fitAll()')
        r = await fn(pg)
        await b.close()
        if errs: raise RuntimeError('page errors: ' + '; '.join(errs))
        return r

async def stills(s, out):
    Path(out).mkdir(parents=True, exist_ok=True); rep = {}
    async def go(pg):
        P = s['_plan']
        shots = [('intro', P['intro'] * .78)] + [(f'moment{i + 1}', a + (b - a) * .72) for i, (a, b) in enumerate(P['moments'])] + [('outro', s['length'] - .4)]
        for i, (name, t) in enumerate(shots):
            await pg.evaluate(f'render({t:.4f})'); f = Path(out) / f'still-{i + 1:02d}-{name}.png'
            await pg.screenshot(path=str(f)); rep[f.name] = await pg.evaluate('qa()')
    await with_page(s, go); return rep

async def video(s, out):
    L = s['length']; N = int(round(L * FPS)); work = tempfile.mkdtemp()
    audio = os.path.join(work, 'a.m4a'); fo = .05 if s.get('_synth') else max(.8, min(2.0, L - s['_plan']['hit'] - .2))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(s.get('music_start', 0)), '-i', s['music'], '-t', str(L), '-af',
                    f'afade=t=in:d=0.02,afade=t=out:st={L - fo}:d={fo},loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', audio], check=True)
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', audio,
                           '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                           '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    async def go(pg):
        for i in range(N):
            await pg.evaluate(f'render({i / FPS:.5f})'); ff.stdin.write(await pg.screenshot(type='jpeg', quality=94))
            if i % 150 == 0: print(f'frame {i}/{N}', flush=True)
    await with_page(s, go); ff.stdin.close(); ff.wait()
    if ff.returncode: raise SystemExit('ffmpeg failed')

def main():
    a = argparse.ArgumentParser(); a.add_argument('spec'); a.add_argument('--stills'); a.add_argument('--video'); o = a.parse_args()
    work = tempfile.mkdtemp(); s = prepare(o.spec, work)
    print(json.dumps({'size': [s['_w'], s['_h']], 'bpm': s['_bpm'], 'beats': s['_beat_method'], 'plan': s['_plan'], 'moments': len(s['_moments']), 'animations': [a['type'] for a in s['_anims']], 'custom': s.get('custom'), 'brand_colors': s['brand_colors'], 'music_credit': s.get('music_credit')}))
    if o.stills:
        rep = asyncio.run(stills(s, o.stills)); bad = {k: v for k, v in rep.items() if v}
        json.dump(rep, open(Path(o.stills) / 'qa.json', 'w'), indent=1); print('QA:', 'clean' if not bad else json.dumps(bad))
        if s.get('_synth'): shutil.copy(s['music'], Path(o.stills) / 'music.wav')
    if o.video: asyncio.run(video(s, o.video)); print('video:', o.video)

if __name__ == '__main__': main()
