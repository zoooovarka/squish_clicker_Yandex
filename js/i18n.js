/* Тексты игры. Язык берётся из Яндекс SDK, иначе из браузера. */
(function () {
  'use strict';

  const DICT = {
    ru: {
      title: 'Сквиш Кликер',
      loading: 'Разминаем сквиши…',
      perTap: '{v} за тап',
      perSec: '{v} в сек',
      tabUpgrades: 'Улучшения',
      tabCollection: 'Сквиши',
      boost: 'x2 доход',
      boostSub: 'за рекламу',
      boostActive: 'x2 ещё {s} с',
      level: 'ур. {n}',
      max: 'МАКС',
      selected: 'Выбран',
      select: 'Выбрать',
      bonus: '+{p}% к доходу',
      collected: '{n} из {m}',
      mult: 'Доход x{m}',
      unlockTitle: 'Новый сквиш!',
      hooray: 'Ура!',
      offlineTitle: 'С возвращением!',
      offlineText: 'Пока тебя не было, помощники насквишили:',
      collect: 'Забрать',
      crit: 'СУПЕР!',
      star: 'Звёздочка!',
      clicks: 'Нажатий: {n}',
      soundOn: 'Выключить звук',
      soundOff: 'Включить звук',
      descTap: '+{v} за тап',
      descAuto: '+{v} в секунду',
      descCrit: '+2% шанс супер-тапа (x5)',
      upgrade: {
        power: 'Сильный пальчик',
        cat: 'Котик-помощник',
        crit: 'Супер-тап',
        machine: 'Сквиш-машинка',
        glove: 'Мягкая перчатка',
        factory: 'Сквиш-фабрика',
        rocket: 'Сквиш-ракета',
      },
      nameFmt: '{series} «{flavor}»',
      series: { dumpling: 'Дамплинг', shake: 'Шейк', capybara: 'Капибара' },
      seriesMany: { dumpling: 'Дамплинги', shake: 'Шейки', capybara: 'Капибары' },
      rarity: { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' },
      flavor: {
        black: 'Уголёк', blue: 'Океан', light_blue: 'Небо', brown: 'Карамель', chocolate: 'Шоколад',
        cookies: 'Печенька', cream: 'Ваниль', crystal: 'Кристалл', galaxy: 'Галактика', gold: 'Золото',
        green: 'Лайм', hearts: 'Сердечки', light_pink: 'Зефир', marble: 'Мрамор', matcha: 'Матча',
        mint: 'Мята', orange: 'Апельсин', pink: 'Розочка', purple: 'Лаванда', red: 'Малина',
        rainbow: 'Радуга', starry: 'Звёздочка', strawberry: 'Клубника', unicorn: 'Единорог', yellow: 'Солнышко',
        cow: 'Бурёнка', kiwi: 'Киви', blueberry: 'Черника', cherry: 'Вишня', ice: 'Льдинка',
        mango: 'Манго', sakura: 'Сакура', strawberry_cream: 'Клубника со сливками',
      },
    },
    en: {
      title: 'Squish Clicker',
      loading: 'Warming up the squishies…',
      perTap: '{v} per tap',
      perSec: '{v} per sec',
      tabUpgrades: 'Upgrades',
      tabCollection: 'Squishies',
      boost: 'x2 income',
      boostSub: 'watch an ad',
      boostActive: 'x2 for {s}s',
      level: 'lv. {n}',
      max: 'MAX',
      selected: 'Selected',
      select: 'Select',
      bonus: '+{p}% income',
      collected: '{n} of {m}',
      mult: 'Income x{m}',
      unlockTitle: 'New squishy!',
      hooray: 'Yay!',
      offlineTitle: 'Welcome back!',
      offlineText: 'While you were away, your helpers squished:',
      collect: 'Collect',
      crit: 'SUPER!',
      star: 'Star!',
      clicks: 'Squishes: {n}',
      soundOn: 'Mute',
      soundOff: 'Unmute',
      descTap: '+{v} per tap',
      descAuto: '+{v} per second',
      descCrit: '+2% super tap chance (x5)',
      upgrade: {
        power: 'Strong finger',
        cat: 'Kitty helper',
        crit: 'Super tap',
        machine: 'Squish machine',
        glove: 'Soft glove',
        factory: 'Squish factory',
        rocket: 'Squish rocket',
      },
      nameFmt: '{flavor} {series}',
      series: { dumpling: 'Dumpling', shake: 'Shake', capybara: 'Capybara' },
      seriesMany: { dumpling: 'Dumplings', shake: 'Shakes', capybara: 'Capybaras' },
      rarity: { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' },
      flavor: {
        black: 'Coal', blue: 'Ocean', light_blue: 'Sky', brown: 'Caramel', chocolate: 'Chocolate',
        cookies: 'Cookies', cream: 'Vanilla', crystal: 'Crystal', galaxy: 'Galaxy', gold: 'Gold',
        green: 'Lime', hearts: 'Hearts', light_pink: 'Marshmallow', marble: 'Marble', matcha: 'Matcha',
        mint: 'Mint', orange: 'Orange', pink: 'Rose', purple: 'Lavender', red: 'Raspberry',
        rainbow: 'Rainbow', starry: 'Starry', strawberry: 'Strawberry', unicorn: 'Unicorn', yellow: 'Sunny',
        cow: 'Cow', kiwi: 'Kiwi', blueberry: 'Blueberry', cherry: 'Cherry', ice: 'Ice',
        mango: 'Mango', sakura: 'Sakura', strawberry_cream: 'Strawberries & Cream',
      },
    },
  };

  // Языки СНГ показываем по-русски, остальные — по-английски.
  const RU_LIKE = ['ru', 'be', 'kk', 'uk', 'uz', 'ky', 'tg', 'hy', 'az'];

  let lang = 'ru';

  function setLang(code) {
    const short = String(code || '').slice(0, 2).toLowerCase();
    lang = DICT[short] ? short : (RU_LIKE.includes(short) ? 'ru' : 'en');
    document.documentElement.lang = lang;
  }

  function t(key, vars) {
    let s = key.split('.').reduce((o, k) => (o ? o[k] : undefined), DICT[lang]);
    if (s === undefined) s = key;
    if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }

  window.I18N = { setLang, t, get lang() { return lang; } };
})();
