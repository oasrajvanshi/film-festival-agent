// Storage spaces for the presentation. A deck frame named "usher-space-<name>"
// (and any frame nested inside it) keeps its own browser storage and live-sync
// channel, so the onboarding showcase (slide 6) and the live demo (slide 7)
// never see each other's festival, sign-in or alerts. Outside the deck: no-op.
(function () {
  try {
    var sp = '';
    var m = /^usher-space-([a-z0-9-]+)$/.exec(window.name || '');
    if (m) sp = m[1];
    else { try { if (window.parent !== window && window.parent.__usherSpace) sp = window.parent.__usherSpace; } catch (e) { /* other origin */ } }
    if (!sp) return;
    window.__usherSpace = sp;
    var P = sp + ':';
    var ls = window.localStorage;
    var S = Storage.prototype, get = S.getItem, set = S.setItem, del = S.removeItem;
    S.getItem = function (k) { return get.call(this, this === ls ? P + k : k); };
    S.setItem = function (k, v) { return set.call(this, this === ls ? P + k : k, v); };
    S.removeItem = function (k) { return del.call(this, this === ls ? P + k : k); };
    // Storage events: only this space's keys, with the prefix taken off.
    var add = window.addEventListener, rem = window.removeEventListener, wrapped = new WeakMap();
    window.addEventListener = function (type, fn, opts) {
      if (type !== 'storage' || typeof fn !== 'function') return add.call(this, type, fn, opts);
      var w = function (e) {
        if (e.key !== null && e.key.indexOf(P) !== 0) return;
        fn.call(this, { key: e.key === null ? null : e.key.slice(P.length), newValue: e.newValue, oldValue: e.oldValue, storageArea: e.storageArea, url: e.url, type: 'storage' });
      };
      wrapped.set(fn, w);
      return add.call(this, type, w, opts);
    };
    window.removeEventListener = function (type, fn, opts) {
      return rem.call(this, type, (type === 'storage' && wrapped.get(fn)) || fn, opts);
    };
    if (window.BroadcastChannel) {
      var B = window.BroadcastChannel;
      var Spaced = function (name) { return new B(P + name); };
      Spaced.prototype = B.prototype;
      window.BroadcastChannel = Spaced;
    }
    document.documentElement.setAttribute('data-usher-space', sp);
  } catch (e) { /* storage blocked: the app falls back as usual */ }
})();
