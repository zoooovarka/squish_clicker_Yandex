#!/usr/bin/env python3
"""Генератор звуков игры.

Все звуки синтезируются с нуля (никаких чужих сэмплов), поэтому их можно
свободно использовать в игре. Запуск из корня проекта:

    pip install numpy scipy
    python3 tools/make_sounds.py                  # все звуки
    python3 tools/make_sounds.py capybara1 crit    # только выбранные

Нужен ffmpeg с libmp3lame. Файлы появятся в папке sounds/.
Параметры звуков можно крутить прямо в этом файле и пересобирать.
"""
import os
import subprocess
import sys
import tempfile
import wave
import zlib

import numpy as np
from scipy import signal

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sounds')
rng = np.random.default_rng(20261003)


# ---------- Базовые кирпичики ----------

def times(dur):
    return np.arange(int(dur * SR)) / SR


def env(n, attack, decay):
    """Линейная атака + экспоненциальное затухание."""
    t = np.arange(n) / SR
    return np.where(t < attack, t / max(attack, 1e-6), np.exp(-(t - attack) / decay))


def chirp(f_start, f_end, dur, tau):
    """Синус, частота которого экспоненциально уходит от f_start к f_end."""
    t = times(dur)
    f = f_end + (f_start - f_end) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def svf_bandpass(x, fc, q):
    """Полосовой фильтр с меняющейся частотой (TPT state-variable filter)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    out = np.zeros_like(x)
    ic1 = ic2 = 0.0
    for i in range(len(x)):
        gi = g[i]
        a1 = 1.0 / (1.0 + gi * (gi + k))
        a2 = gi * a1
        a3 = gi * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v1
    return out


def lowpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'low', fs=SR, output='sos'), x, axis=0)


def highpass(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)


def norm(x, peak=1.0):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def place(buf, x, at, gain=1.0):
    i = int(at * SR)
    end = min(len(buf), i + len(x))
    buf[i:end] += x[:end - i] * gain


def fade_out(x, dur=0.01):
    n = min(len(x), int(dur * SR))
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n)[:, None] if x.ndim == 2 else np.linspace(1, 0, n)
    return x


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------- Инструменты ----------

def bell(freq, dur=0.7, decay=0.22, ratio=3.5, index=1.6):
    """Колокольчик (FM-синтез): хрустальный «дзынь»."""
    t = times(dur)
    mod = index * np.exp(-t / 0.06) * np.sin(2 * np.pi * freq * ratio * t)
    x = np.sin(2 * np.pi * freq * t + mod) + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
    return x * env(len(t), 0.002, decay)


def pluck(freq, dur=0.8, decay=0.32):
    """Калимба / маримба: мягкий щипок."""
    t = times(dur)
    x = np.sin(2 * np.pi * freq * t)
    x += 0.35 * np.sin(2 * np.pi * freq * 4.0 * t) * np.exp(-t / 0.04)
    x += 0.12 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / 0.02)
    return x * env(len(t), 0.003, decay)


def bubble(f0, dur=0.035, decay=0.009, rise=1.3):
    """Пузырёк: короткий синус, частота которого растёт (так лопаются пузырьки в слайме)."""
    t = times(dur)
    f = f0 * (1 + rise * t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)


def soft_kick(dur=0.35):
    return chirp(120, 45, dur, 0.03) * env(int(dur * SR), 0.002, 0.11)


def hat(dur=0.05):
    n = int(dur * SR)
    return highpass(rng.standard_normal(n), 7000) * env(n, 0.001, 0.012)


def snap(dur=0.15):
    n = int(dur * SR)
    noise = signal.sosfilt(signal.butter(2, [1200, 3500], 'band', fs=SR, output='sos'), rng.standard_normal(n))
    return noise * env(n, 0.001, 0.04) + 0.3 * chirp(260, 180, dur, 0.02) * env(n, 0.001, 0.03)


def reverb(x, mix=0.25, seed_shift=0):
    """Простая реверберация Шрёдера: 4 гребёнчатых + 2 фазовых фильтра."""
    combs = [1557, 1617, 1491, 1422]
    combs = [c + seed_shift for c in combs]
    wet = np.zeros_like(x)
    for d in combs:
        a = np.zeros(d + 1)
        a[0], a[d] = 1, -0.8
        wet += signal.lfilter([1], a, x)
    wet /= len(combs)
    for d, g in [(225, 0.5), (556, 0.5)]:
        b = np.zeros(d + 1)
        a = np.zeros(d + 1)
        b[0], b[d] = -g, 1
        a[0], a[d] = 1, -g
        wet = signal.lfilter(b, a, wet)
    wet = lowpass(wet, 6000)
    return x * (1 - mix) + wet * mix


# ---------- Звуки игры ----------

# ---------- «Чвяки» для серий сквишей ----------
# Настоящий сквиш звучит не «бупом», а фактурой: много крошечных липких щелчков
# и пузырьков поверх влажного шороха. Поэтому звук собирается из «зёрен».
# У каждого звука свой генератор случайных чисел — пересборка одного файла
# не меняет остальные.

def rng_for(name):
    return np.random.default_rng(zlib.crc32(name.encode()))


def grain(r, f, tau, noisiness):
    """Одно «зёрнышко»: затухающий резонанс + короткий шумовой щелчок."""
    n = int(max(tau * 7, 0.004) * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * f * t + r.uniform(0, 2 * np.pi)) * np.exp(-t / tau)
    click = highpass(r.standard_normal(n), min(f * 0.7, 9000)) * np.exp(-t / (tau * 0.5)) * 0.5
    return (1 - noisiness) * tone + noisiness * click


def grain_cloud(r, dur, count, f_lo, f_hi, tau_lo, tau_hi, start, spread, noisiness):
    """Облако зёрен: большинство тихие, несколько — громкие, как в настоящей липкой массе."""
    buf = np.zeros(int(dur * SR))
    for _ in range(count):
        at = start + r.gamma(1.6, spread)
        if at > dur - 0.03:
            continue
        f = np.exp(r.uniform(np.log(f_lo), np.log(f_hi)))
        place(buf, grain(r, f, r.uniform(tau_lo, tau_hi), noisiness), at, r.uniform(0.15, 1.0) ** 2)
    return norm(buf)


def wet_noise(r, dur, fc_from, fc_to, q, attack, decay, rough):
    """Влажный шорох: шум через «уезжающий» вниз фильтр + неровная громкость."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    fc = fc_to + (fc_from - fc_to) * np.exp(-t / 0.06)
    x = norm(svf_bandpass(r.standard_normal(n), fc, q))
    mod = lowpass(r.standard_normal(n), 35)
    mod = np.clip(1 + rough * mod / np.max(np.abs(mod)), 0, None)
    return x * env(n, attack, decay) * mod


def thud(f, tau, dur=0.2):
    """Мягкий «вес» нажатия. Гармоники — чтобы было слышно в телефоне."""
    t = times(dur)
    x = np.sin(2 * np.pi * f * t) + 0.6 * np.sin(4 * np.pi * f * t) + 0.3 * np.sin(6 * np.pi * f * t)
    return x * env(len(t), 0.003, tau)


def pui(dur=0.15):
    """Милое «пуи!» — голосок игрушки-капибары."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    k = t / dur
    f0 = (640 + 420 * k ** 0.7) * (1 + 0.015 * np.sin(2 * np.pi * 26 * t))
    phase = 2 * np.pi * np.cumsum(f0) / SR
    src = sum(np.sin(h * phase) / h for h in range(1, 9))
    f2 = 900 + 1500 * k ** 1.5  # «у» → «и»
    v = norm(svf_bandpass(src, 700, 3)) + 0.8 * norm(svf_bandpass(src, f2, 7))
    e = np.minimum(1, t / 0.012) * np.clip((dur - t) / 0.045, 0, 1)
    return lowpass(v * e, 6000)


def finish(x, lp, rms_db=-16.0):
    """Общая обработка: срез верхов, одинаковая громкость, мягкий ограничитель."""
    x = lowpass(x, lp, order=4)
    active = x[np.abs(x) > 1e-3 * np.max(np.abs(x))]
    x = x * (10 ** (rms_db / 20) / np.sqrt(np.mean(active ** 2)))
    x = 0.9 * np.tanh(x / 0.9)
    return fade_out(x, 0.04)


def dumpling_squish(name, variant):
    """Дамплинг: липкий гелевый «чвяк» с пузырьками."""
    r = rng_for(name)
    dur = 0.36
    buf = np.zeros(int(dur * SR))
    place(buf, wet_noise(r, 0.3, 1700 + 200 * variant, 450, 1.3, 0.012, 0.075, 0.6), 0, 0.5)
    place(buf, grain_cloud(r, 0.32, 40 + 8 * variant, 450, 2600, 0.0015, 0.006, 0.004, 0.028, 0.35), 0, 0.85)
    for _ in range(2 + variant):
        place(buf, bubble(r.uniform(550, 1200), decay=0.012), r.uniform(0.02, 0.2), r.uniform(0.12, 0.3))
    place(buf, thud(205 + 15 * variant, 0.03), 0, 0.3)
    return finish(buf, 5500)


def shake_squish(name, variant):
    """Шейк-слаш: хрусткие гелевые шарики и льдинки в пластиковом стаканчике."""
    r = rng_for(name)
    dur = 0.42
    buf = np.zeros(int(dur * SR))
    place(buf, grain_cloud(r, 0.4, 120 + 20 * variant, 1200, 4800, 0.0007, 0.0022, 0.01, 0.055, 0.6), 0, 0.8)
    place(buf, wet_noise(r, 0.36, 3200, 1400, 0.9, 0.02, 0.1, 0.8), 0, 0.4)
    cup = np.zeros(int(0.1 * SR))
    tc = np.arange(len(cup)) / SR
    for f, tau, g in [(940 + 40 * variant, 0.012, 1.0), (2450, 0.006, 0.5), (4100, 0.004, 0.3)]:
        cup += g * np.sin(2 * np.pi * f * tc) * np.exp(-tc / tau)
    place(buf, norm(cup), 0, 0.22)
    for _ in range(1 + variant % 2):
        place(buf, bubble(r.uniform(900, 1600), decay=0.008), r.uniform(0.05, 0.25), 0.12)
    return finish(buf, 7000)


def capybara_squish(name, variant):
    """Капибара: глубже и мягче, третий вариант — с «пуи!»."""
    r = rng_for(name)
    dur = 0.42
    buf = np.zeros(int(dur * SR))
    place(buf, wet_noise(r, 0.38, 1100 + 100 * variant, 320, 1.0, 0.025, 0.11, 0.5), 0, 0.6)
    place(buf, grain_cloud(r, 0.38, 20 + 4 * variant, 300, 1500, 0.003, 0.009, 0.01, 0.045, 0.25), 0, 0.7)
    place(buf, thud(160 + 10 * variant, 0.045), 0, 0.45)
    if variant == 2:
        place(buf, pui(), 0.07, 0.5)
    return finish(buf, 4500)


SERIES_SQUISH = {'dumpling': dumpling_squish, 'shake': shake_squish, 'capybara': capybara_squish}


def make_crit():
    """Супер-тап: хрустальные колокольчики. «Чвяк» нужной серии игра играет поверх."""
    r = rng_for('crit')
    buf = np.zeros(int(0.9 * SR))
    for i, note in enumerate([88, 91, 96]):  # E6 G6 C7
        place(buf, bell(midi(note), dur=0.55, decay=0.18), i * 0.055, 0.35)
    for _ in range(5):
        place(buf, bell(r.uniform(3000, 4500), dur=0.2, decay=0.04, index=0.4), r.uniform(0.1, 0.35), 0.05)
    return fade_out(reverb(buf, 0.18), 0.05)


def make_buy():
    buf = np.zeros(int(0.6 * SR))
    pop = chirp(450, 1100, 0.07, 0.02) * env(int(0.07 * SR), 0.002, 0.018)
    place(buf, pop, 0, 0.7)
    place(buf, bell(midi(83), dur=0.4, decay=0.08, index=1.0), 0.03, 0.45)   # B5
    place(buf, bell(midi(88), dur=0.5, decay=0.16, index=1.0), 0.10, 0.5)    # E6
    return fade_out(reverb(buf, 0.15), 0.05)


def make_unlock():
    buf = np.zeros(int(1.9 * SR))
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    whoosh = norm(svf_bandpass(rng.standard_normal(n), 400 + 5000 * (t / t[-1]) ** 2, 2.0))
    place(buf, whoosh * np.sin(np.pi * t / t[-1]) ** 2, 0, 0.25)
    for i, note in enumerate([72, 76, 79, 84, 88]):  # C5 E5 G5 C6 E6
        place(buf, pluck(midi(note), dur=0.9, decay=0.3), 0.18 + i * 0.075, 0.45)
        place(buf, bell(midi(note + 12), dur=0.6, decay=0.15, index=1.2), 0.18 + i * 0.075, 0.12)
    for note in [72, 76, 79, 84]:  # итоговый аккорд
        place(buf, bell(midi(note), dur=1.3, decay=0.45, index=0.8), 0.6, 0.18)
    for _ in range(14):  # блёстки
        place(buf, bell(rng.uniform(2500, 4200), dur=0.25, decay=0.05, index=0.5),
              rng.uniform(0.55, 1.3), rng.uniform(0.03, 0.08))
    return fade_out(reverb(buf, 0.25), 0.15)


def make_bonus():
    buf = np.zeros(int(1.1 * SR))
    for i, note in enumerate([84, 86, 88, 91, 93, 96, 98, 100]):  # пентатоника вверх
        place(buf, bell(midi(note), dur=0.45, decay=0.12, index=1.1), i * 0.042, 0.28)
    for _ in range(10):
        place(buf, bell(rng.uniform(3000, 5000), dur=0.2, decay=0.04, index=0.4),
              rng.uniform(0.15, 0.6), rng.uniform(0.03, 0.07))
    return fade_out(reverb(buf, 0.28), 0.1)


def make_click():
    dur = 0.1
    n = int(dur * SR)
    x = chirp(750, 380, dur, 0.015) * env(n, 0.002, 0.022)
    x += 0.15 * highpass(rng.standard_normal(n), 3000) * env(n, 0.0005, 0.004)
    x = fade_out(lowpass(x, 6000), 0.02)
    # слишком короткий MP3 (пара кадров) браузеры не читают — добиваем тишиной
    return np.concatenate([x, np.zeros(int(0.15 * SR))])


# ---------- Фоновая музыка ----------

BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
EIGHTH = BEAT / 2

# Аккорды по тактам (по кругу 16 тактов): Fmaj7 Em7 Dm7 Cmaj7 Fmaj7 Em7 Dm7 G7
CHORDS = {
    'F': ([65, 69, 72, 76], 41),
    'Em': ([64, 67, 71, 74], 40),
    'Dm': ([62, 65, 69, 72], 38),
    'C': ([60, 64, 67, 71], 36),
    'G': ([62, 65, 67, 71], 43),
}
PROGRESSION = ['F', 'Em', 'Dm', 'C', 'F', 'Em', 'Dm', 'G'] * 2

# Мелодия: для каждого такта список (восьмая доля, нота MIDI, длина в восьмых)
MELODY = [
    [(0, 81, 2), (2, 84, 2), (4, 81, 1), (5, 79, 3)],
    [(0, 79, 2), (2, 83, 1), (3, 79, 1), (4, 76, 4)],
    [(0, 77, 2), (2, 81, 2), (4, 77, 1), (5, 76, 1), (6, 74, 2)],
    [(0, 76, 3), (3, 79, 1), (4, 72, 4)],
    [(0, 81, 1), (1, 84, 1), (2, 88, 2), (4, 86, 1), (5, 84, 3)],
    [(0, 83, 2), (2, 79, 2), (4, 83, 1), (5, 84, 1), (6, 83, 2)],
    [(0, 81, 2), (2, 77, 1), (3, 81, 1), (4, 86, 2), (6, 84, 2)],
    [(0, 83, 3), (3, 81, 1), (4, 79, 4)],
    [(2, 72, 1), (3, 77, 1), (4, 81, 2), (6, 84, 2)],
    [(0, 83, 4), (4, 79, 2), (6, 76, 2)],
    [(2, 74, 1), (3, 77, 1), (4, 81, 2), (6, 86, 2)],
    [(0, 84, 4), (4, 79, 4)],
    [(0, 88, 2), (2, 86, 1), (3, 84, 1), (4, 81, 2), (6, 84, 2)],
    [(0, 83, 2), (2, 84, 1), (3, 83, 1), (4, 79, 4)],
    [(0, 77, 1), (1, 81, 1), (2, 84, 2), (4, 83, 1), (5, 81, 1), (6, 79, 2)],
    [(0, 79, 2), (2, 74, 2), (4, 79, 4)],
]
ARP = [0, 1, 2, 3, 1, 2, 3, 2]


def bass(freq, dur):
    t = times(dur)
    x = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(4 * np.pi * freq * t) + 0.25 * np.sin(6 * np.pi * freq * t)
    e = np.minimum(1, t / 0.01) * np.exp(-t / 0.9)
    return lowpass(x * e, 900)


def make_music():
    bars = len(PROGRESSION)
    loop_n = int(round(bars * BAR * SR))
    tail = int(4 * SR)
    left = np.zeros(loop_n + tail)
    right = np.zeros(loop_n + tail)
    keys = np.zeros(loop_n + tail)
    lead = np.zeros(loop_n + tail)
    drums = np.zeros(loop_n + tail)
    low = np.zeros(loop_n + tail)

    for b, name in enumerate(PROGRESSION):
        notes, root = CHORDS[name]
        bar_t = b * BAR
        # калимба-арпеджио восьмыми
        for i, idx in enumerate(ARP):
            place(keys, pluck(midi(notes[idx]), dur=0.9, decay=0.35), bar_t + i * EIGHTH, 0.22 if i % 2 else 0.28)
        # бас: 1-я доля и «и» второй
        place(low, bass(midi(root), BEAT * 1.4), bar_t, 0.38)
        place(low, bass(midi(root), BEAT * 1.0), bar_t + 2.5 * BEAT, 0.27)
        # мелодия
        for slot, note, length in MELODY[b]:
            d = length * EIGHTH
            place(lead, bell(midi(note), dur=d + 0.6, decay=0.18 + 0.08 * length, index=1.2), bar_t + slot * EIGHTH, 0.3)
        # ударные
        place(drums, soft_kick(), bar_t, 0.4)
        place(drums, soft_kick(), bar_t + 2 * BEAT, 0.32)
        place(drums, snap(), bar_t + BEAT, 0.1)
        place(drums, snap(), bar_t + 3 * BEAT, 0.1)
        for i in range(8):
            place(drums, hat(), bar_t + i * EIGHTH, 0.04 if i % 2 else 0.025)

    keys_l, keys_r = reverb(keys, 0.3), reverb(keys, 0.3, seed_shift=23)
    lead_l, lead_r = reverb(lead, 0.35, seed_shift=11), reverb(lead, 0.35, seed_shift=37)
    left += 0.75 * keys_l + 0.55 * lead_l + low + drums
    right += 0.55 * keys_r + 0.75 * lead_r + low + drums

    # хвост реверберации переносим в начало — так петля звучит без шва
    for ch in (left, right):
        ch[:tail] += ch[loop_n:loop_n + tail]
    stereo = np.stack([left[:loop_n], right[:loop_n]], axis=1)
    stereo = np.tanh(1.1 * norm(stereo, 0.95)) / np.tanh(1.1)
    return stereo * 0.9


# ---------- Сохранение ----------

def write_mp3(name, x, bitrate):
    x = np.asarray(x, dtype=float)
    assert np.all(np.isfinite(x)), name
    channels = 1 if x.ndim == 1 else x.shape[1]
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        wav_path = f.name
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-codec:a', 'libmp3lame',
                    '-b:a', bitrate, out], check=True)
    os.remove(wav_path)
    print(f'{out}: {len(x) / SR:.2f} s')


def sounds():
    """Имя файла -> (функция, громкость или None, если громкость задана внутри, битрейт)."""
    table = {}
    for series, make in SERIES_SQUISH.items():
        for v in range(3):
            table[f'{series}{v + 1}'] = (lambda make=make, n=f'{series}{v + 1}', v=v: make(n, v), None, '96k')
    table.update({
        'crit': (make_crit, 0.8, '96k'),
        'buy': (make_buy, 0.6, '96k'),
        'unlock': (make_unlock, 0.7, '96k'),
        'bonus': (make_bonus, 0.65, '96k'),
        'click': (make_click, 0.45, '96k'),
        'music': (make_music, None, '128k'),
    })
    return table


def main():
    os.makedirs(OUT, exist_ok=True)
    table = sounds()
    names = sys.argv[1:] or list(table)
    for name in names:
        if name not in table:
            sys.exit(f'Нет такого звука: {name}. Есть: {", ".join(table)}')
        make, level, bitrate = table[name]
        x = make()
        write_mp3(name, norm(x, level) if level else x, bitrate)


if __name__ == '__main__':
    main()
