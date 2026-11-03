/*
  RV deck landing page — click-to-play video for sections/rv-story.liquid.
  The poster renders first (no third-party iframe on page load). To make the click
  feel instant:
  - when the video scrolls near the viewport, or on hover/touch, the browser opens
    connections to YouTube ahead of time (preconnect);
  - on click the poster stays visible with a spinner while the player loads
    underneath, and only fades out once the player is ready, so there is never a
    black box.
  Any element with [data-rv-play="<id>"] (e.g. "Watch the Build Video") plays it too.
*/
(function () {
  if (window.__rvLandingInit) return;
  window.__rvLandingInit = true;

  var warmed = {};
  var ORIGINS = {
    youtube: [
      'https://www.youtube.com',
      'https://www.google.com',
      'https://i.ytimg.com',
      'https://googleads.g.doubleclick.net',
      'https://static.doubleclick.net',
      'https://jnn-pa.googleapis.com'
    ],
    vimeo: ['https://player.vimeo.com', 'https://i.vimeocdn.com', 'https://f.vimeocdn.com']
  };

  function warm(box) {
    var kind = box && box.dataset.provider;
    if (!kind || warmed[kind] || !ORIGINS[kind]) return;
    warmed[kind] = true;
    ORIGINS[kind].forEach(function (href) {
      var link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  function reveal(box) {
    box.classList.add('is-ready');
    var btn = box.querySelector('.rv-video__play');
    if (btn) {
      setTimeout(function () {
        btn.remove();
      }, 400);
    }
  }

  function play(box) {
    if (!box || box.dataset.playing === 'true') return;
    var embed = box.dataset.embed;
    var tpl = box.querySelector('template');
    var node = null;

    if (embed) {
      warm(box);
      node = document.createElement('iframe');
      node.title = box.dataset.title || 'Video';
      node.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      node.allowFullscreen = true;
      node.referrerPolicy = 'strict-origin-when-cross-origin';
      node.addEventListener('load', function () {
        reveal(box);
      });
      node.src = embed;
    } else if (tpl) {
      node = tpl.content.firstElementChild.cloneNode(true);
      node.addEventListener('playing', function () {
        reveal(box);
      });
      node.addEventListener('loadeddata', function () {
        reveal(box);
      });
    }
    if (!node) return;

    box.dataset.playing = 'true';
    box.classList.add('is-loading');
    var btn = box.querySelector('.rv-video__play');
    if (btn) btn.setAttribute('tabindex', '-1');
    box.insertBefore(node, box.firstChild);

    // Never leave the poster up forever if a load event is missed.
    setTimeout(function () {
      reveal(box);
    }, 6000);

    if (node.tagName === 'VIDEO') {
      var p = node.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('.rv-video__play, [data-rv-play]');
    if (!trigger) return;
    var box = trigger.classList.contains('rv-video__play')
      ? trigger.closest('.rv-video')
      : document.getElementById(trigger.getAttribute('data-rv-play'));
    if (!box) return;
    e.preventDefault();
    if (trigger.hasAttribute('data-rv-play')) {
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    play(box);
  });

  ['pointerover', 'touchstart', 'focusin'].forEach(function (type) {
    document.addEventListener(
      type,
      function (e) {
        var t = e.target.closest && e.target.closest('.rv-video, [data-rv-play]');
        if (!t) return;
        warm(t.classList.contains('rv-video') ? t : document.getElementById(t.getAttribute('data-rv-play')));
      },
      { passive: true }
    );
  });

  function observe() {
    var boxes = document.querySelectorAll('.rv-video[data-provider]');
    if (!boxes.length) return;
    if (!('IntersectionObserver' in window)) {
      boxes.forEach(warm);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            warm(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '600px 0px' }
    );
    boxes.forEach(function (b) {
      io.observe(b);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();
