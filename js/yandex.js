/* Обёртка над Yandex Games SDK.
   Если игра открыта не на Яндекс Играх (локально), всё работает без SDK:
   прогресс хранится в localStorage, а награда за рекламу выдаётся сразу. */
(function () {
  'use strict';

  let sdk = null;
  let player = null;

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }

  const YSDK = {
    get available() { return !!sdk; },

    async init() {
      if (typeof window.YaGames === 'undefined') return false;
      try {
        sdk = await withTimeout(window.YaGames.init(), 6000);
      } catch (e) {
        console.warn('[YSDK] init failed', e);
        sdk = null;
        return false;
      }
      try {
        player = await withTimeout(sdk.getPlayer({ scopes: false }), 4000);
      } catch (e) {
        player = null;
      }
      return true;
    },

    lang() {
      try { return (sdk && sdk.environment && sdk.environment.i18n && sdk.environment.i18n.lang) || null; } catch (e) { return null; }
    },

    // Игра загрузилась и готова — обязательный вызов для Яндекс Игр.
    ready() {
      try { sdk && sdk.features.LoadingAPI && sdk.features.LoadingAPI.ready(); } catch (e) { /* нет SDK */ }
    },

    // Разметка геймплея: true — игрок играет, false — пауза (реклама, меню, свернули вкладку).
    gameplay(active) {
      try {
        const g = sdk && sdk.features.GameplayAPI;
        if (g) active ? g.start() : g.stop();
      } catch (e) { /* нет SDK */ }
    },

    async loadData() {
      if (!player) return null;
      try {
        const data = await withTimeout(player.getData(['save']), 4000);
        return data && data.save ? data.save : null;
      } catch (e) {
        return null;
      }
    },

    saveData(save) {
      if (!player) return;
      try { player.setData({ save }, false).catch(() => {}); } catch (e) { /* ignore */ }
    },

    // Полноэкранная реклама. hooks.onOpen / hooks.onClose — чтобы глушить звук.
    showFullscreen(hooks) {
      hooks = hooks || {};
      return new Promise((resolve) => {
        if (!sdk) { resolve(false); return; }
        let done = false;
        const finish = (shown) => {
          if (done) return;
          done = true;
          hooks.onClose && hooks.onClose();
          resolve(!!shown);
        };
        try {
          sdk.adv.showFullscreenAdv({
            callbacks: {
              onOpen: () => hooks.onOpen && hooks.onOpen(),
              onClose: (wasShown) => finish(wasShown),
              onError: () => finish(false),
              onOffline: () => finish(false),
            },
          });
        } catch (e) {
          finish(false);
        }
      });
    },

    // Реклама за награду. Возвращает true, если награду нужно выдать.
    showRewarded(hooks) {
      hooks = hooks || {};
      return new Promise((resolve) => {
        if (!sdk) { resolve(true); return; } // локальный режим: сразу даём награду
        let rewarded = false;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          hooks.onClose && hooks.onClose();
          resolve(rewarded);
        };
        try {
          sdk.adv.showRewardedVideo({
            callbacks: {
              onOpen: () => hooks.onOpen && hooks.onOpen(),
              onRewarded: () => { rewarded = true; },
              onClose: finish,
              onError: finish,
            },
          });
        } catch (e) {
          finish();
        }
      });
    },
  };

  window.YSDK = YSDK;
})();
