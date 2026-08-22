'use strict';

const CATALOG_CART_KEY = 'landshaftParkCart';

let catalogProducts = [];

const grid = document.querySelector('[data-products-grid]');
const emptyState = document.querySelector('[data-empty]');
const resultsCount = document.querySelector('[data-results-count]');
const filterCount = document.querySelector('[data-filter-count]');
const filtersForm = document.querySelector('[data-filters]');
const sortSelect = document.querySelector('[data-sort]');
const categoryTabsContainer = document.querySelector('[data-category-tabs]');
const categoryFiltersContainer = document.querySelector(
  '[data-category-filters]',
);
let categoryTabs = [];

const colorFiltersContainer = document.querySelector('[data-color-filters]');

const priceMinInput = document.querySelector('[data-price-min]');
const priceMaxInput = document.querySelector('[data-price-max]');
const rangeMinInput = document.querySelector('[data-range-min]');
const rangeMaxInput = document.querySelector('[data-range-max]');

const filterPanel = document.querySelector('[data-filter-panel]');
const filterOverlay = document.querySelector('[data-filter-overlay]');
const filterOpen = document.querySelector('[data-filter-open]');
const filterClose = document.querySelector('[data-filter-close]');
const filterApply = document.querySelector('[data-filter-apply]');
const emptyReset = document.querySelector('[data-empty-reset]');

function formatPrice(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function getPriceLabel(value, unit) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return 'Цена по запросу';
  }

  return `от ${formatPrice(value)} ₽/${unit}`;
}

function getColorHex(color) {
  const normalizedColor = String(color ?? '')
    .trim()
    .toLowerCase();

  if (normalizedColor.includes('сер')) {
    return '#8f8b82';
  }

  if (normalizedColor.includes('граф')) {
    return '#555555';
  }

  if (normalizedColor.includes('корич')) {
    return '#735444';
  }

  if (normalizedColor.includes('беж')) {
    return '#c9b28a';
  }

  if (normalizedColor.includes('черн')) {
    return '#222222';
  }

  if (normalizedColor.includes('бел')) {
    return '#eeeeee';
  }

  if (normalizedColor.includes('син')) {
    return '#2563eb';
  }

  if (normalizedColor.includes('зел')) {
    return '#5f7655';
  }

  if (normalizedColor.includes('жел')) {
    return '#d4b85a';
  }

  return '#777777';
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

function getCart() {
  try {
    const rawCart = localStorage.getItem(CATALOG_CART_KEY);

    if (!rawCart) {
      return [];
    }

    const cart = JSON.parse(rawCart);

    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CATALOG_CART_KEY, JSON.stringify(cart));

  window.dispatchEvent(new Event('cart:updated'));
}

function findProduct(productId) {
  return catalogProducts.find((product) => product.id === Number(productId));
}

function findVariant(product, variantId) {
  if (!product) {
    return null;
  }

  return (
    product.variants.find((variant) => variant.id === Number(variantId)) || null
  );
}

function addToCart(productId, variantId, button) {
  const product = findProduct(productId);
  const variant = findVariant(product, variantId);

  if (!product || !variant) {
    return;
  }

  const cart = getCart();

  const existingItem = cart.find(
    (item) => Number(item.variantId) === variant.id,
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

  saveCart(cart);

  if (button) {
    const originalText = button.textContent;

    button.textContent = 'Добавлено';
    button.classList.add('is-added');

    window.setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('is-added');
    }, 900);
  }
}

function getSelectedValues(name) {
  return [...filtersForm.querySelectorAll(`input[name="${name}"]:checked`)].map(
    (input) => input.value,
  );
}

function getActiveCategory() {
  const input = filtersForm.querySelector('input[name="category"]:checked');

  return input ? input.value : 'Тротуарная плитка';
}

function normalizePriceInputs(source) {
  const absoluteMin = Number(rangeMinInput.min);
  const absoluteMax = Number(rangeMaxInput.max);

  let minValue = Number(priceMinInput.value);
  let maxValue = Number(priceMaxInput.value);

  if (!Number.isFinite(minValue)) {
    minValue = absoluteMin;
  }

  if (!Number.isFinite(maxValue)) {
    maxValue = absoluteMax;
  }

  minValue = Math.max(absoluteMin, Math.min(minValue, absoluteMax));

  maxValue = Math.max(absoluteMin, Math.min(maxValue, absoluteMax));

  if (minValue > maxValue) {
    if (source === 'min') {
      minValue = maxValue;
    } else {
      maxValue = minValue;
    }
  }

  priceMinInput.value = String(minValue);
  priceMaxInput.value = String(maxValue);

  rangeMinInput.value = String(minValue);
  rangeMaxInput.value = String(maxValue);
}

function getMatchingVariants(product) {
  const colors = getSelectedValues('color');

  const thicknesses = getSelectedValues('thickness').map(Number);

  const minPrice = Number(priceMinInput.value) || Number(priceMinInput.min);

  const maxPrice = Number(priceMaxInput.value) || Number(priceMaxInput.max);

  return product.variants.filter((variant) => {
    const colorMatches = colors.length === 0 || colors.includes(variant.color);

    const thicknessMatches =
      thicknesses.length === 0 || thicknesses.includes(variant.thickness);

    const priceMatches =
      Number(variant.price) <= 0 ||
      (variant.price >= minPrice && variant.price <= maxPrice);

    return colorMatches && thicknessMatches && priceMatches;
  });
}

function getFilteredProducts() {
  const activeCategory = getActiveCategory();

  return catalogProducts.filter((product) => {
    const categoryMatches = product.category?.name === activeCategory;

    if (!categoryMatches) {
      return false;
    }

    return getMatchingVariants(product).length > 0;
  });
}

function getDisplayVariants(product) {
  const variants = getMatchingVariants(product);

  if (variants.length) {
    return variants;
  }

  return product.variants;
}

function getDisplayVariant(product) {
  const variants = getDisplayVariants(product);

  if (!variants.length) {
    return null;
  }

  return variants[0];
}

function getDisplayPrice(product) {
  const variants = getDisplayVariants(product);

  if (!variants.length) {
    return null;
  }

  return Math.min(...variants.map((variant) => variant.price));
}

function sortProducts(products) {
  const sortValue = sortSelect.value;
  const sorted = [...products];

  if (sortValue === 'price-asc') {
    return sorted.sort(
      (a, b) =>
        (getDisplayPrice(a) ?? Infinity) - (getDisplayPrice(b) ?? Infinity),
    );
  }

  if (sortValue === 'price-desc') {
    return sorted.sort(
      (a, b) => (getDisplayPrice(b) ?? 0) - (getDisplayPrice(a) ?? 0),
    );
  }

  if (sortValue === 'name') {
    return sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  return sorted.sort((a, b) => a.order - b.order);
}

function createProductCard(product) {
  const variant = getDisplayVariant(product);
  const displayPrice = getDisplayPrice(product);

  if (!variant || displayPrice === null) {
    return null;
  }

  const article = document.createElement('article');

  article.className = 'catalog-card';

  const productName = escapeHtml(product.name);
  const productSlug = encodeURIComponent(product.slug);

  const imagePath = escapeHtml(product.image?.path || '');

  const imageAlt = escapeHtml(product.image?.alt || product.name);

  const color = escapeHtml(variant.color || 'Цвет уточняется');

  const thickness =
    variant.thickness !== null && variant.thickness !== undefined
      ? `${escapeHtml(variant.thickness)} мм`
      : 'Толщина уточняется';

  const size = escapeHtml(product.size || 'Размер уточняется');

  const purpose = escapeHtml(product.purpose || 'Назначение уточняется');

  const unit = escapeHtml(product.unit || 'шт.');

  article.innerHTML = `
    <a
      href="/product?slug=${productSlug}"
      class="catalog-card__image"
      aria-label="${productName}"
    >
      ${
        imagePath
          ? `
            <img
              src="${imagePath}"
              alt="${imageAlt}"
              loading="lazy"
            />
          `
          : ''
      }
    </a>

    <div class="catalog-card__content">
      <a
        href="/product?slug=${productSlug}"
        class="catalog-card__title"
      >
        ${productName}
      </a>

      <p class="catalog-card__meta">
        ${thickness} · ${color}
      </p>

      <ul class="catalog-card__features">
        <li>${size}</li>
        <li>${purpose}</li>
      </ul>

      <p class="catalog-card__price">
       ${getPriceLabel(displayPrice, unit)}
      </p>

      <button
        class="catalog-card__button"
        type="button"
        data-add-to-cart
        data-product-id="${product.id}"
        data-variant-id="${variant.id}"
      >
        В корзину
      </button>
    </div>
  `;

  return article;
}

function syncCategoryUI(category) {
  categoryTabs.forEach((button) => {
    const isActive = button.dataset.categoryTab === category;

    button.classList.toggle('is-active', isActive);
  });

  const categoryInput = filtersForm.querySelector(
    `input[name="category"][value="${CSS.escape(category)}"]`,
  );

  if (categoryInput) {
    categoryInput.checked = true;
  }
}

function renderCategories() {
  if (!categoryTabsContainer || !categoryFiltersContainer) {
    return;
  }

  const categories = [
    ...new Set(
      catalogProducts.map((product) => product.category?.name).filter(Boolean),
    ),
  ];

  categoryTabsContainer.innerHTML = '';
  categoryFiltersContainer.innerHTML = '';

  categories.forEach((category, index) => {
    const button = document.createElement('button');
    button.className = 'catalog-categories__button';
    button.type = 'button';
    button.dataset.categoryTab = category;
    button.textContent = category;

    if (index === 0) {
      button.classList.add('is-active');
    }

    categoryTabsContainer.append(button);

    const label = document.createElement('label');
    label.className = 'catalog-check';
    label.innerHTML = `
      <input type="radio" name="category" value="${escapeHtml(category)}" ${index === 0 ? 'checked' : ''}>
      <span>${escapeHtml(category)}</span>
    `;

    categoryFiltersContainer.append(label);
  });

  categoryTabs = [...document.querySelectorAll('[data-category-tab]')];

  categoryTabs.forEach((button) => {
    button.addEventListener('click', () => {
      const category = button.dataset.categoryTab;
      const input = filtersForm.querySelector(
        `input[name="category"][value="${CSS.escape(category)}"]`,
      );

      if (input) {
        input.checked = true;
      }

      syncCategoryUI(category);
      renderColors();
      renderCatalog();
    });
  });
}

function renderColors() {
  if (!colorFiltersContainer) {
    return;
  }

  const activeCategory = getActiveCategory();

  const colors = [
    ...new Set(
      catalogProducts
        .filter((product) => {
          return !activeCategory || product.category?.name === activeCategory;
        })
        .flatMap((product) => product.variants || [])
        .map((variant) => variant.color)
        .filter(Boolean),
    ),
  ];

  colorFiltersContainer.innerHTML = '';

  colors.forEach((color) => {
    const label = document.createElement('label');

    label.className = 'catalog-color';
    label.title = color;
    label.setAttribute('aria-label', color);

    label.innerHTML = `
      <input
        type="checkbox"
        name="color"
        value="${escapeHtml(color)}"
      />

      <span data-color="${escapeHtml(getColorHex(color))}"></span>
    `;

    colorFiltersContainer.append(label);

    applyColorSwatches();
  });
}

function applyColorSwatches() {
  document.querySelectorAll('[data-color]').forEach((element) => {
    const color = element.dataset.color;

    element.style.setProperty('--swatch', color);
  });
}

function renderCatalog() {
  normalizePriceInputs();

  const activeCategory = getActiveCategory();

  const products = sortProducts(getFilteredProducts());

  syncCategoryUI(activeCategory);

  grid.innerHTML = '';

  products.forEach((product) => {
    const card = createProductCard(product);

    if (card) {
      grid.append(card);
    }
  });

  const total = products.length;

  resultsCount.textContent = String(total);
  filterCount.textContent = String(total);

  const hasProducts = total > 0;

  grid.hidden = !hasProducts;
  emptyState.hidden = hasProducts;
}

function resetFilters(category = 'Тротуарная плитка') {
  filtersForm.reset();

  const categoryInput = filtersForm.querySelector(
    `input[name="category"][value="${CSS.escape(category)}"]`,
  );

  if (categoryInput) {
    categoryInput.checked = true;
  }

  priceMinInput.value = '500';
  priceMaxInput.value = '2500';

  rangeMinInput.value = '500';
  rangeMaxInput.value = '2500';

  sortSelect.value = 'popular';

  renderCatalog();
}

function openFilters() {
  filterPanel.classList.add('is-open');
  filterOverlay.classList.add('is-open');

  filterOpen.setAttribute('aria-expanded', 'true');

  document.body.classList.add('catalog-filters-open');
}

function closeFilters() {
  filterPanel.classList.remove('is-open');
  filterOverlay.classList.remove('is-open');

  filterOpen.setAttribute('aria-expanded', 'false');

  document.body.classList.remove('catalog-filters-open');
}

async function loadCatalogProducts() {
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
    throw new Error(data.error || 'Не удалось загрузить каталог.');
  }

  if (!Array.isArray(data.products)) {
    throw new Error('Сервер вернул некорректные данные каталога.');
  }

  catalogProducts = data.products;
}

function showCatalogLoadError(error) {
  console.error('Ошибка загрузки каталога:', error);

  grid.innerHTML = '';

  resultsCount.textContent = '0';
  filterCount.textContent = '0';

  grid.hidden = true;
  emptyState.hidden = false;

  const title = emptyState.querySelector('h2');
  const description = emptyState.querySelector('p');

  if (title) {
    title.textContent = 'Не удалось загрузить каталог';
  }

  if (description) {
    description.textContent =
      'Обновите страницу или попробуйте ещё раз немного позже.';
  }
}

filtersForm.addEventListener('change', (event) => {
  if (event.target.matches('input[name="category"]')) {
    syncCategoryUI(event.target.value);
  }

  renderCatalog();
});

filtersForm.addEventListener('reset', () => {
  window.setTimeout(() => {
    priceMinInput.value = '500';
    priceMaxInput.value = '2500';

    rangeMinInput.value = '500';
    rangeMaxInput.value = '2500';

    renderCatalog();
  }, 0);
});

priceMinInput.addEventListener('input', () => {
  normalizePriceInputs('min');
  renderCatalog();
});

priceMaxInput.addEventListener('input', () => {
  normalizePriceInputs('max');
  renderCatalog();
});

rangeMinInput.addEventListener('input', () => {
  priceMinInput.value = rangeMinInput.value;

  normalizePriceInputs('min');
  renderCatalog();
});

rangeMaxInput.addEventListener('input', () => {
  priceMaxInput.value = rangeMaxInput.value;

  normalizePriceInputs('max');
  renderCatalog();
});

sortSelect.addEventListener('change', renderCatalog);

categoryTabs.forEach((button) => {
  button.addEventListener('click', () => {
    const category = button.dataset.categoryTab;

    const input = filtersForm.querySelector(
      `input[name="category"][value="${CSS.escape(category)}"]`,
    );

    if (input) {
      input.checked = true;
    }

    syncCategoryUI(category);
    renderCatalog();
  });
});

grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-to-cart]');

  if (!button) {
    return;
  }

  addToCart(button.dataset.productId, button.dataset.variantId, button);
});

filterOpen.addEventListener('click', openFilters);

filterClose.addEventListener('click', closeFilters);

filterOverlay.addEventListener('click', closeFilters);

filterApply.addEventListener('click', () => {
  renderCatalog();
  closeFilters();
});

emptyReset.addEventListener('click', () => {
  resetFilters();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && filterPanel.classList.contains('is-open')) {
    closeFilters();
  }
});

async function initCatalog() {
  try {
    await loadCatalogProducts();

    renderCategories();
    renderColors();

    renderCatalog();
  } catch (error) {
    showCatalogLoadError(error);
  }
}

initCatalog();
