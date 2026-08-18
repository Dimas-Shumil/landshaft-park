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
    const quantity = Math.max(1, Number(item.quantity) || 1);

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
}

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch((error) => {
    console.error('Ошибка инициализации сайта:', error);
  });
});
