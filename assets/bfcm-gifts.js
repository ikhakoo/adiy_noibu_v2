/*
 * BFCM free gifts — keeps the gift line items in step with the cart.
 * Config comes from snippets/bfcm-gifts-sync.liquid (#BfcmGiftsConfig).
 *
 *  - any "Deck Kit" in the cart  -> each gift present at qty 1
 *  - no deck in the cart         -> gift lines removed
 *
 * Runs on page load (only when the server says the cart is off) and after
 * every theme cart update (product form add, drawer / cart page changes).
 */
(function () {
  var configEl = document.getElementById('BfcmGiftsConfig');
  if (!configEl) return;

  var cfg;
  try {
    cfg = JSON.parse(configEl.textContent);
  } catch (e) {
    return;
  }
  if (!cfg.giftVariantIds || !cfg.giftVariantIds.length) return;

  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  var saleOver = function () {
    var end = Date.parse(cfg.end);
    return !isNaN(end) && Date.now() > end;
  };

  var running = null;
  var rerun = false;

  function postJSON(url, body) {
    return fetch(root + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json();
    });
  }

  function getCart() {
    return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.json();
    });
  }

  function isGift(item) {
    return cfg.giftVariantIds.indexOf(item.variant_id) !== -1;
  }

  // Work out what has to change. Returns { add: [...], updates: { lineKey: qty } }.
  function plan(cart) {
    var hasDeck = cart.items.some(function (item) {
      return item.product_type === cfg.qualifyingType && !isGift(item);
    });
    var updates = {};
    var add = [];

    cfg.giftVariantIds.forEach(function (variantId) {
      var lines = cart.items.filter(function (item) {
        return item.variant_id === variantId;
      });
      lines.forEach(function (line, i) {
        var want = hasDeck && i === 0 ? 1 : 0;
        if (line.quantity !== want) updates[line.key] = want;
      });
      if (hasDeck && !lines.length) {
        add.push({ id: variantId, quantity: 1, properties: { _bfcm_gift: 'Black Friday free gift' } });
      }
    });

    return { hasDeck: hasDeck, add: add, updates: updates };
  }

  function refreshCartUI(cart) {
    var drawer = document.querySelector('cart-drawer');
    var sectionIds = ['cart-icon-bubble'];
    if (drawer) sectionIds.push('cart-drawer');

    var sectionsPromise = fetch(root + '?sections=' + sectionIds.join(','))
      .then(function (r) {
        return r.json();
      })
      .then(function (sections) {
        var parse = function (html, selector) {
          if (!html) return null;
          return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
        };

        var bubble = document.getElementById('cart-icon-bubble');
        var bubbleSrc = parse(sections['cart-icon-bubble'], '.shopify-section');
        if (bubble && bubbleSrc) bubble.innerHTML = bubbleSrc.innerHTML;

        var drawerTarget = document.getElementById('CartDrawer');
        var drawerSrc = parse(sections['cart-drawer'], '#CartDrawer');
        if (drawer && drawerTarget && drawerSrc) {
          drawerTarget.innerHTML = drawerSrc.innerHTML;
          drawer.classList.toggle('is-empty', cart.item_count === 0);
          var overlay = drawer.querySelector('#CartDrawer-Overlay');
          if (overlay && typeof drawer.close === 'function') overlay.addEventListener('click', drawer.close.bind(drawer));
        }
      })
      .catch(function (e) {
        console.error('[bfcm-gifts] section refresh failed', e);
      });

    // Cart page (not the drawer's subclass): reuse the theme's own refresh.
    document.querySelectorAll('cart-items').forEach(function (el) {
      if (typeof el.onCartUpdate === 'function') el.onCartUpdate();
    });

    return sectionsPromise;
  }

  function announce(hasDeck) {
    document.querySelectorAll('[data-bfcm-gifts-card]').forEach(function (card) {
      card.classList.toggle('is-in-cart', hasDeck);
    });
    document.dispatchEvent(new CustomEvent('bfcm:gifts-synced', { detail: { inCart: hasDeck } }));
  }

  function sync() {
    if (saleOver()) return Promise.resolve();
    if (running) {
      rerun = true;
      return running;
    }

    running = getCart()
      .then(function (cart) {
        var p = plan(cart);
        var changed = false;
        var chain = Promise.resolve();

        if (Object.keys(p.updates).length) {
          changed = true;
          chain = chain.then(function () {
            return postJSON('cart/update.js', { updates: p.updates });
          });
        }
        if (p.add.length) {
          changed = true;
          chain = chain.then(function () {
            return postJSON('cart/add.js', { items: p.add });
          });
        }

        return chain.then(function () {
          if (!changed) {
            announce(p.hasDeck);
            return;
          }
          return getCart().then(function (updated) {
            announce(p.hasDeck);
            return refreshCartUI(updated);
          });
        });
      })
      .catch(function (e) {
        console.error('[bfcm-gifts] sync failed', e);
      })
      .finally(function () {
        running = null;
        if (rerun) {
          rerun = false;
          sync();
        }
      });

    return running;
  }

  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
      sync();
    });
  }

  if (cfg.needsSync) sync();
})();
