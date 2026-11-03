/*
  RV deck landing page — click-to-play video for sections/rv-story.liquid.
  The poster renders first (no third-party iframe on load); a click swaps in the
  YouTube/Vimeo embed or the <template> holding the Shopify-hosted <video>.
  Any element with [data-rv-play="<id>"] (e.g. "Watch the Build Video") plays it too.
*/
(function () {
  if (window.__rvLandingInit) return;
  window.__rvLandingInit = true;

  function play(box) {
    if (!box || box.dataset.playing === 'true') return;
    var embed = box.dataset.embed;
    var tpl = box.querySelector('template');
    var node = null;

    if (embed) {
      node = document.createElement('iframe');
      node.src = embed;
      node.title = box.dataset.title || 'Video';
      node.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      node.allowFullscreen = true;
    } else if (tpl) {
      node = tpl.content.firstElementChild.cloneNode(true);
    }
    if (!node) return;

    box.dataset.playing = 'true';
    var btn = box.querySelector('.rv-video__play');
    if (btn) btn.remove();
    box.appendChild(node);
    if (node.tagName === 'VIDEO') {
      var p = node.play();
      if (p && p.catch) p.catch(function () {});
    }
    if (typeof node.focus === 'function') node.focus({ preventScroll: true });
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
})();
