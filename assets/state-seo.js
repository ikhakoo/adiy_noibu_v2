/* State SEO landing pages — small enhancements shared by sections/state-seo-*.liquid.
   1) Poster videos: swap the poster for the player on click (Shopify video, .mp4 or embed).
   2) Cities grid: "Load more cities" reveals the hidden cards (and any continuation section). */
(function () {
  'use strict';

  function initVideos(root) {
    root.querySelectorAll('[data-ss-video]:not([data-ready])').forEach(function (wrap) {
      wrap.setAttribute('data-ready', '');
      var play = wrap.querySelector('.ss-video__play');
      if (!play) return;
      play.addEventListener('click', function () {
        var player = wrap.querySelector('.ss-video__player');
        var source = wrap.getAttribute('data-source');
        if (source === 'mp4' && !player.querySelector('video')) {
          var v = document.createElement('video');
          v.src = wrap.getAttribute('data-mp4');
          v.controls = true;
          v.playsInline = true;
          v.preload = 'auto';
          player.appendChild(v);
        } else if ((source === 'youtube' || source === 'vimeo') && !player.querySelector('iframe')) {
          var f = document.createElement('iframe');
          f.src = wrap.getAttribute('data-embed');
          f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
          f.setAttribute('allowfullscreen', '');
          f.setAttribute('title', play.getAttribute('aria-label') || 'Video');
          player.appendChild(f);
        }
        wrap.classList.add('is-playing');
        var video = player.querySelector('video');
        if (video) {
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
        }
      });
    });
  }

  function initCities(root) {
    root.querySelectorAll('[data-ss-cities-more]:not([data-ready])').forEach(function (btn) {
      btn.setAttribute('data-ready', '');
      btn.addEventListener('click', function () {
        var section = btn.closest('.ss-cities');
        if (section) {
          section.querySelectorAll('.ss-city.is-hidden').forEach(function (el) { el.classList.remove('is-hidden'); });
        }
        // Continuation sections (more than 50 cities) follow directly after this one.
        var next = section && section.closest('.shopify-section') ? section.closest('.shopify-section').nextElementSibling : null;
        while (next && next.querySelector('.ss-cities--continued')) {
          next.querySelector('.ss-cities--continued').classList.remove('is-hidden');
          next = next.nextElementSibling;
        }
        btn.parentElement.remove();
      });
    });
  }

  function init(root) {
    initVideos(root || document);
    initCities(root || document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
