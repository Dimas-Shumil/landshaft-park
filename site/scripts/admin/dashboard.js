'use strict';

(() => {
  const sidebar = document.querySelector('[data-admin-sidebar]');
  const overlay = document.querySelector('[data-sidebar-overlay]');
  const openButton = document.querySelector('[data-sidebar-open]');
  const closeButton = document.querySelector('[data-sidebar-close]');
  const logoutButton = document.querySelector('[data-admin-logout]');
  const adminName = document.querySelector('[data-admin-name]');
  const adminAvatar = document.querySelector('[data-admin-avatar]');
  const toast = document.querySelector('[data-admin-toast]');

  const metricCalculate = document.querySelector('[data-dashboard-calculate]');
  const metricOrders = document.querySelector('[data-dashboard-orders]');
  const metricProducts = document.querySelector('[data-dashboard-products]');
  const metricPublished = document.querySelector('[data-dashboard-published]');

  const activityBody = document.querySelector('[data-dashboard-activity]');
  const activityEmpty = document.querySelector('[data-dashboard-empty]');
  const statusNew = document.querySelector('[data-dashboard-status-new]');
  const statusProgress = document.querySelector('[data-dashboard-status-progress]');
  const statusConfirmed = document.querySelector(
    '[data-dashboard-status-confirmed]',
  );
  const statusTotal = document.querySelector('[data-dashboard-status-total]');

  const currencyFormatter = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  });

  const numberFormatter = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  });

  const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ORDER_STATUS_META = {
    NEW: { label: 'Новый', className: 'is-new' },
    CONFIRMED: { label: 'Подтверждён', className: 'is-confirmed' },
    COMPLETED: { label: 'Завершён', className: 'is-completed' },
    CANCELLED: { label: 'Отменён', className: 'is-cancelled' },
  };

  const CALCULATE_STATUS_META = {
    NEW: { label: 'Новая', className: 'is-new' },
    IN_PROGRESS: { label: 'В работе', className: 'is-progress' },
    COMPLETED: { label: 'Завершена', className: 'is-completed' },
    CANCELLED: { label: 'Отменена', className: 'is-cancelled' },
  };

  let csrfToken = '';
  let toastTimer = null;

  function setSidebar(open) {
    sidebar?.classList.toggle('is-open', open);
    overlay?.classList.toggle('is-visible', open);
    document.body.classList.toggle('admin-menu-open', open);
  }

  function showToast(message) {
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add('is-visible');

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  function applyUser(user) {
    const name = String(user?.name || 'Администратор').trim() || 'Администратор';

    if (adminName) {
      adminName.textContent = name;
    }

    if (adminAvatar) {
      adminAvatar.textContent = name.slice(0, 1).toUpperCase();
    }
  }

  function setText(element, value) {
    if (element) {
      element.textContent = String(value ?? '—');
    }
  }

  function getStatusMeta(item) {
    if (item.type === 'ORDER') {
      return (
        ORDER_STATUS_META[item.status] || {
          label: item.status || '—',
          className: '',
        }
      );
    }

    return (
      CALCULATE_STATUS_META[item.status] || {
        label: item.status || '—',
        className: '',
      }
    );
  }

  function formatActivityValue(item) {
    if (item.type === 'ORDER') {
      return currencyFormatter.format(Number(item.estimatedTotal) || 0);
    }

    if (item.area === null || item.area === undefined) {
      return '—';
    }

    return `${numberFormatter.format(Number(item.area))} м²`;
  }

  function createActivityRow(item) {
    const row = document.createElement('tr');
    const statusMeta = getStatusMeta(item);
    const createdAt = new Date(item.createdAt);

    if (!Number.isNaN(createdAt.getTime())) {
      row.title = `Создано: ${dateFormatter.format(createdAt)}`;
    }

    const numberCell = document.createElement('td');
    const detailHref =
      item.type === 'ORDER'
        ? `/admin/requests?open=order:${item.entityId}`
        : `/admin/requests?open=calculate:${item.entityId}`;
    const numberLink = document.createElement('a');
    numberLink.className = 'admin-request-number';
    numberLink.href = detailHref;
    numberLink.textContent = String(item.publicNumber || '—');
    numberCell.append(numberLink);

    const customerCell = document.createElement('td');
    const customer = document.createElement('span');
    customer.className = 'admin-table__customer';
    customer.textContent = String(item.customerName || '—');
    customerCell.append(customer);

    const typeCell = document.createElement('td');
    const typeBadge = document.createElement('span');
    typeBadge.className = 'admin-table__type';
    typeBadge.textContent = item.type === 'ORDER' ? 'Заказ' : 'Расчёт';
    typeCell.append(typeBadge);

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = ['admin-table__status', statusMeta.className]
      .filter(Boolean)
      .join(' ');
    statusBadge.textContent = statusMeta.label;
    statusCell.append(statusBadge);

    const valueCell = document.createElement('td');
    valueCell.textContent = formatActivityValue(item);

    row.append(numberCell, customerCell, typeCell, statusCell, valueCell);

    return row;
  }

  function renderRecentActivity(items) {
    if (!activityBody) {
      return;
    }

    activityBody.replaceChildren();

    const normalizedItems = Array.isArray(items) ? items : [];

    if (normalizedItems.length === 0) {
      if (activityEmpty) {
        activityEmpty.hidden = false;
      }
      return;
    }

    if (activityEmpty) {
      activityEmpty.hidden = true;
    }

    const fragment = document.createDocumentFragment();

    for (const item of normalizedItems) {
      fragment.append(createActivityRow(item));
    }

    activityBody.append(fragment);
  }

  function applyDashboard(payload) {
    const metrics = payload?.metrics || {};
    const statuses = payload?.statuses || {};

    setText(metricCalculate, metrics.newCalculateRequests ?? 0);
    setText(metricOrders, metrics.newOrders ?? 0);
    setText(metricProducts, metrics.totalProducts ?? 0);
    setText(metricPublished, metrics.publishedProducts ?? 0);

    setText(statusNew, statuses.new ?? 0);
    setText(statusProgress, statuses.inProgress ?? 0);
    setText(statusConfirmed, statuses.confirmed ?? 0);
    setText(statusTotal, statuses.total ?? 0);

    renderRecentActivity(payload?.recentActivity);
  }

  async function loadSession() {
    const response = await fetch('/api/admin/auth/session', {
      headers: {
        Accept: 'application/json',
      },
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      window.location.replace('/admin/login');
      return null;
    }

    if (!response.ok) {
      throw new Error('session_error');
    }

    const payload = await response.json();
    csrfToken = String(payload.csrfToken || '');
    applyUser(payload.user);

    return payload;
  }

  async function loadDashboard() {
    const response = await fetch('/api/admin/dashboard', {
      headers: {
        Accept: 'application/json',
      },
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      window.location.replace('/admin/login');
      return null;
    }

    if (!response.ok) {
      throw new Error('dashboard_error');
    }

    const payload = await response.json();
    applyDashboard(payload);

    return payload;
  }

  async function initializeDashboard() {
    try {
      const session = await loadSession();

      if (!session) {
        return;
      }

      await loadDashboard();
    } catch {
      showToast('Не удалось загрузить данные Dashboard.');
    }
  }

  async function logout() {
    if (!logoutButton || logoutButton.disabled) {
      return;
    }

    logoutButton.disabled = true;

    try {
      if (!csrfToken) {
        await loadSession();
      }

      const response = await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'same-origin',
      });

      if (!response.ok && response.status !== 401) {
        throw new Error('logout_error');
      }

      window.location.replace('/admin/login');
    } catch {
      logoutButton.disabled = false;
      showToast('Не удалось выйти. Попробуйте ещё раз.');
    }
  }

  openButton?.addEventListener('click', () => setSidebar(true));
  closeButton?.addEventListener('click', () => setSidebar(false));
  overlay?.addEventListener('click', () => setSidebar(false));
  logoutButton?.addEventListener('click', logout);

  document.querySelectorAll('[data-coming-soon]').forEach((button) => {
    button.addEventListener('click', () => {
      setSidebar(false);
      showToast('Раздел подключим на следующем подэтапе.');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setSidebar(false);
    }
  });

  initializeDashboard();
})();
