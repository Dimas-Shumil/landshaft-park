'use strict';

(() => {
  const sidebar = document.querySelector('[data-admin-sidebar]');
  const sidebarOverlay = document.querySelector('[data-sidebar-overlay]');
  const sidebarOpen = document.querySelector('[data-sidebar-open]');
  const sidebarClose = document.querySelector('[data-sidebar-close]');
  const logoutButton = document.querySelector('[data-admin-logout]');
  const adminName = document.querySelector('[data-admin-name]');
  const adminAvatar = document.querySelector('[data-admin-avatar]');
  const toast = document.querySelector('[data-admin-toast]');

  const tabs = [...document.querySelectorAll('[data-request-type]')];
  const searchInput = document.querySelector('[data-request-search]');
  const statusSelect = document.querySelector('[data-request-status]');
  const refreshButton = document.querySelector('[data-requests-refresh]');
  const requestsBody = document.querySelector('[data-requests-body]');
  const requestsLoading = document.querySelector('[data-requests-loading]');
  const requestsEmpty = document.querySelector('[data-requests-empty]');
  const countAll = document.querySelector('[data-count-all]');
  const countOrders = document.querySelector('[data-count-orders]');
  const countCalculate = document.querySelector('[data-count-calculate]');
  const paginationInfo = document.querySelector('[data-pagination-info]');
  const pagePrev = document.querySelector('[data-page-prev]');
  const pageNext = document.querySelector('[data-page-next]');

  const detailOverlay = document.querySelector('[data-detail-overlay]');
  const detailPanel = document.querySelector('[data-detail-panel]');
  const detailKicker = document.querySelector('[data-detail-kicker]');
  const detailNumber = document.querySelector('[data-detail-number]');
  const detailDate = document.querySelector('[data-detail-date]');
  const detailBody = document.querySelector('[data-detail-body]');
  const detailLoading = document.querySelector('[data-detail-loading]');
  const detailFooter = document.querySelector('[data-detail-footer]');
  const detailSave = document.querySelector('[data-detail-save]');
  const detailCloseButtons = [
    document.querySelector('[data-detail-close]'),
    document.querySelector('[data-detail-close-secondary]'),
  ].filter(Boolean);

  const state = {
    type: 'ALL',
    status: '',
    q: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    csrfToken: '',
    currentDetail: null,
    searchTimer: null,
    toastTimer: null,
    requestSerial: 0,
  };

  const ORDER_STATUS_META = {
    NEW: { label: 'Новый', className: 'is-new' },
    IN_PROGRESS: { label: 'В обработке', className: 'is-progress' },
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

  const PURPOSE_LABELS = {
    paths: 'Дорожки и зоны отдыха',
    parking: 'Въезд и парковка',
    garden: 'Сад и декоративные элементы',
    commercial: 'Коммерческое благоустройство',
    other: 'Другое',
  };

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

  function element(tagName, className, text) {
    const node = document.createElement(tagName);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = String(text);
    }

    return node;
  }

  function setSidebar(open) {
    sidebar?.classList.toggle('is-open', open);
    sidebarOverlay?.classList.toggle('is-visible', open);
    document.body.classList.toggle('admin-menu-open', open);
  }

  function showToast(message, variant = 'default') {
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.toggle('is-error', variant === 'error');
    toast.classList.add('is-visible');

    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3200);
  }

  function applyUser(user) {
    const name =
      String(user?.name || 'Администратор').trim() || 'Администратор';

    if (adminName) {
      adminName.textContent = name;
    }

    if (adminAvatar) {
      adminAvatar.textContent = name.slice(0, 1).toUpperCase();
    }
  }

  function getStatusMeta(item) {
    const source =
      item.type === 'ORDER' ? ORDER_STATUS_META : CALCULATE_STATUS_META;

    return (
      source[item.status] || {
        label: item.status || '—',
        className: '',
      }
    );
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return number > 0 ? currencyFormatter.format(number) : 'Цена по запросу';
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? numberFormatter.format(number) : '—';
  }

  function isSquareMeterUnit(value) {
    const unit = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

    return ['м²', 'м2', 'м^2', 'кв.м', 'кв.м.'].includes(unit);
  }

  async function readResponseMessage(response, fallback) {
    try {
      const payload = await response.json();
      return String(payload?.message || fallback);
    } catch {
      return fallback;
    }
  }

  async function loadSession() {
    const response = await fetch('/api/admin/auth/session', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      window.location.replace('/admin/login');
      return null;
    }

    if (!response.ok) {
      throw new Error('Не удалось проверить сессию.');
    }

    const payload = await response.json();
    state.csrfToken = String(payload.csrfToken || '');
    applyUser(payload.user);

    return payload;
  }

  async function logout() {
    if (!logoutButton || logoutButton.disabled) {
      return;
    }

    logoutButton.disabled = true;

    try {
      if (!state.csrfToken) {
        await loadSession();
      }

      const response = await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': state.csrfToken,
        },
        credentials: 'same-origin',
      });

      if (!response.ok && response.status !== 401) {
        throw new Error('logout_error');
      }

      window.location.replace('/admin/login');
    } catch {
      logoutButton.disabled = false;
      showToast('Не удалось выйти. Попробуйте ещё раз.', 'error');
    }
  }

  function setListLoading(loading) {
    requestsLoading?.toggleAttribute('hidden', !loading);
    refreshButton?.classList.toggle('is-loading', loading);
    if (refreshButton) {
      refreshButton.disabled = loading;
    }
  }

  function createStatusBadge(item) {
    const meta = getStatusMeta(item);
    const badge = element(
      'span',
      `admin-table__status ${meta.className}`.trim(),
    );
    badge.textContent = meta.label;
    return badge;
  }

  function createRequestRow(item) {
    const row = document.createElement('tr');
    row.className = 'admin-requests-table__row';
    row.tabIndex = 0;
    row.dataset.type = item.type;
    row.dataset.id = String(item.id);

    const numberCell = element('td');
    const number = element(
      'strong',
      'admin-request-number',
      item.publicNumber || '—',
    );
    numberCell.append(number);

    const dateCell = element('td', '', formatDate(item.createdAt));

    const customerCell = element('td');
    customerCell.append(
      element('span', 'admin-table__customer', item.customerName || '—'),
    );

    const typeCell = element('td');
    typeCell.append(
      element(
        'span',
        'admin-table__type',
        item.type === 'ORDER' ? 'Заказ' : 'Расчёт',
      ),
    );

    const statusCell = element('td');
    statusCell.append(createStatusBadge(item));

    const valueCell = element('td');
    if (item.type === 'ORDER') {
      const finalValue =
        item.confirmedTotal === null || item.confirmedTotal === undefined
          ? item.estimatedTotal
          : item.confirmedTotal;
      valueCell.textContent = formatCurrency(finalValue);
    } else {
      valueCell.textContent =
        item.area === null || item.area === undefined
          ? '—'
          : `${formatNumber(item.area)} м²`;
    }

    const phoneCell = element('td');
    const phoneLink = element('a', 'admin-request-phone', item.phone || '—');
    phoneLink.href = `tel:${String(item.phone || '').replace(/[^+\d]/g, '')}`;
    phoneLink.addEventListener('click', (event) => event.stopPropagation());
    phoneCell.append(phoneLink);

    const actionCell = element('td');
    const actionButton = element('button', 'admin-row-action');
    actionButton.type = 'button';
    actionButton.setAttribute('aria-label', 'Открыть обращение');
    actionButton.textContent = '›';

    actionButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openDetail(item.type, item.id);
    });

    const deleteButton = element('button', 'admin-row-delete', 'Удалить');

    deleteButton.type = 'button';

    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();

      if (item.type !== 'ORDER') {
        showToast('Удаление заявок пока не добавлено.', 'error');
        return;
      }

      const confirmed = window.confirm(`Удалить заказ ${item.publicNumber}?`);

      if (!confirmed) {
        return;
      }

      await deleteOrder(item.id);
    });
    actionButton.addEventListener('click', (event) => {
      event.stopPropagation();
      openDetail(item.type, item.id);
    });
    const actions = element('div', 'admin-row-actions');

    actions.append(deleteButton, actionButton);

    actionCell.append(actions);

    row.append(
      numberCell,
      dateCell,
      customerCell,
      typeCell,
      statusCell,
      valueCell,
      phoneCell,
      actionCell,
    );

    const open = () => openDetail(item.type, item.id);
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    return row;
  }

  function renderRequests(payload) {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const counts = payload?.counts || {};
    const pagination = payload?.pagination || {};

    state.total = Number(pagination.total) || 0;
    state.totalPages = Math.max(1, Number(pagination.totalPages) || 1);
    state.page = Math.min(
      Math.max(1, Number(pagination.page) || 1),
      state.totalPages,
    );

    if (countAll) countAll.textContent = String(counts.all ?? 0);
    if (countOrders) countOrders.textContent = String(counts.orders ?? 0);
    if (countCalculate)
      countCalculate.textContent = String(counts.calculateRequests ?? 0);

    requestsBody?.replaceChildren();

    if (requestsEmpty) {
      requestsEmpty.hidden = items.length !== 0;
    }

    if (items.length > 0 && requestsBody) {
      const fragment = document.createDocumentFragment();
      for (const item of items) {
        fragment.append(createRequestRow(item));
      }
      requestsBody.append(fragment);
    }

    if (paginationInfo) {
      if (state.total === 0) {
        paginationInfo.textContent = '0 обращений';
      } else {
        const from = (state.page - 1) * state.limit + 1;
        const to = Math.min(state.page * state.limit, state.total);
        paginationInfo.textContent = `${from}–${to} из ${state.total}`;
      }
    }

    if (pagePrev) pagePrev.disabled = state.page <= 1;
    if (pageNext) pageNext.disabled = state.page >= state.totalPages;
  }

  async function loadRequests({ quiet = false } = {}) {
    const serial = ++state.requestSerial;

    if (!quiet) {
      setListLoading(true);
    }

    const params = new URLSearchParams({
      type: state.type,
      page: String(state.page),
      limit: String(state.limit),
    });

    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);

    try {
      const response = await fetch(`/api/admin/requests?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });

      if (response.status === 401) {
        window.location.replace('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error(
          await readResponseMessage(
            response,
            'Не удалось загрузить обращения.',
          ),
        );
      }

      const payload = await response.json();

      if (serial !== state.requestSerial) {
        return;
      }

      renderRequests(payload);
    } catch (error) {
      if (serial === state.requestSerial) {
        showToast(error.message || 'Не удалось загрузить обращения.', 'error');
      }
    } finally {
      if (!quiet && serial === state.requestSerial) {
        setListLoading(false);
      }
    }
  }

  function setDetailOpen(open) {
    detailPanel?.classList.toggle('is-open', open);
    detailOverlay?.classList.toggle('is-visible', open);
    detailPanel?.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('admin-detail-open', open);
  }

  function setOpenQuery(type, id) {
    const url = new URL(window.location.href);
    const value = type === 'ORDER' ? `order:${id}` : `calculate:${id}`;
    url.searchParams.set('open', value);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  function clearOpenQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  function closeDetail() {
    state.currentDetail = null;
    setDetailOpen(false);
    clearOpenQuery();
  }

  function setDetailLoading(loading) {
    detailLoading?.toggleAttribute('hidden', !loading);
    if (detailFooter) detailFooter.hidden = loading;
    if (detailSave) detailSave.disabled = loading;
  }

  function detailSection(title) {
    const section = element('section', 'admin-detail-section');
    section.append(element('h3', '', title));
    return section;
  }

  function appendDetailValue(container, label, value, options = {}) {
    const item = element('div', 'admin-detail-field');
    item.append(element('span', '', label));

    if (options.href) {
      const link = element('a', '', value || '—');
      link.href = options.href;
      item.append(link);
    } else {
      item.append(element('strong', '', value ?? '—'));
    }

    container.append(item);
  }

  function createManagementSelect(label, options, value, dataAttribute) {
    const field = element('label', 'admin-manage-field');
    field.append(element('span', '', label));
    const select = document.createElement('select');
    select.setAttribute(dataAttribute, '');

    for (const option of options) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.value === value;
      select.append(node);
    }

    field.append(select);
    return field;
  }

  function createManagementInput(label, value, dataAttribute, config = {}) {
    const field = element('label', 'admin-manage-field');
    field.append(element('span', '', label));
    const input = document.createElement('input');
    input.setAttribute(dataAttribute, '');
    input.type = config.type || 'text';
    if (config.min !== undefined) input.min = String(config.min);
    if (config.max !== undefined) input.max = String(config.max);
    if (config.step !== undefined) input.step = String(config.step);
    input.value = value === null || value === undefined ? '' : String(value);
    input.placeholder = config.placeholder || '';
    field.append(input);
    return field;
  }

  function createCommentField(value) {
    const field = element(
      'label',
      'admin-manage-field admin-manage-field--wide',
    );
    field.append(element('span', '', 'Внутренний комментарий'));
    const textarea = document.createElement('textarea');
    textarea.dataset.internalComment = '';
    textarea.maxLength = 3000;
    textarea.rows = 4;
    textarea.placeholder = 'Заметка для менеджера — клиент её не видит';
    textarea.value = String(value || '');
    field.append(textarea);
    return field;
  }

  function updateOrderItemUi(card) {
    const availability = card.querySelector('[data-item-availability]');
    const quantity = card.querySelector('[data-item-quantity]');
    const area = card.querySelector('[data-item-area]');
    const price = card.querySelector('[data-item-price]');
    const total = card.querySelector('[data-item-confirmed-total]');
    const usesArea = card.dataset.usesArea === 'true';
    const available = availability?.value === 'true';

    for (const input of [quantity, area, price]) {
      if (input) input.disabled = !available;
    }

    if (!available) {
      if (total) total.textContent = '—';
      return;
    }

    const unitPrice = Number(price?.value);
    const multiplier = Number(usesArea ? area?.value : quantity?.value);

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0 ||
      !Number.isFinite(multiplier) ||
      multiplier <= 0
    ) {
      if (total) total.textContent = '—';
      return;
    }

    if (total) {
      total.textContent = formatCurrency(Math.round(unitPrice * multiplier));
    }
  }

  function createOrderItemCard(item) {
    const card = element('article', 'admin-order-item');
    card.dataset.orderItemId = String(item.id);
    const usesArea =
      isSquareMeterUnit(item.unitSnapshot) && item.requestedArea !== null;
    card.dataset.usesArea = String(usesArea);

    const top = element('div', 'admin-order-item__top');
    const titleWrap = element('div');
    titleWrap.append(
      element('strong', '', item.productTitleSnapshot || 'Товар'),
      element(
        'span',
        '',
        [item.variantNameSnapshot, item.colorSnapshot]
          .filter(Boolean)
          .join(' · ') || 'Стандарт',
      ),
    );
    top.append(
      titleWrap,
      element(
        'strong',
        'admin-order-item__estimate',
        formatCurrency(item.estimatedLineTotal),
      ),
    );
    card.append(top);

    const snapshot = element('div', 'admin-order-item__snapshot');
    appendDetailValue(
      snapshot,
      'Цена из заказа',
      `${formatCurrency(item.unitPriceSnapshot)} / ${item.unitSnapshot || 'шт.'}`,
    );
    appendDetailValue(
      snapshot,
      'Количество',
      formatNumber(item.requestedQuantity),
    );
    if (item.requestedArea !== null) {
      appendDetailValue(
        snapshot,
        'Площадь',
        `${formatNumber(item.requestedArea)} м²`,
      );
    }
    if (item.thicknessMmSnapshot !== null) {
      appendDetailValue(snapshot, 'Толщина', `${item.thicknessMmSnapshot} мм`);
    }
    if (item.dimensionsSnapshot) {
      appendDetailValue(snapshot, 'Размер', item.dimensionsSnapshot);
    }
    if (item.skuSnapshot) {
      appendDetailValue(snapshot, 'SKU', item.skuSnapshot);
    }
    card.append(snapshot);

    const controls = element('div', 'admin-order-item__controls');

    const availabilityField = element('label', 'admin-manage-field');
    availabilityField.append(element('span', '', 'Наличие'));
    const availability = document.createElement('select');
    availability.dataset.itemAvailability = '';
    const availabilityOptions = [
      { value: '', label: 'Не проверено' },
      { value: 'true', label: 'В наличии' },
      { value: 'false', label: 'Нет в наличии' },
    ];
    const currentAvailability =
      item.isAvailable === true
        ? 'true'
        : item.isAvailable === false
          ? 'false'
          : '';
    for (const option of availabilityOptions) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.value === currentAvailability;
      availability.append(node);
    }
    availabilityField.append(availability);
    controls.append(availabilityField);

    const quantityField = createManagementInput(
      'Подтв. количество',
      item.confirmedQuantity ?? item.requestedQuantity,
      'data-item-quantity',
      { type: 'number', min: 0.01, step: 0.01 },
    );
    controls.append(quantityField);

    if (usesArea) {
      controls.append(
        createManagementInput(
          'Подтв. площадь, м²',
          item.confirmedArea ?? item.requestedArea,
          'data-item-area',
          { type: 'number', min: 0.01, step: 0.01 },
        ),
      );
    }

    controls.append(
      createManagementInput(
        'Подтв. цена',
        item.confirmedUnitPrice ?? item.unitPriceSnapshot,
        'data-item-price',
        { type: 'number', min: 0, step: 1 },
      ),
    );

    const totalField = element('div', 'admin-order-item__confirmed-total');
    totalField.append(
      element('span', '', 'Подтверждённая сумма'),
      element('strong', '', '—'),
    );
    totalField.querySelector('strong').dataset.itemConfirmedTotal = '';
    controls.append(totalField);

    card.append(controls);

    availability.addEventListener('change', () => updateOrderItemUi(card));
    controls.addEventListener('input', () => updateOrderItemUi(card));
    updateOrderItemUi(card);

    return card;
  }

  function renderOrderDetail(order) {
    if (!detailBody) return;
    detailBody.replaceChildren();

    const clientSection = detailSection('Клиент и получение');
    const clientGrid = element('div', 'admin-detail-grid');
    appendDetailValue(clientGrid, 'Клиент', order.customerName || '—');
    appendDetailValue(clientGrid, 'Телефон', order.phone || '—', {
      href: `tel:${String(order.phone || '').replace(/[^+\d]/g, '')}`,
    });
    appendDetailValue(
      clientGrid,
      'Получение',
      order.fulfillmentMethod === 'DELIVERY' ? 'Доставка' : 'Самовывоз',
    );
    appendDetailValue(clientGrid, 'Источник', order.source || 'catalog');
    if (order.fulfillmentMethod === 'DELIVERY') {
      appendDetailValue(
        clientGrid,
        'Адрес',
        order.deliveryAddress || 'Не указан',
      );
    }
    clientSection.append(clientGrid);

    if (order.comment) {
      const note = element('div', 'admin-client-comment');
      note.append(
        element('span', '', 'Комментарий клиента'),
        element('p', '', order.comment),
      );
      clientSection.append(note);
    }

    const financeSection = detailSection('Стоимость');
    const totals = element('div', 'admin-detail-totals');
    const estimate = element('div');
    estimate.append(
      element('span', '', 'Предварительно'),
      element('strong', '', formatCurrency(order.estimatedTotal)),
    );
    const confirmed = element('div');
    confirmed.append(
      element('span', '', 'Подтверждено'),
      element(
        'strong',
        '',
        order.confirmedTotal === null
          ? 'Не указано'
          : formatCurrency(order.confirmedTotal),
      ),
    );
    totals.append(estimate, confirmed);
    financeSection.append(totals);

    const itemsSection = detailSection(
      `Позиции заказа · ${order.items.length}`,
    );
    const itemsWrap = element('div', 'admin-order-items');
    for (const item of order.items) {
      itemsWrap.append(createOrderItemCard(item));
    }
    itemsSection.append(itemsWrap);

    const manageSection = detailSection('Обработка заказа');
    const manageGrid = element('div', 'admin-manage-grid');
    manageGrid.append(
      createManagementSelect(
        'Статус',
        [
          { value: 'NEW', label: 'Новый' },
          { value: 'IN_PROGRESS', label: 'В обработке' },
          { value: 'CONFIRMED', label: 'Подтверждён' },
          { value: 'COMPLETED', label: 'Завершён' },
          { value: 'CANCELLED', label: 'Отменён' },
        ],
        order.status,
        'data-detail-status',
      ),
      createManagementInput(
        'Итоговая стоимость, ₽',
        order.confirmedTotal,
        'data-confirmed-total',
        { type: 'number', min: 0, step: 1, placeholder: 'Не подтверждена' },
      ),
      createCommentField(order.internalComment),
    );
    manageSection.append(manageGrid);

    detailBody.append(
      clientSection,
      financeSection,
      itemsSection,
      manageSection,
    );
  }

  function renderCalculateDetail(request) {
    if (!detailBody) return;
    detailBody.replaceChildren();

    const clientSection = detailSection('Данные клиента');
    const clientGrid = element('div', 'admin-detail-grid');
    appendDetailValue(clientGrid, 'Клиент', request.name || '—');
    appendDetailValue(clientGrid, 'Телефон', request.phone || '—', {
      href: `tel:${String(request.phone || '').replace(/[^+\d]/g, '')}`,
    });
    appendDetailValue(
      clientGrid,
      'Площадь',
      request.area === null ? 'Не указана' : `${formatNumber(request.area)} м²`,
    );
    appendDetailValue(
      clientGrid,
      'Назначение',
      PURPOSE_LABELS[request.purpose] || request.purpose || 'Не указано',
    );
    appendDetailValue(
      clientGrid,
      'Доставка',
      request.delivery ? 'Нужна' : 'Не нужна',
    );
    appendDetailValue(clientGrid, 'Источник', request.source || 'website');
    clientSection.append(clientGrid);

    if (request.comment) {
      const note = element('div', 'admin-client-comment');
      note.append(
        element('span', '', 'Комментарий клиента'),
        element('p', '', request.comment),
      );
      clientSection.append(note);
    }

    const manageSection = detailSection('Обработка заявки');
    const manageGrid = element('div', 'admin-manage-grid');
    manageGrid.append(
      createManagementSelect(
        'Статус',
        [
          { value: 'NEW', label: 'Новая' },
          { value: 'IN_PROGRESS', label: 'В работе' },
          { value: 'COMPLETED', label: 'Завершена' },
          { value: 'CANCELLED', label: 'Отменена' },
        ],
        request.status,
        'data-detail-status',
      ),
      createCommentField(request.internalComment),
    );
    manageSection.append(manageGrid);

    detailBody.append(clientSection, manageSection);
  }

  function renderDetail(type, data) {
    state.currentDetail = { type, id: data.id, data };
    if (detailKicker)
      detailKicker.textContent =
        type === 'ORDER' ? 'Заказ' : 'Заявка на расчёт';
    if (detailNumber) detailNumber.textContent = data.publicNumber || '—';
    if (detailDate)
      detailDate.textContent = `Создано ${formatDate(data.createdAt)}`;

    if (type === 'ORDER') {
      renderOrderDetail(data);
    } else {
      renderCalculateDetail(data);
    }

    if (detailFooter) detailFooter.hidden = false;
  }

  async function openDetail(type, id, { updateUrl = true } = {}) {
    const normalizedType = type === 'ORDER' ? 'ORDER' : 'CALCULATE_REQUEST';
    const path =
      normalizedType === 'ORDER'
        ? `/api/admin/requests/orders/${id}`
        : `/api/admin/requests/calculate/${id}`;

    if (updateUrl) setOpenQuery(normalizedType, id);
    setDetailOpen(true);
    setDetailLoading(true);

    if (detailBody && detailLoading) {
      detailBody.replaceChildren(detailLoading);
    }
    if (detailKicker)
      detailKicker.textContent =
        normalizedType === 'ORDER' ? 'Заказ' : 'Заявка на расчёт';
    if (detailNumber) detailNumber.textContent = 'Загрузка…';
    if (detailDate) detailDate.textContent = '';

    try {
      const response = await fetch(path, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });

      if (response.status === 401) {
        window.location.replace('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error(
          await readResponseMessage(response, 'Не удалось открыть обращение.'),
        );
      }

      const payload = await response.json();
      renderDetail(
        normalizedType,
        normalizedType === 'ORDER' ? payload.order : payload.request,
      );
    } catch (error) {
      showToast(error.message || 'Не удалось открыть обращение.', 'error');
      closeDetail();
    } finally {
      setDetailLoading(false);
    }
  }

  function parseNullableNumber(input, { integer = false } = {}) {
    const value = String(input?.value || '').trim();
    if (!value) return null;
    const number = Number(value.replace(',', '.'));
    if (!Number.isFinite(number)) return NaN;
    return integer ? Math.round(number) : number;
  }

  function collectOrderUpdate() {
    const status =
      detailBody?.querySelector('[data-detail-status]')?.value || 'NEW';
    const confirmedTotal = parseNullableNumber(
      detailBody?.querySelector('[data-confirmed-total]'),
      { integer: true },
    );
    const internalComment =
      detailBody?.querySelector('[data-internal-comment]')?.value || '';

    if (Number.isNaN(confirmedTotal) || confirmedTotal < 0) {
      throw new Error('Проверьте итоговую стоимость заказа.');
    }

    const items = [];
    for (const card of detailBody?.querySelectorAll('[data-order-item-id]') ||
      []) {
      const availabilityValue =
        card.querySelector('[data-item-availability]')?.value || '';
      const isAvailable =
        availabilityValue === 'true'
          ? true
          : availabilityValue === 'false'
            ? false
            : null;
      const confirmedQuantity = parseNullableNumber(
        card.querySelector('[data-item-quantity]'),
      );
      const confirmedArea = parseNullableNumber(
        card.querySelector('[data-item-area]'),
      );
      const confirmedUnitPrice = parseNullableNumber(
        card.querySelector('[data-item-price]'),
        { integer: true },
      );

      if (
        [confirmedQuantity, confirmedArea, confirmedUnitPrice].some(
          Number.isNaN,
        )
      ) {
        throw new Error('Проверьте подтверждённые значения в позициях заказа.');
      }

      items.push({
        id: Number(card.dataset.orderItemId),
        isAvailable,
        confirmedQuantity,
        confirmedArea,
        confirmedUnitPrice,
      });
    }

    return { status, confirmedTotal, internalComment, items };
  }

  function collectCalculateUpdate() {
    return {
      status: detailBody?.querySelector('[data-detail-status]')?.value || 'NEW',
      internalComment:
        detailBody?.querySelector('[data-internal-comment]')?.value || '',
    };
  }

  async function deleteOrder(id) {
    try {
      if (!state.csrfToken) {
        await loadSession();
      }

      const response = await fetch(`/api/admin/requests/orders/${id}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'X-CSRF-Token': state.csrfToken,
        },
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error(
          await readResponseMessage(response, 'Не удалось удалить заказ.'),
        );
      }

      showToast('Заказ удалён.');

      if (
        state.currentDetail &&
        state.currentDetail.type === 'ORDER' &&
        state.currentDetail.id === id
      ) {
        closeDetail();
      }

      await loadRequests({
        quiet: true,
      });
    } catch (error) {
      showToast(error.message || 'Не удалось удалить заказ.', 'error');
    }
  }

  async function saveDetail() {
    const current = state.currentDetail;
    if (!current || !detailSave || detailSave.disabled) return;

    detailSave.disabled = true;
    detailSave.classList.add('is-loading');

    try {
      if (!state.csrfToken) {
        await loadSession();
      }

      const body =
        current.type === 'ORDER'
          ? collectOrderUpdate()
          : collectCalculateUpdate();
      const path =
        current.type === 'ORDER'
          ? `/api/admin/requests/orders/${current.id}`
          : `/api/admin/requests/calculate/${current.id}`;

      const response = await fetch(path, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': state.csrfToken,
        },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        window.location.replace('/admin/login');
        return;
      }

      if (!response.ok) {
        throw new Error(
          await readResponseMessage(
            response,
            'Не удалось сохранить изменения.',
          ),
        );
      }

      const payload = await response.json();
      const updated =
        current.type === 'ORDER' ? payload.order : payload.request;
      renderDetail(current.type, updated);
      showToast('Изменения сохранены.');
      await loadRequests({ quiet: true });
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить изменения.', 'error');
    } finally {
      detailSave.disabled = false;
      detailSave.classList.remove('is-loading');
    }
  }

  function applyType(type) {
    state.type = type;
    state.page = 1;
    for (const tab of tabs) {
      tab.classList.toggle('is-active', tab.dataset.requestType === type);
    }
    loadRequests();
  }

  function maybeOpenFromQuery() {
    const value = new URL(window.location.href).searchParams.get('open');
    const match = /^(order|calculate):(\d+)$/i.exec(String(value || ''));
    if (!match) return;

    const id = Number(match[2]);
    if (!Number.isInteger(id) || id < 1) return;

    openDetail(
      match[1].toLowerCase() === 'order' ? 'ORDER' : 'CALCULATE_REQUEST',
      id,
      {
        updateUrl: false,
      },
    );
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () =>
      applyType(tab.dataset.requestType || 'ALL'),
    );
  }

  searchInput?.addEventListener('input', () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.q = searchInput.value.trim();
      state.page = 1;
      loadRequests();
    }, 350);
  });

  statusSelect?.addEventListener('change', () => {
    state.status = statusSelect.value;
    state.page = 1;
    loadRequests();
  });

  refreshButton?.addEventListener('click', () => loadRequests());
  pagePrev?.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadRequests();
  });
  pageNext?.addEventListener('click', () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    loadRequests();
  });

  sidebarOpen?.addEventListener('click', () => setSidebar(true));
  sidebarClose?.addEventListener('click', () => setSidebar(false));
  sidebarOverlay?.addEventListener('click', () => setSidebar(false));
  logoutButton?.addEventListener('click', logout);
  detailOverlay?.addEventListener('click', closeDetail);
  detailCloseButtons.forEach((button) =>
    button.addEventListener('click', closeDetail),
  );
  detailSave?.addEventListener('click', saveDetail);

  document.querySelectorAll('[data-coming-soon]').forEach((button) => {
    button.addEventListener('click', () => {
      setSidebar(false);
      showToast('Каталог подключим следующим этапом.');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (detailPanel?.classList.contains('is-open')) {
      closeDetail();
    } else {
      setSidebar(false);
    }
  });

  (async () => {
    try {
      const session = await loadSession();
      if (!session) return;
      await loadRequests();
      maybeOpenFromQuery();
    } catch {
      showToast('Не удалось загрузить админ-панель.', 'error');
    }
  })();
})();
