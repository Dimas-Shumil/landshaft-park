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

  const pageTitle = document.querySelector('[data-page-title]');
  const editorLoading = document.querySelector('[data-editor-loading]');
  const form = document.querySelector('[data-product-form]');
  const saveTopButton = document.querySelector('[data-save-top]');
  const saveButton = document.querySelector('[data-product-save]');
  const deleteButton = document.querySelector('[data-product-delete]');
  const publicLink = document.querySelector('[data-public-link]');
  const productIdLabel = document.querySelector('[data-product-id-label]');

  const titleInput = document.querySelector('[data-product-title]');
  const slugInput = document.querySelector('[data-product-slug]');
  const categoryInput = document.querySelector('[data-product-category]');
  const unitInput = document.querySelector('[data-product-unit]');
  const sortOrderInput = document.querySelector('[data-product-sort-order]');
  const dimensionsInput = document.querySelector('[data-product-dimensions]');
  const purposeInput = document.querySelector('[data-product-purpose]');
  const calculatorTypeInput = document.querySelector('[data-product-calculator-type]');
  const pavingCalculatorFields = document.querySelector('[data-calculator-paving]');
  const fenceCalculatorFields = document.querySelector('[data-calculator-fence]');
  const pavingWasteInput = document.querySelector('[data-product-paving-waste]');
  const fenceSectionWidthInput = document.querySelector('[data-product-fence-section-width]');
  const fencePanelHeightInput = document.querySelector('[data-product-fence-panel-height]');
  const fencePostPriceInput = document.querySelector('[data-product-fence-post-price]');
  const shortDescriptionInput = document.querySelector('[data-product-short-description]');
  const descriptionInput = document.querySelector('[data-product-description]');
  const seoTitleInput = document.querySelector('[data-product-seo-title]');
  const seoDescriptionInput = document.querySelector('[data-product-seo-description]');
  const publishedInput = document.querySelector('[data-product-published]');

  const addVariantButton = document.querySelector('[data-add-variant]');
  const variantList = document.querySelector('[data-variant-list]');
  const variantTemplate = document.querySelector('[data-variant-template]');

  const imageInput = document.querySelector('[data-image-input]');
  const imageDropzone = document.querySelector('[data-image-dropzone]');
  const imageGrid = document.querySelector('[data-image-grid]');
  const imageEmpty = document.querySelector('[data-image-empty]');

  const state = {
    productId: getProductIdFromPath(),
    csrfToken: '',
    images: [],
    pendingFiles: [],
    slugTouched: false,
    isSaving: false,
    isUploading: false,
    toastTimer: null,
  };

  function getProductIdFromPath() {
    const match = window.location.pathname.match(/^\/admin\/catalog\/product\/(\d+)\/?$/);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
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
    state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3500);
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
    if (!response.ok) throw new Error(await readResponseMessage(response, 'Ошибка запроса.'));
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

  function setEditorLoading(loading) {
    if (editorLoading) editorLoading.hidden = !loading;
    if (form) form.hidden = loading;
  }

  function setSaving(saving) {
    state.isSaving = saving;
    if (saveButton) saveButton.disabled = saving;
    if (saveTopButton) saveTopButton.disabled = saving;
    if (deleteButton) deleteButton.disabled = saving;
    if (saveButton) saveButton.textContent = saving ? 'Сохраняем…' : 'Сохранить изменения';
    if (saveTopButton) saveTopButton.textContent = saving ? 'Сохраняем…' : 'Сохранить товар';
  }

  function setUploading(uploading) {
    state.isUploading = uploading;
    if (imageInput) imageInput.disabled = uploading;
    imageDropzone?.classList.toggle('is-uploading', uploading);
    imageDropzone?.setAttribute('aria-busy', String(uploading));
  }

  async function loadCategories() {
    const payload = await adminRequest('/api/admin/catalog/categories?status=ALL&page=1&limit=100');
    const categories = Array.isArray(payload.items) ? payload.items : [];
    const fragment = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Выберите категорию';
    fragment.append(placeholder);
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = String(category.id);
      option.textContent = `${category.name}${category.isPublished ? '' : ' — скрыта'}`;
      fragment.append(option);
    }
    categoryInput?.replaceChildren(fragment);
  }

  function updateVariantTitles() {
    const rows = [...variantList.querySelectorAll('[data-variant-row]')];
    rows.forEach((row, index) => {
      const title = row.querySelector('[data-variant-title]');
      if (title) title.textContent = `Вариант ${index + 1}`;
      const remove = row.querySelector('[data-remove-variant]');
      if (remove) remove.disabled = rows.length <= 1;
    });
  }

  function addVariant(variant = {}) {
    const fragment = variantTemplate.content.cloneNode(true);
    const row = fragment.querySelector('[data-variant-row]');
    row.querySelector('[data-variant-id]').value = variant.id ? String(variant.id) : '';
    row.querySelector('[data-variant-name]').value = variant.name ?? 'Стандарт';
    row.querySelector('[data-variant-sku]').value = variant.sku ?? '';
    row.querySelector('[data-variant-price]').value = variant.price ?? '';
    row.querySelector('[data-variant-color]').value = variant.color ?? '';
    row.querySelector('[data-variant-thickness]').value = variant.thicknessMm ?? '';
    row.querySelector('[data-variant-sort-order]').value = String(variant.sortOrder ?? 100);
    row.querySelector('[data-variant-active]').checked = variant.isActive ?? true;
    row.querySelector('[data-remove-variant]').addEventListener('click', () => {
      if (variantList.querySelectorAll('[data-variant-row]').length <= 1) {
        showToast('У товара должен остаться хотя бы один вариант.', 'error');
        return;
      }
      row.remove();
      updateVariantTitles();
    });
    variantList.append(fragment);
    updateVariantTitles();
  }

  function renderVariants(variants) {
    variantList.replaceChildren();
    const list = Array.isArray(variants) && variants.length ? variants : [{}];
    list.forEach(addVariant);
  }

  function readNumber(input, { nullable = false } = {}) {
    const raw = String(input?.value ?? '').trim();
    if (!raw && nullable) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function updateCalculatorFields() {
    const type = String(calculatorTypeInput?.value || 'NONE');
    if (pavingCalculatorFields) pavingCalculatorFields.hidden = type !== 'PAVING';
    if (fenceCalculatorFields) fenceCalculatorFields.hidden = type !== 'FENCE';
  }

  function collectVariants() {
    return [...variantList.querySelectorAll('[data-variant-row]')].map((row) => {
      const id = readNumber(row.querySelector('[data-variant-id]'), { nullable: true });
      return {
        ...(id ? { id } : {}),
        name: String(row.querySelector('[data-variant-name]').value || '').trim(),
        sku: String(row.querySelector('[data-variant-sku]').value || '').trim() || null,
        color: String(row.querySelector('[data-variant-color]').value || '').trim(),
        thicknessMm: readNumber(row.querySelector('[data-variant-thickness]'), { nullable: true }),
        price: readNumber(row.querySelector('[data-variant-price]')),
        isActive: Boolean(row.querySelector('[data-variant-active]').checked),
        sortOrder: readNumber(row.querySelector('[data-variant-sort-order]')) ?? 100,
      };
    });
  }

  function collectProductPayload({ forceDraft = false } = {}) {
    return {
      title: String(titleInput?.value || '').trim(),
      slug: String(slugInput?.value || '').trim().toLowerCase(),
      shortDescription: String(shortDescriptionInput?.value || '').trim(),
      description: String(descriptionInput?.value || '').trim(),
      unit: String(unitInput?.value || '').trim(),
      dimensions: String(dimensionsInput?.value || '').trim(),
      purpose: String(purposeInput?.value || '').trim(),
      calculatorType: String(calculatorTypeInput?.value || 'NONE'),
      pavingWastePercent: readNumber(pavingWasteInput, { nullable: true }) ?? 7,
      fenceSectionWidth: readNumber(fenceSectionWidthInput, { nullable: true }),
      fencePanelHeight: readNumber(fencePanelHeightInput, { nullable: true }),
      fencePostPrice: readNumber(fencePostPriceInput, { nullable: true }),
      seoTitle: String(seoTitleInput?.value || '').trim(),
      seoDescription: String(seoDescriptionInput?.value || '').trim(),
      categoryId: readNumber(categoryInput),
      isPublished: forceDraft ? false : Boolean(publishedInput?.checked),
      sortOrder: readNumber(sortOrderInput) ?? 100,
      variants: collectVariants(),
    };
  }

  function validatePayload(payload) {
    if (!payload.title || !payload.slug || !payload.unit || !payload.categoryId) {
      return 'Заполните название, slug, категорию и единицу измерения.';
    }
    if (!payload.variants.length) return 'Добавьте хотя бы один вариант.';
    if (
      !Number.isFinite(payload.pavingWastePercent) ||
      payload.pavingWastePercent < 0 ||
      payload.pavingWastePercent > 50
    ) {
      return 'Запас плитки должен быть от 0 до 50%.';
    }
    if (payload.calculatorType === 'FENCE') {
      if (!Number.isFinite(payload.fenceSectionWidth) || payload.fenceSectionWidth <= 0) {
        return 'Укажите ширину секции забора.';
      }
      if (!Number.isFinite(payload.fencePanelHeight) || payload.fencePanelHeight <= 0) {
        return 'Укажите высоту одной заборной плиты.';
      }
      if (!Number.isInteger(payload.fencePostPrice) || payload.fencePostPrice < 0) {
        return 'Укажите цену одного столба целым числом.';
      }
    }
    for (const [index, variant] of payload.variants.entries()) {
      if (!variant.name || !Number.isInteger(variant.price) || variant.price < 0) {
        return `Проверьте название и цену варианта ${index + 1}.`;
      }
      if (variant.thicknessMm !== null && !Number.isInteger(variant.thicknessMm)) {
        return `Толщина варианта ${index + 1} должна быть целым числом.`;
      }
    }
    return null;
  }

  function fillProduct(product) {
    state.productId = Number(product.id);
    titleInput.value = product.title || '';
    slugInput.value = product.slug || '';
    categoryInput.value = String(product.categoryId || product.category?.id || '');
    unitInput.value = product.unit || 'м²';
    sortOrderInput.value = String(product.sortOrder ?? 100);
    dimensionsInput.value = product.dimensions || '';
    purposeInput.value = product.purpose || '';
    calculatorTypeInput.value = product.calculatorType || 'NONE';
    pavingWasteInput.value = String(product.pavingWastePercent ?? 7);
    fenceSectionWidthInput.value = product.fenceSectionWidth ?? '';
    fencePanelHeightInput.value = product.fencePanelHeight ?? '';
    fencePostPriceInput.value = product.fencePostPrice ?? '';
    updateCalculatorFields();
    shortDescriptionInput.value = product.shortDescription || '';
    descriptionInput.value = product.description || '';
    seoTitleInput.value = product.seoTitle || '';
    seoDescriptionInput.value = product.seoDescription || '';
    publishedInput.checked = Boolean(product.isPublished);
    renderVariants(product.variants || []);
    state.images = Array.isArray(product.images) ? product.images : [];
    state.slugTouched = true;
    renderImages();
    updateEditorIdentity(product);
  }

  function updateEditorIdentity(product = null) {
    const title = product?.title || String(titleInput?.value || '').trim() || 'Новый товар';
    if (pageTitle) pageTitle.textContent = state.productId ? title : 'Новый товар';
    document.title = `${state.productId ? title : 'Новый товар'} | Ландшафт Парк`;
    if (productIdLabel) productIdLabel.textContent = state.productId ? `ID ${state.productId}` : 'Новый товар';
    if (deleteButton) deleteButton.hidden = !state.productId;
    if (publicLink) {
      const slug = product?.slug || String(slugInput?.value || '').trim();
      publicLink.hidden = !state.productId || !slug;
      if (slug) publicLink.href = `/product?slug=${encodeURIComponent(slug)}`;
    }
  }

  function createImageCard(image) {
    const card = document.createElement('article');
    card.className = `admin-image-card${image.isMain ? ' is-main' : ''}`;
    const media = document.createElement('div');
    media.className = 'admin-image-card__media';
    const img = document.createElement('img');
    img.src = image.imagePath;
    img.alt = image.alt || '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      media.classList.add('is-broken');
      img.remove();
    });
    media.append(img);
    if (image.isMain) media.append(Object.assign(document.createElement('span'), { textContent: 'Главное' }));

    const body = document.createElement('div');
    body.className = 'admin-image-card__body';
    const altLabel = document.createElement('label');
    altLabel.className = 'admin-form-field admin-form-field--small';
    altLabel.innerHTML = '<span>Alt</span>';
    const altInput = document.createElement('input');
    altInput.type = 'text';
    altInput.maxLength = 300;
    altInput.value = image.alt || '';
    altLabel.append(altInput);

    const orderLabel = document.createElement('label');
    orderLabel.className = 'admin-form-field admin-form-field--small';
    orderLabel.innerHTML = '<span>Порядок</span>';
    const orderInput = document.createElement('input');
    orderInput.type = 'number';
    orderInput.min = '0';
    orderInput.max = '1000000';
    orderInput.value = String(image.sortOrder ?? 100);
    orderLabel.append(orderInput);

    const actions = document.createElement('div');
    actions.className = 'admin-image-card__actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'admin-catalog-action admin-catalog-action--primary';
    save.textContent = 'Сохранить';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const payload = await adminRequest(`/api/admin/catalog/products/${state.productId}/images/${image.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ alt: altInput.value.trim(), sortOrder: Number(orderInput.value || 100) }),
        });
        state.images = payload.images || [];
        renderImages();
        showToast('Изображение обновлено.');
      } catch (error) {
        showToast(error.message || 'Не удалось обновить изображение.', 'error');
      } finally {
        save.disabled = false;
      }
    });

    if (!image.isMain) {
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'admin-catalog-action';
      main.textContent = 'Сделать главным';
      main.addEventListener('click', async () => {
        main.disabled = true;
        try {
          const payload = await adminRequest(`/api/admin/catalog/products/${state.productId}/images/${image.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isMain: true }),
          });
          state.images = payload.images || [];
          renderImages();
          showToast('Главное изображение изменено.');
        } catch (error) {
          showToast(error.message || 'Не удалось изменить главное изображение.', 'error');
        } finally {
          if (main.isConnected) main.disabled = false;
        }
      });
      actions.append(main);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-catalog-action admin-catalog-action--danger';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', async () => {
      if (!window.confirm('Удалить это изображение?')) return;
      remove.disabled = true;
      try {
        const payload = await adminRequest(`/api/admin/catalog/products/${state.productId}/images/${image.id}`, {
          method: 'DELETE',
        });
        state.images = payload.images || [];
        renderImages();
        showToast('Изображение удалено.');
      } catch (error) {
        showToast(error.message || 'Не удалось удалить изображение.', 'error');
        remove.disabled = false;
      }
    });
    actions.prepend(save);
    actions.append(remove);
    body.append(altLabel, orderLabel, actions);
    card.append(media, body);
    return card;
  }

  function createPendingImageCard(file, index) {
    const card = document.createElement('article');
    card.className = 'admin-image-card is-pending';
    const media = document.createElement('div');
    media.className = 'admin-image-card__media';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
    media.append(img, Object.assign(document.createElement('span'), { textContent: 'После сохранения' }));
    const body = document.createElement('div');
    body.className = 'admin-image-card__body';
    const name = document.createElement('strong');
    name.className = 'admin-image-card__filename';
    name.textContent = file.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'admin-catalog-action admin-catalog-action--danger';
    remove.textContent = 'Убрать';
    remove.addEventListener('click', () => {
      state.pendingFiles.splice(index, 1);
      renderImages();
    });
    body.append(name, remove);
    card.append(media, body);
    return card;
  }

  function renderImages() {
    imageGrid.replaceChildren();
    for (const image of state.images) imageGrid.append(createImageCard(image));
    state.pendingFiles.forEach((file, index) => imageGrid.append(createPendingImageCard(file, index)));
    imageEmpty.hidden = state.images.length > 0 || state.pendingFiles.length > 0;
  }

  function validateFiles(files) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    for (const file of files) {
      if (!allowed.has(file.type)) return 'Допустимы только JPEG, PNG и WebP.';
      if (file.size > 8 * 1024 * 1024) return `Файл «${file.name}» больше 8 МБ.`;
    }
    return null;
  }

  async function uploadFiles(files) {
    const list = [...files];
    if (!list.length) return;

    const validationError = validateFiles(list);
    if (validationError) {
      showToast(validationError, 'error');
      if (imageInput) imageInput.value = '';
      return;
    }

    if (list.length > 10) {
      showToast('За один раз можно выбрать не более 10 изображений.', 'error');
      if (imageInput) imageInput.value = '';
      return;
    }

    if (!state.productId) {
      if (state.pendingFiles.length + list.length > 10) {
        showToast('До первого сохранения можно подготовить не более 10 изображений.', 'error');
        if (imageInput) imageInput.value = '';
        return;
      }

      state.pendingFiles.push(...list);
      renderImages();
      if (imageInput) imageInput.value = '';
      showToast('Фото загрузятся после первого сохранения товара.');
      return;
    }

    if (state.isUploading || state.isSaving) return;

    setUploading(true);
    const data = new FormData();
    list.forEach((file) => data.append('images', file));

    try {
      const payload = await adminRequest(`/api/admin/catalog/products/${state.productId}/images`, {
        method: 'POST',
        body: data,
      });
      state.images = payload.images || [];
      renderImages();
      showToast('Изображения загружены и преобразованы в WebP.');
    } catch (error) {
      showToast(error.message || 'Не удалось загрузить изображения.', 'error');
    } finally {
      setUploading(false);
      if (imageInput) imageInput.value = '';
    }
  }

  async function uploadPendingFiles() {
    if (!state.productId || !state.pendingFiles.length) return;
    const files = [...state.pendingFiles];
    state.pendingFiles = [];
    const data = new FormData();
    files.forEach((file) => data.append('images', file));
    try {
      const payload = await adminRequest(`/api/admin/catalog/products/${state.productId}/images`, {
        method: 'POST',
        body: data,
      });
      state.images = payload.images || [];
      renderImages();
    } catch (error) {
      state.pendingFiles = files;
      renderImages();
      throw error;
    }
  }

  async function saveProduct(event) {
    event?.preventDefault();
    if (state.isSaving || state.isUploading) {
      showToast('Дождитесь завершения загрузки изображений.');
      return;
    }

    const desiredPublished = Boolean(publishedInput?.checked);
    const isNew = !state.productId;
    let payload = collectProductPayload({ forceDraft: isNew });
    const validationError = validatePayload(payload);
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    if (desiredPublished) {
      const availableImages = state.images.length + state.pendingFiles.length;
      if (availableImages === 0) {
        showToast('Для публикации добавьте хотя бы одно изображение товара.', 'error');
        return;
      }

      if (!payload.variants.some((variant) => variant.isActive)) {
        showToast('Для публикации нужен хотя бы один активный вариант.', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await adminRequest('/api/admin/catalog/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        fillProduct(created.product);
        history.replaceState({}, '', `/admin/catalog/product/${state.productId}`);
        await uploadPendingFiles();

        if (desiredPublished) {
          publishedInput.checked = true;
          payload = collectProductPayload();
          const published = await adminRequest(`/api/admin/catalog/products/${state.productId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          fillProduct(published.product);
        }
        showToast(desiredPublished ? 'Товар создан и опубликован.' : 'Товар создан как черновик.');
      } else {
        const updated = await adminRequest(`/api/admin/catalog/products/${state.productId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        fillProduct(updated.product);
        showToast('Товар сохранён.');
      }
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить товар.', 'error');
      if (state.productId) {
        try {
          const current = await adminRequest(`/api/admin/catalog/products/${state.productId}`);
          fillProduct(current.product);
        } catch {
          // Сохраняем исходную ошибку пользователю; повторная синхронизация не критична.
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!state.productId) return;
    const label = String(titleInput?.value || 'товар').trim();
    if (!window.confirm(`Удалить «${label}»? Варианты и галерея будут удалены. Данные в истории заказов сохранятся.`)) return;
    deleteButton.disabled = true;
    try {
      await adminRequest(`/api/admin/catalog/products/${state.productId}`, { method: 'DELETE' });
      window.location.replace('/admin/catalog');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить товар.', 'error');
      deleteButton.disabled = false;
    }
  }

  async function loadProduct() {
    if (!state.productId) {
      // Новый товар всегда открывается чистым, без данных существующих товаров.
      if (titleInput) titleInput.value = '';
      if (slugInput) slugInput.value = '';
      if (categoryInput) categoryInput.value = '';
      if (unitInput) unitInput.value = 'м²';
      if (sortOrderInput) sortOrderInput.value = '100';
      if (dimensionsInput) dimensionsInput.value = '';
      if (purposeInput) purposeInput.value = '';
      if (calculatorTypeInput) calculatorTypeInput.value = 'NONE';
      if (pavingWasteInput) pavingWasteInput.value = '7';
      if (fenceSectionWidthInput) fenceSectionWidthInput.value = '';
      if (fencePanelHeightInput) fencePanelHeightInput.value = '';
      if (fencePostPriceInput) fencePostPriceInput.value = '';
      updateCalculatorFields();
      if (shortDescriptionInput) shortDescriptionInput.value = '';
      if (descriptionInput) descriptionInput.value = '';
      if (seoTitleInput) seoTitleInput.value = '';
      if (seoDescriptionInput) seoDescriptionInput.value = '';
      if (publishedInput) publishedInput.checked = false;
      renderVariants([{}]);
      state.images = [];
      renderImages();
      updateEditorIdentity();
      return;
    }
    const payload = await adminRequest(`/api/admin/catalog/products/${state.productId}`);
    fillProduct(payload.product);
  }

  sidebarOpen?.addEventListener('click', () => setSidebar(true));
  sidebarClose?.addEventListener('click', () => setSidebar(false));
  sidebarOverlay?.addEventListener('click', () => setSidebar(false));
  logoutButton?.addEventListener('click', logout);
  addVariantButton?.addEventListener('click', () => addVariant({ sortOrder: variantList.children.length * 10 + 10 }));
  form?.addEventListener('submit', saveProduct);
  saveTopButton?.addEventListener('click', () => form?.requestSubmit());
  deleteButton?.addEventListener('click', deleteProduct);

  titleInput?.addEventListener('input', () => {
    if (!state.slugTouched && slugInput) slugInput.value = slugify(titleInput.value);
    updateEditorIdentity();
  });
  slugInput?.addEventListener('input', () => {
    state.slugTouched = true;
    slugInput.value = slugify(slugInput.value);
    updateEditorIdentity();
  });
  calculatorTypeInput?.addEventListener('change', updateCalculatorFields);

  imageInput?.addEventListener('change', () => uploadFiles(imageInput.files || []));
  for (const type of ['dragenter', 'dragover']) {
    imageDropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      imageDropzone.classList.add('is-dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    imageDropzone?.addEventListener(type, (event) => {
      event.preventDefault();
      imageDropzone.classList.remove('is-dragging');
    });
  }
  imageDropzone?.addEventListener('drop', (event) => uploadFiles(event.dataTransfer?.files || []));
  imageDropzone?.addEventListener('click', () => imageInput?.click());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebar(false);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      form?.requestSubmit();
    }
  });

  async function init() {
    try {
      const session = await loadSession();
      if (!session) return;
      await loadCategories();
      await loadProduct();
      setEditorLoading(false);
      if (!state.productId) titleInput?.focus();
    } catch (error) {
      showToast(error.message || 'Не удалось открыть редактор товара.', 'error');
      setEditorLoading(false);
    }
  }

  init();
})();
