"""The drawer sounds of the bonus tile room (web/sounds/drawer-open.wav, drawer-close.wav), cut from one recording and cleaned.

Source: assets_src/sounds/drawer-open-close-source.mp3 (4.2 s: the opening, then the closing; a steady hiss and a low rumble in the background).
Steps: mix to mono at the source's own 24 kHz; stationary noise reduction (noisereduce, the noise profile taken from the pauses of the recording, "medium":
prop_decrease .8, 1.8 sigma); rumble filter below 45 Hz and a low pass at 11 kHz; cut; 6 ms fade in, fade out at the end; one gain so the closing thump peaks at -3 dBFS
(the opening keeps its relative level). The closing is cut short after the thump (the page leaves 120 ms + the ambience fade later) so the page change does not cut it off.
Needs: pip install numpy scipy noisereduce; ffmpeg. Run: python scripts/build_drawer_sounds.py
"""
import subprocess, tempfile, pathlib
import numpy as np, scipy.io.wavfile as w, scipy.signal as s, noisereduce as nr

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets_src' / 'sounds' / 'drawer-open-close-source.mp3'
OUT = ROOT / 'web' / 'sounds'
SR = 24000
CUT = {'open': (.42, 1.62, .150), 'close': (1.88, 3.30, .200)}      # start s, end s, fade-out s
PAUSES = [(0, .12), (1.5, 1.8), (3.6, 4.2)]                         # the stretches with nothing but the background noise


def main():
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t) / 'src.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(SRC), '-ar', str(SR), str(tmp)], check=True)
        _, st = w.read(tmp)
    x = (st.astype(np.float32) / 32768).mean(axis=1)
    noise = np.concatenate([x[int(a * SR):int(b * SR)] for a, b in PAUSES])
    y = nr.reduce_noise(y=x, sr=SR, y_noise=noise, stationary=True, n_fft=1024, win_length=1024, hop_length=256, freq_mask_smooth_hz=300,
                        time_mask_smooth_ms=40, prop_decrease=.8, n_std_thresh_stationary=1.8)
    y = s.sosfiltfilt(s.butter(4, 45, 'high', fs=SR, output='sos'), y)
    y = s.sosfiltfilt(s.butter(4, 11000, 'low', fs=SR, output='sos'), y)

    def clip(a, b, fade_out):
        c = y[int(a * SR):int(b * SR)].copy()
        fi = int(.006 * SR); c[:fi] *= np.linspace(0, 1, fi) ** 2
        fo = int(fade_out * SR); c[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
        return c
    clips = {k: clip(*v) for k, v in CUT.items()}
    gain = 10 ** (-3 / 20) / abs(clips['close']).max()
    OUT.mkdir(parents=True, exist_ok=True)
    for k, c in clips.items():
        w.write(OUT / f'drawer-{k}.wav', SR, (np.clip(c * gain, -1, 1) * 32767).astype(np.int16))
        print(k, round(len(c) / SR, 2), 's')


if __name__ == '__main__':
    main()
