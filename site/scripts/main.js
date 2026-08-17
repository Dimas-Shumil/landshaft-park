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

  const handleHeaderScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 12);
  };

  handleHeaderScroll();
  window.addEventListener('scroll', handleHeaderScroll);
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
  window.addEventListener('scroll', handleFloatingCall);
}

async function initApp() {
  await loadComponents();

  initHeader();
  initHero();
  initSectionAnimations();
  initFloatingCall();
}

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch((error) => {
    console.error('Ошибка инициализации сайта:', error);
  });
});
