/* Сквиши: спрайты, редкость, цены и бонусы.
   Картинки лежат в assets/squishes/<серия>/, превью для коллекции — в .../thumbs/.
   Чтобы добавить сквиш: положи PNG в папку серии (и уменьшенную копию в thumbs/),
   допиши вкус в items нужной серии и его название в js/i18n.js (раздел flavor). */
(function () {
  'use strict';

  // Редкость: бонус к доходу (0.1 = +10%) и цвет значка.
  const RARITY = {
    common:    { rank: 0, bonus: 0.1,  color: '#8fa3b8' },
    rare:      { rank: 1, bonus: 0.3,  color: '#3fa7ff' },
    epic:      { rank: 2, bonus: 0.75, color: '#a35cff' },
    legendary: { rank: 3, bonus: 2,    color: '#ffa600' },
  };

  // Порядок вкусов внутри серии = порядок в коллекции.
  const SERIES = [
    {
      id: 'dumpling', dir: 'dumplings', file: 'dumpling', pitch: 0.95,
      items: {
        common: ['cream', 'yellow', 'pink', 'light_pink', 'light_blue', 'blue', 'mint', 'green', 'orange', 'purple', 'red', 'chocolate', 'black'],
        rare: ['cookies', 'matcha', 'marble', 'strawberry', 'hearts'],
        epic: ['rainbow', 'unicorn', 'starry'],
        legendary: ['crystal', 'galaxy', 'gold'],
      },
    },
    {
      id: 'shake', dir: 'shakes', file: 'shake', pitch: 1.15,
      items: {
        common: ['cream', 'yellow', 'pink', 'light_blue', 'blue', 'mint', 'green', 'orange', 'purple', 'red', 'brown', 'black'],
        rare: ['chocolate', 'cookies', 'matcha', 'mango', 'cherry', 'blueberry', 'strawberry', 'strawberry_cream', 'ice'],
        epic: ['rainbow', 'unicorn', 'starry', 'sakura'],
        legendary: ['crystal', 'galaxy', 'gold'],
      },
    },
    {
      id: 'capybara', dir: 'capybaras', file: 'capybara', pitch: 0.82,
      items: {
        common: ['brown', 'cream', 'yellow', 'pink', 'light_blue', 'blue', 'mint', 'green', 'orange', 'purple', 'red', 'chocolate', 'black'],
        rare: ['cow', 'kiwi', 'strawberry'],
        epic: ['rainbow'],
        legendary: ['crystal', 'galaxy', 'gold'],
      },
    },
  ];

  // Цвет брызг при нажатии (средний цвет спрайта).
  const COLORS = {
    dumpling_black: '#5d5457', dumpling_blue: '#2e8eff', dumpling_chocolate: '#964829', dumpling_cookies: '#debea0',
    dumpling_cream: '#f1cba6', dumpling_crystal: '#debdb5', dumpling_galaxy: '#6348b3', dumpling_gold: '#fbbe41',
    dumpling_green: '#c4e166', dumpling_hearts: '#fc9ba7', dumpling_light_blue: '#7eb2fe', dumpling_light_pink: '#faa19d',
    dumpling_marble: '#f3a299', dumpling_matcha: '#a9a741', dumpling_mint: '#83e3c9', dumpling_orange: '#fea737',
    dumpling_pink: '#fe6f98', dumpling_purple: '#c684ed', dumpling_rainbow: '#dcb5bc', dumpling_red: '#ff5042',
    dumpling_starry: '#be87e8', dumpling_strawberry: '#fe917f', dumpling_unicorn: '#d3c4c0', dumpling_yellow: '#fecd3d',
    capybara_black: '#625056', capybara_blue: '#2a71ed', capybara_brown: '#db8a4f', capybara_chocolate: '#954b2d',
    capybara_cow: '#c1927d', capybara_cream: '#d8af8e', capybara_crystal: '#e7b0bd', capybara_galaxy: '#5841b6',
    capybara_gold: '#eeaa34', capybara_green: '#b3c75c', capybara_kiwi: '#9ca639', capybara_light_blue: '#64a9f4',
    capybara_mint: '#77cfb1', capybara_orange: '#fe8023', capybara_pink: '#f97b8e', capybara_purple: '#c674e8',
    capybara_rainbow: '#e1aab2', capybara_red: '#ee2a21', capybara_strawberry: '#fe8188', capybara_yellow: '#f5c34c',
    shake_black: '#6c5c61', shake_blue: '#3782ff', shake_blueberry: '#a678c1', shake_brown: '#ba6c4b',
    shake_cherry: '#f6595b', shake_chocolate: '#af674a', shake_cookies: '#ceb099', shake_cream: '#f0c6a7',
    shake_crystal: '#dcb5c3', shake_galaxy: '#6c53d5', shake_gold: '#ffc03f', shake_green: '#bee856',
    shake_ice: '#9fccf5', shake_light_blue: '#7cc1fe', shake_mango: '#ffc945', shake_matcha: '#ccc660',
    shake_mint: '#42e9db', shake_orange: '#ff9337', shake_pink: '#ff8f99', shake_purple: '#e384f5',
    shake_rainbow: '#daaaa8', shake_red: '#ff5248', shake_sakura: '#fc9b9b', shake_starry: '#ef93cf',
    shake_strawberry: '#ffa294', shake_strawberry_cream: '#fca99b', shake_unicorn: '#c5badd', shake_yellow: '#ffdb5d',
  };

  // Лестница цен: сначала все обычные (по очереди из каждой серии), потом редкие,
  // эпические и легендарные. Первый сквиш бесплатный.
  const FIRST_PRICE = 60;
  const PRICE_GROWTH = 1.3;

  function nicePrice(v) {
    const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
    return Math.round(v / p) * p;
  }

  const SQUISHES = [];
  for (const s of SERIES) {
    for (const rarity of Object.keys(RARITY)) {
      for (const flavor of s.items[rarity]) {
        const id = s.file + '_' + flavor;
        SQUISHES.push({
          id, series: s.id, flavor, rarity,
          bonus: RARITY[rarity].bonus,
          pitch: s.pitch,
          color: COLORS[id] || '#ff8fbb',
          img: `assets/squishes/${s.dir}/${id}.png`,
          thumb: `assets/squishes/${s.dir}/thumbs/${id}.png`,
        });
      }
    }
  }

  const ladder = [];
  for (const rarity of Object.keys(RARITY)) {
    const lists = SERIES.map((s) => SQUISHES.filter((q) => q.series === s.id && q.rarity === rarity));
    const longest = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) ladder.push(l[i]);
  }
  ladder.forEach((q, i) => {
    q.order = i;
    q.price = i === 0 ? 0 : nicePrice(FIRST_PRICE * Math.pow(PRICE_GROWTH, i - 1));
  });

  function squishImg(def, small) {
    return `<img src="${small ? def.thumb : def.img}" alt="" draggable="false"${small ? ' loading="lazy"' : ''}>`;
  }

  window.RARITY = RARITY;
  window.SERIES = SERIES;
  window.SQUISHES = SQUISHES;
  window.STARTER_SQUISH = ladder[0].id;
  window.squishImg = squishImg;
})();
