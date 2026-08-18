'use strict';

const CATALOG_CART_KEY = 'landshaftParkCart';

const TEMP_CATALOG_PRODUCTS = [
  {
    id: 'old-city-grey-60',
    slug: 'old-city-grey-60',
    name: 'Старый город',
    category: 'Тротуарная плитка',
    image: '/site/images/main-tovari/old-city.png',
    thickness: 60,
    color: 'Серый',
    size: '60 / 90 / 120 мм',
    purpose: 'Для двора и дорожек',
    price: 1250,
    order: 1,
  },
  {
    id: 'brick-brown-60',
    slug: 'brick-brown-60',
    name: 'Кирпичик',
    category: 'Тротуарная плитка',
    image: '/site/images/main-tovari/kirpichik.png',
    thickness: 60,
    color: 'Коричневый',
    size: '200 × 100 × 60 мм',
    purpose: 'Парковки и отмостки',
    price: 1150,
    order: 2,
  },
  {
    id: 'classic-grey-60',
    slug: 'classic-grey-60',
    name: 'Классика',
    category: 'Тротуарная плитка',
    image: '/site/images/main-tovari/classik.png',
    thickness: 60,
    color: 'Серый',
    size: '200 × 200 × 60 мм',
    purpose: 'Универсальное решение',
    price: 1190,
    order: 3,
  },
  {
    id: 'parket-graphite-60',
    slug: 'parket-graphite-60',
    name: 'Паркет',
    category: 'Тротуарная плитка',
    image: '/site/images/main-tovari/parket.png',
    thickness: 60,
    color: 'Графит',
    size: '300 × 150 × 60 мм',
    purpose: 'Премиальный вид',
    price: 1290,
    order: 4,
  },
];

const grid = document.querySelector('[data-products-grid]');
const emptyState = document.querySelector('[data-empty]');
const resultsCount = document.querySelector('[data-results-count]');
const filterCount = document.querySelector('[data-filter-count]');
const filtersForm = document.querySelector('[data-filters]');
const sortSelect = document.querySelector('[data-sort]');
const categoryTabs = [...document.querySelectorAll('[data-category-tab]')];

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

function addToCart(productId, button) {
  const product = TEMP_CATALOG_PRODUCTS.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  const cart = getCart();
  const existingItem = cart.find((item) => item.productId === productId);

  if (existingItem) {
    existingItem.quantity = (Number(existingItem.quantity) || 1) + 1;
  } else {
    cart.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      price: product.price,
      unit: 'м²',
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

function getFilteredProducts() {
  const activeCategory = getActiveCategory();
  const colors = getSelectedValues('color');
  const thicknesses = getSelectedValues('thickness').map(Number);

  const minPrice = Number(priceMinInput.value) || 500;
  const maxPrice = Number(priceMaxInput.value) || 2500;

  return TEMP_CATALOG_PRODUCTS.filter((product) => {
    const categoryMatches = product.category === activeCategory;
    const colorMatches = colors.length === 0 || colors.includes(product.color);
    const thicknessMatches =
      thicknesses.length === 0 || thicknesses.includes(product.thickness);
    const priceMatches = product.price >= minPrice && product.price <= maxPrice;

    return categoryMatches && colorMatches && thicknessMatches && priceMatches;
  });
}

function sortProducts(products) {
  const sortValue = sortSelect.value;
  const sorted = [...products];

  if (sortValue === 'price-asc') {
    return sorted.sort((a, b) => a.price - b.price);
  }

  if (sortValue === 'price-desc') {
    return sorted.sort((a, b) => b.price - a.price);
  }

  if (sortValue === 'name') {
    return sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  return sorted.sort((a, b) => a.order - b.order);
}

function createProductCard(product) {
  const article = document.createElement('article');
  article.className = 'catalog-card';

  article.innerHTML = `
    <a
      href="/product.html?slug=${encodeURIComponent(product.slug)}"
      class="catalog-card__image"
      aria-label="${product.name}"
    >
      <img
        src="${product.image}"
        alt="${product.name}, ${product.color.toLowerCase()}"
        loading="lazy"
      />
    </a>

    <div class="catalog-card__content">
      <a
        href="/product.html?slug=${encodeURIComponent(product.slug)}"
        class="catalog-card__title"
      >
        ${product.name}
      </a>

      <p class="catalog-card__meta">
        ${product.thickness} мм · ${product.color}
      </p>

      <ul class="catalog-card__features">
        <li>${product.size}</li>
        <li>${product.purpose}</li>
      </ul>

      <p class="catalog-card__price">
        от ${formatPrice(product.price)} ₽/м²
      </p>

      <button
        class="catalog-card__button"
        type="button"
        data-add-to-cart="${product.id}"
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

function renderCatalog() {
  normalizePriceInputs();

  const activeCategory = getActiveCategory();
  const products = sortProducts(getFilteredProducts());

  syncCategoryUI(activeCategory);

  grid.innerHTML = '';

  products.forEach((product) => {
    grid.append(createProductCard(product));
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

  addToCart(button.dataset.addToCart, button);
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

renderCatalog();
