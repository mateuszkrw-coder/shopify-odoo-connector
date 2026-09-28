"""Soundtrack for the showreel: 15 s, 120 BPM, D minor, synthesised from scratch.

Music: intro riser + pad (0-2 s), beat drops with step 1 at 2 s, four-on-the-floor
with off-beat bass, pluck arpeggio and a side-chained pad; big hit on the end card.
Sound design: every whoosh / pop / thud lands on the same timestamps as the
animation (see EV in scenes.js).
"""
import sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

dry = np.zeros((2, N))
send = np.zeros((2, N))      # reverb send
duck_bus = np.zeros((2, N))  # things that get side-chained by the kick


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def place(buf, sig, t0, gain=1.0, pan=0.0):
    """Mix a mono signal into a stereo bus with equal-power panning."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if i0 < 0:
        sig = sig[-i0:]
        i0 = 0
    sig = sig[: N - i0]
    a = (pan + 1) * np.pi / 4
    buf[0, i0:i0 + len(sig)] += sig * gain * np.cos(a)
    buf[1, i0:i0 + len(sig)] += sig * gain * np.sin(a)


def adsr(n, a=0.005, d=0.1, s=0.0, r=0.05, hold=None):
    t = tt(n)
    env = np.zeros(n)
    hold = hold if hold is not None else n / SR
    att = t < a
    env[att] = t[att] / a
    dec = (t >= a) & (t < hold)
    env[dec] = s + (1 - s) * np.exp(-(t[dec] - a) / max(d, 1e-4))
    rel = t >= hold
    lvl = s + (1 - s) * np.exp(-(hold - a) / max(d, 1e-4))
    env[rel] = lvl * np.exp(-(t[rel] - hold) / max(r, 1e-4))
    return env


def saw(f, n, detune=0.0, phase=0.0):
    """Band-limited saw by additive synthesis."""
    t = tt(n)
    ff = f * 2 ** (detune / 1200)
    k_max = int(min(40, (SR * 0.45) // ff))
    out = np.zeros(n)
    for k in range(1, k_max + 1):
        out += np.sin(2 * np.pi * k * ff * t + phase * k) / k
    return out * (2 / np.pi)


def svf_bandpass(x, fc, q=1.0):
    """TPT state-variable band-pass with per-sample cutoff array."""
    fc = np.broadcast_to(fc, x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    ic1 = ic2 = 0.0
    y = np.empty_like(x)
    for i in range(len(x)):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + g[i] * a1[i] * v3
        v2 = ic2 + g[i] * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        y[i] = v1
    return y * k


def lp(x, fc, order=2):
    sos = signal.butter(order, fc, 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, 'high', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], 'band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def high_shelf(x, f0=2500, gain_db=2.5, slope=0.8):
    """RBJ-cookbook high shelf, for a touch of presence on small speakers."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / 2 * np.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
    cw = np.cos(w0)
    b = [A * ((A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * alpha),
         -2 * A * ((A - 1) + (A + 1) * cw),
         A * ((A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * alpha)]
    a = [(A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * alpha,
         2 * ((A - 1) - (A + 1) * cw),
         (A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * alpha]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


# ---------------------------------------------------------------- instruments
def kick(gain=1.0):
    n = int(0.5 * SR)
    t = tt(n)
    f = 52 + 130 * np.exp(-t / 0.026)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * adsr(n, a=0.002, d=0.2)
    knock = np.sin(2 * ph) * adsr(n, a=0.002, d=0.045) * 0.45
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.4
    return np.tanh((body + knock + click) * 1.5) * gain


def clap():
    n = int(0.35 * SR)
    t = tt(n)
    noise = bp(rng.standard_normal(n), 900, 3200)
    env = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        m = t >= d
        env[m] += np.exp(-(t[m] - d) / 0.007)
    m = t >= 0.03
    env[m] += 0.9 * np.exp(-(t[m] - 0.03) / 0.11)
    return noise * env * 0.5


def hat(open_=False):
    n = int((0.25 if open_ else 0.08) * SR)
    t = tt(n)
    noise = hp(rng.standard_normal(n), 7500, order=4)
    return noise * np.exp(-t / (0.09 if open_ else 0.022))


def pluck(m, dur=0.5, bright=0.3):
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    x = np.sin(2 * np.pi * f * t) + bright * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05) \
        + 0.08 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.03)
    return x * adsr(n, a=0.003, d=0.16)


def bell(m, dur=1.2):
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    idx = 2.2 * np.exp(-t / 0.18)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    return x * adsr(n, a=0.002, d=0.45)


def pop(f, dur=0.12):
    n = int(dur * SR)
    t = tt(n)
    fr = f * (1 + 0.7 * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    return np.sin(ph) * adsr(n, a=0.001, d=0.045)


def whoosh(dur, f0, f1, q=1.4, shape=1.5, curve='swell'):
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    noise = rng.standard_normal(n)
    fc = f0 * (f1 / f0) ** x
    y = svf_bandpass(noise, fc, q)
    if curve == 'swell':
        env = np.sin(np.pi * x) ** shape
    elif curve == 'rise':
        env = x ** shape * (1 - np.exp(-(1 - x) * 60))
    else:  # 'fall'
        env = (1 - x) ** shape * (1 - np.exp(-x * 80))
    return y * env


def sub_drop(f0=90, f1=34, dur=0.9):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(1.4 * np.sin(ph)) * adsr(n, a=0.003, d=0.42)


def crash(dur=1.4):
    n = int(dur * SR)
    t = tt(n)
    noise = hp(rng.standard_normal(n), 3000)
    return noise * np.exp(-t / 0.35) * 0.6


def pad_voice(m, dur, cutoff=1400):
    n = int(dur * SR)
    x = np.zeros(n)
    for det, ph in ((-9, 0.0), (0, 1.3), (8, 2.6)):
        x += saw(midi(m), n, det, ph)
    x = lp(x / 3, cutoff)
    return x * adsr(n, a=0.35, d=10.0, s=1.0, r=0.35, hold=max(0.01, dur - 0.5))


def bass_note(m, dur=0.22):
    n = int(dur * SR)
    t = tt(n)
    env = adsr(n, a=0.004, d=0.12, s=0.35, r=0.03, hold=dur - 0.03)
    mid = lp(saw(midi(m + 12), n), 1100) * 0.9
    sub = np.sin(2 * np.pi * midi(m) * t) * 0.55
    return np.tanh(1.6 * (mid + sub)) * env


# ---------------------------------------------------------------- arrangement
BEAT = 0.5
# (start, chord voicing, bass root) — one chord per 2 s bar
CHORDS = [
    (0.0, [50, 53, 57, 60, 64], 38),    # Dm9
    (2.0, [50, 53, 57, 60, 64], 38),    # Dm9
    (4.0, [46, 50, 53, 57, 60], 34),    # Bbmaj9
    (6.0, [53, 57, 60, 64, 67], 41),    # Fmaj9 (F A C E G)
    (8.0, [48, 52, 55, 62, 64], 36),    # Cadd9
    (10.0, [50, 53, 57, 60, 64], 38),   # Dm9
    (12.0, [46, 50, 53, 57, 60], 34),   # Bbmaj9 (end card)
    (14.0, [48, 52, 57, 62], 36),       # C6/9 -> back to Dm on loop
]


def chord_at(t):
    cur = CHORDS[0]
    for c in CHORDS:
        if t >= c[0]:
            cur = c
    return cur


# pads (whole piece), louder once the beat is in
for i, (t0, notes, root) in enumerate(CHORDS):
    t1 = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
    dur = t1 - t0 + 0.45
    g = 0.075 if t0 < 2 else 0.085
    for j, m in enumerate(notes):
        place(duck_bus, pad_voice(m, dur, cutoff=1400 if t0 < 2 else 2200), t0, g, pan=(j - 2) * 0.28)
        place(send, pad_voice(m, dur), t0, g * 0.5, pan=(j - 2) * 0.28)

kick_times = []
# groove: 2.0 -> 12.0, a lighter pulse on the end card 13.0 -> 14.3
for b in range(int((12.0 - 2.0) / BEAT)):
    t0 = 2.0 + b * BEAT
    kick_times.append(t0)
    place(dry, kick(), t0, 0.62)
    if b % 2 == 1:
        place(dry, clap(), t0, 0.5, pan=0.05)
        place(send, clap(), t0, 0.18)
    place(dry, hat(open_=True), t0 + 0.25, 0.15, pan=0.25)
    for s16 in (0.125, 0.375):
        place(dry, hat(), t0 + s16, 0.08 + 0.03 * (b % 2), pan=-0.3)
    # off-beat bass
    _, _, root = chord_at(t0)
    place(duck_bus, bass_note(root), t0 + 0.25, 0.36)
for t0 in (13.0, 13.5, 14.0):
    kick_times.append(t0)
    place(dry, kick(), t0, 0.45)
    place(dry, hat(open_=True), t0 + 0.25, 0.07, pan=0.25)
    place(duck_bus, bass_note(34), t0 + 0.25, 0.3)

# pluck arpeggio in 8ths across the steps
for s in range(int((12.0 - 2.0) / 0.25)):
    t0 = 2.0 + s * 0.25
    _, notes, _ = chord_at(t0)
    pattern = [0, 2, 4, 3, 1, 3, 4, 2]
    m = notes[pattern[s % 8]] + 12
    g = 0.15 if (s % 2 == 0) else 0.11
    if t0 >= 10.0:
        g *= 1.2
    p = pluck(m, 0.45)
    place(duck_bus, p, t0, g, pan=0.35 if s % 2 else -0.35)
    place(send, p, t0, g * 0.6)

# fill into the Odoo wipe: 16th claps ramping up
for i in range(8):
    t0 = 9.5 + i * 0.0625
    place(dry, clap(), t0, 0.06 + 0.05 * i, pan=(-0.2 if i % 2 else 0.2))

# ---------------------------------------------------------------- sound design
def fx(sig, t0, g, pan=0.0, wet=0.35):
    place(dry, sig, t0, g, pan)
    place(send, sig, t0, g * wet, pan)


# intro: riser into the drop + title stings
fx(whoosh(1.95, 250, 7000, q=1.1, shape=2.2, curve='rise'), 0.05, 0.22, wet=0.5)
fx(pop(midi(74)), 0.0, 0.18)                                  # the dot
fx(whoosh(0.4, 600, 3500, q=1.6), 0.1, 0.28, pan=0.0)         # line stretches
for i, m in enumerate([62, 65, 69, 72]):                      # letters rise
    fx(pluck(m + 12, 0.6, 0.2), 0.28 + i * 0.09, 0.08, pan=-0.3 + 0.2 * i, wet=0.7)
fx(bell(81, 1.4), 0.95, 0.1, wet=0.9)                         # arrowhead lands
for i in range(10):                                           # subtitle "decode" chatter
    fx(pop(2400 + 600 * (i % 3), 0.03), 0.8 + i * 0.04, 0.035, pan=rng.uniform(-0.5, 0.5))
fx(whoosh(0.45, 2500, 500, q=1.2), 1.6, 0.3, pan=-0.4)        # title -> corner

# step 1: fetch
place(dry, sub_drop(80, 45, 0.6), 2.0, 0.25)                  # the drop
fx(crash(1.2), 2.0, 0.12, wet=0.6)
fx(pop(midi(62) * 2), 2.05, 0.22)                             # bag pops in
fx(pop(midi(69) * 2), 2.26, 0.14, pan=0.2)                    # badge
for i, m in enumerate([69, 72, 76]):                          # orders fly out
    fx(pluck(m + 12, 0.5, 0.35), 2.45 + i * 0.15, 0.13, pan=0.2 + 0.15 * i)
    fx(whoosh(0.35, 900, 3000, q=2.0), 2.45 + i * 0.15, 0.08, pan=0.3)
for i in range(12):                                           # typing the command
    place(dry, hp(rng.standard_normal(int(0.012 * SR)), 3000) * np.exp(-tt(int(0.012 * SR)) / 0.003),
          2.13 + i * 0.037 + rng.uniform(0, 0.01), 0.05 + rng.uniform(0, 0.03), pan=-0.5)
fx(bell(86, 0.6), 3.05, 0.05, wet=0.6)                        # "Shopify returned 3 order(s)"
fx(whoosh(0.4, 3000, 700, q=1.3), 3.55, 0.16, pan=0.3)        # bag out
fx(whoosh(0.5, 500, 2200, q=1.2), 3.66, 0.22, pan=-0.3)       # cards slide left

# step 2: never import twice
fx(whoosh(0.45, 1800, 600, q=1.4), 4.1, 0.18, pan=0.6)        # Odoo panel in
n = int(0.37 * SR)
zip_f = 700 * (2200 / 700) ** np.linspace(0, 1, n)
zip_sig = np.sin(2 * np.pi * np.cumsum(zip_f) / SR) * np.sin(np.pi * np.linspace(0, 1, n)) ** 2
fx(zip_sig, 4.55, 0.04, pan=0.4)                              # lookup line draws
place(dry, sub_drop(120, 55, 0.4), 5.0, 0.4)                 # STAMP
fx(lp(rng.standard_normal(int(0.12 * SR)), 1800) * np.exp(-tt(int(0.12 * SR)) / 0.03), 5.0, 0.5)
for i, m in enumerate([69, 65]):                              # "already imported" blip
    tone = sum(np.sin(2 * np.pi * midi(m) * k * tt(int(0.1 * SR))) / k for k in (1, 3, 5))
    fx(tone * adsr(int(0.1 * SR), a=0.003, d=0.05, s=0.4, r=0.02, hold=0.08), 5.02 + i * 0.1, 0.07, pan=0.1)
fx(whoosh(0.5, 1500, 250, q=1.0, curve='fall'), 5.2, 0.14, pan=-0.2)  # card drops out
for i, tc in enumerate([5.18, 5.28]):                         # checks
    fx(pluck(74 + 3 * i + 12, 0.4, 0.25), tc, 0.11, pan=0.25)
fx(whoosh(0.35, 1200, 400, q=1.3), 5.45, 0.12, pan=0.6)       # panel out
fx(whoosh(0.6, 400, 2600, q=1.1), 5.55, 0.2)                  # card expands

# step 3: find or create customer
fx(whoosh(0.4, 2500, 900, q=1.5), 6.12, 0.16, pan=0.5)        # lens swoops in
for i in range(4):                                            # scanning ticks
    fx(pop(1760, 0.04), 6.48 + i * 0.09, 0.05, pan=-0.1 + 0.08 * i, wet=0.6)
for i in range(2):                                            # "0 results"
    fx(pop(midi(57) * (1 - 0.1 * i), 0.1), 6.82 + i * 0.09, 0.16)
fx(pop(midi(74)), 7.02, 0.2)                                  # "+" button
fx(pop(midi(81), 0.1), 7.3, 0.2)                              # customer created
for i, m in enumerate([81, 84, 88, 91]):
    fx(bell(m, 0.8), 7.3 + i * 0.045, 0.045, pan=rng.uniform(-0.6, 0.6), wet=0.8)
fx(pop(midi(86)), 7.5, 0.12, pan=0.3)                         # NEW pill

# step 4: match SKUs
fx(whoosh(0.4, 600, 1800, q=1.3), 8.0, 0.14, pan=-0.3)        # card slides left
for td, m in ((8.5, 76), (9.0, 79)):
    fx(whoosh(0.34, 3500, 900, q=1.6), td - 0.34, 0.14, pan=0.7)
    place(dry, hp(rng.standard_normal(int(0.01 * SR)), 1500) * np.exp(-tt(int(0.01 * SR)) / 0.002), td, 0.35)
    fx(pop(1900, 0.03), td, 0.12)
    fx(bell(m, 0.9), td + 0.02, 0.08, pan=0.3, wet=0.7)       # click-lock + ding
fx(whoosh(0.4, 500, 1600, q=1.3), 9.55, 0.14, pan=0.3)        # card back to centre
fx(whoosh(0.5, 300, 5000, q=1.0, shape=2.5, curve='rise'), 9.5, 0.2)  # riser into the wipe

# step 5: draft quotation
place(dry, sub_drop(95, 42, 0.9), 10.0, 0.38)                 # purple wipe
fx(crash(1.4), 10.0, 0.16, wet=0.7)
fx(whoosh(0.55, 350, 3200, q=1.1), 10.0, 0.22, pan=0.2)
fx(whoosh(0.5, 2600, 800, q=1.6), 10.05, 0.13, pan=-0.2)      # card flip
for i in range(14):                                           # confetti sparkle
    m = [81, 84, 86, 88, 93][i % 5]
    fx(pop(midi(m), 0.05), 10.54 + i * 0.03 + rng.uniform(0, 0.02), 0.05, pan=rng.uniform(-0.8, 0.8), wet=0.7)
fx(pop(midi(74)), 10.62, 0.2)                                 # DRAFT badge
fx(whoosh(0.4, 1500, 700, q=1.5), 10.9, 0.07, pan=0.7)        # cursor glides in
place(dry, hp(rng.standard_normal(int(0.008 * SR)), 2000) * np.exp(-tt(int(0.008 * SR)) / 0.0015), 11.5, 0.3)
fx(pop(1250, 0.03), 11.5, 0.1)                                # hover pulse
fx(whoosh(0.45, 1800, 300, q=1.2, curve='fall'), 11.82, 0.18, pan=0.2)  # card drops away

# end card
place(dry, sub_drop(100, 40, 1.2), 12.0, 0.42)
fx(crash(1.8), 12.0, 0.2, wet=0.8)
fx(whoosh(0.6, 300, 4000, q=1.0), 11.95, 0.2, pan=-0.6)       # ink wipe from the corner
for i, m in enumerate([62, 65, 69, 72, 76]):                  # pipeline nodes pop, rising
    fx(pluck(m + 12, 0.7, 0.3), 12.58 + i * 0.13, 0.13, pan=-0.6 + 0.3 * i, wet=0.6)
for i in range(3):                                            # tags
    fx(pop(midi(81 + 3 * i), 0.06), 13.02 + i * 0.08, 0.07, pan=-0.3 + 0.3 * i)
fx(whoosh(0.46, 200, 6000, q=1.0, shape=3.0, curve='rise'), 14.35, 0.3)  # collapse "suck"
fx(pop(midi(74)), 14.81, 0.22, wet=0.9)                       # back to the dot
fx(bell(86, 1.0), 14.81, 0.06, wet=1.0)

# ---------------------------------------------------------------- mix + master
t_all = tt(N)
duck = np.ones(N)
for tk in kick_times:
    m = t_all >= tk
    duck[m] -= 0.55 * np.exp(-(t_all[m] - tk) / 0.11)
duck = np.clip(duck, 0.35, 1.0)
mix = dry + duck_bus * duck

# reverb: decorrelated decaying noise impulse response
ir_n = int(1.8 * SR)
ir_t = tt(ir_n)
ir = rng.standard_normal((2, ir_n)) * np.exp(-ir_t / 0.42)
ir = np.stack([lp(ch, 5500) for ch in ir])
ir[:, : int(0.012 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
wet = np.stack([signal.fftconvolve(send[c] + send[1 - c] * 0.3, ir[c])[:N] for c in range(2)])
mix = mix + wet * 0.5

mix = np.stack([hp(ch, 28) for ch in mix])
mix = np.stack([high_shelf(ch) for ch in mix])
mix = np.tanh(mix * 1.15) / 1.15                              # gentle glue
fade = np.ones(N)
fade[-int(0.05 * SR):] = np.linspace(1, 0, int(0.05 * SR))    # no click at the loop point
mix *= fade
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))                # peak -1 dBFS

out = sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav'
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out, 'peak', float(np.max(np.abs(mix))))
