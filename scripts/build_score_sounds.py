"""The two sounds of the final scoring show (web/js/endshow.js, played through web/js/step-sound.js `scoreSound`):

  web/sounds/score-ding.mp3   a card scores: a bell ding, cleaned from a downloaded recording (ding_02.mp3)
  web/sounds/score-wood.mp3   a card scores nothing: a short warm wooden pluck (a marimba-like note), synthesised here

Usage: python scripts/build_score_sounds.py path/to/ding_02.mp3   (needs ffmpeg on the PATH, numpy, scipy)

The ding: the right channel only (the recording's two channels are out of phase, a mono mix loses ~5 dB of the main note), hum below 60 Hz removed,
the background hiss removed by a spectral gate (per frame the noise floor is the median across ~880 Hz of bins; the bell's partials are narrow lines
far above it; the first 60 ms, the strike, are left as they are), the silence before the strike cut, a fade-out to the end (1.6 s).
Both are levelled against play-card.mp3 (its loudest 100 ms): the ding 4 dB under it, the wooden pluck 7 dB under it (the quieter "nothing" sound).
"""
import subprocess, sys, os
import numpy as np
from scipy.signal import stft, istft, butter, sosfiltfilt
from scipy.ndimage import median_filter, uniform_filter

SR = 44100
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SOUNDS = os.path.join(ROOT, 'web', 'sounds')


def load(path, channels=1):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(channels), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)
    return x if channels == 1 else x.reshape(-1, channels)


def loudness(x):
    """the RMS of the loudest 100 ms in dB (after a 100 Hz high-pass)"""
    y = sosfiltfilt(butter(2, 100, 'hp', fs=SR, output='sos'), x)
    return 20 * np.log10(np.sqrt(np.maximum(uniform_filter(y ** 2, int(.1 * SR)), 0)).max())


def denoise(x, a=2.5, floor=0.015, protect=0.06):
    f, t, Z = stft(x, SR, nperseg=2048, noverlap=1536)
    M = np.abs(Z)
    N = uniform_filter(median_filter(M, size=(41, 1)), size=(1, 9))
    G = uniform_filter(np.clip(1 - a * N / (M + 1e-12), floor, 1), size=(3, 3))
    G[:, t < protect] = 1
    return istft(Z * G, SR, nperseg=2048, noverlap=1536)[1][:len(x)]


def cut(x, pre=0.004, end_db=-62, fade=0.25):
    on = np.argmax(np.abs(x) > np.abs(x).max() * 0.02)
    s = max(0, on - int(pre * SR))
    env = np.sqrt(np.maximum(uniform_filter(x ** 2, int(.03 * SR)), 0))
    e = min(len(x), np.where(env > env.max() * 10 ** (end_db / 20))[0][-1] + int(.02 * SR))
    y = x[s:e].copy()
    fi = int(.002 * SR); y[:fi] *= np.linspace(0, 1, fi)
    fo = int(fade * SR); y[-fo:] *= np.linspace(1, 0, fo) ** 2
    return y


def wood():
    t = np.arange(int(.42 * SR)) / SR
    def note(f, length, level):
        env = np.where(t < .004, t / .004, np.exp(np.log(1e-4) * (t - .004) / length))
        return level * env * np.sin(2 * np.pi * f * t)
    y = note(784, .32, .42) + note(2166, .08, .12)
    fo = int(.03 * SR); y[-fo:] *= np.linspace(1, 0, fo)
    return y


def level(y, target):
    y = y * 10 ** ((target - loudness(y)) / 20)
    pk = np.abs(y).max()
    return y * (0.89 / pk) if pk > 0.89 else y


def save(y, name):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1',
                    os.path.join(SOUNDS, name)], input=y.astype(np.float32).tobytes(), check=True)


if __name__ == '__main__':
    ref = loudness(load(os.path.join(SOUNDS, 'play-card.mp3')))
    x = load(sys.argv[1], 2)[:, 1].copy()
    x = sosfiltfilt(butter(2, 60, 'hp', fs=SR, output='sos'), x - x.mean())
    save(level(cut(denoise(x)), ref - 4), 'score-ding.mp3')
    save(level(wood(), ref - 7), 'score-wood.mp3')
