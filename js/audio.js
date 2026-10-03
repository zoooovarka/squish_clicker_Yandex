/* Звуки.
   Файлы в sounds/ сгенерированы скриптом tools/make_sounds.py.
   Чтобы поставить свои — замени файлы с теми же именами (или поменяй пути ниже).
   Если файла нет — играет встроенный синтезированный звук,
   так что игра никогда не останется «немой». */
(function () {
  'use strict';

  // Несколько файлов в списке — на каждое нажатие выбирается случайный.
  const SOUND_FILES = {
    crit:   ['sounds/crit.mp3'],
    buy:    ['sounds/buy.mp3'],
    unlock: ['sounds/unlock.mp3'],
    bonus:  ['sounds/bonus.mp3'],
    click:  ['sounds/click.mp3'],
  };

  // «Чвяк» при нажатии — свой для каждой серии (id серии из js/squishes.js).
  const SERIES_FILES = {
    dumpling: ['sounds/dumpling1.mp3', 'sounds/dumpling2.mp3', 'sounds/dumpling3.mp3'],
    shake:    ['sounds/shake1.mp3', 'sounds/shake2.mp3', 'sounds/shake3.mp3'],
    capybara: ['sounds/capybara1.mp3', 'sounds/capybara2.mp3', 'sounds/capybara3.mp3'],
  };

  // Необязательно: свой звук для конкретного сквиша (id из js/squishes.js),
  // важнее звука серии. Пример: capybara_gold: ['sounds/capybara_gold.mp3'],
  const SQUISH_FILES = {
  };

  // Фоновая музыка (необязательно). Играет по кругу.
  const MUSIC_FILE = 'sounds/music.mp3';
  // Точная длина петли в секундах — MP3 добавляет тишину в начало и конец,
  // без этого на стыке слышна пауза. Для своей музыки поставь null.
  const MUSIC_LOOP_SECONDS = 40;

  const SFX_VOLUME = 0.9;
  const MUSIC_VOLUME = 0.3;

  let ctx = null, master = null, sfxGain = null, musicGain = null, noiseBuf = null;
  let musicStarted = false;
  let userMuted = false;
  const blockers = new Set(); // 'hidden', 'ad' — когда звук обязан молчать
  const raw = {};      // url -> Promise<ArrayBuffer|null>
  const decoded = {};  // url -> AudioBuffer|null

  function prefetch(url) {
    if (!(url in raw)) {
      raw[url] = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
    }
    return raw[url];
  }

  function allUrls() {
    const urls = [MUSIC_FILE];
    for (const k in SOUND_FILES) urls.push(...SOUND_FILES[k]);
    for (const k in SERIES_FILES) urls.push(...SERIES_FILES[k]);
    for (const k in SQUISH_FILES) urls.push(...SQUISH_FILES[k]);
    return urls;
  }

  function decodeAll() {
    for (const url of allUrls()) {
      if (url in decoded) continue;
      decoded[url] = null;
      prefetch(url).then((ab) => {
        if (!ab || !ctx) return;
        ctx.decodeAudioData(ab).then((buf) => {
          decoded[url] = url === MUSIC_FILE ? buf : trimSilence(buf);
          if (url === MUSIC_FILE) startMusic();
        }).catch(() => {});
      });
    }
  }

  // MP3 начинается с короткой тишины — срезаем её, чтобы звук отвечал на тап сразу.
  function firstSound(buf) {
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.0005) return i;
    return 0;
  }

  function trimSilence(buf) {
    const start = firstSound(buf);
    if (start < 32) return buf;
    const out = ctx.createBuffer(buf.numberOfChannels, buf.length - start, buf.sampleRate);
    for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(start));
    return out;
  }

  function applyVolume() {
    if (!master) return;
    const silent = userMuted || blockers.size > 0;
    master.gain.setTargetAtTime(silent ? 0 : 1, ctx.currentTime, 0.02);
    try {
      if (blockers.size > 0 && ctx.state === 'running') ctx.suspend();
      else if (blockers.size === 0 && ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* ignore */ }
  }

  // Вызывать из обработчика нажатия: браузеры разрешают звук только после жеста игрока.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      // мягкий ограничитель: много быстрых тапов подряд не будут хрипеть
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = SFX_VOLUME;
      sfxGain.connect(master);
      musicGain = ctx.createGain();
      musicGain.gain.value = MUSIC_VOLUME;
      musicGain.connect(master);
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolume();
      decodeAll();
    } else if (ctx.state === 'suspended' && blockers.size === 0) {
      ctx.resume().catch(() => {});
    }
  }

  function startMusic() {
    const buf = decoded[MUSIC_FILE];
    if (!ctx || !buf || musicStarted) return;
    musicStarted = true;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const start = firstSound(buf) / buf.sampleRate;
    if (MUSIC_LOOP_SECONDS && start + MUSIC_LOOP_SECONDS <= buf.duration) {
      src.loopStart = start;
      src.loopEnd = start + MUSIC_LOOP_SECONDS;
    }
    src.connect(musicGain);
    src.start(0, start);
  }

  function pickBuffer(name, squishId, series) {
    const lists = [];
    if (name === 'squish' && SQUISH_FILES[squishId]) lists.push(SQUISH_FILES[squishId]);
    if (name === 'squish' && SERIES_FILES[series]) lists.push(SERIES_FILES[series]);
    if (SOUND_FILES[name]) lists.push(SOUND_FILES[name]);
    for (const list of lists) {
      const ready = list.map((u) => decoded[u]).filter(Boolean);
      if (ready.length) return ready[Math.floor(Math.random() * ready.length)];
    }
    return null;
  }

  // ---------- Встроенные звуки (если своих файлов нет) ----------

  function tone(freq, start, dur, type, vol, freqEnd) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, start);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(sfxGain);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function squelch(start, pitch, vol) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400 * pitch, start);
    f.frequency.exponentialRampToValueAtTime(250, start + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    src.connect(f).connect(g).connect(sfxGain);
    src.start(start);
    src.stop(start + 0.15);
  }

  function synth(name, pitch) {
    const t = ctx.currentTime;
    switch (name) {
      case 'squish':
        tone(330 * pitch, t, 0.16, 'sine', 0.45, 110 * pitch);
        squelch(t, pitch, 0.18);
        break;
      case 'crit': // «чвяк» играет отдельно, здесь только звон
        tone(880, t + 0.02, 0.12, 'triangle', 0.18, 1320);
        tone(1320, t + 0.08, 0.14, 'triangle', 0.14, 1760);
        break;
      case 'buy':
        tone(660, t, 0.09, 'triangle', 0.25);
        tone(990, t + 0.07, 0.12, 'triangle', 0.25);
        break;
      case 'unlock':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.22, 'triangle', 0.25));
        break;
      case 'bonus':
        [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.06, 0.16, 'sine', 0.2));
        break;
      case 'click':
      default:
        tone(700, t, 0.05, 'sine', 0.15, 500);
    }
  }

  function play(name, opts) {
    if (!ctx || userMuted || blockers.size > 0) return;
    opts = opts || {};
    const pitch = (opts.pitch || 1) * (0.92 + Math.random() * 0.16);
    const buf = pickBuffer(name, opts.squishId, opts.series);
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (name === 'squish') src.playbackRate.value = pitch;
      src.connect(sfxGain);
      src.start();
    } else {
      synth(name, pitch);
    }
  }

  function setMuted(m) { userMuted = !!m; applyVolume(); }
  function block(reason, on) {
    if (on) blockers.add(reason); else blockers.delete(reason);
    applyVolume();
  }

  // Скачиваем файлы заранее, расшифруем после первого нажатия.
  function preload() { allUrls().forEach(prefetch); }

  window.Sound = { preload, unlock, play, setMuted, block, get muted() { return userMuted; } };
})();
