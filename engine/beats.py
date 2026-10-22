#!/usr/bin/env python3
"""Beat detection for .promo. Uses a built-in numpy onset detector (ffmpeg decode -> spectral flux ->
autocorrelation tempo with sub-frame refinement -> phase-aligned beat grid), then librosa if installed,
then falls back to a fixed BPM grid. Usage: python3 beats.py song.mp3 [--length 30]"""
import json, subprocess, sys
import numpy as np

SR = 22050; HOP = 512

def decode(path, length=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', path] + (['-t', str(length + 2)] if length else []) + \
          ['-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)

def fixed_grid(length, bpm=120.0, start=0.0):
    return {'bpm': bpm, 'beats': [round(start + i * 60 / bpm, 4) for i in range(int(length * bpm / 60) + 2)], 'method': 'fixed'}

def numpy_beats(y, length):
    n = 2048; win = np.hanning(n)
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(y, (n // 2, n // 2)), n)[::HOP]
    mag = np.log1p(np.abs(np.fft.rfft(frames * win, axis=1)))
    flux = np.maximum(0, np.diff(mag, axis=0)).sum(1); flux = np.concatenate([[0], flux])
    flux -= np.convolve(flux, np.ones(16) / 16, 'same'); flux = np.maximum(flux, 0)
    if flux.max() <= 0: return None
    fps = SR / HOP
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lags = np.arange(len(ac)); bpms = 60 * fps / np.maximum(lags, 1)
    ok = (bpms >= 70) & (bpms <= 180)
    w = np.exp(-0.5 * (np.log2(bpms / 120) / 0.9) ** 2)  # mild preference near 120
    lag = lags[ok][np.argmax((ac * w)[ok])]
    a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]  # parabolic refinement of the peak
    frac = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
    # refine further with the 4x-period peak (sub-frame accuracy over a bar)
    L4 = int(round((lag + frac) * 4))
    if L4 + 2 < len(ac):
        k = L4 - 2 + int(np.argmax(ac[L4 - 2:L4 + 3])); a, b, c = ac[k - 1], ac[k], ac[k + 1]
        f4 = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
        lag_f = (k + f4) / 4
    else: lag_f = lag + frac
    period = lag_f / fps; bpm = 60 / period
    # phase: pick offset maximising onset energy on the grid
    best, phase = -1, 0.0
    for off in np.linspace(0, period, 48, endpoint=False):
        idx = (np.arange(off, len(flux) / fps, period) * fps).astype(int)
        sc = flux[idx[idx < len(flux)]].sum()
        if sc > best: best, phase = sc, off
    beats = [round(float(b), 4) for b in np.arange(phase, length + period, period)]
    return {'bpm': round(float(bpm), 2), 'beats': beats, 'method': 'numpy-flux'}

def detect(path, length, fallback_bpm=120.0):
    if not path: return fixed_grid(length, fallback_bpm)
    try:
        r = numpy_beats(decode(path, length), length)
        if r and len(r['beats']) > 4: return r
    except Exception as e:
        print('beat detection failed, using fixed BPM:', e, file=sys.stderr)
    try:
        import librosa  # optional
        y, sr = librosa.load(path, sr=SR, mono=True, duration=length + 2)
        tempo, fr = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP)
        bt = librosa.frames_to_time(fr, sr=sr, hop_length=HOP)
        if len(bt) > 4:
            return {'bpm': round(float(np.atleast_1d(tempo)[0]), 2), 'beats': [round(float(b), 4) for b in bt], 'method': 'librosa'}
    except Exception:
        pass
    return fixed_grid(length, fallback_bpm)

if __name__ == '__main__':
    L = float(sys.argv[sys.argv.index('--length') + 1]) if '--length' in sys.argv else 30
    r = detect(sys.argv[1], L); print(json.dumps({k: (v if k != 'beats' else v[:16]) for k, v in r.items()}))
