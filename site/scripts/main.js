'use strict';

async function loadComponents() {
  const placeholders = document.querySelectorAll('[data-include]');

  await Promise.all(
    [...placeholders].map(async (placeholder) => {
      const componentPath = placeholder.dataset.include;

      try {
        const response = await fetch(componentPath);

        if (!response.ok) {
          throw new Error(`Не удалось загрузить: ${componentPath}`);
        }

        const html = await response.text();
        const template = document.createElement('template');

        template.innerHTML = html.trim();
        placeholder.replaceWith(template.content.cloneNode(true));
      } catch (error) {
        console.error(error);
      }
    }),
  );
}

function initHeader() {
  const header = document.querySelector('.header');
  const burger = document.querySelector('.header__burger');
  const menuLinks = document.querySelectorAll('.mobile-menu a');

  if (!header || !burger) return;

  const closeMenu = () => {
    header.classList.remove('is-active');
    document.body.classList.remove('lock');
    burger.setAttribute('aria-expanded', 'false');
  };

  burger.addEventListener('click', () => {
    const isActive = header.classList.toggle('is-active');

    if (isActive) {
      header.classList.remove('is-hidden');
    }

    document.body.classList.toggle('lock', isActive);
    burger.setAttribute('aria-expanded', String(isActive));
  });

  menuLinks.forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  });

  let lastScrollY = Math.max(window.scrollY, 0);
  let scrollTicking = false;

  const updateHeaderOnScroll = () => {
    const currentScrollY = Math.max(window.scrollY, 0);
    const scrollDelta = currentScrollY - lastScrollY;

    header.classList.toggle('is-scrolled', currentScrollY > 12);

    if (header.classList.contains('is-active') || currentScrollY <= 12) {
      header.classList.remove('is-hidden');
      lastScrollY = currentScrollY;
      scrollTicking = false;
      return;
    }

    if (Math.abs(scrollDelta) >= 6) {
      header.classList.toggle('is-hidden', scrollDelta > 0);
      lastScrollY = currentScrollY;
    }

    scrollTicking = false;
  };

  const handleHeaderScroll = () => {
    if (scrollTicking) return;

    scrollTicking = true;
    requestAnimationFrame(updateHeaderOnScroll);
  };

  updateHeaderOnScroll();
  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
}

function initHero() {
  const hero = document.querySelector('.hero');

  if (!hero) return;

  requestAnimationFrame(() => {
    hero.classList.add('is-loaded');
  });
}

function initSectionAnimations() {
  const sections = document.querySelectorAll(
    '.categories, .products, .desicion, .advantages, .production, .calculate',
  );

  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries, sectionObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-visible');
        sectionObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.2,
      rootMargin: '0px 0px -80px 0px',
    },
  );

  sections.forEach((section) => observer.observe(section));
}

function initFloatingCall() {
  const floatingCall = document.querySelector('.floating-call');

  if (!floatingCall) return;

  const handleFloatingCall = () => {
    floatingCall.classList.toggle('is-visible', window.scrollY > 20);
  };

  handleFloatingCall();
  window.addEventListener('scroll', handleFloatingCall, { passive: true });
}

// корзина

const CART_STORAGE_KEY = 'landshaftParkCart';

function getGlobalCart() {
  try {
    const rawCart = localStorage.getItem(CART_STORAGE_KEY);

    if (!rawCart) {
      return [];
    }

    const cart = JSON.parse(rawCart);

    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function updateGlobalCartCount() {
  const total = getGlobalCart().reduce((sum, item) => {
    const hasArea = Number(item.area) > 0;
    const unit = String(item.unit || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    const usesAreaPricing =
      hasArea && ['м²', 'м2', 'м^2', 'кв.м', 'кв.м.'].includes(unit);
    const quantity = usesAreaPricing
      ? 1
      : Math.max(1, Number(item.quantity) || 1);

    return sum + quantity;
  }, 0);

  document.querySelectorAll('[data-cart-count]').forEach((counter) => {
    counter.textContent = String(total);
    counter.hidden = total === 0;
  });
}

function initGlobalCartCounter() {
  updateGlobalCartCount();

  window.addEventListener('storage', (event) => {
    if (event.key === CART_STORAGE_KEY) {
      updateGlobalCartCount();
    }
  });

  window.addEventListener('cart:updated', updateGlobalCartCount);
}

// популярные товары

function formatProductPrice(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
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

function saveGlobalCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new Event('cart:updated'));
}

function getPopularProductVariant(product) {
  if (!Array.isArray(product?.variants) || product.variants.length === 0) {
    return null;
  }

  return product.variants.reduce((cheapestVariant, variant) => {
    if (!cheapestVariant) {
      return variant;
    }

    return Number(variant.price) < Number(cheapestVariant.price)
      ? variant
      : cheapestVariant;
  }, null);
}

function addPopularProductToCart(product, variant, button) {
  const cart = getGlobalCart();
  const existingItem = cart.find(
    (item) => Number(item.variantId) === Number(variant.id),
  );

  if (existingItem) {
    existingItem.quantity = (Number(existingItem.quantity) || 1) + 1;
  } else {
    cart.push({
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      name: product.name,
      variantName: variant.name,
      color: variant.color,
      thickness: variant.thickness,
      image: product.image?.path || '',
      price: variant.price,
      unit: product.unit,
      quantity: 1,
      area: null,
    });
  }

  saveGlobalCart(cart);

  if (!button) return;

  const originalText = button.textContent;

  button.textContent = 'Добавлено';
  button.classList.add('is-added');
  button.disabled = true;

  window.setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('is-added');
    button.disabled = false;
  }, 900);
}

function createPopularProductCard(product) {
  const variant = getPopularProductVariant(product);

  if (!variant || !Number.isFinite(Number(variant.price))) {
    return null;
  }

  const article = document.createElement('article');
  article.className = 'product-card';

  const productName = escapeHtml(product.name || 'Товар');
  const productSlug = encodeURIComponent(product.slug || '');
  const imagePath = escapeHtml(product.image?.path || '');
  const imageAlt = escapeHtml(product.image?.alt || product.name || 'Товар');

  const thickness =
    variant.thickness !== null && variant.thickness !== undefined
      ? `${escapeHtml(variant.thickness)} мм`
      : 'Толщина уточняется';

  const color = escapeHtml(variant.color || 'Цвет уточняется');
  const size = escapeHtml(product.size || 'Размер уточняется');
  const purpose = escapeHtml(product.purpose || 'Назначение уточняется');
  const unit = escapeHtml(product.unit || 'шт.');

  article.innerHTML = `
    <a
      href="/product?slug=${productSlug}"
      class="product-card__image"
      aria-label="${productName}"
    >
      ${
        imagePath
          ? `<img src="${imagePath}" alt="${imageAlt}" loading="lazy" />`
          : ''
      }
    </a>

    <div class="product-card__content">
      <h3>
        <a href="/product?slug=${productSlug}">${productName}</a>
      </h3>

      <p class="product-card__subtitle">${thickness} • ${color}</p>

      <ul class="product-card__list">
        <li>${size}</li>
        <li>${purpose}</li>
      </ul>

      <div class="product-card__price">
        от ${formatProductPrice(Number(variant.price))} ₽/${unit}
      </div>

      <button class="product-card__button" type="button">
        В корзину
      </button>
    </div>
  `;

  const button = article.querySelector('.product-card__button');

  button?.addEventListener('click', () => {
    addPopularProductToCart(product, variant, button);
  });

  return article;
}

function renderPopularProductsStatus(grid, message) {
  grid.innerHTML = '';

  const status = document.createElement('p');
  status.className = 'products__status';
  status.textContent = message;

  grid.appendChild(status);
}

async function initPopularProducts() {
  const grid = document.querySelector('[data-popular-products]');

  if (!grid) return;

  try {
    const response = await fetch('/api/catalog/products', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || 'Не удалось загрузить популярные товары.');
    }

    if (!Array.isArray(data.products)) {
      throw new Error('Сервер вернул некорректные данные каталога.');
    }

    const cards = data.products
      .slice(0, 4)
      .map(createPopularProductCard)
      .filter(Boolean);

    if (cards.length === 0) {
      renderPopularProductsStatus(grid, 'Популярные товары пока не добавлены.');
      return;
    }

    grid.innerHTML = '';
    cards.forEach((card) => grid.appendChild(card));
  } catch (error) {
    console.error('Ошибка загрузки популярных товаров:', error);
    renderPopularProductsStatus(
      grid,
      'Не удалось загрузить популярные товары. Обновите страницу позже.',
    );
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

// отправка формы

function initCalculateForm() {
  const form = document.querySelector('[data-calculate-form]');

  if (!form) return;

  const submitButton = form.querySelector('.calculate-form__button');

  if (!submitButton) return;

  let formStartedAt = Date.now();
  let formToken = '';
  let isSubmitting = false;

  const honeypot = document.createElement('input');
  honeypot.type = 'text';
  honeypot.name = 'company';
  honeypot.autocomplete = 'off';
  honeypot.tabIndex = -1;
  honeypot.hidden = true;
  honeypot.setAttribute('aria-hidden', 'true');
  form.appendChild(honeypot);

  let status = form.querySelector('[data-calculate-status]');

  if (!status) {
    status = document.createElement('p');
    status.className = 'calculate-form__status';
    status.dataset.calculateStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;

    submitButton.insertAdjacentElement('afterend', status);
  }

  const setStatus = (message, type = '') => {
    status.textContent = message;
    status.hidden = !message;

    status.classList.remove('is-success', 'is-error');

    if (type) {
      status.classList.add(`is-${type}`);
    }
  };

  const loadFormChallenge = async () => {
    const response = await fetch('/api/requests/calculate/challenge', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok || !data.formToken) {
      throw new Error('Не удалось подготовить форму. Обновите страницу.');
    }

    formToken = String(data.formToken);
    formStartedAt = Date.now();
  };

  loadFormChallenge().catch((error) => {
    console.error('Не удалось получить токен формы:', error);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setStatus('');

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!formToken) {
      setStatus(
        'Форма ещё загружается. Подождите пару секунд и попробуйте снова.',
        'error',
      );
      return;
    }

    const formData = new FormData(form);
    const areaValue = String(formData.get('area') || '').trim();
    const purposeValue = String(formData.get('purpose') || '').trim();

    const payload = {
      name: String(formData.get('name') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      area: areaValue ? Number(areaValue) : null,
      purpose: purposeValue || null,
      comment: String(formData.get('comment') || '').trim(),
      delivery: formData.get('delivery') === 'on',
      personalDataConsent:
        formData.get('personalDataConsent') === 'on',

      company: String(formData.get('company') || '').trim(),
      formToken,
      formElapsedMs: Date.now() - formStartedAt,
    };

    const originalButtonText = submitButton.textContent.trim();

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Отправляем...';

    try {
      const response = await fetch('/api/requests/calculate', {
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
        throw new Error(
          data.message || 'Не удалось отправить заявку. Попробуйте ещё раз.',
        );
      }

      form.reset();
      honeypot.value = '';
      formToken = '';

      loadFormChallenge().catch((error) => {
        console.error('Не удалось обновить токен формы:', error);
      });

      submitButton.textContent = 'Заявка отправлена';

      setStatus(
        'Спасибо! Заявка отправлена. Мы свяжемся с вами для уточнения расчёта.',
        'success',
      );

      window.setTimeout(() => {
        submitButton.textContent = originalButtonText;
      }, 1800);
    } catch (error) {
      submitButton.textContent = originalButtonText;
      formToken = '';

      loadFormChallenge().catch((challengeError) => {
        console.error('Не удалось обновить токен формы:', challengeError);
      });

      setStatus(
        error instanceof Error
          ? error.message
          : 'Не удалось отправить заявку. Попробуйте ещё раз.',
        'error',
      );
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
    }
  });
}

async function initApp() {
  await loadComponents();

  initHeader();
  initGlobalCartCounter();
  initHero();
  initSectionAnimations();
  initFloatingCall();
  initCalculateForm();
  initPopularProducts();
}

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch((error) => {
    console.error('Ошибка инициализации сайта:', error);
  });
});
