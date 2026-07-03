document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.header');
  const burger = document.querySelector('.header__burger');
  const menuLinks = document.querySelectorAll('.mobile-menu a');

  const closeMenu = () => {
    if (!header || !burger) return;

    header.classList.remove('is-active');
    document.body.classList.remove('lock');
    burger.setAttribute('aria-expanded', 'false');
  };

  if (header && burger) {
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

  const hero = document.querySelector('.hero');

  if (hero) {
    window.addEventListener('load', () => {
      requestAnimationFrame(() => {
        hero.classList.add('is-loaded');
      });
    });
  }

  const animatedSections = document.querySelectorAll('.categories, .products');

  if (animatedSections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.2,
        rootMargin: '0px 0px -80px 0px',
      },
    );

    animatedSections.forEach((section) => {
      sectionObserver.observe(section);
    });
  }

  const floatingCall = document.querySelector('.floating-call');

  if (floatingCall) {
    const handleFloatingCall = () => {
      floatingCall.classList.toggle('is-visible', window.scrollY > 20);
    };

    handleFloatingCall();
    window.addEventListener('scroll', handleFloatingCall);
  }
});
