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
       'beat_pulse', 'scene_order', 'screenshots', 'music', 'music_start', 'music_credit', 'scenes', 'font'}
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

def resolve(spec, base):
    validate(spec)
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
    return s

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
    if not s['music']:
        s['music'] = str(Path(work) / 'beat.wav')
        subprocess.run([sys.executable, str(HERE / 'synth_beat.py'), '--length', str(s['length']), '--out', s['music']], check=True, capture_output=True)
        s['music_credit'] = 'Original beat synthesized by the .promo engine'
        s['_synth'] = True
    bt = B.fixed_grid(s['length'] + 1, 120.0) if s.get('_synth') else B.detect(s['music'], s['length'] + float(s.get('music_start', 0)))
    off = float(s.get('music_start', 0))
    s['_beats'] = [round(b - off, 4) for b in bt['beats'] if b >= off]; s['_bpm'] = bt['bpm']; s['_beat_method'] = bt['method']
    s['_order'] = [int(x) for x in s['scene_order']]; s['_cuts'] = plan_cuts(s, s['_beats'])
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
        await pg.evaluate('document.fonts.ready'); await pg.evaluate('fitAll()')
        r = await fn(pg)
        await b.close()
        if errs: raise RuntimeError('page errors: ' + '; '.join(errs))
        return r

async def stills(s, out):
    Path(out).mkdir(parents=True, exist_ok=True); rep = {}
    async def go(pg):
        for i in range(4):
            t0, t1 = s['_cuts'][i], s['_cuts'][i + 1]; t = t0 + (t1 - t0) * .72
            await pg.evaluate(f'render({t})'); f = Path(out) / f'still-{i + 1}-scene{s["_order"][i]}.png'
            await pg.screenshot(path=str(f)); rep[f.name] = await pg.evaluate('qa()')
    await with_page(s, go); return rep

async def video(s, out):
    L = s['length']; N = int(round(L * FPS)); work = tempfile.mkdtemp()
    audio = os.path.join(work, 'a.m4a'); fo = max(.8, min(2.0, L * .06))
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(s.get('music_start', 0)), '-i', s['music'], '-t', str(L), '-af',
                    f'afade=t=in:d=0.02,afade=t=out:st={L - fo}:d={fo},loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', audio], check=True)
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', audio,
                           '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                           '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    async def go(pg):
        for i in range(N):
            await pg.evaluate(f'render({i / FPS})'); ff.stdin.write(await pg.screenshot(type='jpeg', quality=95))
            if i % 150 == 0: print(f'frame {i}/{N}', flush=True)
    await with_page(s, go); ff.stdin.close(); ff.wait()
    if ff.returncode: raise SystemExit('ffmpeg failed')

def main():
    a = argparse.ArgumentParser(); a.add_argument('spec'); a.add_argument('--stills'); a.add_argument('--video'); o = a.parse_args()
    work = tempfile.mkdtemp(); s = prepare(o.spec, work)
    print(json.dumps({'size': [s['_w'], s['_h']], 'bpm': s['_bpm'], 'beats': s['_beat_method'], 'cuts': s['_cuts'], 'order': s['_order'], 'brand_colors': s['brand_colors'], 'music_credit': s.get('music_credit')}))
    if o.stills:
        rep = asyncio.run(stills(s, o.stills)); bad = {k: v for k, v in rep.items() if v}
        json.dump(rep, open(Path(o.stills) / 'qa.json', 'w'), indent=1); print('QA:', 'clean' if not bad else json.dumps(bad))
        if s.get('music'): shutil.copy(s['music'], Path(o.stills) / ('music' + Path(s['music']).suffix)) if 'beat.wav' in s['music'] else None
    if o.video: asyncio.run(video(s, o.video)); print('video:', o.video)

if __name__ == '__main__': main()
