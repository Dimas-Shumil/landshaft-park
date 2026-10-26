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
let availableCategories = [];

const colorFiltersContainer = document.querySelector('[data-color-filters]');
const colorFilterSection = colorFiltersContainer?.closest('.catalog-filter');
const thicknessFiltersContainer = document.querySelector(
  '[data-thickness-filters]',
);
const variantFilterTitle = document.querySelector('[data-variant-filter-title]');

function isFenceCategory() {
  return /забор/i.test(getActiveCategory());
}

const priceMinInput = document.querySelector('[data-price-min]');
const priceMaxInput = document.querySelector('[data-price-max]');
const rangeMinInput = document.querySelector('[data-range-min]');
const rangeMaxInput = document.querySelector('[data-range-max]');
const priceScaleMin = document.querySelector('[data-price-scale-min]');
const priceScaleMax = document.querySelector('[data-price-scale-max]');

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

function getSafeColorHex(value) {
  const colorHex = String(value ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(colorHex) ? colorHex : '#777777';
}

function createSwatchMarkup(colorHex) {
  return `<span><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="17" fill="${escapeHtml(getSafeColorHex(colorHex))}"></circle></svg></span>`;
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
      colorHex: variant.colorHex,
      thickness: variant.thickness,
      fencePanelCount: variant.fencePanelCount,

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

  return input ? input.value : '';
}

function isFenceProduct(product) {
  return /забор/i.test(product?.category?.name || '');
}

function getCategoryVariants() {
  const activeCategory = getActiveCategory();
  return catalogProducts
    .filter((product) => !activeCategory || product.category?.name === activeCategory)
    .flatMap((product) => product.variants || []);
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

  const fence = isFenceCategory();
  const thicknesses = getSelectedValues(fence ? 'fencePanelCount' : 'thickness').map(Number);

  const minPrice = Number(priceMinInput.value) || Number(priceMinInput.min);

  const maxPrice = Number(priceMaxInput.value) || Number(priceMaxInput.max);

  return product.variants.filter((variant) => {
    const colorMatches = colors.length === 0 || colors.includes(variant.color);

    const thicknessMatches =
      thicknesses.length === 0 || thicknesses.includes(Number(fence ? variant.fencePanelCount : variant.thickness));

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

  const color = variant.color ? escapeHtml(variant.color) : '';

  const thickness = isFenceProduct(product)
    ? (variant.fencePanelCount ? `${variant.fencePanelCount} ${variant.fencePanelCount === 1 ? 'плита' : 'плиты'}` : 'Количество плит уточняется')
    : (variant.thickness != null ? `${escapeHtml(variant.thickness)} мм` : 'Толщина уточняется');

  const variantMeta = [thickness, color].filter(Boolean).join(' · ');

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
        ${variantMeta}
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
    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
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

  // Берём только категории, где есть доступные в каталоге товары.
  availableCategories = [...new Map(
    catalogProducts
      .map((product) => product.category)
      .filter((category) => category?.name && category?.slug)
      .map((category) => [category.slug, category]),
  ).values()];

  const currentSlug = window.location.pathname.match(
    /^\/catalog\/([a-z0-9]+(?:-[a-z0-9]+)*)$/,
  )?.[1];
  const selectedCategory = availableCategories.find(
    (category) => category.slug === currentSlug,
  ) || availableCategories[0];

  categoryTabsContainer.innerHTML = '';
  categoryFiltersContainer.innerHTML = '';

  availableCategories.forEach((category) => {
    const button = document.createElement('a');
    button.className = 'catalog-categories__button';
    button.href = `/catalog/${encodeURIComponent(category.slug)}`;
    button.dataset.categoryTab = category.name;
    button.textContent = category.name;

    const isSelected = category.slug === selectedCategory?.slug;

    if (isSelected) {
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'page');
    }

    categoryTabsContainer.append(button);

    const label = document.createElement('label');
    label.className = 'catalog-check';
    label.innerHTML = `
      <input type="radio" name="category" value="${escapeHtml(category.name)}" ${isSelected ? 'checked' : ''}>
      <span>${escapeHtml(category.name)}</span>
    `;

    categoryFiltersContainer.append(label);
  });

  categoryTabs = [...categoryTabsContainer.querySelectorAll('[data-category-tab]')];
}

function renderColors() {
  if (!colorFiltersContainer) {
    return;
  }

  const colors = new Map();
  getCategoryVariants().forEach((variant) => {
    if (variant.color && !colors.has(variant.color)) {
      colors.set(variant.color, variant.colorHex);
    }
  });

  colorFiltersContainer.innerHTML = '';
  if (colorFilterSection) colorFilterSection.hidden = colors.size === 0;

  colors.forEach((colorHex, color) => {
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

      ${createSwatchMarkup(colorHex)}
    `;

    colorFiltersContainer.append(label);
  });
}

function renderThicknesses() {
  if (!thicknessFiltersContainer) return;
  const fence = isFenceCategory();
  if (variantFilterTitle) variantFilterTitle.textContent = fence ? 'Количество плит' : 'Толщина, мм';
  const values = [...new Set(
    getCategoryVariants()
      .map((variant) => Number(fence ? variant.fencePanelCount : variant.thickness))
      .filter((value) => Number.isInteger(value) && value > 0 && (!fence || value <= 4)),
  )].sort((a, b) => a - b);

  thicknessFiltersContainer.replaceChildren();
  values.forEach((value) => {
    const label = document.createElement('label');
    label.className = 'catalog-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = fence ? 'fencePanelCount' : 'thickness';
    input.value = String(value);
    const span = document.createElement('span');
    span.textContent = fence ? `${value} ${value === 1 ? 'плита' : value < 5 ? 'плиты' : 'плит'}` : String(value);
    label.append(input, span);
    thicknessFiltersContainer.append(label);
  });
}

function configurePriceRange() {
  const prices = getCategoryVariants()
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const minimum = prices.length ? Math.floor(Math.min(...prices) / 10) * 10 : 0;
  const maximum = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 1;
  const safeMaximum = Math.max(minimum + 1, maximum);

  [priceMinInput, rangeMinInput].forEach((input) => {
    input.min = String(minimum);
    input.max = String(safeMaximum);
    input.value = String(minimum);
  });
  [priceMaxInput, rangeMaxInput].forEach((input) => {
    input.min = String(minimum);
    input.max = String(safeMaximum);
    input.value = String(safeMaximum);
  });
  if (priceScaleMin) priceScaleMin.textContent = formatPrice(minimum);
  if (priceScaleMax) priceScaleMax.textContent = formatPrice(safeMaximum);
}

function renderDynamicFilters() {
  renderColors();
  renderThicknesses();
  configurePriceRange();
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

function resetFilters(category = getActiveCategory()) {
  filtersForm.reset();

  const categoryInput = filtersForm.querySelector(
    `input[name="category"][value="${CSS.escape(category)}"]`,
  );

  if (categoryInput) {
    categoryInput.checked = true;
  }

  configurePriceRange();

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
    const category = availableCategories.find(
      (item) => item.name === event.target.value,
    );

    if (category) {
      window.location.assign(`/catalog/${encodeURIComponent(category.slug)}`);
      return;
    }
  }

  renderCatalog();
});

filtersForm.addEventListener('reset', () => {
  window.setTimeout(() => {
    configurePriceRange();

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
    renderDynamicFilters();

    renderCatalog();
  } catch (error) {
    showCatalogLoadError(error);
  }
}

initCatalog();
