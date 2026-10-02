/* Основная логика: нажатия, доход, улучшения, коллекция, сохранения. */
(function () {
  'use strict';

  const { t } = window.I18N;
  const SQUISHES = window.SQUISHES;

  // ---------- Баланс ----------
  const SAVE_KEY = 'squish-clicker-save-v1';
  const LOCAL_SAVE_MS = 5000;
  const CLOUD_SAVE_MS = 30000;
  const OFFLINE_CAP_SEC = 2 * 60 * 60; // офлайн-доход максимум за 2 часа
  const BOOST_SEC = 60;                // x2 за рекламу
  const CRIT_MULT = 5;                 // супер-тап
  const TAP_FROM_AUTO = 0.05;          // тап дополнительно даёт 5% от дохода в секунду
  const FULLSCREEN_GAP_MS = 3 * 60 * 1000;
  const STAR_MIN_MS = 40000, STAR_MAX_MS = 80000, STAR_LIFE_MS = 9000;

  // type: tap — к силе тапа, auto — доход в секунду, crit — шанс супер-тапа.
  const UPGRADES = [
    { id: 'power',   icon: '👆', type: 'tap',  amount: 1,    base: 20,     growth: 1.18 },
    { id: 'cat',     icon: '🐱', type: 'auto', amount: 1,    base: 60,     growth: 1.15 },
    { id: 'crit',    icon: '⚡', type: 'crit', amount: 0.02, base: 300,    growth: 1.6, max: 25 },
    { id: 'machine', icon: '⚙️', type: 'auto', amount: 12,   base: 1100,   growth: 1.15 },
    { id: 'glove',   icon: '🧤', type: 'tap',  amount: 10,   base: 1500,   growth: 1.2 },
    { id: 'factory', icon: '🏭', type: 'auto', amount: 80,   base: 12000,  growth: 1.15 },
    { id: 'rocket',  icon: '🚀', type: 'auto', amount: 500,  base: 150000, growth: 1.15 },
  ];

  let state = defaultState();
  let boostUntil = 0;
  let lastFullscreenAt = 0;
  let gameplayActive = false;
  const pauseReasons = new Set(['loading']);

  const $ = (id) => document.getElementById(id);
  const els = {};

  // ---------- Состояние ----------

  function defaultState() {
    return {
      coins: 0, totalEarned: 0, clicks: 0,
      upgrades: {}, unlocked: ['butter'], current: 'butter',
      muted: false, savedAt: Date.now(),
    };
  }

  function sanitize(raw) {
    const s = defaultState();
    if (!raw || typeof raw !== 'object') return s;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : (d || 0));
    s.coins = num(raw.coins);
    s.totalEarned = num(raw.totalEarned);
    s.clicks = Math.floor(num(raw.clicks));
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      for (const u of UPGRADES) {
        const lvl = Math.floor(num(raw.upgrades[u.id]));
        if (lvl) s.upgrades[u.id] = u.max ? Math.min(lvl, u.max) : lvl;
      }
    }
    if (Array.isArray(raw.unlocked)) {
      s.unlocked = SQUISHES.filter((q) => q.price === 0 || raw.unlocked.includes(q.id)).map((q) => q.id);
    }
    if (s.unlocked.includes(raw.current)) s.current = raw.current;
    s.muted = !!raw.muted;
    s.savedAt = num(raw.savedAt, Date.now());
    return s;
  }

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  function saveLocal() {
    state.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* приватный режим */ }
  }

  function saveCloud() {
    state.savedAt = Date.now();
    window.YSDK.saveData(state);
  }

  // Из двух сохранений берём то, где игрок продвинулся дальше.
  function pickBest(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((a.totalEarned || 0) !== (b.totalEarned || 0)) return (a.totalEarned || 0) > (b.totalEarned || 0) ? a : b;
    return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
  }

  // ---------- Формулы ----------

  const level = (id) => state.upgrades[id] || 0;
  const upgradeCost = (u) => Math.ceil(u.base * Math.pow(u.growth, level(u.id)));
  const isMaxed = (u) => !!u.max && level(u.id) >= u.max;
  const squishById = (id) => SQUISHES.find((q) => q.id === id) || SQUISHES[0];
  const boostActive = () => boostUntil > Date.now();

  function incomeMult() {
    let m = 1;
    for (const q of SQUISHES) if (state.unlocked.includes(q.id)) m += q.bonus;
    return m;
  }

  function sumOf(type) {
    let s = 0;
    for (const u of UPGRADES) if (u.type === type) s += u.amount * level(u.id);
    return s;
  }

  function perSecond(withBoost) {
    return sumOf('auto') * incomeMult() * (withBoost !== false && boostActive() ? 2 : 1);
  }

  function tapValue() {
    const base = 1 + sumOf('tap') + sumOf('auto') * TAP_FROM_AUTO;
    return base * incomeMult() * (boostActive() ? 2 : 1);
  }

  const critChance = () => Math.min(sumOf('crit'), 0.5);

  // ---------- Числа ----------

  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1000) return n < 10 && n % 1 ? String(Math.floor(n * 10) / 10) : String(Math.floor(n));
    let i = 0;
    while (n >= 1000 && i < SUFFIXES.length - 1) { n /= 1000; i++; }
    const v = n >= 100 ? Math.floor(n) : n >= 10 ? Math.floor(n * 10) / 10 : Math.floor(n * 100) / 100;
    return String(v) + SUFFIXES[i];
  }

  function addCoins(v) {
    state.coins += v;
    state.totalEarned += v;
  }

  // ---------- Пауза / геймплей ----------

  function setPaused(reason, on) {
    if (on) pauseReasons.add(reason); else pauseReasons.delete(reason);
    const active = pauseReasons.size === 0;
    if (active !== gameplayActive) {
      gameplayActive = active;
      window.YSDK.gameplay(active);
    }
  }

  function adHooks() {
    return {
      onOpen: () => { window.Sound.block('ad', true); setPaused('ad', true); },
      onClose: () => { window.Sound.block('ad', false); setPaused('ad', false); },
    };
  }

  function maybeFullscreenAd(force) {
    if (!window.YSDK.available) return;
    if (!force && Date.now() - lastFullscreenAt < FULLSCREEN_GAP_MS) return;
    lastFullscreenAt = Date.now();
    window.YSDK.showFullscreen(adHooks());
  }

  // ---------- Сквиш: нажатия ----------

  let squishAnim = null;
  let shadowAnim = null;
  const activePointers = new Set();
  const SQUASH = 'scale(1.16, 0.8)';

  function squeezeDown() {
    els.squish.classList.add('pressed');
    if (squishAnim) squishAnim.cancel();
    if (shadowAnim) shadowAnim.cancel();
    squishAnim = els.squish.animate([{ transform: 'scale(1, 1)' }, { transform: SQUASH }],
      { duration: 70, easing: 'ease-out', fill: 'forwards' });
    shadowAnim = els.shadow.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(1.2)' }],
      { duration: 70, easing: 'ease-out', fill: 'forwards' });
  }

  function squeezeUp() {
    els.squish.classList.remove('pressed');
    if (squishAnim) squishAnim.cancel();
    if (shadowAnim) shadowAnim.cancel();
    squishAnim = els.squish.animate([
      { transform: SQUASH },
      { transform: 'scale(0.9, 1.12)', offset: 0.3 },
      { transform: 'scale(1.05, 0.96)', offset: 0.55 },
      { transform: 'scale(0.98, 1.02)', offset: 0.8 },
      { transform: 'scale(1, 1)' },
    ], { duration: 520, easing: 'ease-out' });
    shadowAnim = els.shadow.animate([{ transform: 'scaleX(1.2)' }, { transform: 'scaleX(1)' }],
      { duration: 400, easing: 'ease-out' });
  }

  function tap(clientX, clientY) {
    window.Sound.unlock();
    const q = squishById(state.current);
    const crit = Math.random() < critChance();
    const v = tapValue() * (crit ? CRIT_MULT : 1);
    addCoins(v);
    state.clicks++;
    const r = els.stage.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    spawnFloat(x, y, (crit ? t('crit') + ' ' : '') + '+' + fmt(v), crit ? 'crit' : '');
    spawnParticles(x, y, q.color, crit ? 14 : 6);
    window.Sound.play(crit ? 'crit' : 'squish', { squishId: q.id, pitch: q.pitch });
    updateHud();
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    activePointers.add(e.pointerId);
    squeezeDown();
    tap(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!activePointers.delete(e.pointerId)) return;
    if (activePointers.size === 0) squeezeUp();
  }

  // ---------- Эффекты ----------

  function trimLayer(layer, max) {
    while (layer.childElementCount > max) layer.firstElementChild.remove();
  }

  function spawnFloat(x, y, text, cls) {
    const el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    el.style.left = x + (Math.random() * 30 - 15) + 'px';
    el.style.top = y + 'px';
    el.addEventListener('animationend', () => el.remove());
    els.fx.appendChild(el);
    trimLayer(els.fx, 80);
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 60;
      const s = 6 + Math.random() * 9;
      p.className = 'particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.width = p.style.height = s + 'px';
      p.style.background = color;
      p.style.setProperty('--dx', Math.cos(a) * d + 'px');
      p.style.setProperty('--dy', Math.sin(a) * d + 'px');
      p.addEventListener('animationend', () => p.remove());
      els.fx.appendChild(p);
    }
    trimLayer(els.fx, 80);
  }

  function confetti() {
    const colors = ['#ff6fa5', '#8b6cff', '#4fd1a8', '#ffb627', '#5cc4ff', '#ff8a5c'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.animationDuration = 1.6 + Math.random() * 1.2 + 's';
      c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      c.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
      c.addEventListener('animationend', () => c.remove());
      els.confetti.appendChild(c);
    }
  }

  // ---------- Звёздочка-бонус ----------

  function scheduleStar() {
    setTimeout(spawnStar, STAR_MIN_MS + Math.random() * (STAR_MAX_MS - STAR_MIN_MS));
  }

  function spawnStar() {
    if (document.hidden || pauseReasons.size) { scheduleStar(); return; }
    const r = els.stage.getBoundingClientRect();
    const star = document.createElement('button');
    star.className = 'star-bonus';
    star.type = 'button';
    star.setAttribute('aria-label', t('star'));
    star.textContent = '⭐';
    star.style.left = 15 + Math.random() * 70 + '%';
    star.style.top = 15 + Math.random() * 55 + '%';
    let taken = false;
    star.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (taken) return;
      taken = true;
      window.Sound.unlock();
      const reward = Math.max(50, perSecond() * 30, tapValue() * 20);
      addCoins(reward);
      window.Sound.play('bonus');
      spawnFloat(e.clientX - r.left, e.clientY - r.top, '⭐ +' + fmt(reward), 'crit');
      spawnParticles(e.clientX - r.left, e.clientY - r.top, '#ffd447', 16);
      star.remove();
      updateHud();
    });
    els.stage.appendChild(star);
    setTimeout(() => star.remove(), STAR_LIFE_MS);
    scheduleStar();
  }

  // ---------- Покупки ----------

  function buyUpgrade(u) {
    window.Sound.unlock();
    if (isMaxed(u)) return;
    const cost = upgradeCost(u);
    if (state.coins < cost) { window.Sound.play('click'); nope(upgradeRows[u.id].root); return; }
    state.coins -= cost;
    state.upgrades[u.id] = level(u.id) + 1;
    window.Sound.play('buy');
    renderUpgrades();
    updateHud();
    saveLocal();
  }

  function onSquishCard(q) {
    window.Sound.unlock();
    if (state.unlocked.includes(q.id)) {
      if (state.current !== q.id) {
        state.current = q.id;
        window.Sound.play('click');
        renderSquish(true);
        renderCollection();
        saveLocal();
      }
      return;
    }
    if (state.coins < q.price) { window.Sound.play('click'); nope(cardRefs[q.id].root); return; }
    state.coins -= q.price;
    state.unlocked.push(q.id);
    state.current = q.id;
    window.Sound.play('unlock');
    renderSquish(true);
    renderCollection();
    updateHud();
    saveLocal();
    saveCloud();
    confetti();
    showModal({
      title: t('unlockTitle'),
      body: `<div class="modal-squish">${window.squishSVG(q)}</div>
             <div class="modal-name">${t('squish.' + q.id)}</div>
             <div class="modal-sub">${t('bonus', { p: Math.round(q.bonus * 100) })}</div>`,
      button: t('hooray'),
      onClose: () => maybeFullscreenAd(false),
    });
  }

  function nope(el) {
    el.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
    ], { duration: 260 });
  }

  // ---------- Реклама за x2 ----------

  async function onBoost() {
    window.Sound.unlock();
    if (boostActive()) return;
    els.boostBtn.disabled = true;
    const ok = await window.YSDK.showRewarded(adHooks());
    els.boostBtn.disabled = false;
    if (ok) {
      boostUntil = Date.now() + BOOST_SEC * 1000;
      window.Sound.play('bonus');
      confetti();
    }
    updateHud();
  }

  // ---------- Окна ----------

  let modalOnClose = null;

  function showModal(opts) {
    els.modalTitle.textContent = opts.title;
    els.modalBody.innerHTML = opts.body;
    els.modalBtn.textContent = opts.button;
    modalOnClose = opts.onClose || null;
    els.modal.classList.remove('hidden');
    setPaused('modal', true);
  }

  function closeModal() {
    window.Sound.unlock();
    els.modal.classList.add('hidden');
    setPaused('modal', false);
    const cb = modalOnClose;
    modalOnClose = null;
    if (cb) cb();
  }

  // ---------- Отрисовка ----------

  const upgradeRows = {};
  const cardRefs = {};
  const hudCache = {};

  function setText(el, key, text) {
    if (hudCache[key] !== text) { hudCache[key] = text; el.textContent = text; }
  }

  function renderSquish(animate) {
    const q = squishById(state.current);
    els.squish.innerHTML = window.squishSVG(q);
    els.squishName.textContent = t('squish.' + q.id);
    if (animate) {
      if (squishAnim) squishAnim.cancel();
      squishAnim = els.squish.animate([
        { transform: 'scale(0.3)', opacity: 0 },
        { transform: 'scale(1.12, 0.92)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)' },
      ], { duration: 450, easing: 'ease-out' });
    }
  }

  function buildUpgrades() {
    els.upgrades.innerHTML = '';
    for (const u of UPGRADES) {
      const root = document.createElement('button');
      root.type = 'button';
      root.className = 'upg';
      root.innerHTML = `
        <span class="upg-icon">${u.icon}</span>
        <span class="upg-text"><span class="upg-name"></span><span class="upg-desc"></span></span>
        <span class="upg-side"><span class="upg-lvl"></span><span class="price"><i class="coin"></i><b></b></span></span>`;
      root.addEventListener('click', () => buyUpgrade(u));
      els.upgrades.appendChild(root);
      upgradeRows[u.id] = {
        root,
        name: root.querySelector('.upg-name'),
        desc: root.querySelector('.upg-desc'),
        lvl: root.querySelector('.upg-lvl'),
        price: root.querySelector('.price b'),
      };
    }
    renderUpgrades();
  }

  function upgradeDesc(u) {
    if (u.type === 'crit') return t('descCrit');
    const v = u.amount * incomeMult();
    return t(u.type === 'tap' ? 'descTap' : 'descAuto', { v: fmt(v) });
  }

  function renderUpgrades() {
    for (const u of UPGRADES) {
      const r = upgradeRows[u.id];
      r.name.textContent = t('upgrade.' + u.id);
      r.desc.textContent = upgradeDesc(u);
      r.lvl.textContent = t('level', { n: level(u.id) });
      r.price.textContent = isMaxed(u) ? t('max') : fmt(upgradeCost(u));
      r.root.classList.toggle('maxed', isMaxed(u));
    }
  }

  function buildCollection() {
    els.collection.innerHTML = '';
    for (const q of SQUISHES) {
      const root = document.createElement('button');
      root.type = 'button';
      root.className = 'card';
      root.innerHTML = `
        <span class="card-thumb">${window.squishSVG(q)}</span>
        <span class="card-name">${t('squish.' + q.id)}</span>
        <span class="card-bonus">${q.bonus ? t('bonus', { p: Math.round(q.bonus * 100) }) : t('firstSquish')}</span>
        <span class="card-action"></span>`;
      root.addEventListener('click', () => onSquishCard(q));
      els.collection.appendChild(root);
      cardRefs[q.id] = { root, action: root.querySelector('.card-action') };
    }
    renderCollection();
  }

  function renderCollection() {
    for (const q of SQUISHES) {
      const r = cardRefs[q.id];
      const owned = state.unlocked.includes(q.id);
      const current = state.current === q.id;
      r.root.classList.toggle('locked', !owned);
      r.root.classList.toggle('current', current);
      r.action.innerHTML = owned
        ? (current ? t('selected') : t('select'))
        : `<span class="price"><i class="coin"></i><b>${fmt(q.price)}</b></span>`;
    }
    renderUpgrades(); // описания улучшений зависят от множителя
  }

  function updateHud() {
    setText(els.coins, 'coins', fmt(state.coins));
    setText(els.perTap, 'tap', t('perTap', { v: fmt(tapValue()) }));
    setText(els.perSec, 'sec', t('perSec', { v: fmt(perSecond()) }));
    const m = incomeMult() * (boostActive() ? 2 : 1);
    setText(els.multChip, 'mult', t('mult', { m: m < 1000 ? String(Math.round(m * 100) / 100) : fmt(m) }));
    els.multChip.classList.toggle('boosted', boostActive());

    if (boostActive()) {
      const s = Math.ceil((boostUntil - Date.now()) / 1000);
      setText(els.boostMain, 'boost', t('boostActive', { s }));
      setText(els.boostSub, 'boostSub', '');
      els.boostBtn.classList.add('active');
    } else {
      setText(els.boostMain, 'boost', t('boost'));
      setText(els.boostSub, 'boostSub', t('boostSub'));
      els.boostBtn.classList.remove('active');
    }

    for (const u of UPGRADES) {
      upgradeRows[u.id].root.classList.toggle('cant', !isMaxed(u) && state.coins < upgradeCost(u));
    }
    for (const q of SQUISHES) {
      cardRefs[q.id].root.classList.toggle('cant', !state.unlocked.includes(q.id) && state.coins < q.price);
    }
  }

  function applyStaticTexts() {
    document.title = t('title');
    els.tabUpgrades.textContent = t('tabUpgrades');
    els.tabCollection.textContent = t('tabCollection');
    updateSoundBtn();
  }

  function updateSoundBtn() {
    els.soundBtn.textContent = state.muted ? '🔇' : '🔊';
    els.soundBtn.setAttribute('aria-label', state.muted ? t('soundOff') : t('soundOn'));
    els.soundBtn.title = els.soundBtn.getAttribute('aria-label');
  }

  function switchTab(name) {
    const up = name === 'upgrades';
    els.tabUpgrades.classList.toggle('active', up);
    els.tabCollection.classList.toggle('active', !up);
    els.upgrades.classList.toggle('hidden', !up);
    els.collection.classList.toggle('hidden', up);
  }

  // ---------- Цикл ----------

  let lastTick = performance.now();

  function tick() {
    const now = performance.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    if (dt > OFFLINE_CAP_SEC) dt = OFFLINE_CAP_SEC;
    if (dt > 0) {
      // после долгого простоя (свёрнутая вкладка) не умножаем на x2 за весь период
      const ps = dt > 5 ? perSecond(false) : perSecond();
      if (ps > 0) addCoins(ps * dt);
    }
    updateHud();
  }

  // ---------- Запуск ----------

  function cacheEls() {
    for (const id of ['app', 'loader', 'stage', 'squish', 'shadow', 'squishName', 'fx', 'coins', 'perTap', 'perSec',
      'multChip', 'boostBtn', 'boostMain', 'boostSub', 'soundBtn', 'tabUpgrades', 'tabCollection', 'upgrades',
      'collection', 'modal', 'modalTitle', 'modalBody', 'modalBtn', 'confetti']) {
      els[id] = $(id);
    }
  }

  function bindEvents() {
    const holder = els.squish.parentElement;
    holder.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // Пробел / Enter на компьютере тоже сжимают сквиш
    let keyDown = false;
    window.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat && els.modal.classList.contains('hidden')) {
        e.preventDefault();
        if (!keyDown) {
          keyDown = true;
          squeezeDown();
          const r = holder.getBoundingClientRect();
          tap(r.left + r.width / 2, r.top + r.height / 2);
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && keyDown) { keyDown = false; squeezeUp(); }
    });

    els.boostBtn.addEventListener('click', onBoost);
    els.modalBtn.addEventListener('click', closeModal);
    els.tabUpgrades.addEventListener('click', () => { window.Sound.unlock(); switchTab('upgrades'); });
    els.tabCollection.addEventListener('click', () => { window.Sound.unlock(); switchTab('collection'); });
    els.soundBtn.addEventListener('click', () => {
      window.Sound.unlock();
      state.muted = !state.muted;
      window.Sound.setMuted(state.muted);
      updateSoundBtn();
      saveLocal();
    });

    // Требования Яндекс Игр: без контекстного меню, выделения и звука в фоне
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      const hidden = document.hidden;
      window.Sound.block('hidden', hidden);
      setPaused('hidden', hidden);
      if (hidden) { saveLocal(); saveCloud(); }
    });
    window.addEventListener('pagehide', saveLocal);
  }

  async function boot() {
    cacheEls();
    window.Sound.preload();

    await window.YSDK.init();
    window.I18N.setLang(window.YSDK.lang() || navigator.language || 'ru');

    const cloud = await window.YSDK.loadData();
    state = sanitize(pickBest(loadLocal(), cloud));
    window.Sound.setMuted(state.muted);

    applyStaticTexts();
    buildUpgrades();
    buildCollection();
    renderSquish(false);
    bindEvents();

    // Офлайн-доход
    const away = (Date.now() - state.savedAt) / 1000;
    const offline = perSecond(false) * Math.min(Math.max(away, 0), OFFLINE_CAP_SEC);
    if (away > 60 && offline >= 1) {
      addCoins(offline);
      showModal({
        title: t('offlineTitle'),
        body: `<div class="modal-sub">${t('offlineText')}</div>
               <div class="modal-amount"><i class="coin"></i>${fmt(offline)}</div>`,
        button: t('collect'),
      });
    }

    updateHud();
    els.loader.classList.add('hidden');
    if (document.hidden) {
      window.Sound.block('hidden', true);
      pauseReasons.add('hidden');
    }
    window.YSDK.ready();
    setPaused('loading', false);
    maybeFullscreenAd(true); // реклама при запуске

    lastTick = performance.now();
    setInterval(tick, 100);
    setInterval(saveLocal, LOCAL_SAVE_MS);
    setInterval(saveCloud, CLOUD_SAVE_MS);
    scheduleStar();
  }

  boot();
})();
