/* Сквиши: внешний вид и параметры.
   Каждый рисунок — SVG в квадрате 200×200.
   Чтобы добавить новый сквиш: допиши объект в массив SQUISHES
   и его название в js/i18n.js (раздел squish). */
(function () {
  'use strict';

  let uid = 0;

  // Мордочка. Обычная (face-normal) и «сжатая» >_< (face-squeeze) — во время нажатия.
  function face(o) {
    o = o || {};
    const x = o.x ?? 100, y = o.y ?? 115, dx = o.dx ?? 24, r = o.r ?? 7.5;
    const ink = o.ink || '#3b2733';
    const blush = o.blush || '#ff8fab';
    const lx = x - dx, rx = x + dx;
    const my = o.mouthY ?? (y + r + 7);
    const mouth = o.mouth === 'u'
      ? `M${x - 7} ${my - 2} q7 7 14 0`
      : `M${x - 8} ${my - 2} q4 5 8 0 q4 5 8 0`;
    const sw = Math.max(2.6, r * 0.42);
    const stroke = `fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    return `
      <ellipse cx="${lx - r * 0.7}" cy="${y + r + 5}" rx="${r * 1.15}" ry="${r * 0.6}" fill="${blush}" opacity=".55"/>
      <ellipse cx="${rx + r * 0.7}" cy="${y + r + 5}" rx="${r * 1.15}" ry="${r * 0.6}" fill="${blush}" opacity=".55"/>
      <g class="face-normal">
        <ellipse cx="${lx}" cy="${y}" rx="${r * 0.85}" ry="${r}" fill="${ink}"/>
        <ellipse cx="${rx}" cy="${y}" rx="${r * 0.85}" ry="${r}" fill="${ink}"/>
        <circle cx="${lx + r * 0.3}" cy="${y - r * 0.38}" r="${r * 0.34}" fill="#fff"/>
        <circle cx="${rx + r * 0.3}" cy="${y - r * 0.38}" r="${r * 0.34}" fill="#fff"/>
        <path d="${mouth}" ${stroke}/>
      </g>
      <g class="face-squeeze">
        <path d="M${lx - r * 0.8} ${y - r * 0.9} L${lx + r * 0.7} ${y} L${lx - r * 0.8} ${y + r * 0.9}" ${stroke}/>
        <path d="M${rx + r * 0.8} ${y - r * 0.9} L${rx - r * 0.7} ${y} L${rx + r * 0.8} ${y + r * 0.9}" ${stroke}/>
        <ellipse cx="${x}" cy="${my + 1}" rx="${r * 0.6}" ry="${r * 0.75}" fill="${ink}"/>
      </g>`;
  }

  function sparkle(x, y, s, color) {
    return `<path d="M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z" fill="${color || '#fff'}"/>`;
  }

  function vgrad(id, from, to) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
  }

  function rgrad(id, stops, cx, cy) {
    return `<radialGradient id="${id}" cx="${cx ?? 0.4}" cy="${cy ?? 0.35}" r="0.8">` +
      stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</radialGradient>';
  }

  // ---------- Рисунки ----------

  function drawButter(u, p) {
    p = p || { top: '#FFF6C9', light: '#FFEB94', dark: '#F7CF55', side: '#EBB93C', drip: '#FFFBE6' };
    return `
      <defs>${vgrad(u + 'f', p.light, p.dark)}</defs>
      <path d="M36 66 L50 44 Q53 40 58 40 H172 Q180 40 177 47 L166 66 Z" fill="${p.top}"/>
      <path d="M162 70 L175 46 Q180 41 180 50 V136 Q180 146 174 152 L162 164 Z" fill="${p.side}"/>
      <rect x="22" y="62" width="146" height="104" rx="24" fill="url(#${u}f)"/>
      <path d="M44 63 V82 Q44 94 54 94 Q64 94 64 82 V76 Q64 70 70 70 Q76 70 76 77 V86 Q76 97 86 97 Q96 97 96 86 V63 Z" fill="${p.drip}" opacity=".9"/>
      <rect x="30" y="74" width="8" height="34" rx="4" fill="#fff" opacity=".45"/>
      ${face({ x: 95, y: 120, dx: 26 })}`;
  }

  function drawGolden(u) {
    return drawButter(u, { top: '#FFF2A8', light: '#FFDA55', dark: '#F2A600', side: '#D18A00', drip: '#FFF7D1' }) +
      sparkle(26, 34, 11) + sparkle(186, 176, 9) + sparkle(150, 22, 7) + sparkle(14, 150, 6);
  }

  function drawDumpling(u) {
    return `
      <defs>${rgrad(u + 'd', [[0, '#FFFEF9'], [0.65, '#F8EEDC'], [1, '#E9D5B3']], 0.45, 0.4)}</defs>
      <path d="M20 138 Q22 88 62 66 Q100 44 138 66 Q178 88 180 138 Q180 160 150 162 H50 Q20 160 20 138 Z" fill="url(#${u}d)"/>
      <path d="M46 80 Q56 62 70 63 Q78 49 92 55 Q100 43 108 55 Q122 49 130 63 Q144 62 154 80" fill="none" stroke="#E4CEA8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <g fill="none" stroke="#E4CEA8" stroke-width="3.5" stroke-linecap="round">
        <path d="M70 65 Q73 76 68 88"/><path d="M92 57 Q95 69 90 80"/>
        <path d="M108 57 Q105 69 110 80"/><path d="M130 65 Q127 76 132 88"/>
      </g>
      <ellipse cx="58" cy="104" rx="10" ry="16" fill="#fff" opacity=".6" transform="rotate(25 58 104)"/>
      ${face({ x: 100, y: 122, dx: 24 })}`;
  }

  function drawMochi(u) {
    return `
      <defs>${rgrad(u + 'm', [[0, '#FFF2F7'], [0.6, '#FFC9DC'], [1, '#F6A2C0']])}</defs>
      <path d="M22 132 Q20 70 100 62 Q180 70 178 132 Q178 166 100 168 Q22 166 22 132 Z" fill="url(#${u}m)"/>
      <ellipse cx="66" cy="86" rx="24" ry="10" fill="#fff" opacity=".6" transform="rotate(-18 66 86)"/>
      <g fill="#fff" opacity=".75">
        <circle cx="120" cy="78" r="2.4"/><circle cx="140" cy="88" r="2"/><circle cx="48" cy="130" r="2.2"/>
        <circle cx="156" cy="132" r="2.4"/><circle cx="104" cy="156" r="2"/>
      </g>
      ${face({ x: 100, y: 120, dx: 26, blush: '#ff7ea8' })}`;
  }

  function drawToast(u) {
    return `
      <defs>${vgrad(u + 'c', '#E8AE62', '#C27630')}${vgrad(u + 'i', '#FFF3D1', '#FFE0A2')}</defs>
      <path d="M44 166 V86 Q28 80 28 62 Q28 28 74 28 H126 Q172 28 172 62 Q172 80 156 86 V166 Q156 174 148 174 H52 Q44 174 44 166 Z" fill="url(#${u}c)"/>
      <path d="M56 160 V79 Q42 75 42 62 Q42 41 77 41 H123 Q158 41 158 62 Q158 75 144 79 V160 Z" fill="url(#${u}i)"/>
      <g fill="#F2CF8A">
        <ellipse cx="72" cy="62" rx="3" ry="2"/><ellipse cx="128" cy="58" rx="3.5" ry="2.2"/>
        <ellipse cx="70" cy="146" rx="3" ry="2"/><ellipse cx="132" cy="140" rx="3" ry="2"/><ellipse cx="100" cy="54" rx="2.5" ry="1.8"/>
      </g>
      ${face({ x: 100, y: 102, dx: 24 })}`;
  }

  function drawStrawberry(u) {
    return `
      <defs>${rgrad(u + 's', [[0, '#FF97A4'], [0.6, '#FF5C73'], [1, '#E0364F']], 0.4, 0.3)}</defs>
      <path d="M100 180 Q38 152 30 102 Q26 62 64 56 Q84 53 100 66 Q116 53 136 56 Q174 62 170 102 Q162 152 100 180 Z" fill="url(#${u}s)"/>
      <g fill="#FFE59A">
        <ellipse cx="58" cy="84" rx="2.6" ry="4"/><ellipse cx="142" cy="84" rx="2.6" ry="4"/>
        <ellipse cx="46" cy="112" rx="2.6" ry="4"/><ellipse cx="154" cy="112" rx="2.6" ry="4"/>
        <ellipse cx="68" cy="146" rx="2.6" ry="4"/><ellipse cx="132" cy="146" rx="2.6" ry="4"/>
        <ellipse cx="100" cy="160" rx="2.6" ry="4"/><ellipse cx="86" cy="80" rx="2.4" ry="3.6"/><ellipse cx="114" cy="80" rx="2.4" ry="3.6"/>
      </g>
      <g fill="#5CC46A">
        <ellipse cx="80" cy="58" rx="20" ry="8" transform="rotate(-22 80 58)"/>
        <ellipse cx="120" cy="58" rx="20" ry="8" transform="rotate(22 120 58)"/>
        <ellipse cx="100" cy="54" rx="8" ry="16"/>
      </g>
      <rect x="97" y="28" width="6" height="20" rx="3" fill="#3E9A4D"/>
      <ellipse cx="62" cy="100" rx="8" ry="14" fill="#fff" opacity=".35" transform="rotate(20 62 100)"/>
      ${face({ x: 100, y: 108, dx: 22, ink: '#4a1c26', blush: '#ffd0d8' })}`;
  }

  function drawPaw(u) {
    return `
      <defs>${rgrad(u + 'p', [[0, '#FFFFFF'], [0.7, '#FBF3F8'], [1, '#EBDCE6']], 0.45, 0.4)}</defs>
      <g fill="url(#${u}p)">
        <ellipse cx="44" cy="80" rx="20" ry="24" transform="rotate(-22 44 80)"/>
        <ellipse cx="78" cy="52" rx="20" ry="25"/>
        <ellipse cx="122" cy="52" rx="20" ry="25"/>
        <ellipse cx="156" cy="80" rx="20" ry="24" transform="rotate(22 156 80)"/>
        <ellipse cx="100" cy="130" rx="66" ry="52"/>
      </g>
      <g fill="#FFB3CB">
        <ellipse cx="45" cy="82" rx="9" ry="12" transform="rotate(-22 45 82)"/>
        <ellipse cx="78" cy="55" rx="9.5" ry="12"/>
        <ellipse cx="122" cy="55" rx="9.5" ry="12"/>
        <ellipse cx="155" cy="82" rx="9" ry="12" transform="rotate(22 155 82)"/>
        <path d="M100 108 Q70 94 62 124 Q56 158 100 162 Q144 158 138 124 Q130 94 100 108 Z"/>
      </g>
      ${face({ x: 100, y: 130, dx: 17, r: 6, ink: '#5a2440', blush: '#ff6f9a' })}`;
  }

  function drawCapybara(u) {
    return `
      <defs>${vgrad(u + 'b', '#C99A70', '#9C6A43')}</defs>
      <ellipse cx="54" cy="68" rx="13" ry="11" fill="#86562F"/>
      <ellipse cx="146" cy="68" rx="13" ry="11" fill="#86562F"/>
      <path d="M26 122 Q26 66 100 62 Q174 66 174 122 Q174 170 100 172 Q26 170 26 122 Z" fill="url(#${u}b)"/>
      <ellipse cx="100" cy="140" rx="40" ry="25" fill="#7E5131"/>
      <ellipse cx="88" cy="132" rx="4.5" ry="3.2" fill="#3a2416"/>
      <ellipse cx="112" cy="132" rx="4.5" ry="3.2" fill="#3a2416"/>
      <circle cx="100" cy="50" r="18" fill="#FF9F2E"/>
      <circle cx="94" cy="44" r="5" fill="#FFC77A"/>
      <ellipse cx="110" cy="33" rx="9" ry="4" fill="#5CC46A" transform="rotate(-30 110 33)"/>
      ${face({ x: 100, y: 104, dx: 32, r: 6.5, mouthY: 148, mouth: 'u', ink: '#2e1c12', blush: '#ff9a9a' })}`;
  }

  function drawCroissant(u) {
    return `
      <defs>${rgrad(u + 'k', [[0, '#FFD98E'], [0.65, '#F2B154'], [1, '#D2832A']], 0.45, 0.35)}</defs>
      <g fill="url(#${u}k)" stroke="#B5701F" stroke-opacity=".55" stroke-width="2.5">
        <ellipse cx="30" cy="132" rx="15" ry="22" transform="rotate(-55 30 132)"/>
        <ellipse cx="170" cy="132" rx="15" ry="22" transform="rotate(55 170 132)"/>
        <ellipse cx="62" cy="118" rx="26" ry="36" transform="rotate(-30 62 118)"/>
        <ellipse cx="138" cy="118" rx="26" ry="36" transform="rotate(30 138 118)"/>
        <ellipse cx="100" cy="110" rx="36" ry="48"/>
      </g>
      <ellipse cx="86" cy="80" rx="10" ry="6" fill="#fff" opacity=".45" transform="rotate(-20 86 80)"/>
      ${face({ x: 100, y: 112, dx: 17, r: 6.5, ink: '#4a2a10' })}`;
  }

  // price — цена открытия, bonus — прибавка к доходу (0.25 = +25%),
  // color — цвет брызг при нажатии, pitch — высота звука «чвяка».
  const SQUISHES = [
    { id: 'butter',     price: 0,        bonus: 0,    color: '#FFD84D', pitch: 1.0,  draw: drawButter },
    { id: 'dumpling',   price: 250,      bonus: 0.25, color: '#F3E3C6', pitch: 0.9,  draw: drawDumpling },
    { id: 'mochi',      price: 2000,     bonus: 0.5,  color: '#FFB3CC', pitch: 1.15, draw: drawMochi },
    { id: 'toast',      price: 12000,    bonus: 1,    color: '#E8AE62', pitch: 0.95, draw: drawToast },
    { id: 'strawberry', price: 60000,    bonus: 1.5,  color: '#FF5C73', pitch: 1.2,  draw: drawStrawberry },
    { id: 'paw',        price: 300000,   bonus: 2.5,  color: '#FFB3CB', pitch: 1.3,  draw: drawPaw },
    { id: 'capybara',   price: 1500000,  bonus: 4,    color: '#B8865B', pitch: 0.8,  draw: drawCapybara },
    { id: 'croissant',  price: 8000000,  bonus: 7,    color: '#F2B154', pitch: 0.9,  draw: drawCroissant },
    { id: 'golden',     price: 50000000, bonus: 15,   color: '#FFC21A', pitch: 1.1,  draw: drawGolden },
  ];

  function squishSVG(def) {
    const u = 'q' + (++uid);
    return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${def.draw(u)}</svg>`;
  }

  window.SQUISHES = SQUISHES;
  window.squishSVG = squishSVG;
})();
