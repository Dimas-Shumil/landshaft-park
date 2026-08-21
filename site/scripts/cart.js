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
  const orderForm = document.querySelector('[data-order-form]');
  const orderSubmitButton = document.querySelector('[data-order-submit]');
  const orderMessage = document.querySelector('[data-order-message]');
  const deliveryAddressField = document.querySelector('[data-delivery-address]');
  const orderSuccess = document.querySelector('[data-order-success]');
  const orderNumberElement = document.querySelector('[data-order-number]');
  const orderTotalElement = document.querySelector('[data-order-total]');
  const statusElement = document.querySelector('[data-cart-status]');

  let hasCompletedOrder = false;

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

  function isSquareMeterUnit(value) {
    const unit = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

    return ['м²', 'м2', 'м^2', 'кв.м', 'кв.м.'].includes(unit);
  }

  function usesAreaPricing(item) {
    return normalizeArea(item.area) !== null && isSquareMeterUnit(item.unit);
  }

  function getLineTotal(item) {
    const price = Number(item.price) || 0;
    const multiplier = usesAreaPricing(item)
      ? normalizeArea(item.area)
      : normalizeQuantity(item.quantity);

    return Math.round(price * Number(multiplier || 0));
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
        .map((item) => {
          const normalizedItem = {
            ...item,
            variantId: Number(item.variantId),
            productId: Number(item.productId) || null,
            quantity: normalizeQuantity(item.quantity),
            area: normalizeArea(item.area),
            price: Number(item.price) || 0,
          };

          if (usesAreaPricing(normalizedItem)) {
            normalizedItem.quantity = 1;
          }

          return normalizedItem;
        });
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

  function setOrderMessage(message, isError = false) {
    if (!orderMessage) {
      return;
    }

    orderMessage.textContent = message;
    orderMessage.classList.toggle('is-error', isError);
  }

  function createCartItem(item) {
    const article = document.createElement('article');
    const itemKey = getItemKey(item);
    const productName = escapeHtml(item.name || 'Товар');
    const slug = encodeURIComponent(item.slug || '');
    const imagePath = escapeHtml(item.image || '');
    const unit = escapeHtml(item.unit || 'шт.');
    const variantMeta = getVariantMeta(item);
    const lineTotal = getLineTotal(item);
    const areaPricing = usesAreaPricing(item);

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
          ${
            areaPricing
              ? `
                <div class="cart-item__pricing-basis">
                  <span>Расчёт по площади</span>
                  <strong>${escapeHtml(item.area)} м²</strong>
                </div>
              `
              : `
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
              `
          }

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
    const totalQuantity = cart.reduce((sum, item) => {
      return sum + (usesAreaPricing(item) ? 1 : normalizeQuantity(item.quantity));
    }, 0);

    const total = cart.reduce((sum, item) => sum + getLineTotal(item), 0);

    linesElement.textContent = String(cart.length);
    quantityElement.textContent = String(totalQuantity);
    totalElement.textContent = `${formatPrice(total)} ₽`;
  }

  function renderCart() {
    if (hasCompletedOrder) {
      cartContent.hidden = true;
      emptyState.hidden = true;
      checkoutSection?.setAttribute('hidden', '');
      orderSuccess?.removeAttribute('hidden');
      updateSummary([]);
      return;
    }

    orderSuccess?.setAttribute('hidden', '');

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

    if (usesAreaPricing(cart[itemIndex])) {
      cart[itemIndex].quantity = 1;
    } else {
      cart[itemIndex].quantity = normalizeQuantity(nextQuantity);
    }

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

  function updateDeliveryAddressState() {
    if (!orderForm || !deliveryAddressField) {
      return;
    }

    const method = orderForm.elements.fulfillmentMethod?.value;
    const addressInput = orderForm.elements.deliveryAddress;
    const needsAddress = method === 'DELIVERY';

    deliveryAddressField.hidden = !needsAddress;

    if (addressInput) {
      addressInput.required = needsAddress;
      addressInput.disabled = !needsAddress;

      if (!needsAddress) {
        addressInput.value = '';
      }
    }
  }

  async function submitOrder(event) {
    event.preventDefault();

    if (!orderForm || !orderSubmitButton) {
      return;
    }

    const cart = getCart();

    if (!cart.length) {
      setOrderMessage('Корзина пуста. Добавьте товары перед оформлением.', true);
      renderCart();
      return;
    }

    updateDeliveryAddressState();

    if (!orderForm.reportValidity()) {
      return;
    }

    const formData = new FormData(orderForm);
    const fulfillmentMethod = String(
      formData.get('fulfillmentMethod') || 'PICKUP',
    );

    const payload = {
      customer: {
        name: String(formData.get('name') || '').trim(),
        phone: String(formData.get('phone') || '').trim(),
        comment: String(formData.get('comment') || '').trim(),
        fulfillmentMethod,
        deliveryAddress:
          fulfillmentMethod === 'DELIVERY'
            ? String(formData.get('deliveryAddress') || '').trim()
            : '',
        personalDataConsent:
          formData.get('personalDataConsent') === 'on',
      },
      items: cart.map((item) => ({
        variantId: Number(item.variantId),
        quantity: usesAreaPricing(item) ? 1 : normalizeQuantity(item.quantity),
        area: normalizeArea(item.area),
      })),
    };

    const originalButtonText = orderSubmitButton.textContent;

    orderSubmitButton.disabled = true;
    orderSubmitButton.textContent = 'Отправляем заказ...';
    setOrderMessage('');

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.message || 'Не удалось отправить заказ.');
      }

      hasCompletedOrder = true;

      if (orderNumberElement) {
        orderNumberElement.textContent = data.order?.publicNumber || '—';
      }

      if (orderTotalElement) {
        orderTotalElement.textContent = `${formatPrice(
          data.order?.estimatedTotal,
        )} ₽`;
      }

      localStorage.removeItem(CART_PAGE_STORAGE_KEY);
      window.dispatchEvent(new Event('cart:updated'));

      renderCart();
      orderSuccess?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Ошибка оформления заказа:', error);
      setOrderMessage(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить заказ. Попробуйте ещё раз.',
        true,
      );
    } finally {
      orderSubmitButton.disabled = false;
      orderSubmitButton.textContent = originalButtonText;
    }
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
    updateDeliveryAddressState();
    checkoutSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  checkoutCloseButton?.addEventListener('click', () => {
    if (!checkoutSection) {
      return;
    }

    checkoutSection.hidden = true;
  });

  orderForm?.addEventListener('change', (event) => {
    if (event.target.matches('[name="fulfillmentMethod"]')) {
      updateDeliveryAddressState();
    }
  });

  orderForm?.addEventListener('submit', submitOrder);

  window.addEventListener('storage', (event) => {
    if (event.key === CART_PAGE_STORAGE_KEY) {
      renderCart();
    }
  });

  window.addEventListener('cart:updated', renderCart);

  updateDeliveryAddressState();
  renderCart();
})();
