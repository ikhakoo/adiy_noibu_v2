const SCROLL_ANIMATION_TRIGGER_CLASSNAME = 'scroll-trigger';
const SCROLL_ANIMATION_OFFSCREEN_CLASSNAME = 'scroll-trigger--offscreen';
const SCROLL_ZOOM_IN_TRIGGER_CLASSNAME = 'animate--zoom-in';
const SCROLL_ANIMATION_CANCEL_CLASSNAME = 'scroll-trigger--cancel';

// The observer treats anything within 50px of the fold as still on screen. The
// value is needed twice - once to build the observer, once to work out whether
// a non-intersecting element is inside that band or genuinely out of view - so
// it lives here rather than being written inline into the rootMargin string.
const SCROLL_ANIMATION_OFFSCREEN_THRESHOLD = 50;

// Elements this observer has already shown.
//
// base.css paints .scroll-trigger content on its own: the opacity: 0.01 rules
// are outranked by .scroll-trigger:not(.scroll-trigger--offscreen)..., and
// scroll-trigger--offscreen is never in the server-rendered markup - it is only
// ever added below. So every element starts visible and this file's real job is
// to hide the ones the visitor has not reached yet, so they can animate in.
//
// That only makes sense the first time. Once an element has been on screen the
// visitor has seen it, and hiding it again to re-arm the animation reads as
// content popping out, not as a reveal.
const revealedScrollTriggers = new WeakSet();

// Whether an element is outside the real viewport, as opposed to merely outside
// the observer's inset root. entry.rootBounds already has the negative bottom
// rootMargin applied, so the last 50px of the screen reports as "not
// intersecting" while still being perfectly visible to the reader; adding the
// margin back gives the true fold.
function isOutsideViewport(entry) {
  const root = entry.rootBounds;

  // rootBounds is null when the document is in a cross-origin iframe. Without
  // it there is no way to tell an off-screen element from one sitting in the
  // margin band, so leave the element painted rather than risk hiding
  // something the visitor is looking at.
  if (!root) return false;

  const rect = entry.boundingClientRect;
  return rect.top >= root.bottom + SCROLL_ANIMATION_OFFSCREEN_THRESHOLD || rect.bottom <= root.top;
}

// Scroll in animation logic
function onIntersection(elements, observer) {
  elements.forEach((element, index) => {
    const elementTarget = element.target;

    if (element.isIntersecting) {
      revealedScrollTriggers.add(elementTarget);

      if (elementTarget.classList.contains(SCROLL_ANIMATION_OFFSCREEN_CLASSNAME)) {
        elementTarget.classList.remove(SCROLL_ANIMATION_OFFSCREEN_CLASSNAME);
        if (elementTarget.hasAttribute('data-cascade'))
          elementTarget.setAttribute('style', `--animation-order: ${index};`);
      }

      observer.unobserve(elementTarget);
      return;
    }

    // Not intersecting - but "not intersecting" is not the same as "the visitor
    // cannot see this". Skip anything already shown, and anything still inside
    // the real viewport, so nothing that has been painted is taken away again.
    if (revealedScrollTriggers.has(elementTarget) || !isOutsideViewport(element)) return;

    elementTarget.classList.add(SCROLL_ANIMATION_OFFSCREEN_CLASSNAME);
    elementTarget.classList.remove(SCROLL_ANIMATION_CANCEL_CLASSNAME);
  });
}

function initializeScrollAnimationTrigger(rootEl = document, isDesignModeEvent = false) {
  const animationTriggerElements = Array.from(rootEl.getElementsByClassName(SCROLL_ANIMATION_TRIGGER_CLASSNAME));
  if (animationTriggerElements.length === 0) return;

  if (isDesignModeEvent) {
    animationTriggerElements.forEach((element) => {
      element.classList.add('scroll-trigger--design-mode');
    });
    return;
  }

  const observer = new IntersectionObserver(onIntersection, {
    rootMargin: `0px 0px -${SCROLL_ANIMATION_OFFSCREEN_THRESHOLD}px 0px`,
  });
  animationTriggerElements.forEach((element) => observer.observe(element));
}

// Zoom in animation logic
function initializeScrollZoomAnimationTrigger() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const animationTriggerElements = Array.from(document.getElementsByClassName(SCROLL_ZOOM_IN_TRIGGER_CLASSNAME));

  if (animationTriggerElements.length === 0) return;

  const scaleAmount = 0.2 / 100;

  animationTriggerElements.forEach((element) => {
    let elementIsVisible = false;
    const observer = new IntersectionObserver((elements) => {
      elements.forEach((entry) => {
        elementIsVisible = entry.isIntersecting;
      });
    });
    observer.observe(element);

    element.style.setProperty('--zoom-in-ratio', 1 + scaleAmount * percentageSeen(element));

    window.addEventListener(
      'scroll',
      throttle(() => {
        if (!elementIsVisible) return;

        element.style.setProperty('--zoom-in-ratio', 1 + scaleAmount * percentageSeen(element));
      }),
      { passive: true }
    );
  });
}

function percentageSeen(element) {
  const viewportHeight = window.innerHeight;
  const scrollY = window.scrollY;
  const elementPositionY = element.getBoundingClientRect().top + scrollY;
  const elementHeight = element.offsetHeight;

  if (elementPositionY > scrollY + viewportHeight) {
    // If we haven't reached the image yet
    return 0;
  } else if (elementPositionY + elementHeight < scrollY) {
    // If we've completely scrolled past the image
    return 100;
  }

  // When the image is in the viewport
  const distance = scrollY + viewportHeight - elementPositionY;
  let percentage = distance / ((viewportHeight + elementHeight) / 100);
  return Math.round(percentage);
}

function initializeAnimations() {
  initializeScrollAnimationTrigger();
  initializeScrollZoomAnimationTrigger();
}

// This file is loaded with defer, so it usually runs while the document is
// still 'loading' and DOMContentLoaded is the right hook. It can also arrive
// after that event has already fired though - a bfcache restore, or the asset
// landing late on a slow connection - and waiting on an event that is already
// in the past left the observers never running at all, which is what made the
// hidden state look permanent. Check the parse state first and start straight
// away when the DOM is already there.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initializeAnimations);
} else {
  initializeAnimations();
}

if (Shopify.designMode) {
  document.addEventListener('shopify:section:load', (event) => initializeScrollAnimationTrigger(event.target, true));
  document.addEventListener('shopify:section:reorder', () => initializeScrollAnimationTrigger(document, true));
}
