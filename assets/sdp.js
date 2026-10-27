/* Size deck page (sdp-*) sections: hero payment toggle, promo-code copy, variant
   price updates, FAQ accordion and the five-layers leader lines. Idempotent so the
   theme editor can re-run it after a section re-renders. */
(function () {
  'use strict';

  function formatMoney(cents, template) {
    var amount = (cents / 100).toFixed(2);
    var parts = amount.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var withCents = '$' + parts.join('.');
    var noCents = '$' + parts[0];
    if (template === 'short') return parts[1] === '00' ? noCents : withCents;
    return withCents;
  }

  function initHero(root) {
    if (root.dataset.sdpInit) return;
    root.dataset.sdpInit = '1';

    var toggle = root.querySelector('[data-sdp-toggle]');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        var panel = document.getElementById(toggle.getAttribute('aria-controls'));
        if (panel) panel.hidden = open;
      });
    }

    root.querySelectorAll('[data-sdp-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.getAttribute('data-sdp-copy');
        var done = function () {
          btn.classList.add('is-copied');
          setTimeout(function () { btn.classList.remove('is-copied'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done, done);
        } else {
          var ta = document.createElement('textarea');
          ta.value = code;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta);
          done();
        }
      });
    });

    var select = root.querySelector('[data-sdp-variant-select]');
    var dataEl = root.querySelector('[data-sdp-variants]');
    if (select && dataEl) {
      var data;
      try { data = JSON.parse(dataEl.textContent); } catch (e) { data = null; }
      if (data) {
        select.addEventListener('change', function () {
          var id = Number(select.value);
          var v = data.variants.filter(function (x) { return x.id === id; })[0];
          if (!v) return;
          var discount = (v.discount > 0 ? v.discount : data.fallbackDiscount) * 100;
          var sale = discount > 0 && v.price - discount > 0 ? v.price - discount : v.price;
          var hasDiscount = sale < v.price;

          var idInput = root.querySelector('[data-sdp-variant-id]');
          if (idInput) { idInput.value = v.id; idInput.disabled = !v.available; }

          var regular = root.querySelector('[data-sdp-regular]');
          if (regular) regular.textContent = formatMoney(v.price);
          var saleEl = root.querySelector('[data-sdp-sale]');
          if (saleEl) saleEl.textContent = formatMoney(sale);
          var promo = root.querySelector('[data-sdp-promo]');
          if (promo) promo.hidden = !hasDiscount;
          var monthly = root.querySelector('[data-sdp-monthly]');
          if (monthly) monthly.textContent = formatMoney(Math.round(sale / data.months / 100) * 100, 'short');
          var cta = root.querySelector('[data-sdp-cta-price]');
          if (cta) cta.textContent = formatMoney(v.price);

          root.querySelectorAll('[data-sdp-plan]').forEach(function (plan) {
            var base = plan.hasAttribute('data-sdp-plan-regular') ? v.price : sale;
            plan.querySelectorAll('[data-sdp-plan-amount]').forEach(function (el) {
              var n = Number(el.getAttribute('data-sdp-plan-amount')) || 1;
              el.textContent = formatMoney(Math.round(base / n / 100) * 100, 'short');
            });
          });

          var button = root.querySelector('.sdp-add');
          if (button) {
            button.disabled = !v.available;
            var span = button.querySelector('span');
            if (span && !v.available) span.textContent = window.variantStrings && window.variantStrings.soldOut ? window.variantStrings.soldOut : 'Sold out';
          }

          var url = new URL(window.location.href);
          url.searchParams.set('variant', v.id);
          window.history.replaceState({}, '', url.toString());
        });
      }
    }
  }

  function initFaq(root) {
    if (root.dataset.sdpInit) return;
    root.dataset.sdpInit = '1';
    root.querySelectorAll('.sdp-faq__q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        var answer = document.getElementById(btn.getAttribute('aria-controls'));
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (answer) answer.hidden = open;
      });
    });
  }

  /* Dashed leader from each pin on the exploded image to its label, drawn in an SVG
     laid over the diagram. Positions come from the DOM, so the lines survive resizes. */
  function drawLeaders(root) {
    var svg = root.querySelector('.sdp-layers__leaders');
    var diagram = root.querySelector('.sdp-layers__diagram');
    if (!svg || !diagram) return;
    var box = diagram.getBoundingClientRect();
    if (box.width < 760) { svg.innerHTML = ''; return; }
    svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);

    var ns = 'http://www.w3.org/2000/svg';
    var html = [];
    var badges = root.querySelectorAll('.sdp-layer__badge');
    var first = badges[0] && badges[0].getBoundingClientRect();
    var last = badges[badges.length - 1] && badges[badges.length - 1].getBoundingClientRect();
    if (first && last && badges.length > 1) {
      var x = first.left + first.width / 2 - box.left;
      var y1 = first.top + first.height / 2 - box.top;
      var y2 = last.top + last.height / 2 - box.top;
      html.push('<path class="sdp-layers__spine" d="M' + x + ' ' + y1 + ' Q' + (x + 20) + ' ' + ((y1 + y2) / 2) + ' ' + x + ' ' + y2 + '"/>');
    }
    root.querySelectorAll('.sdp-layer').forEach(function (row) {
      var pin = root.querySelector('.sdp-pin[data-for="' + row.dataset.layer + '"]');
      var badge = row.querySelector('.sdp-layer__badge');
      if (!pin || !badge) return;
      var p = pin.getBoundingClientRect();
      var b = badge.getBoundingClientRect();
      var px = p.left + p.width / 2 - box.left;
      var py = p.top + p.height / 2 - box.top;
      var bx = b.left - box.left - 4;
      var by = b.top + b.height / 2 - box.top;
      html.push('<line x1="' + px + '" y1="' + py + '" x2="' + bx + '" y2="' + by + '"/>');
    });
    svg.innerHTML = html.join('');
    void ns;
  }

  function initLayers(root) {
    if (root.dataset.sdpInit) return;
    root.dataset.sdpInit = '1';
    var draw = function () { drawLeaders(root); };
    draw();
    var img = root.querySelector('.sdp-layers__media img');
    if (img && !img.complete) img.addEventListener('load', draw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    var pending;
    window.addEventListener('resize', function () {
      clearTimeout(pending);
      pending = setTimeout(draw, 80);
    });
  }

  function initAll() {
    document.querySelectorAll('[data-sdp-hero]').forEach(initHero);
    document.querySelectorAll('[data-sdp-faq]').forEach(initFaq);
    document.querySelectorAll('[data-sdp-layers]').forEach(initLayers);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
  document.addEventListener('shopify:section:load', initAll);
})();
