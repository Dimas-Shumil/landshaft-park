'use strict';

(() => {
  const CART_PAGE_STORAGE_KEY = 'landshaftParkCart';

  const cartContent = document.querySelector('[data-cart-content]');
  const cartItemsElement = document.querySelector('[data-cart-items]');
  const emptyState = document.querySelector('[data-cart-empty]');
  const linesElement = document.querySelector('[data-cart-lines]');
  const quantityElement = document.querySelector('[data-cart-quantity]');
  const totalElement = document.querySelector('[data-cart-total]');
  const checkoutButton = document.querySelector('[data-cart-checkout]');
  const checkoutSection = document.querySelector('[data-checkout-section]');
  const checkoutCloseButton = document.querySelector('[data-checkout-close]');
  const statusElement = document.querySelector('[data-cart-status]');

  if (
    !cartContent ||
    !cartItemsElement ||
    !emptyState ||
    !linesElement ||
    !quantityElement ||
    !totalElement
  ) {
    return;
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
  }

  function escapeHtml(value) {
    const symbols = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };

    return String(value ?? '').replace(/[&<>"']/g, (symbol) => symbols[symbol]);
  }

  function normalizeQuantity(value) {
    const quantity = Math.trunc(Number(value));

    if (!Number.isFinite(quantity)) {
      return 1;
    }

    return Math.min(999, Math.max(1, quantity));
  }

  function normalizeArea(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const area = Number(value);

    return Number.isFinite(area) && area > 0 ? area : null;
  }

  function getCart() {
    try {
      const rawCart = localStorage.getItem(CART_PAGE_STORAGE_KEY);

      if (!rawCart) {
        return [];
      }

      const parsedCart = JSON.parse(rawCart);

      if (!Array.isArray(parsedCart)) {
        return [];
      }

      return parsedCart
        .filter((item) => item && Number.isFinite(Number(item.variantId)))
        .map((item) => ({
          ...item,
          variantId: Number(item.variantId),
          productId: Number(item.productId) || null,
          quantity: normalizeQuantity(item.quantity),
          area: normalizeArea(item.area),
          price: Number(item.price) || 0,
        }));
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_PAGE_STORAGE_KEY, JSON.stringify(cart));
    window.dispatchEvent(new Event('cart:updated'));
  }

  function getItemKey(item) {
    const area = normalizeArea(item.area);

    return `${Number(item.variantId)}:${area ?? ''}`;
  }

  function findItemIndex(cart, key) {
    return cart.findIndex((item) => getItemKey(item) === key);
  }

  function getVariantMeta(item) {
    return [
      item.variantName,
      item.color,
      item.thickness ? `${item.thickness} мм` : '',
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index);
  }

  function setStatus(message) {
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message;

    window.clearTimeout(setStatus.timeoutId);

    if (message) {
      setStatus.timeoutId = window.setTimeout(() => {
        statusElement.textContent = '';
      }, 1800);
    }
  }

  function createCartItem(item) {
    const article = document.createElement('article');
    const itemKey = getItemKey(item);
    const productName = escapeHtml(item.name || 'Товар');
    const slug = encodeURIComponent(item.slug || '');
    const imagePath = escapeHtml(item.image || '');
    const unit = escapeHtml(item.unit || 'шт.');
    const variantMeta = getVariantMeta(item);
    const lineTotal = Number(item.price) * normalizeQuantity(item.quantity);

    article.className = 'cart-item';
    article.dataset.cartItemKey = itemKey;

    article.innerHTML = `
      <a
        class="cart-item__image"
        href="${item.slug ? `/product?slug=${slug}` : '/catalog'}"
        aria-label="${productName}"
      >
        ${
          imagePath
            ? `
              <img
                src="${imagePath}"
                alt="${productName}"
                loading="lazy"
              />
            `
            : `
              <div class="cart-item__placeholder">
                Изображение готовится
              </div>
            `
        }
      </a>

      <div class="cart-item__body">
        <div class="cart-item__main">
          <div>
            <p class="cart-item__label">Товар</p>
            <a
              class="cart-item__title"
              href="${item.slug ? `/product?slug=${slug}` : '/catalog'}"
            >
              ${productName}
            </a>
          </div>

          <button
            class="cart-item__remove"
            type="button"
            aria-label="Удалить ${productName} из корзины"
            data-cart-remove
          >
            Удалить
          </button>
        </div>

        ${
          variantMeta.length
            ? `
              <div class="cart-item__meta">
                ${variantMeta
                  .map((value) => `<span>${escapeHtml(value)}</span>`)
                  .join('')}
              </div>
            `
            : ''
        }

        ${
          item.area
            ? `
              <p class="cart-item__area">
                Площадь для расчёта:
                <strong>${escapeHtml(item.area)} м²</strong>
              </p>
            `
            : ''
        }

        <div class="cart-item__bottom">
          <div class="cart-item__quantity" aria-label="Количество товара">
            <button
              type="button"
              aria-label="Уменьшить количество"
              data-cart-decrease
            >
              −
            </button>

            <input
              type="number"
              min="1"
              max="999"
              step="1"
              inputmode="numeric"
              value="${normalizeQuantity(item.quantity)}"
              aria-label="Количество"
              data-cart-quantity-input
            />

            <button
              type="button"
              aria-label="Увеличить количество"
              data-cart-increase
            >
              +
            </button>
          </div>

          <div class="cart-item__price">
            <span>${formatPrice(item.price)} ₽/${unit}</span>
            <strong>${formatPrice(lineTotal)} ₽</strong>
          </div>
        </div>
      </div>
    `;

    return article;
  }

  function updateSummary(cart) {
    const totalQuantity = cart.reduce(
      (sum, item) => sum + normalizeQuantity(item.quantity),
      0,
    );

    const total = cart.reduce((sum, item) => {
      return sum + Number(item.price || 0) * normalizeQuantity(item.quantity);
    }, 0);

    linesElement.textContent = String(cart.length);
    quantityElement.textContent = String(totalQuantity);
    totalElement.textContent = `${formatPrice(total)} ₽`;
  }

  function renderCart() {
    const cart = getCart();
    const hasItems = cart.length > 0;

    cartContent.hidden = !hasItems;
    emptyState.hidden = hasItems;

    if (!hasItems) {
      cartItemsElement.innerHTML = '';
      checkoutSection?.setAttribute('hidden', '');
      updateSummary([]);
      return;
    }

    cartItemsElement.innerHTML = '';

    cart.forEach((item) => {
      cartItemsElement.append(createCartItem(item));
    });

    updateSummary(cart);
  }

  function changeQuantity(key, nextQuantity) {
    const cart = getCart();
    const itemIndex = findItemIndex(cart, key);

    if (itemIndex < 0) {
      renderCart();
      return;
    }

    cart[itemIndex].quantity = normalizeQuantity(nextQuantity);
    saveCart(cart);
    renderCart();
  }

  function removeItem(key) {
    const cart = getCart();
    const itemIndex = findItemIndex(cart, key);

    if (itemIndex < 0) {
      renderCart();
      return;
    }

    const [removedItem] = cart.splice(itemIndex, 1);

    saveCart(cart);
    renderCart();
    setStatus(`${removedItem?.name || 'Товар'} удалён из корзины`);
  }

  cartItemsElement.addEventListener('click', (event) => {
    const button = event.target.closest('button');

    if (!button) {
      return;
    }

    const itemElement = button.closest('[data-cart-item-key]');
    const key = itemElement?.dataset.cartItemKey;

    if (!key) {
      return;
    }

    const quantityInput = itemElement.querySelector('[data-cart-quantity-input]');
    const currentQuantity = normalizeQuantity(quantityInput?.value);

    if (button.matches('[data-cart-decrease]')) {
      changeQuantity(key, currentQuantity - 1);
      return;
    }

    if (button.matches('[data-cart-increase]')) {
      changeQuantity(key, currentQuantity + 1);
      return;
    }

    if (button.matches('[data-cart-remove]')) {
      removeItem(key);
    }
  });

  cartItemsElement.addEventListener('change', (event) => {
    const input = event.target.closest('[data-cart-quantity-input]');

    if (!input) {
      return;
    }

    const itemElement = input.closest('[data-cart-item-key]');
    const key = itemElement?.dataset.cartItemKey;

    if (!key) {
      return;
    }

    changeQuantity(key, input.value);
  });

  checkoutButton?.addEventListener('click', () => {
    if (!getCart().length || !checkoutSection) {
      return;
    }

    checkoutSection.hidden = false;
    checkoutSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  checkoutCloseButton?.addEventListener('click', () => {
    if (!checkoutSection) {
      return;
    }

    checkoutSection.hidden = true;
  });

  window.addEventListener('storage', (event) => {
    if (event.key === CART_PAGE_STORAGE_KEY) {
      renderCart();
    }
  });

  window.addEventListener('cart:updated', renderCart);

  renderCart();
})();
