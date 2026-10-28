/* Deck Kits by Size — tabs, sort and colour swatches for sections/sdp-collection.liquid */
(function () {
  function init(root) {
    if (root.dataset.sdpcReady) return;
    root.dataset.sdpcReady = '1';

    var grid = root.querySelector('[data-sdpc-grid]');
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-sdpc-card]'));
    var tabs = root.querySelectorAll('[data-sdpc-filter]');
    var sort = root.querySelector('[data-sdpc-sort]');
    var countEl = root.querySelector('[data-sdpc-count]');

    function matches(card, filter) {
      if (filter === 'all') return true;
      if (filter === 'compact') return card.dataset.series === 'compact';
      return card.dataset.material === filter;
    }

    function applyFilter(filter) {
      var shown = 0;
      cards.forEach(function (card) {
        var ok = matches(card, filter);
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (countEl) countEl.textContent = shown;
      tabs.forEach(function (tab) {
        var active = tab.dataset.sdpcFilter === filter;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    function num(card, key) {
      return parseFloat(card.dataset[key]) || 0;
    }

    function applySort(mode) {
      var sorted = cards.slice().sort(function (a, b) {
        switch (mode) {
          case 'area-asc': return num(a, 'area') - num(b, 'area') || num(a, 'price') - num(b, 'price');
          case 'area-desc': return num(b, 'area') - num(a, 'area') || num(a, 'price') - num(b, 'price');
          case 'price-asc': return num(a, 'price') - num(b, 'price');
          case 'price-desc': return num(b, 'price') - num(a, 'price');
          default: return num(a, 'index') - num(b, 'index');
        }
      });
      sorted.forEach(function (card) { grid.appendChild(card); });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { applyFilter(tab.dataset.sdpcFilter); });
    });
    if (sort) sort.addEventListener('change', function () { applySort(sort.value); });

    // Colour swatches swap the card image and point the card link at that colour.
    grid.addEventListener('click', function (event) {
      var swatch = event.target.closest('[data-sdpc-swatch]');
      if (!swatch) return;
      event.preventDefault();
      var card = swatch.closest('[data-sdpc-card]');
      var img = card.querySelector('[data-sdpc-img]');
      var link = card.querySelector('.sdpc-card__link');
      if (img && swatch.dataset.src) {
        img.removeAttribute('srcset');
        img.src = swatch.dataset.src;
      }
      if (link && swatch.dataset.url) link.href = swatch.dataset.url;
      card.querySelectorAll('[data-sdpc-swatch]').forEach(function (s) {
        var on = s === swatch;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  }

  function boot() {
    document.querySelectorAll('[data-sdpc]').forEach(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('shopify:section:load', boot);
})();
