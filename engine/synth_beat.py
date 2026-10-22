#!/usr/bin/env python3
"""Clean, original promo beat synthesized from code (no samples, no copyright).
Four-on-the-floor kick, claps, tight hats, sub bass and bright plucked chords; no pads,
no reverb wash, no noise layers. Usage: python3 synth_beat.py --length 30 --bpm 120 --out beat.wav"""
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
    if i >= len(buf): return
    n = min(len(x), len(buf) - i); buf[i:i + n] += g * x[:n]
def kick():
    t = np.arange(int(.32 * SR)) / SR; f = 48 + 110 * np.exp(-t * 32)
    return np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8))
def clap():
    t = np.arange(int(.22 * SR)) / SR; env = sum((t >= d) * np.exp(-np.maximum(t - d, 0) * k) for d, k in ((0, 80), (.01, 80), (.02, 20)))
    return hp(lp(rng.standard_normal(len(t)), 5000), 1100) * env * .35
def hat():
    t = np.arange(int(.04 * SR)) / SR; return hp(rng.standard_normal(len(t)), 8000) * np.exp(-t * 110) * .16
def pluck(m, d):
    t = np.arange(int(d * SR)) / SR
    return sum(np.sin(2 * np.pi * mtof(m) * k * t) / k ** 1.4 for k in range(1, 6)) * np.exp(-t * 5) * np.minimum(1, t / .004) * .09
def sub(m, d):
    t = np.arange(int(d * SR)) / SR; env = np.minimum(np.minimum(1, t / .01), np.clip((d - t) / .04, 0, 1))
    return np.sin(2 * np.pi * mtof(m) * t) * env * .45

def make(length, bpm):
    beat = 60 / bpm; bar = 4 * beat; buf = np.zeros(int((length + 1) * SR))
    prog = [(48, [60, 64, 67, 71]), (43, [59, 62, 67, 71]), (45, [60, 64, 69, 72]), (41, [60, 65, 69, 72])]  # Cmaj7 G Am F
    nb = int(np.ceil(length / bar)); end = length - 1.6
    for b in range(nb):
        t0 = b * bar; root, ch = prog[b % 4]; intro = b == 0
        for q in range(4):
            t = t0 + q * beat
            if t >= end: break
            if not intro or q >= 2: add(buf, kick(), t, .9)
            if q in (1, 3) and not intro: add(buf, clap(), t)
            for e in (0, .5): add(buf, hat(), t + e * beat, .6 if e == 0 else 1)
            if not intro: add(buf, sub(root - 12 + (12 if q == 3 else 0), beat * .9), t + (0 if q % 2 == 0 else beat * .5) * 0)
        for s, step in enumerate((0, 1.5, 3, 4.5, 6)):  # syncopated chord stabs in 8ths
            t = t0 + step * beat / 2
            if t < end:
                for m in ch: add(buf, pluck(m, beat * 1.2), t, .8 if s else 1)
    # ending: one clean hit + short tail
    add(buf, kick(), end); [add(buf, pluck(m, 1.6), end, 1.2) for m in [48, 60, 64, 67, 71]]; add(buf, sub(36, 1.2), end)
    buf = buf[:int(length * SR)]; buf = np.tanh(1.2 * buf); buf *= .89 / np.abs(buf).max()
    fade = int(.02 * SR); buf[-fade:] *= np.linspace(1, 0, fade)
    return buf

if __name__ == '__main__':
    a = argparse.ArgumentParser(); a.add_argument('--length', type=float, default=30); a.add_argument('--bpm', type=float, default=120); a.add_argument('--out', default='beat.wav')
    o = a.parse_args(); y = make(o.length, o.bpm)
    wavfile.write(o.out, SR, (np.stack([y, y], 1) * 32767).astype(np.int16)); print(o.out)
