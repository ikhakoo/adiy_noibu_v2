/*
  RV deck landing page — click-to-play video for sections/rv-story.liquid.
  The poster renders first (no third-party iframe on page load). To make the click
  feel instant:
  - when the video scrolls near the viewport the browser opens connections to
    YouTube ahead of time (preconnect);
  - on hover, touch or keyboard focus the player itself loads, hidden under the
    poster, so the click only presses play;
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

  function command(iframe, provider, func) {
    if (!iframe || !iframe.contentWindow) return;
    var msg = provider === 'vimeo'
      ? { method: func === 'playVideo' ? 'play' : func }
      : { event: 'command', func: func, args: [] };
    iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
  }

  // Build the player iframe ahead of the click (on hover/touch/focus intent) so the
  // click only has to press play. The iframe sits under the poster until then.
  function preload(box) {
    if (!box || box.__rvFrame || !box.dataset.embed) return box && box.__rvFrame;
    warm(box);
    var provider = box.dataset.provider;
    var src = box.dataset.embed.replace('autoplay=1', 'autoplay=0');
    src += (src.indexOf('?') > -1 ? '&' : '?') + (provider === 'vimeo' ? 'api=1' : 'enablejsapi=1&origin=' + encodeURIComponent(location.origin));
    var frame = document.createElement('iframe');
    frame.title = box.dataset.title || 'Video';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('tabindex', '-1');
    frame.addEventListener('load', function () {
      box.__rvLoaded = true;
      if (provider !== 'vimeo') {
        // Ask YouTube to report state changes so we can reveal on "playing".
        frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: box.id }), '*');
      }
      if (box.dataset.playing === 'true') start(box);
    });
    frame.src = src;
    box.insertBefore(frame, box.firstChild);
    box.__rvFrame = frame;
    return frame;
  }

  function start(box) {
    var frame = box.__rvFrame;
    command(frame, box.dataset.provider, 'playVideo');
    frame.removeAttribute('tabindex');
    // Reveal as soon as playback begins; fall back to a short delay.
    setTimeout(function () {
      reveal(box);
    }, 900);
  }

  function play(box) {
    if (!box || box.dataset.playing === 'true') return;
    box.dataset.playing = 'true';
    box.classList.add('is-loading');
    var btn = box.querySelector('.rv-video__play');
    if (btn) btn.setAttribute('tabindex', '-1');

    if (box.dataset.embed) {
      preload(box);
      if (box.__rvLoaded) start(box);
      // Never leave the poster up forever if a load event is missed.
      setTimeout(function () {
        reveal(box);
      }, 8000);
      return;
    }

    var tpl = box.querySelector('template');
    if (!tpl) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    node.addEventListener('playing', function () {
      reveal(box);
    });
    box.insertBefore(node, box.firstChild);
    setTimeout(function () {
      reveal(box);
    }, 6000);
    var p = node.play();
    if (p && p.catch) p.catch(function () {});
  }

  // YouTube reports playerState 1 when playing: reveal immediately.
  window.addEventListener('message', function (e) {
    if (!/youtube\.com$/.test((e.origin || '').replace(/^https?:\/\//, ''))) return;
    var data;
    try {
      data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch (err) {
      return;
    }
    if (!data || !data.info || data.info.playerState !== 1) return;
    document.querySelectorAll('.rv-video.is-loading').forEach(function (box) {
      if (box.__rvFrame && box.__rvFrame.contentWindow === e.source) reveal(box);
    });
  });

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
        var box = t.classList.contains('rv-video') ? t : document.getElementById(t.getAttribute('data-rv-play'));
        if (box) preload(box);
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
