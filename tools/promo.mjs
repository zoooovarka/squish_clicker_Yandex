#!/usr/bin/env node
// Промо-материалы для консоли Яндекс Игр → папка promo/
//
//   node tools/promo.mjs                 всё: иконка, обложки, скриншоты, видео (ru, en, tr)
//   node tools/promo.mjs art shots       только иконка/обложки и скриншоты
//   node tools/promo.mjs video --lang=ru только видео на русском
//
// Нужны playwright (npm i playwright && npx playwright install chromium) и ffmpeg в PATH
// (или путь в переменной FFMPEG). Свой Chrome: CHROMIUM_PATH=/путь/к/chrome.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'promo');
const args = process.argv.slice(2);
const parts = args.filter((a) => !a.startsWith('--'));
const want = (p) => parts.length === 0 || parts.includes(p);
const LANGS = (args.find((a) => a.startsWith('--lang=')) || '--lang=ru,en,tr').split('=')[1].split(',');
const TITLE = { ru: 'Сквиш Кликер', en: 'Squish Clicker', tr: 'Squishy Tıklayıcı' };
const SAVE_KEY = 'squish-clicker-save-v1';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Нет playwright. Установите: npm i playwright && npx playwright install chromium');
  process.exit(1);
}

// ---------- Локальный сервер ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.json': 'application/json',
};
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  // CORS — иначе шрифты для обложек не загрузятся в page.setContent
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/`;

// ---------- Сохранения для разных сцен ----------

// Порядок открытия сквишей (как в js/squishes.js): читаем прямо из игры
const ctxForData = { window: {} };
new Function('window', fs.readFileSync(path.join(ROOT, 'js/squishes.js'), 'utf8'))(ctxForData.window);
const LADDER = ctxForData.window.SQUISHES.slice().sort((a, b) => a.order - b.order).map((q) => q.id);
const upTo = (id) => LADDER.slice(0, LADDER.indexOf(id) + 1);
const without = (list, ...ids) => list.filter((x) => !ids.includes(x));

const UPGRADES_LATE = { power: 40, cat: 35, crit: 10, machine: 30, glove: 20, factory: 25, rocket: 12 };
const SCENES = {
  // скриншоты 1–2: далеко в игре, космическая капибара (на тёмной хорошо видно цифры)
  play: {
    coins: 1.94e9, totalEarned: 9e9, clicks: 61000, upgrades: UPGRADES_LATE,
    unlocked: upTo('capybara_galaxy'), current: 'capybara_galaxy',
  },
  // скриншот 3: вот-вот откроется золотая капибара
  unlock: {
    coins: 6.1e9, totalEarned: 3e10, clicks: 90000, upgrades: UPGRADES_LATE,
    unlocked: without(upTo('capybara_gold'), 'capybara_gold'), current: 'shake_unicorn',
  },
  // видео: тапы, улучшения, звёздочка, x2 и два новых сквиша
  video: {
    coins: 2.75e9, totalEarned: 1e10, clicks: 60000, upgrades: UPGRADES_LATE,
    unlocked: without(upTo('capybara_galaxy'), 'dumpling_rainbow', 'capybara_galaxy'), current: 'shake_cherry',
  },
};

async function openGame(context, lang, scene, extraCss) {
  const save = { muted: false, ...SCENES[scene] };
  await context.addInitScript(([key, data, css]) => {
    data.savedAt = Date.now(); // без окна «пока тебя не было»
    localStorage.setItem(key, JSON.stringify(data));
    if (css) {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = css;
        document.head.appendChild(st);
      });
    }
  }, [SAVE_KEY, save, extraCss || '']);
  const page = await context.newPage();
  await page.goto(`${BASE}index.html?lang=${lang}`);
  await page.waitForSelector('#loader.hidden', { state: 'attached' });
  await wait(600);
  return page;
}

// ---------- Действия в игре ----------

async function holderCenter(page) {
  const b = await page.locator('.squish-holder').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
}

async function tapSquish(page, count, gap = 90) {
  const c = await holderCenter(page);
  for (let i = 0; i < count; i++) {
    const x = c.x + (Math.random() - 0.5) * c.w * 0.35;
    const y = c.y + (Math.random() - 0.3) * c.h * 0.3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await wait(60 + Math.random() * 30);
    await page.mouse.up();
    await wait(gap + Math.random() * 40);
  }
}

async function catchStar(page) {
  await page.evaluate(() => window.__game.spawnStar());
  await wait(900);
  const b = await page.locator('.star-bonus').boundingBox();
  if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

async function showCard(page, id, smooth) {
  await page.click('#tabCollection');
  await wait(300);
  await page.evaluate(([cardId, behavior]) => {
    document.querySelector(`[data-id="${cardId}"]`).scrollIntoView({ block: 'center', behavior });
  }, [id, smooth ? 'smooth' : 'auto']);
  await wait(smooth ? 900 : 200);
}

async function showSeries(page, index) {
  await page.click('#tabCollection');
  await wait(300);
  await page.evaluate((i) => {
    const head = document.querySelectorAll('.series-head')[i];
    const body = document.getElementById('collection');
    body.scrollTop = head.offsetTop - body.offsetTop - 4;
  }, index);
  await wait(500);
}

// ---------- Иконка и обложки ----------

const FONT_CSS = `
@font-face { font-family: 'Nunito Promo'; font-weight: 900; src: url(tools/promo/fonts/nunito-cyrillic-900-normal.woff2) format('woff2');
  unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116; }
@font-face { font-family: 'Nunito Promo'; font-weight: 900; src: url(tools/promo/fonts/nunito-latin-ext-900-normal.woff2) format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
@font-face { font-family: 'Nunito Promo'; font-weight: 900; src: url(tools/promo/fonts/nunito-latin-900-normal.woff2) format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }`;

const sprite = (id) => {
  const dir = id.startsWith('dumpling') ? 'dumplings' : id.startsWith('shake') ? 'shakes' : 'capybaras';
  return `assets/squishes/${dir}/${id}.png`;
};

const ART_CSS = `${FONT_CSS}
* { margin: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  position: relative;
  font-family: 'Nunito Promo', sans-serif;
  background:
    radial-gradient(circle at 12% 20%, rgba(255,255,255,.75) 0 7%, transparent 7.4%),
    radial-gradient(circle at 90% 16%, rgba(255,255,255,.55) 0 5%, transparent 5.4%),
    radial-gradient(circle at 84% 84%, rgba(255,255,255,.5) 0 8%, transparent 8.4%),
    radial-gradient(circle at 8% 88%, rgba(255,255,255,.45) 0 4%, transparent 4.4%),
    linear-gradient(160deg, #ffd3e6 0%, #e6d9ff 55%, #cff3e8 100%);
}
.s { position: absolute; filter: drop-shadow(0 10px 14px rgba(120,60,120,.28)); }
.spark { position: absolute; color: #fff; text-shadow: 0 0 10px rgba(255,190,230,.9); }
.plus {
  position: absolute; font-weight: 900; color: #fff; white-space: nowrap;
  text-shadow: 0 3px 0 #e44d86, 0 0 10px rgba(228,77,134,.5);
}
.plus.gold { color: #fff6c2; text-shadow: 0 3px 0 #e08a00, 0 0 12px rgba(255,170,0,.7); }
h1 {
  position: absolute; left: 24px; right: 24px; text-align: center; white-space: nowrap;
  font-weight: 900; color: #fff; letter-spacing: 1px;
  -webkit-text-stroke: 10px #e44d86; paint-order: stroke fill;
  text-shadow: 0 7px 0 #c43a70, 0 12px 24px rgba(120,40,90,.35);
}
`;

function iconHtml() {
  return `<!doctype html><html><head><base href="${BASE}"><style>${ART_CSS}</style></head><body>
    <img class="s" src="${sprite('dumpling_pink')}" style="width:210px;left:-6px;top:150px;transform:rotate(-12deg)">
    <img class="s" src="${sprite('shake_strawberry')}" style="width:170px;right:2px;top:118px;transform:rotate(10deg)">
    <img class="s" src="${sprite('capybara_brown')}" style="width:400px;left:56px;top:176px;transform:scale(1.06,.95);transform-origin:50% 100%">
    <div class="plus" style="font-size:58px;left:40px;top:34px;transform:rotate(-10deg)">+1</div>
    <div class="plus gold" style="font-size:66px;right:36px;top:22px;transform:rotate(8deg)">+5</div>
    <div class="spark" style="font-size:44px;left:206px;top:58px">✦</div>
    <div class="spark" style="font-size:30px;left:300px;top:118px">✦</div>
  </body></html>`;
}

function coverHtml(lang) {
  return `<!doctype html><html><head><base href="${BASE}"><style>${ART_CSS}</style></head><body>
    <h1 id="t" style="top:18px;font-size:86px">${TITLE[lang]}</h1>
    <img class="s" src="${sprite('shake_rainbow')}" style="width:150px;left:28px;top:210px;transform:rotate(-8deg)">
    <img class="s" src="${sprite('dumpling_galaxy')}" style="width:190px;left:118px;top:300px;transform:rotate(-4deg)">
    <img class="s" src="${sprite('capybara_brown')}" style="width:300px;left:250px;top:200px">
    <img class="s" src="${sprite('dumpling_pink')}" style="width:180px;right:112px;top:302px;transform:rotate(5deg)">
    <img class="s" src="${sprite('shake_cherry')}" style="width:150px;right:24px;top:196px;transform:rotate(9deg)">
    <div class="plus" style="font-size:40px;left:204px;top:160px;transform:rotate(-8deg)">+10</div>
    <div class="plus gold" style="font-size:48px;right:196px;top:150px;transform:rotate(7deg)">+50</div>
    <div class="spark" style="font-size:30px;left:60px;top:150px">✦</div>
    <div class="spark" style="font-size:26px;right:60px;top:140px">✦</div>
  </body></html>`;
}

async function renderArt(browser, html, file, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.status === 'loaded');
  });
  if (!fontOk) throw new Error('Шрифт для обложек не загрузился');
  await page.evaluate(() => {
    const t = document.getElementById('t');
    // длинное название уменьшаем, чтобы влезло по ширине
    if (t) for (let fs = parseInt(t.style.fontSize, 10); fs > 40 && t.scrollWidth > t.clientWidth; fs -= 2) t.style.fontSize = fs + 'px';
  });
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
  console.log(`promo/${file} (${w}×${h})`);
}

// ---------- Скриншоты ----------

const DEVICES = [
  ['desktop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }],                       // 1920×1080
  ['mobile', { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], // 1080×1920
];

async function screenshots(browser, lang) {
  for (const [device, opts] of DEVICES) {
    const shot = (n, name) => path.join(OUT, `screen-${device}-${lang}-${n}-${name}.png`);

    // 1. Игра: x2 включён, звёздочка, летят цифры
    let ctx = await browser.newContext(opts);
    let page = await openGame(ctx, lang, 'play');
    await page.click('#boostBtn');
    await wait(3200); // пусть конфетти от x2 упадёт
    await page.evaluate(() => {
      window.__game.spawnStar();
      const star = document.querySelector('.star-bonus');
      star.style.left = '84%';
      star.style.top = '30%';
    });
    await wait(500);
    await tapSquish(page, 6, 110); // цифры разлетаются лесенкой, не слипаясь
    await wait(120);
    await page.screenshot({ path: shot(1, 'game') });
    await ctx.close();

    // 2. Коллекция: раздел капибар
    ctx = await browser.newContext(opts);
    page = await openGame(ctx, lang, 'play');
    await showSeries(page, 2);
    await page.screenshot({ path: shot(2, 'collection') });
    await ctx.close();

    // 3. Новый сквиш: золотая капибара
    ctx = await browser.newContext(opts);
    page = await openGame(ctx, lang, 'unlock');
    await showCard(page, 'capybara_gold', false);
    await page.click('[data-id="capybara_gold"]');
    await wait(800);
    await page.screenshot({ path: shot(3, 'new') });
    await ctx.close();
  }
  console.log(`promo/screen-*-${lang}-*.png`);
}

// ---------- Видео ----------

const VIDEO_CSS = 'html{zoom:1.5} #app{height:calc(100dvh / 1.5)!important}'; // 1280×720 вёрстка в 1920×1080 пикселях

async function video(browser, lang) {
  const tmp = fs.mkdtempSync(path.join(OUT, '.rec-'));
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } } });
  const t0 = Date.now();
  const page = await openGame(ctx, lang, 'video', VIDEO_CSS);
  const startAt = (Date.now() - t0) / 1000;

  await tapSquish(page, 20);                                   // мнём вишнёвый шейк
  for (const i of [0, 0, 1, 3]) { await page.locator('.upg').nth(i).click(); await wait(350); } // улучшения
  await tapSquish(page, 12);
  await catchStar(page);                                       // звёздочка
  await tapSquish(page, 10);
  await page.click('#boostBtn');                               // x2 доход
  await tapSquish(page, 16);
  await showCard(page, 'dumpling_rainbow', true);              // новый сквиш: радужный дамплинг
  await page.click('[data-id="dumpling_rainbow"]');
  await wait(2600);
  await page.click('#modalBtn');
  await tapSquish(page, 18);
  await showCard(page, 'capybara_galaxy', true);               // легендарная капибара
  await page.click('[data-id="capybara_galaxy"]');
  await wait(2800);
  await page.click('#modalBtn');
  await tapSquish(page, 14);
  await wait(400);

  await ctx.close();
  const raw = await page.video().path();
  const out = path.join(OUT, `video-${lang}.mp4`);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', String(startAt + 0.3), '-i', raw,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`promo/video-${lang}.mp4 (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} МБ)`);
}

// ---------- Запуск ----------

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  if (want('art')) {
    await renderArt(browser, iconHtml(), 'icon.png', 512, 512);
    for (const lang of LANGS) await renderArt(browser, coverHtml(lang), `cover-${lang}.png`, 800, 470);
  }
  if (want('shots')) for (const lang of LANGS) await screenshots(browser, lang);
  if (want('video')) for (const lang of LANGS) await video(browser, lang);
} finally {
  await browser.close();
  server.close();
}
