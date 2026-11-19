/* Deck Builders Near Me directory — behaviour for sections/deck-directory-*.liquid.
   1) State directory: filter by state/city text, region tabs, "only states with city guides",
      and open one state's city panel at a time.
   2) Hero search: jump to the matching state or city guide.
   3) FAQ: search questions and highlight the category in view.
   Everything is progressive: without this file every tile and city card is still a plain link. */
(function () {
  'use strict';

  function norm(value) {
    return (value || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function scrollTo(el) {
    if (!el) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  /* ---------- State directory ---------- */

  function initStates(root) {
    root.querySelectorAll('[data-dd-states]:not([data-ready])').forEach(function (section) {
      section.setAttribute('data-ready', '');
      section.classList.add('dd-js');

      var input = section.querySelector('[data-dd-filter]');
      var tabs = Array.prototype.slice.call(section.querySelectorAll('[data-dd-region-tab]'));
      var onlyCities = section.querySelector('[data-dd-only-cities]');
      var regions = Array.prototype.slice.call(section.querySelectorAll('[data-dd-region]'));
      var tiles = Array.prototype.slice.call(section.querySelectorAll('[data-dd-state]'));
      var panels = Array.prototype.slice.call(section.querySelectorAll('[data-dd-panel]'));
      var empty = section.querySelector('[data-dd-empty]');
      var region = 'all';

      function openPanel(handle, scroll) {
        var opened = null;
        panels.forEach(function (panel) {
          var match = handle && panel.getAttribute('data-dd-panel') === handle;
          panel.hidden = !match;
          if (match) opened = panel;
        });
        tiles.forEach(function (tile) {
          var link = tile.querySelector('[data-dd-open]');
          if (!link) return;
          var match = !!opened && link.getAttribute('data-dd-open') === handle;
          link.classList.toggle('is-open', match);
          link.setAttribute('aria-expanded', match ? 'true' : 'false');
        });
        if (opened && scroll) scrollTo(opened);
        return opened;
      }

      function apply() {
        var q = norm(input ? input.value : '');
        var shown = 0;
        tiles.forEach(function (tile) {
          var ok = region === 'all' || tile.getAttribute('data-region') === region;
          if (ok && onlyCities && onlyCities.checked) ok = tile.hasAttribute('data-has-cities');
          if (ok && q) {
            var hay = ' ' + tile.getAttribute('data-search') + ' ';
            ok = hay.indexOf(q) !== -1;
          }
          tile.hidden = !ok;
          if (ok) shown++;
          var link = tile.querySelector('[data-dd-open].is-open');
          if (!ok && link) openPanel(null);
        });
        regions.forEach(function (r) {
          r.hidden = !r.querySelector('[data-dd-state]:not([hidden])');
        });
        if (empty) empty.hidden = shown > 0;
      }

      section.addEventListener('click', function (e) {
        var open = e.target.closest('[data-dd-open]');
        if (open && section.contains(open)) {
          e.preventDefault();
          var handle = open.getAttribute('data-dd-open');
          openPanel(open.classList.contains('is-open') ? null : handle, true);
          return;
        }
        var close = e.target.closest('[data-dd-close]');
        if (close && section.contains(close)) {
          var panel = close.closest('[data-dd-panel]');
          var handleClosed = panel.getAttribute('data-dd-panel');
          openPanel(null);
          var tile = section.querySelector('[data-dd-open="' + handleClosed + '"]');
          if (tile) tile.focus();
          return;
        }
        var tab = e.target.closest('[data-dd-region-tab]');
        if (tab && section.contains(tab)) {
          region = tab.getAttribute('data-dd-region-tab');
          tabs.forEach(function (t) { t.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); });
          apply();
        }
      });

      if (input) input.addEventListener('input', apply);
      if (onlyCities) onlyCities.addEventListener('change', apply);

      // Public hook for the hero search.
      section.ddFind = function (text) {
        var q = norm(text);
        if (!q) { scrollTo(section); return; }
        var stateHit = null;
        var cityHit = null;
        tiles.forEach(function (tile) {
          if (stateHit) return;
          if (norm(tile.getAttribute('data-name')) === q || norm(tile.getAttribute('data-abbr')) === q) stateHit = tile;
        });
        if (!stateHit) {
          panels.forEach(function (panel) {
            if (cityHit) return;
            panel.querySelectorAll('[data-dd-city]').forEach(function (card) {
              if (!cityHit && norm(card.getAttribute('data-dd-city')) === q) cityHit = card;
            });
          });
        }
        if (cityHit) { window.location.href = cityHit.getAttribute('href'); return; }
        if (stateHit) {
          var opener = stateHit.querySelector('[data-dd-open]');
          var guide = stateHit.querySelector('a[href]:not([data-dd-open])');
          if (opener) {
            region = 'all';
            tabs.forEach(function (t) { t.setAttribute('aria-pressed', t.getAttribute('data-dd-region-tab') === 'all' ? 'true' : 'false'); });
            if (input) input.value = '';
            if (onlyCities) onlyCities.checked = false;
            apply();
            openPanel(opener.getAttribute('data-dd-open'), true);
            return;
          }
          if (guide) { window.location.href = guide.getAttribute('href'); return; }
        }
        if (input) input.value = text;
        apply();
        scrollTo(section);
      };

      var initial = section.getAttribute('data-dd-open-state');
      var fromHash = window.location.hash.indexOf('#dd-panel-') === 0 ? window.location.hash.replace('#dd-panel-', '') : '';
      openPanel(fromHash || initial || null, !!fromHash);
      apply();
    });
  }

  /* ---------- Hero search ---------- */

  function initHero(root) {
    root.querySelectorAll('[data-dd-hero-search]:not([data-ready])').forEach(function (form) {
      form.setAttribute('data-ready', '');
      form.addEventListener('submit', function (e) {
        var directory = document.querySelector('[data-dd-states]');
        if (!directory || !directory.ddFind) return;
        e.preventDefault();
        var field = form.querySelector('input[type="search"]');
        directory.ddFind(field ? field.value : '');
      });
    });
  }

  /* ---------- FAQ ---------- */

  function initFaq(root) {
    root.querySelectorAll('[data-dd-faq]:not([data-ready])').forEach(function (section) {
      section.setAttribute('data-ready', '');
      var input = section.querySelector('[data-dd-faq-search]');
      var groups = Array.prototype.slice.call(section.querySelectorAll('[data-dd-faq-group]'));
      var links = Array.prototype.slice.call(section.querySelectorAll('[data-dd-faq-link]'));
      var empty = section.querySelector('[data-dd-faq-empty]');

      if (input) {
        input.addEventListener('input', function () {
          var q = norm(input.value);
          var shown = 0;
          groups.forEach(function (group) {
            var any = false;
            group.querySelectorAll('[data-dd-faq-item]').forEach(function (item) {
              var ok = !q || norm(item.textContent).indexOf(q) !== -1;
              item.hidden = !ok;
              if (ok) { any = true; shown++; if (q) item.open = true; }
            });
            group.hidden = !any;
          });
          if (empty) empty.hidden = shown > 0;
        });
      }

      function setActive(id) {
        links.forEach(function (link) {
          var on = link.getAttribute('href') === '#' + id;
          link.classList.toggle('is-active', on);
          if (on) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
        });
      }

      links.forEach(function (link) {
        link.addEventListener('click', function (e) {
          var target = document.getElementById(link.getAttribute('href').slice(1));
          if (!target) return;
          e.preventDefault();
          if (input && input.value) { input.value = ''; input.dispatchEvent(new Event('input')); }
          setActive(target.id);
          scrollTo(target);
        });
      });

      if ('IntersectionObserver' in window && groups.length) {
        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) setActive(entry.target.id);
          });
        }, { rootMargin: '-25% 0px -65% 0px' });
        groups.forEach(function (group) { observer.observe(group); });
      }
    });
  }

  function init(root) {
    initStates(root || document);
    initHero(root || document);
    initFaq(root || document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
