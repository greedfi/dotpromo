#!/usr/bin/env python3
"""Clean, original promo beat synthesized from code (no samples, no copyright).
Modern house/pop at 128 BPM: layered kick on every beat, real-style clap on 2 and 4, off-beat open hats,
warm saw+sub bass side-chained to the kick, bright major-key supersaw chord stabs (C-F-G-F). Arranged to the video: a filtered intro that drops on
--drop, a one-beat stop before --outro, and a final clean hit on --hit that rings out.
No pads, no reverb wash, no noise risers, no pitch effects.
Usage: python3 synth_beat.py --length 30 --bpm 128 --drop 3.5 --outro 24.5 --hit 26.5 --out beat.wav"""
import argparse
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
rng = np.random.default_rng(3)
def hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(2, f, 'low', fs=SR, output='sos'), x)
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def add(buf, x, t, g=1.0):
    i = int(t * SR)
    if i >= len(buf) or i < 0: return
    n = min(len(x), len(buf) - i); buf[i:i + n] += g * x[:n]
def kick():
    t = np.arange(int(.36 * SR)) / SR; f = 46 + 140 * np.exp(-t * 38)
    body = np.tanh(2.4 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5))
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 600) * .35
    return body + click
def clap():
    t = np.arange(int(.2 * SR)) / SR; env = sum((t >= d) * np.exp(-np.maximum(t - d, 0) * k) for d, k in ((0, 90), (.008, 90), (.016, 26)))
    return hp(lp(rng.standard_normal(len(t)), 6000), 1200) * env * .42
def hat(open_=False):
    t = np.arange(int((.09 if open_ else .035) * SR)) / SR
    return hp(rng.standard_normal(len(t)), 8500) * np.exp(-t * (40 if open_ else 120)) * .14
def pluck(m, d, decay=6):
    t = np.arange(int(d * SR)) / SR
    saw = sum(np.sin(2 * np.pi * mtof(m) * k * t) / k ** 1.25 for k in range(1, 8))
    return saw * np.exp(-t * decay) * np.minimum(1, t / .003) * .075
def sub(m, d, decay=0.0):
    t = np.arange(int(d * SR)) / SR; env = np.minimum(np.minimum(1, t / .006), np.clip((d - t) / .03, 0, 1)) * np.exp(-t * decay)
    return np.tanh(1.6 * np.sin(2 * np.pi * mtof(m) * t)) * env * .42

def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)
def kick2():
    t = np.arange(int(.42 * SR)) / SR
    f = 50 + 160 * np.exp(-t * 42)
    sub_ = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    punch = np.sin(2 * np.pi * np.cumsum(120 + 300 * np.exp(-t * 90)) / SR) * np.exp(-t * 45) * .5
    click = bp(rng.standard_normal(len(t)), 2500, 7000) * np.exp(-t * 400) * .25
    return np.tanh(1.6 * (sub_ + punch)) * .95 + click
def clap2():  # real-style clap: 4 noise bursts + short room tail, band-passed
    t = np.arange(int(.32 * SR)) / SR
    env = sum((t >= d) * np.exp(-np.maximum(t - d, 0) * 140) for d in (0, .009, .018, .027)) + (t >= .027) * np.exp(-np.maximum(t - .027, 0) * 16) * .55
    return bp(rng.standard_normal(len(t)), 900, 5200) * env * .5
def hat2(open_=False):
    t = np.arange(int((.16 if open_ else .05) * SR)) / SR
    return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * (22 if open_ else 90)) * (.12 if open_ else .1)
def saw(f, t, det=(-.12, 0, .12)):  # band-limited-ish detuned supersaw
    out = 0
    for d in det:
        ff = f * 2 ** (d / 12); k = np.arange(1, max(2, int(9000 / ff)))
        out = out + sum(np.sin(2 * np.pi * ff * kk * t + kk * d * 3) / kk for kk in k[:24])
    return out / len(det)
def stab(notes, d):
    t = np.arange(int(d * SR)) / SR
    x = sum(saw(mtof(m), t) for m in notes) / len(notes)
    env = np.minimum(1, t / .004) * np.exp(-t * 7)
    return lp(x * env, 5200) * .28
def bass2(m, d):
    t = np.arange(int(d * SR)) / SR
    x = lp(saw(mtof(m), t, (-.06, .06)), 520) * .9 + np.sin(2 * np.pi * mtof(m) * t) * .6
    env = np.minimum(1, t / .005) * np.clip((d - t) / .03, 0, 1)
    return x * env * .5
def sub(m, d, decay=0.0):
    t = np.arange(int(d * SR)) / SR; env = np.minimum(np.minimum(1, t / .006), np.clip((d - t) / .03, 0, 1)) * np.exp(-t * decay)
    return np.sin(2 * np.pi * mtof(m) * t) * env * .5

def make(length, bpm, drop=None, outro=None, hit=None):
    """Modern house/pop: layered kick on every beat, real-style clap on 2 & 4, off-beat open hats,
    warm saw+sub bass side-chained to the kick, bright MAJOR chord stabs (I-IV-V-IV). No square waves, no minor chords."""
    beat = 60 / bpm; bar = 4 * beat; n = int((length + 2) * SR)
    drums = np.zeros(n); bass = np.zeros(n); keys = np.zeros(n); duck = np.ones(n)
    drop = bar * 2 if drop is None else drop
    outro = length - 5.5 if outro is None else outro
    hit = min(length - 1.5, outro + 2 * bar) if hit is None else hit
    # C major: C  F  G  F  (all major triads + added 9ths for a bright pop colour)
    prog = [(36, [60, 64, 67, 74]), (41, [60, 65, 69, 72]), (43, [62, 67, 71, 74]), (41, [60, 65, 69, 72])]
    K, C = kick2(), clap2(); STABS = {}
    t = 0.0; k = 0
    while t < hit - 1e-6:
        q = k % 4; b = k // 4; root, ch = prog[b % 4]
        stop = outro - beat <= t < outro; pre = t < drop
        if not stop:
            add(drums, K, t, .75 if pre else 1.0)
            i = int(t * SR); m = min(n - i, int(beat * .8 * SR))
            if m > 0: duck[i:i + m] = np.minimum(duck[i:i + m], .15 + .85 * np.linspace(0, 1, m) ** .8)
            if q in (1, 3) and (not pre or t >= drop - 2 * beat): add(drums, C, t, .9)
            add(drums, hat2(not pre), t + beat / 2, 1.0)
            if not pre:
                add(drums, hat2(), t + beat / 4, .5); add(drums, hat2(), t + 3 * beat / 4, .5)
                add(bass, bass2(root, beat * .45), t + beat / 2, 1.0)        # off-beat pumping bass
            # chord stabs: house rhythm (1, 1&, 2&, 3&, 4) on each bar
        if q == 0 and not stop:
            key = tuple(ch)
            if key not in STABS: STABS[key] = stab(ch, beat * .9)
            for step in ((0, 1.5, 3, 5, 6.5) if not pre else (0, 3, 6)):
                ts = t + step * beat / 2
                if ts < (outro - beat if t < outro else hit): add(keys, STABS[key], ts, .9 if pre else 1.0)
        t += beat; k += 1
    for ti in (drop, outro):
        add(drums, K, ti, .4); add(bass, sub(36, beat * 1.2, 3), ti, .9)
    add(drums, K, hit, 1.1); add(drums, C, hit, .7); add(bass, sub(36, 1.6, 2.5), hit, .9)
    tt = np.arange(int(2.8 * SR)) / SR; fin = sum(saw(mtof(m_), tt) for m_ in [48, 60, 64, 67, 72, 76]) / 6
    add(keys, lp(fin * np.minimum(1, tt / .005) * np.exp(-tt * 1.6), 4800) * .32, hit)
    if drop > 0:
        i = int(drop * SR); keys[:i] = lp(keys[:i], 1400) * 1.5
    mix = drums + bass * duck + keys * (.45 + .55 * duck)
    buf = mix[:int(length * SR)]; buf = np.tanh(1.2 * buf); buf *= .9 / np.abs(buf).max()
    fade = int(.03 * SR); buf[-fade:] *= np.linspace(1, 0, fade)
    return buf

if __name__ == '__main__':
    a = argparse.ArgumentParser(); a.add_argument('--length', type=float, default=30); a.add_argument('--bpm', type=float, default=120)
    a.add_argument('--drop', type=float); a.add_argument('--outro', type=float); a.add_argument('--hit', type=float); a.add_argument('--out', default='beat.wav')
    o = a.parse_args(); y = make(o.length, o.bpm, o.drop, o.outro, o.hit)
    wavfile.write(o.out, SR, (np.stack([y, y], 1) * 32767).astype(np.int16)); print(o.out)
