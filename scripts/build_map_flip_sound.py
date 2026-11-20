"""The sound of a library wall map being turned over (web/sounds/map-flip.wav, played by js/library_maps.js with the 3D turn of js/map_flip.js).

Source: assets_src/sounds/map-flip-source.mp3 (3.7 s, both channels the same: 1.7 s of digital silence, then three rustles of paper in 1.2 s,
then a faint hiss). The recording is much shorter than the turn (3.65 s), so it is cut into its three rustles at the quiet dips between them and
each one is laid on the moment of the turn it belongs to (times in s from the click, see PATH / UNHOOK / REHOOK / RELEASE in js/map_flip.js):
  lift   (source 1.74-2.11): the hand takes the rod off the nail (UNHOOK .22), its loudest point at .20
  turn   (source 2.11-2.60, the loudest rustle): the sheet swings round, fastest around 1.05-1.38 s (edge-on at 1.05), its peak at 1.15
  rehang (source 2.60-2.95, the quiet end, +6 dB): the rod goes back on the nail (REHOOK 2.05) and the hands let go (RELEASE 2.3)
Steps: mono at 24 kHz; stationary noise reduction (noisereduce, the noise profile from the hiss after the rustles, 2.95-3.65 s: the leading
silence is digital zero and holds no noise); rumble filter below 45 Hz and a low pass at 11 kHz; the three pieces, each with a short fade in and
out, at their places on a silent track; one gain so the loudest point is at -3 dBFS.
Needs: pip install numpy scipy noisereduce; ffmpeg. Run: python scripts/build_map_flip_sound.py
"""
import subprocess, tempfile, pathlib
import numpy as np, scipy.io.wavfile as w, scipy.signal as s, noisereduce as nr

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets_src' / 'sounds' / 'map-flip-source.mp3'
OUT = ROOT / 'web' / 'sounds' / 'map-flip.wav'
SR = 24000
NOISE = (2.95, 3.65)
# source start s, source end s, place on the turn s, gain dB, fade in s, fade out s
PIECES = [(1.74, 2.11, .06, 0, .010, .060),
          (2.11, 2.60, .84, 0, .015, .120),
          (2.60, 2.95, 1.95, 6, .015, .080)]


def main():
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t) / 'src.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(SRC), '-ar', str(SR), str(tmp)], check=True)
        _, st = w.read(tmp)
    x = (st.astype(np.float32) / 32768)
    x = x.mean(axis=1) if x.ndim == 2 else x
    noise = x[int(NOISE[0] * SR):int(NOISE[1] * SR)]
    y = nr.reduce_noise(y=x, sr=SR, y_noise=noise, stationary=True, n_fft=1024, win_length=1024, hop_length=256, freq_mask_smooth_hz=300,
                        time_mask_smooth_ms=40, prop_decrease=.85, n_std_thresh_stationary=1.8)
    y = s.sosfiltfilt(s.butter(4, 45, 'high', fs=SR, output='sos'), y)
    y = s.sosfiltfilt(s.butter(4, 11000, 'low', fs=SR, output='sos'), y)
    end = max(at + (b - a) for a, b, at, *_ in PIECES)
    out = np.zeros(int(end * SR) + 1, np.float32)
    for a, b, at, db, fi, fo in PIECES:
        c = y[int(a * SR):int(b * SR)].copy() * 10 ** (db / 20)
        n = int(fi * SR); c[:n] *= np.sin(np.linspace(0, np.pi / 2, n)) ** 2
        n = int(fo * SR); c[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
        i = int(at * SR); out[i:i + len(c)] += c
    out *= 10 ** (-3 / 20) / abs(out).max()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    w.write(OUT, SR, (out * 32767).astype(np.int16))
    print(OUT.name, f'{len(out) / SR:.2f} s')


if __name__ == '__main__':
    main()
