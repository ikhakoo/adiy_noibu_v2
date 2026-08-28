//============================ # smooth scroll ==========================

document.addEventListener('DOMContentLoaded', function() {
  // Un sabhi anchor links ko target karein jo '#' se start hote hain
  const hashLinks = document.querySelectorAll('a[href*="#"]');

  hashLinks.forEach(function(link) {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
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
  });
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
    const qtyBtn = e.target.closest('.js-qty-btn');
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
    const addBtn = e.target.closest('.js-acc-add-to-cart');
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




  document.addEventListener('mouseover', (event) => {
    const li = event.target.closest('.header-menu-right li');
    if (li) {
      li.classList.add('active');
    }
  });

  document.addEventListener('mouseout', (event) => {
    const li = event.target.closest('.header-menu-right li');
    if (li) {
      li.classList.remove('active');
    }
  });



  document.addEventListener('DOMContentLoaded', () => {
  const cartDrawer = document.querySelector('cart-drawer');

  document.addEventListener('change', (event) => {
    if (event.target.classList.contains('quantity__input')) {
      const input = event.target;
      const lineKey = input.dataset.key || input.dataset.index;
      const newQuantity = parseInt(input.value, 10);

      updateCartQuantity(lineKey, newQuantity);
    }
  });

  function updateCartQuantity(lineKey, quantity) {
    const body = JSON.stringify({
      id: lineKey,
      quantity: quantity,
      sections: cartDrawer ? cartDrawer.getSectionsToRender().map((section) => section.id) : []
    });

    fetch(`${routes.cart_change_url}.js`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body
    })
    .then((response) => response.json())
    .then((parsedState) => {
      if (parsedState.errors) {
        alert(parsedState.errors);
        return;
      }

      // If using standard Shopify Dawn cart-drawer component
      if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
        cartDrawer.renderContents(parsedState);
      } else {
        // Fallback: Reload page or trigger Shopify cart update events
        window.location.reload();
      }
    })
    .catch((error) => {
      console.error('Error updating cart:', error);
    });
  }
});



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
const firstMenuItem = document.querySelector('#Details-menu-drawer-menu-item-1');
if (firstMenuItem) {
  firstMenuItem.setAttribute('open', '');
  firstMenuItem.classList.add('menu-opening');
  
  const summary = firstMenuItem.querySelector('summary');
  if (summary) {
    summary.setAttribute('aria-expanded', 'true');
  }
}


// end ================================




document.addEventListener("DOMContentLoaded", function () {
    // 1. #affirm link click trigger functionality
    document.addEventListener("click", function (event) {
      const linkTarget = event.target.closest('a[href*="#affirm"]');
      
      if (linkTarget) {
        event.preventDefault();
        const affirmTrigger = document.querySelector(".affirm-modal-trigger");
        if (affirmTrigger) {
          affirmTrigger.click();
        }
      }
    });

    // 2. Dynamic Price Synchronization Function
    function updateFinancingTitle() {
      const affirmPriceElement = document.querySelector(".affirm-ala-price");
      const dynamicTitleSpan = document.querySelector(".js-financing-dynamic-title");

      if (affirmPriceElement && dynamicTitleSpan) {
        const price = affirmPriceElement.textContent.trim();
        if (price) {
          // Dynamic calculated price inject ki ja rahi hai
          dynamicTitleSpan.textContent = `As Low As ${price}/Month With Affirm`;
        }
      }
    }

    // Direct Sync Check
    updateFinancingTitle();

    // Affirm JS async load hoti hai, isliye Observer dynamic DOM change monitor karega
    const affirmBlockContainer = document.querySelector(".affirm-as-low-as");
    if (affirmBlockContainer) {
      const observer = new MutationObserver(function() {
        updateFinancingTitle();
      });
      observer.observe(affirmBlockContainer, { childList: true, subtree: true });
    }
  });