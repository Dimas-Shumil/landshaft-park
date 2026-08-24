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

  const refreshButton = document.querySelector('[data-catalog-refresh]');
  const createButton = document.querySelector('[data-catalog-create]');
  const createLabel = document.querySelector('[data-catalog-create-label]');
  const tabs = [...document.querySelectorAll('[data-catalog-view]')];
  const searchInput = document.querySelector('[data-catalog-search]');
  const statusSelect = document.querySelector('[data-catalog-status]');
  const categoryFilterWrap = document.querySelector('[data-category-filter-wrap]');
  const categoryFilter = document.querySelector('[data-category-filter]');

  const productsView = document.querySelector('[data-products-view]');
  const categoriesView = document.querySelector('[data-categories-view]');
  const productsBody = document.querySelector('[data-products-body]');
  const categoriesBody = document.querySelector('[data-categories-body]');
  const results = document.querySelector('[data-catalog-results]');
  const loading = document.querySelector('[data-catalog-loading]');
  const empty = document.querySelector('[data-catalog-empty]');
  const emptyTitle = document.querySelector('[data-catalog-empty-title]');
  const emptyCopy = document.querySelector('[data-catalog-empty-copy]');
  const emptyCreateButton = document.querySelector('[data-catalog-empty-create]');

  const metricProducts = document.querySelector('[data-metric-products]');
  const metricPublished = document.querySelector('[data-metric-published]');
  const metricCategories = document.querySelector('[data-metric-categories]');
  const metricVariants = document.querySelector('[data-metric-variants]');
  const countProducts = document.querySelector('[data-count-products]');
  const countCategories = document.querySelector('[data-count-categories]');

  const paginationInfo = document.querySelector('[data-pagination-info]');
  const pagePrev = document.querySelector('[data-page-prev]');
  const pageNext = document.querySelector('[data-page-next]');

  const categoryModal = document.querySelector('[data-category-modal]');
  const categoryModalOverlay = document.querySelector('[data-category-modal-overlay]');
  const categoryModalClose = document.querySelector('[data-category-modal-close]');
  const categoryModalTitle = document.querySelector('[data-category-modal-title]');
  const categoryForm = document.querySelector('[data-category-form]');
  const categoryIdInput = document.querySelector('[data-category-id]');
  const categoryNameInput = document.querySelector('[data-category-name]');
  const categorySlugInput = document.querySelector('[data-category-slug]');
  const categoryDescriptionInput = document.querySelector('[data-category-description]');
  const categoryImagePathInput = document.querySelector('[data-category-image-path]');
  const categorySeoTitleInput = document.querySelector('[data-category-seo-title]');
  const categorySeoDescriptionInput = document.querySelector('[data-category-seo-description]');
  const categorySortOrderInput = document.querySelector('[data-category-sort-order]');
  const categoryPublishedInput = document.querySelector('[data-category-published]');
  const categoryDeleteButton = document.querySelector('[data-category-delete]');
  const categoryCancelButton = document.querySelector('[data-category-cancel]');
  const categorySaveButton = document.querySelector('[data-category-save]');

  const state = {
    view: 'PRODUCTS',
    q: '',
    status: 'ALL',
    categoryId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    csrfToken: '',
    searchTimer: null,
    toastTimer: null,
    requestSerial: 0,
    categorySlugTouched: false,
  };

  const currencyFormatter = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  });
  const numberFormatter = new Intl.NumberFormat('ru-RU');
  const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function setSidebar(open) {
    sidebar?.classList.toggle('is-open', open);
    sidebarOverlay?.classList.toggle('is-visible', open);
    document.body.classList.toggle('admin-menu-open', open);
  }

  function showToast(message, variant = 'default') {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('is-error', variant === 'error');
    toast.classList.add('is-visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function applyUser(user) {
    const name = String(user?.name || 'Администратор').trim() || 'Администратор';
    if (adminName) adminName.textContent = name;
    if (adminAvatar) adminAvatar.textContent = name.slice(0, 1).toUpperCase();
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
    if (!response.ok) throw new Error('Не удалось проверить сессию.');

    const payload = await response.json();
    state.csrfToken = String(payload.csrfToken || '');
    applyUser(payload.user);
    return payload;
  }

  async function adminRequest(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    if (!['GET', 'HEAD'].includes(method)) {
      if (!state.csrfToken) await loadSession();
      headers.set('X-CSRF-Token', state.csrfToken);
      if (options.body && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
    }

    const response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'same-origin',
    });

    if (response.status === 401) {
      window.location.replace('/admin/login');
      throw new Error('Сессия завершена.');
    }

    if (!response.ok) {
      throw new Error(await readResponseMessage(response, 'Ошибка запроса.'));
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function logout() {
    if (!logoutButton || logoutButton.disabled) return;
    logoutButton.disabled = true;
    try {
      await adminRequest('/api/admin/auth/logout', { method: 'POST' });
      window.location.replace('/admin/login');
    } catch (error) {
      logoutButton.disabled = false;
      showToast(error.message || 'Не удалось выйти.', 'error');
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
  }

  function formatCurrency(value) {
    const number = Number(value);
    return Number.isFinite(number) ? currencyFormatter.format(number) : '—';
  }

  function formatPriceRange(item) {
    if (item.minPrice === null || item.minPrice === undefined) return 'Цена не задана';
    if (Number(item.maxPrice ?? item.minPrice) <= 0) return 'Цена по запросу';
    if (Number(item.minPrice) <= 0 && Number(item.maxPrice) > 0) {
      return `от ${formatCurrency(item.maxPrice)} / ${item.unit || 'шт.'}`;
    }
    if (item.maxPrice !== null && item.maxPrice !== item.minPrice) {
      return `${formatCurrency(item.minPrice)} – ${formatCurrency(item.maxPrice)}`;
    }
    return `${formatCurrency(item.minPrice)} / ${item.unit || 'шт.'}`;
  }

  function createStatusBadge(isPublished) {
    return element(
      'span',
      `admin-catalog-status ${isPublished ? 'is-published' : 'is-draft'}`,
      isPublished ? 'Опубликован' : 'Скрыт',
    );
  }

  function createProductCell(item) {
    const wrap = element('div', 'admin-catalog-product');
    const media = element('span', 'admin-catalog-product__media');

    if (item.image?.imagePath) {
      const image = document.createElement('img');
      image.src = item.image.imagePath;
      image.alt = item.image.alt || item.title || '';
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        media.classList.add('is-placeholder');
        image.remove();
      });
      media.append(image);
    } else {
      media.classList.add('is-placeholder');
    }

    const copy = element('span', 'admin-catalog-product__copy');
    copy.append(
      element('strong', '', item.title || 'Без названия'),
      element('small', '', item.slug || '—'),
    );
    wrap.append(media, copy);
    return wrap;
  }

  function createRowActions() {
    return element('div', 'admin-catalog-row-actions');
  }

  function createEditLink(item) {
    const link = element('a', 'admin-catalog-action admin-catalog-action--primary', 'Редактировать');
    link.href = `/admin/catalog/product/${item.id}`;
    return link;
  }

  function createPublicLink(item) {
    const link = element('a', 'admin-catalog-action', 'На сайте');
    link.href = `/product?slug=${encodeURIComponent(item.slug || '')}`;
    link.target = '_blank';
    link.rel = 'noopener';
    return link;
  }

  function hasActiveFilters() {
    return Boolean(
      state.q ||
      state.status !== 'ALL' ||
      (state.view === 'PRODUCTS' && state.categoryId),
    );
  }

  function updateEmptyState(itemsLength) {
    if (!empty) return;

    const isEmpty = itemsLength === 0;
    empty.hidden = !isEmpty;

    if (!isEmpty) return;

    const filtered = hasActiveFilters();
    const productsActive = state.view === 'PRODUCTS';

    if (emptyTitle) {
      emptyTitle.textContent = filtered
        ? 'Ничего не найдено'
        : productsActive
          ? 'Товаров пока нет'
          : 'Категорий пока нет';
    }

    if (emptyCopy) {
      emptyCopy.textContent = filtered
        ? 'Попробуйте изменить фильтры или поисковый запрос.'
        : productsActive
          ? 'Создайте первый товар — после сохранения он появится в этом списке.'
          : 'Создайте первую категорию, чтобы затем добавлять в неё товары.';
    }

    if (emptyCreateButton) {
      emptyCreateButton.textContent = productsActive ? 'Добавить товар' : 'Добавить категорию';
      emptyCreateButton.hidden = filtered;
    }
  }

  function renderProducts(items) {
    if (!productsBody) return;
    productsBody.replaceChildren();

    for (const item of items) {
      const row = document.createElement('tr');
      const productCell = document.createElement('td');
      productCell.append(createProductCell(item));

      const categoryCell = document.createElement('td');
      categoryCell.append(element('strong', 'admin-catalog-category-name', item.category?.name || '—'));

      const variantsCell = document.createElement('td');
      const variantsWrap = element('div', 'admin-catalog-variants');
      variantsWrap.append(
        element('strong', '', numberFormatter.format(item.variantsCount || 0)),
        element('small', '', `активных: ${numberFormatter.format(item.activeVariantsCount || 0)}`),
      );
      variantsCell.append(variantsWrap);

      const priceCell = document.createElement('td');
      priceCell.append(element('strong', 'admin-catalog-price', formatPriceRange(item)));

      const statusCell = document.createElement('td');
      statusCell.append(createStatusBadge(Boolean(item.isPublished)));

      const updatedCell = document.createElement('td');
      updatedCell.textContent = formatDate(item.updatedAt);

      const actionCell = document.createElement('td');
      const actions = createRowActions();
      actions.append(createEditLink(item));
      if (item.isPublished) actions.append(createPublicLink(item));
      actionCell.append(actions);

      row.append(productCell, categoryCell, variantsCell, priceCell, statusCell, updatedCell, actionCell);
      productsBody.append(row);
    }
  }

  function createCategoryEditButton(item) {
    const button = element('button', 'admin-catalog-action admin-catalog-action--primary', 'Редактировать');
    button.type = 'button';
    button.addEventListener('click', () => openCategoryModal(item.id));
    return button;
  }

  function renderCategories(items) {
    if (!categoriesBody) return;
    categoriesBody.replaceChildren();

    for (const item of items) {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const nameWrap = element('div', 'admin-catalog-category-cell');
      nameWrap.append(
        element('strong', '', item.name || 'Без названия'),
        element('small', '', item.description || 'Описание не заполнено'),
      );
      nameCell.append(nameWrap);

      const slugCell = document.createElement('td');
      slugCell.append(element('code', 'admin-catalog-slug', item.slug || '—'));

      const productsCell = document.createElement('td');
      productsCell.textContent = numberFormatter.format(item.productsCount || 0);
      const publishedCell = document.createElement('td');
      publishedCell.textContent = numberFormatter.format(item.publishedProductsCount || 0);
      const orderCell = document.createElement('td');
      orderCell.textContent = numberFormatter.format(item.sortOrder || 0);
      const statusCell = document.createElement('td');
      statusCell.append(createStatusBadge(Boolean(item.isPublished)));
      const actionCell = document.createElement('td');
      actionCell.append(createCategoryEditButton(item));

      row.append(nameCell, slugCell, productsCell, publishedCell, orderCell, statusCell, actionCell);
      categoriesBody.append(row);
    }
  }

  function setLoading(isLoading) {
    if (loading) loading.hidden = !isLoading;
    if (results) results.setAttribute('aria-busy', String(isLoading));
    refreshButton?.classList.toggle('is-loading', isLoading);
    if (refreshButton) refreshButton.disabled = isLoading;
  }

  function updateView() {
    const productsActive = state.view === 'PRODUCTS';
    if (productsView) productsView.hidden = !productsActive;
    if (categoriesView) categoriesView.hidden = productsActive;
    if (categoryFilterWrap) categoryFilterWrap.hidden = !productsActive;
    if (createLabel) createLabel.textContent = productsActive ? 'Добавить товар' : 'Добавить категорию';

    for (const tab of tabs) {
      const isActive = tab.dataset.catalogView === state.view;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    }
  }

  function updatePagination() {
    const start = state.total === 0 ? 0 : (state.page - 1) * state.limit + 1;
    const end = Math.min(state.page * state.limit, state.total);
    if (paginationInfo) {
      paginationInfo.textContent = state.total
        ? `${numberFormatter.format(start)}–${numberFormatter.format(end)} из ${numberFormatter.format(state.total)}`
        : '0 записей';
    }
    if (pagePrev) pagePrev.disabled = state.page <= 1;
    if (pageNext) pageNext.disabled = state.page >= state.totalPages;
  }

  function buildListUrl() {
    const path = state.view === 'PRODUCTS'
      ? '/api/admin/catalog/products'
      : '/api/admin/catalog/categories';
    const params = new URLSearchParams({
      q: state.q,
      status: state.status,
      page: String(state.page),
      limit: String(state.limit),
    });
    if (state.view === 'PRODUCTS' && state.categoryId) params.set('categoryId', state.categoryId);
    return `${path}?${params.toString()}`;
  }

  async function loadSummary() {
    const payload = await adminRequest('/api/admin/catalog/summary');
    const metrics = payload.metrics || {};
    if (metricProducts) metricProducts.textContent = numberFormatter.format(metrics.totalProducts || 0);
    if (metricPublished) metricPublished.textContent = numberFormatter.format(metrics.publishedProducts || 0);
    if (metricCategories) metricCategories.textContent = numberFormatter.format(metrics.totalCategories || 0);
    if (metricVariants) metricVariants.textContent = numberFormatter.format(metrics.activeVariants || 0);
    if (countProducts) countProducts.textContent = numberFormatter.format(metrics.totalProducts || 0);
    if (countCategories) countCategories.textContent = numberFormatter.format(metrics.totalCategories || 0);
  }

  async function loadCategoryOptions() {
    if (!categoryFilter) return;
    const payload = await adminRequest('/api/admin/catalog/categories?status=ALL&page=1&limit=100');
    const current = categoryFilter.value;
    const fragment = document.createDocumentFragment();
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Все категории';
    fragment.append(defaultOption);

    for (const category of payload.items || []) {
      const option = document.createElement('option');
      option.value = String(category.id);
      option.textContent = category.name;
      fragment.append(option);
    }
    categoryFilter.replaceChildren(fragment);

    const stillExists = [...categoryFilter.options].some((option) => option.value === current);
    categoryFilter.value = stillExists ? current : '';

    if (!stillExists && state.categoryId) {
      state.categoryId = '';
    }
  }

  async function loadList() {
    const requestId = ++state.requestSerial;
    setLoading(true);
    if (empty) empty.hidden = true;

    try {
      const payload = await adminRequest(buildListUrl());
      if (requestId !== state.requestSerial) return;

      state.total = Number(payload.pagination?.total || 0);
      state.totalPages = Math.max(1, Number(payload.pagination?.totalPages || 1));
      state.page = Number(payload.pagination?.page || state.page || 1);

      if (state.total > 0 && state.page > state.totalPages) {
        state.page = state.totalPages;
        return loadList();
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      if (state.view === 'PRODUCTS') renderProducts(items);
      else renderCategories(items);
      updateEmptyState(items.length);
      updatePagination();
    } catch (error) {
      if (requestId === state.requestSerial) showToast(error.message || 'Не удалось загрузить каталог.', 'error');
    } finally {
      if (requestId === state.requestSerial) setLoading(false);
    }
  }

  async function refreshAll() {
    try {
      await Promise.all([loadSummary(), loadCategoryOptions(), loadList()]);
    } catch (error) {
      showToast(error.message || 'Не удалось обновить каталог.', 'error');
      setLoading(false);
    }
  }

  function slugify(value) {
    const map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    };
    return String(value || '')
      .toLowerCase()
      .split('')
      .map((char) => map[char] ?? char)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  function resetCategoryForm() {
    categoryForm?.reset();
    if (categoryIdInput) categoryIdInput.value = '';
    if (categorySortOrderInput) categorySortOrderInput.value = '100';
    if (categoryPublishedInput) categoryPublishedInput.checked = true;
    if (categoryDeleteButton) categoryDeleteButton.hidden = true;
    if (categoryModalTitle) categoryModalTitle.textContent = 'Новая категория';
    state.categorySlugTouched = false;
  }

  function setCategoryModal(open) {
    categoryModal?.classList.toggle('is-open', open);
    categoryModalOverlay?.classList.toggle('is-visible', open);
    categoryModal?.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('admin-modal-open', open);
  }

  async function openCategoryModal(id = null) {
    resetCategoryForm();
    setCategoryModal(true);

    if (!id) {
      categoryNameInput?.focus();
      return;
    }

    if (categoryModalTitle) categoryModalTitle.textContent = 'Редактирование категории';
    if (categorySaveButton) categorySaveButton.disabled = true;

    try {
      const payload = await adminRequest(`/api/admin/catalog/categories/${id}`);
      const category = payload.category || {};
      if (categoryIdInput) categoryIdInput.value = String(category.id || '');
      if (categoryNameInput) categoryNameInput.value = category.name || '';
      if (categorySlugInput) categorySlugInput.value = category.slug || '';
      if (categoryDescriptionInput) categoryDescriptionInput.value = category.description || '';
      if (categoryImagePathInput) categoryImagePathInput.value = category.imagePath || '';
      if (categorySeoTitleInput) categorySeoTitleInput.value = category.seoTitle || '';
      if (categorySeoDescriptionInput) categorySeoDescriptionInput.value = category.seoDescription || '';
      if (categorySortOrderInput) categorySortOrderInput.value = String(category.sortOrder ?? 100);
      if (categoryPublishedInput) categoryPublishedInput.checked = Boolean(category.isPublished);
      if (categoryDeleteButton) categoryDeleteButton.hidden = false;
      state.categorySlugTouched = true;
    } catch (error) {
      setCategoryModal(false);
      showToast(error.message || 'Не удалось открыть категорию.', 'error');
    } finally {
      if (categorySaveButton) categorySaveButton.disabled = false;
    }
  }

  function getCategoryPayload() {
    return {
      name: String(categoryNameInput?.value || '').trim(),
      slug: String(categorySlugInput?.value || '').trim().toLowerCase(),
      description: String(categoryDescriptionInput?.value || '').trim(),
      imagePath: String(categoryImagePathInput?.value || '').trim(),
      seoTitle: String(categorySeoTitleInput?.value || '').trim(),
      seoDescription: String(categorySeoDescriptionInput?.value || '').trim(),
      sortOrder: Number(categorySortOrderInput?.value || 100),
      isPublished: Boolean(categoryPublishedInput?.checked),
    };
  }

  async function saveCategory(event) {
    event.preventDefault();
    const id = Number(categoryIdInput?.value || 0);
    const payload = getCategoryPayload();

    if (!payload.name || !payload.slug) {
      showToast('Заполните название и slug категории.', 'error');
      return;
    }

    if (categorySaveButton) categorySaveButton.disabled = true;
    try {
      await adminRequest(id ? `/api/admin/catalog/categories/${id}` : '/api/admin/catalog/categories', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setCategoryModal(false);
      showToast(id ? 'Категория обновлена.' : 'Категория создана.');
      await refreshAll();
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить категорию.', 'error');
    } finally {
      if (categorySaveButton) categorySaveButton.disabled = false;
    }
  }

  async function deleteCategory() {
    const id = Number(categoryIdInput?.value || 0);
    if (!id) return;
    if (!window.confirm('Удалить категорию? Это действие нельзя отменить.')) return;

    categoryDeleteButton.disabled = true;
    try {
      await adminRequest(`/api/admin/catalog/categories/${id}`, { method: 'DELETE' });
      setCategoryModal(false);
      showToast('Категория удалена.');
      await refreshAll();
    } catch (error) {
      showToast(error.message || 'Не удалось удалить категорию.', 'error');
    } finally {
      categoryDeleteButton.disabled = false;
    }
  }

  function scheduleSearch() {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.q = String(searchInput?.value || '').trim();
      state.page = 1;
      loadList();
    }, 320);
  }

  sidebarOpen?.addEventListener('click', () => setSidebar(true));
  sidebarClose?.addEventListener('click', () => setSidebar(false));
  sidebarOverlay?.addEventListener('click', () => setSidebar(false));
  logoutButton?.addEventListener('click', logout);
  refreshButton?.addEventListener('click', refreshAll);
  function handleCreate() {
    if (state.view === 'PRODUCTS') {
      window.location.href = '/admin/catalog/product/new';
      return;
    }

    openCategoryModal();
  }

  createButton?.addEventListener('click', handleCreate);
  emptyCreateButton?.addEventListener('click', handleCreate);

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const nextView = tab.dataset.catalogView;
      if (!nextView || nextView === state.view) return;
      state.view = nextView;
      state.page = 1;
      if (state.view === 'CATEGORIES') {
        state.categoryId = '';
        if (categoryFilter) categoryFilter.value = '';
      }
      updateView();
      if (empty) empty.hidden = true;
      loadList();
    });
  }

  searchInput?.addEventListener('input', scheduleSearch);
  statusSelect?.addEventListener('change', () => {
    state.status = statusSelect.value || 'ALL';
    state.page = 1;
    loadList();
  });
  categoryFilter?.addEventListener('change', () => {
    state.categoryId = categoryFilter.value;
    state.page = 1;
    loadList();
  });
  pagePrev?.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadList();
  });
  pageNext?.addEventListener('click', () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    loadList();
  });

  categoryModalClose?.addEventListener('click', () => setCategoryModal(false));
  categoryCancelButton?.addEventListener('click', () => setCategoryModal(false));
  categoryModalOverlay?.addEventListener('click', () => setCategoryModal(false));
  categoryForm?.addEventListener('submit', saveCategory);
  categoryDeleteButton?.addEventListener('click', deleteCategory);
  categoryNameInput?.addEventListener('input', () => {
    if (!state.categorySlugTouched && categorySlugInput) {
      categorySlugInput.value = slugify(categoryNameInput.value);
    }
  });
  categorySlugInput?.addEventListener('input', () => {
    state.categorySlugTouched = true;
    categorySlugInput.value = slugify(categorySlugInput.value);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setSidebar(false);
      setCategoryModal(false);
    }
  });

  async function init() {
    try {
      const session = await loadSession();
      if (!session) return;
      updateView();
      await Promise.all([loadSummary(), loadCategoryOptions(), loadList()]);
    } catch (error) {
      showToast(error.message || 'Не удалось загрузить админ-панель.', 'error');
      setLoading(false);
    }
  }

  init();
})();
