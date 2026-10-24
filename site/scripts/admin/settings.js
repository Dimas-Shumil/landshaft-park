'use strict';

(() => {
  const sidebar = document.querySelector('[data-admin-sidebar]');
  const overlay = document.querySelector('[data-sidebar-overlay]');
  const logoutButton = document.querySelector('[data-admin-logout]');
  const adminName = document.querySelector('[data-admin-name]');
  const avatar = document.querySelector('[data-admin-avatar]');
  const toast = document.querySelector('[data-admin-toast]');
  let csrfToken = '';

  function setSidebar(open) {
    sidebar?.classList.toggle('is-open', open);
    overlay?.classList.toggle('is-visible', open);
    document.body.classList.toggle('admin-menu-open', open);
  }

  document.querySelector('[data-sidebar-open]')?.addEventListener('click', () => setSidebar(true));
  document.querySelector('[data-sidebar-close]')?.addEventListener('click', () => setSidebar(false));
  overlay?.addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebar(false);
  });

  async function loadSession() {
    const response = await fetch('/api/admin/auth/session', {
      credentials: 'same-origin', headers: { Accept: 'application/json' },
    });
    if (response.status === 401) {
      location.replace('/admin/login');
      return;
    }
    if (!response.ok) throw new Error('Не удалось проверить сессию администратора');
    const result = await response.json();
    csrfToken = String(result.csrfToken || '');
    const name = String(result.user?.name || 'Администратор').trim() || 'Администратор';
    if (adminName) adminName.textContent = name;
    if (avatar) avatar.textContent = name.slice(0, 1).toUpperCase();
  }

  async function logout() {
    if (!logoutButton || logoutButton.disabled) return;
    logoutButton.disabled = true;
    try {
      const response = await fetch('/api/admin/auth/logout', {
        method: 'POST', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) throw new Error('Не удалось выйти из аккаунта');
      location.replace('/admin/login');
    } catch (error) {
      logoutButton.disabled = false;
      if (toast) {
        toast.textContent = error.message || 'Ошибка выхода';
        toast.classList.add('is-visible');
      }
    }
  }

  logoutButton?.addEventListener('click', logout);
  loadSession().catch((error) => {
    if (toast) {
      toast.textContent = error.message || 'Ошибка загрузки настроек';
      toast.classList.add('is-visible');
    }
  });
})();
