//============================ # INP helper ==========================

/*
 * Runs `fn` after the browser has had a chance to paint the current
 * interaction's visual response, instead of inside the click task itself.
 *
 * Third-party widgets (Affirm's modal, Gorgias' chat) do a lot of synchronous
 * work when they are opened. Calling them straight from a click handler adds
 * all of that to the interaction's processing time, which is what Core Web
 * Vitals measures as INP. Yielding first lets the frame commit, so the click
 * is recorded as fast and the widget still opens a few milliseconds later --
 * indistinguishable to the user.
 *
 * Anything that MUST stay synchronous (notably event.preventDefault(), which
 * has no effect once the handler has returned) has to run before this call.
 */
function runAfterPaint(fn) {
  if (window.scheduler && typeof window.scheduler.yield === 'function') {
    window.scheduler.yield().then(fn);
    return;
  }

  requestAnimationFrame(function () {
    setTimeout(fn, 0);
  });
}

//============================ # INP helper End ==========================


//============================ # event target helper ==========================

/*
 * `closest()` lives on Element. An event target is NOT always an element --
 * `document` is a common one, and mouse events can also land on non-element
 * nodes. Calling event.target.closest() directly therefore throws
 * "event.target.closest is not a function" (Noibu #441).
 *
 * Returns null instead of throwing when there is nothing sensible to match.
 */
function closestFromEvent(event, selector) {
  const target = event && event.target;
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(selector);
}

//============================ # event target helper End ==========================


//============================ # smooth scroll ==========================

/*
 * One delegated listener on the document instead of a listener per anchor.
 * The previous version ran document.querySelectorAll('a[href*="#"]') at
 * DOMContentLoaded and attached an individual handler to every match, which on
 * a page with a large nav and footer is hundreds of listeners to set up and
 * retain. Delegation also picks up anchors added to the page after load, which
 * the old version silently missed.
 */
document.addEventListener('click', function(e) {
  const link = closestFromEvent(e, 'a[href*="#"]');
  if (!link) return;

  const href = link.getAttribute('href');

  // Check karein k link mein '#' mojood hai aur sirf '#' nahi hai
  if (href && href.includes('#') && href !== '#') {
    const hashIndex = href.indexOf('#');
    const targetId = href.substring(hashIndex); // e.g. '#form'
    const targetElement = document.querySelector(targetId);

    if (targetElement) {
      // Agar hum same page par hain, to smooth scroll karain
      const currentPath = window.location.pathname;
      const linkPath = href.substring(0, hashIndex);

      if (linkPath === '' || linkPath === currentPath || href.startsWith('#')) {
        e.preventDefault();

        // Smooth Scroll with Header Offset (Agar fixed header ho to us se overlap na ho)
        const headerOffset = 80; // Aap apni header height k hisab se adjustment kar sakte hain (e.g. 0 ya 80)
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        // URL mein hash update karain bina page jump kiye
        history.pushState(null, null, targetId);
      }
    }
  }
});

//============================ # smooth scroll End ==========================


//============================ Review count daily basis announcement bar ==========================

document.addEventListener('DOMContentLoaded', function() {
  // Aapki settings (same date, base count aur increment)
  const startDate = new Date("2026-08-13"); // Yahan apni start date rakhein
  const baseCount = 1746;
  const dailyIncrement = 1;
  
  const today = new Date();
  const diffTime = Math.max(0, today - startDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  const currentCount = baseCount + (diffDays * dailyIncrement);
  
  // Jitni bhi jagah ye class hogi, sab me count auto update ho jaye ga
  const countElements = document.querySelectorAll('.dynamic-review-count-global, #dynamic-review-count');
  countElements.forEach(function(elem) {
    elem.textContent = currentCount.toLocaleString();
  });
});

//============================ Review count daily basis announcement bar END ==========================



document.addEventListener('DOMContentLoaded', () => {
  // Quantity Selector Plus/Minus Logic
  document.addEventListener('click', (e) => {
    const qtyBtn = closestFromEvent(e, '.js-qty-btn');
    if (!qtyBtn) return;

    const card = qtyBtn.closest('.js-accessory-card');
    const input = card.querySelector('.js-acc-qty-input');
    let currentVal = parseInt(input.value) || 1;

    if (qtyBtn.dataset.action === 'plus') {
      input.value = currentVal + 1;
    } else if (qtyBtn.dataset.action === 'minus' && currentVal > 1) {
      input.value = currentVal - 1;
    }
  });

  // AJAX Add To Cart Logic (Empty Cart Fix Included)
  document.addEventListener('click', async (e) => {
    const addBtn = closestFromEvent(e, '.js-acc-add-to-cart');
    if (!addBtn) return;

    const card = addBtn.closest('.js-accessory-card');
    const variantSelect = card.querySelector('.js-acc-variant-select');
    const qtyInput = card.querySelector('.js-acc-qty-input');

    const variantId = variantSelect ? variantSelect.value : null;
    const quantity = parseInt(qtyInput.value) || 1;

    if (!variantId) return;

    // UI Loading state
    addBtn.disabled = true;
    const btnText = addBtn.querySelector('.btn-text');
    const originalText = btnText ? btnText.textContent : 'Add To Cart';
    if (btnText) btnText.textContent = 'Adding...';

    const cartDrawer = document.querySelector('cart-drawer');
    const cartNotification = document.querySelector('cart-notification');

    // Sections required to re-render drawer & cart count
    const sectionsToFetch = cartDrawer
      ? cartDrawer.getSectionsToRender().map((section) => section.id)
      : ['cart-drawer', 'cart-icon-bubble'];

    const formData = {
      items: [
        {
          id: variantId,
          quantity: quantity
        }
      ],
      sections: sectionsToFetch
    };

    try {
      const response = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/javascript'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        // Clear empty state class from drawer if present
        if (cartDrawer) {
          cartDrawer.classList.remove('is-empty');

          // Render updated sections
          cartDrawer.renderContents(data);

          // Force open drawer safely
          if (typeof cartDrawer.open === 'function') {
            cartDrawer.open();
          } else {
            cartDrawer.classList.add('active');
          }
        } else if (cartNotification) {
          cartNotification.renderContents(data);
        } else {
          // Rebuy / Custom Drawer trigger
          document.dispatchEvent(new CustomEvent('cart:refresh'));
          document.dispatchEvent(new CustomEvent('cart:build'));
        }

        if (btnText) btnText.textContent = 'Added!';
      } else {
        alert(data.description || 'Error adding to cart');
        if (btnText) btnText.textContent = originalText;
      }
    } catch (error) {
      console.error('Cart Add Error:', error);
      if (btnText) btnText.textContent = originalText;
    } finally {
      setTimeout(() => {
        addBtn.disabled = false;
        if (btnText) btnText.textContent = originalText;
      }, 1500);
    }
  });
});



// product image slider

document.addEventListener('DOMContentLoaded', function () {
    // Swiper is only loaded on templates that need it (product gallery, mobile
    // banner). Bail out quietly everywhere else instead of throwing.
    if (typeof Swiper === 'undefined' || !document.querySelector('.custom-main-slider')) return;

    // 1. Initialize Main Slider without loop
    var mainSwiper = new Swiper(".custom-main-slider", {
      spaceBetween: 0,
      speed: 300, // Smooth transition speed
      navigation: {
        nextEl: ".swiper-button-next",
        prevEl: ".swiper-button-prev",
      },
    });

    // Variable to track currently active variant
    var currentActiveVariantId = null;

    function goToVariantSlide(variantId) {
      if (!variantId || variantId === currentActiveVariantId) return;

      var slides = document.querySelectorAll('.custom-main-slider .swiper-slide');
      var targetIndex = -1;

      slides.forEach(function(slide, index) {
        var variantIds = slide.getAttribute('data-variant-ids') || '';
        if (variantIds.split(',').includes(variantId.toString())) {
          targetIndex = index;
        }
      });

      if (targetIndex !== -1) {
        currentActiveVariantId = variantId;
        // Slide directly to target without step-by-step jump
        mainSwiper.slideTo(targetIndex, 300, false);
      }
    }

    // 2. Intercept Dawn Variant Change Instantly
    document.addEventListener('change', function(e) {
      var variantInput = document.querySelector('input[name="id"]');
      if (variantInput) {
        goToVariantSlide(variantInput.value);
      }
    });

    // 3. Listen to Dawn's Native Custom Event
    document.addEventListener('variant:change', function(event) {
      if (event.detail && event.detail.variant) {
        goToVariantSlide(event.detail.variant.id);
      }
    });

    // Initial Check on Page Load
    var initialVariantInput = document.querySelector('input[name="id"]');
    if (initialVariantInput) {
      goToVariantSlide(initialVariantInput.value);
    }
  });



//============================ # desktop nav hover ==========================

/*
 * These two run on every pointer move across every page, so they need to be
 * cheap and they must not throw. The previous version called
 * event.target.closest() directly, which threw whenever the pointer target was
 * not an element (Noibu #441).
 *
 * Behaviour is unchanged: hovering a `.header-menu-right li` adds `active`,
 * leaving it removes `active`. If the `.active` styles turn out to be a plain
 * hover state, both listeners can be deleted entirely in favour of a
 * `.header-menu-right li:hover` rule -- that is the better fix, but it needs
 * the stylesheet checked first.
 */
function setHeaderMenuActive(event, isActive) {
  const li = closestFromEvent(event, '.header-menu-right li');
  if (li) li.classList.toggle('active', isActive);
}

document.addEventListener('mouseover', (event) => setHeaderMenuActive(event, true));
document.addEventListener('mouseout', (event) => setHeaderMenuActive(event, false));

//============================ # desktop nav hover End ==========================



// ============================ cart quantity updates ============================
//
// A delegated `change` listener used to live here. It watched every
// `.quantity__input` on the page and POSTed to /cart/change.js as:
//
//     { id: input.dataset.key || input.dataset.index, quantity: n }
//
// `data-index` is the line NUMBER ("1", "2", ...). Shopify's `id` parameter
// expects a variant id or a line item key, so that request always failed:
//
//     422  {"status":422,"message":"Cart Error","description":"Cannot find variant"}
//
// Because assets/cart.js also listens for the same change event and sends the
// correct `{ line: "2", quantity: 3 }`, the update did go through -- but every
// single quantity change in the drawer fired a wasted 422 alongside it. That is
// Noibu issue #379 ("422 Unprocessable Entity", 422-a-diy.com/cart/change.js),
// which carries rage-click, refresh and back-button symptoms.
//
// Removed rather than repaired: CartItems / CartDrawerItems in assets/cart.js
// already own quantity changes for the drawer, including rejection handling,
// live-region announcements and focus management. Two handlers on one event was
// the underlying problem.
//
// ============================ end ============================



// ============================ open direct chat box popup from link with #chat at the end =================================

(function () {
  function openGorgiasChat() {
    if (window.location.hash !== '#chat') return;

    // Check karne ke liye max 10 seconds tak attempt karega
    let attempts = 0;
    const maxAttempts = 20; // 20 attempts * 500ms = 10 seconds

    const interval = setInterval(function () {
      attempts++;

      // Direct Gorgias API check
      if (window.GorgiasChat?.open) {
        window.GorgiasChat.open();
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 500);
  }

  // Page fully load hone par call karein
  if (document.readyState === 'complete') {
    openGorgiasChat();
  } else {
    window.addEventListener('load', openGorgiasChat);
  }

  // URL Hash change event
  window.addEventListener('hashchange', openGorgiasChat);
})();



// =========================================== auto on mobile mega menu  ===========================================
// const firstMenuItem = document.querySelector('#Details-menu-drawer-menu-item-1');
// if (firstMenuItem) {
//   firstMenuItem.setAttribute('open', '');
//   firstMenuItem.classList.add('menu-opening');
  
//   const summary = firstMenuItem.querySelector('summary');
//   if (summary) {
//     summary.setAttribute('aria-expanded', 'true');
//   }
// }


// ================================ end ================================



// =========================================== Open Affirm popup  (#affirm)  ===========================================

document.addEventListener("DOMContentLoaded", function () {
  // Puri website par kisi bhi link me jab '#affirm' Href aayega, us par click hone par popup trigger hoga
  document.addEventListener("click", function (event) {
    const linkTarget = closestFromEvent(event, 'a[href*="#affirm"]');

    if (linkTarget) {
      event.preventDefault(); // Default anchor anchor jump ko rokega -- must stay synchronous

      const affirmTrigger = document.querySelector(".affirm-modal-trigger");
      if (affirmTrigger) {
        // Forwarding the click to Affirm's own trigger runs the Affirm app's
        // modal code. Doing that inline made it part of this click's processing
        // time; yielding first lets the frame commit before Affirm starts.
        // The modal still opens, just after the paint.
        runAfterPaint(function () {
          affirmTrigger.click(); // Affirm app ke official modal trigger button par click simulate karega
        });
      }
    }
  });
});


// ================================ end ================================

  document.addEventListener('DOMContentLoaded', function () {
  const modal = document.getElementById('klarnaModal');
  const closeIcon = document.getElementById('klarnaCloseIcon');
  const closeBtn = document.getElementById('klarnaCloseBtn');

  // Remembers what opened the modal so focus can be handed back on close.
  let klarnaOpener = null;

  function openModal() {
    if (!modal) return;
    klarnaOpener = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-modal', 'true');
    // Without this the page keeps scrolling behind the open modal on a phone.
    document.body.classList.add('overflow-hidden');
    // Move focus into the dialog; trapFocus is Dawn's helper from global.js.
    if (typeof trapFocus === 'function') {
      trapFocus(modal, closeIcon || modal);
    } else if (closeIcon) {
      closeIcon.focus();
    }
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    modal.removeAttribute('aria-modal');
    document.body.classList.remove('overflow-hidden');
    if (typeof removeTrapFocus === 'function') {
      removeTrapFocus(klarnaOpener);
    } else if (klarnaOpener && klarnaOpener.focus) {
      klarnaOpener.focus();
    }
    klarnaOpener = null;
  }

  // Pure page par check karega jis link/button ke href me "#klarna" ho
  document.body.addEventListener('click', function (e) {
    const trigger = closestFromEvent(e, 'a[href*="#klarna"], button[href*="#klarna"], [data-href*="#klarna"]');
    if (trigger) {
      e.preventDefault();
      openModal();
    }
  });

  // Close events
  if (closeIcon) closeIcon.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  // Background click par close
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  // Keyboard Escape key press hone par close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeModal();
    }
  });
});


// =============================== end ==========================
