'use strict';

const PRODUCT_CART_KEY = 'landshaftParkCart';

const productView = document.querySelector('[data-product-view]');

const loadingState = document.querySelector('[data-product-loading]');

const errorState = document.querySelector('[data-product-error]');

const titleElement = document.querySelector('[data-product-title]');

const breadcrumbElement = document.querySelector('[data-product-breadcrumb]');

const categoryElement = document.querySelector('[data-product-category]');

const shortDescriptionElement = document.querySelector(
  '[data-product-short-description]',
);

const priceElement = document.querySelector('[data-product-price]');

const unitElement = document.querySelector('[data-product-unit]');

const variantsElement = document.querySelector('[data-product-variants]');

const mainImageElement = document.querySelector('[data-product-main-image]');

const thumbnailsElement = document.querySelector('[data-product-thumbnails]');

const previousGalleryButton = document.querySelector('[data-gallery-prev]');

const nextGalleryButton = document.querySelector('[data-gallery-next]');

const sizeElement = document.querySelector('[data-product-size]');

const thicknessElement = document.querySelector('[data-product-thickness]');

const colorElement = document.querySelector('[data-product-color]');
const colorRowElement = document.querySelector('[data-product-color-row]');

const purposeElement = document.querySelector('[data-product-purpose]');

const areaInput = document.querySelector('[data-product-area]');

const addButton = document.querySelector('[data-product-add]');

const descriptionSection = document.querySelector(
  '[data-product-description-section]',
);

const fullDescriptionElement = document.querySelector(
  '[data-product-full-description]',
);

const relatedSection = document.querySelector('[data-related-products]');

const relatedLoadingState = document.querySelector('[data-related-loading]');

const relatedEmptyState = document.querySelector('[data-related-empty]');

const relatedEmptyText = document.querySelector('[data-related-empty-text]');

const relatedGrid = document.querySelector('[data-related-grid]');

let currentProduct = null;
let selectedVariant = null;
let currentImageIndex = 0;

function formatPrice(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
}

function getSafeColorHex(value) {
  const colorHex = String(value ?? '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(colorHex) ? colorHex : '#777777';
}

function createSwatchMarkup(colorHex) {
  return `<svg class="product-info__swatch" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="${escapeHtml(getSafeColorHex(colorHex))}"></circle></svg>`;
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

function getSlug() {
  const params = new URLSearchParams(window.location.search);

  return String(params.get('slug') || '').trim();
}

function getCart() {
  try {
    const rawCart = localStorage.getItem(PRODUCT_CART_KEY);

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
  localStorage.setItem(PRODUCT_CART_KEY, JSON.stringify(cart));

  window.dispatchEvent(new Event('cart:updated'));
}

function getMainImage(product) {
  return (
    product.images.find((image) => image.isMain) || product.images[0] || null
  );
}

function getGalleryImages() {
  if (!currentProduct || !Array.isArray(currentProduct.images)) {
    return [];
  }

  return currentProduct.images;
}

function normalizeImageIndex(index) {
  const images = getGalleryImages();

  if (!images.length) {
    return 0;
  }

  return ((index % images.length) + images.length) % images.length;
}

function updateGalleryControls() {
  const images = getGalleryImages();
  const hasMultipleImages = images.length > 1;

  previousGalleryButton.hidden = !hasMultipleImages;

  nextGalleryButton.hidden = !hasMultipleImages;
}

function updateActiveThumbnail() {
  const images = getGalleryImages();
  const activeImage = images[currentImageIndex];

  if (!activeImage) {
    return;
  }

  thumbnailsElement
    .querySelectorAll('.product-gallery__thumb')
    .forEach((button) => {
      const isActive = Number(button.dataset.imageId) === activeImage.id;

      button.classList.toggle('is-active', isActive);

      button.setAttribute('aria-current', isActive ? 'true' : 'false');

      if (isActive) {
        button.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    });
}

function showImageByIndex(index) {
  const images = getGalleryImages();

  if (!images.length) {
    return;
  }

  currentImageIndex = normalizeImageIndex(index);

  const image = images[currentImageIndex];

  mainImageElement.innerHTML = `
    <img
      src="${escapeHtml(image.path)}"
      alt="${escapeHtml(image.alt)}"
      draggable="false"
    />
  `;

  updateActiveThumbnail();
}

function renderGallery(product) {
  thumbnailsElement.innerHTML = '';

  if (!product.images.length) {
    mainImageElement.innerHTML = `
      <div class="product-gallery__placeholder">
        Изображение готовится
      </div>
    `;

    previousGalleryButton.hidden = true;
    nextGalleryButton.hidden = true;

    return;
  }

  const mainImage = getMainImage(product);

  const mainImageIndex = product.images.findIndex(
    (image) => image.id === mainImage?.id,
  );

  currentImageIndex = mainImageIndex >= 0 ? mainImageIndex : 0;

  product.images.forEach((image, index) => {
    const button = document.createElement('button');

    button.type = 'button';

    button.className = 'product-gallery__thumb';

    button.dataset.imageId = String(image.id);

    button.setAttribute('aria-label', `Показать изображение ${index + 1}`);

    button.innerHTML = `
        <img
          src="${escapeHtml(image.path)}"
          alt="${escapeHtml(image.alt)}"
          loading="lazy"
          draggable="false"
        />
      `;

    button.addEventListener('click', () => {
      showImageByIndex(index);
    });

    thumbnailsElement.append(button);
  });

  updateGalleryControls();

  showImageByIndex(currentImageIndex);
}

function renderVariants(product) {
  variantsElement.innerHTML = '';

  if (product.variants.length <= 1) {
    return;
  }

  const appendGroup = (labelText, type, variants) => {
    const group = document.createElement('div');
    group.className = 'product-info__variant-group';
    const label = document.createElement('p');
    label.className = 'product-info__variants-label';
    label.textContent = labelText;
    const list = document.createElement('div');
    list.className = 'product-info__variants-list';

    variants.forEach((variant) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'product-info__variant';
      if (type === 'color') {
        button.dataset.optionColor = variant.color;
        button.innerHTML = `${createSwatchMarkup(variant.colorHex)}<span>${escapeHtml(variant.color)}</span>`;
      } else if (type === 'thickness') {
        button.dataset.optionThickness = String(variant.thickness);
        button.textContent = `${variant.thickness} мм`;
      } else {
        button.dataset.variantId = String(variant.id);
        button.textContent = [variant.name, variant.sku].filter(Boolean).join(' · ') || 'Вариант';
      }
      button.addEventListener('click', () => {
        if (type === 'variant') {
          selectVariant(variant);
          return;
        }
        const candidates = product.variants.filter((item) =>
          type === 'color'
            ? item.color === variant.color
            : Number(item.thickness) === Number(variant.thickness),
        );
        const compatible = candidates.find((item) =>
          type === 'color'
            ? Number(item.thickness) === Number(selectedVariant?.thickness)
            : item.color === selectedVariant?.color,
        );
        selectVariant(compatible || candidates[0]);
      });
      list.append(button);
    });
    group.append(label, list);
    variantsElement.append(group);
  };

  const colors = [...new Map(
    product.variants.filter((variant) => variant.color).map((variant) => [variant.color, variant]),
  ).values()];
  const thicknesses = [...new Map(
    product.variants
      .filter((variant) => Number.isFinite(Number(variant.thickness)))
      .map((variant) => [Number(variant.thickness), variant]),
  ).values()].sort((a, b) => Number(a.thickness) - Number(b.thickness));

  if (colors.length) appendGroup('Цвет', 'color', colors);
  if (thicknesses.length) appendGroup('Толщина', 'thickness', thicknesses);
  const combinationsCount = new Set(
    product.variants.map((variant) => `${variant.color || ''}\u0000${variant.thickness ?? ''}`),
  ).size;
  if ((!colors.length && !thicknesses.length) || combinationsCount < product.variants.length) {
    appendGroup('Вариант', 'variant', product.variants);
  }
}

function selectVariant(variant) {
  selectedVariant = variant;

  const hasPrice = Number(variant.price) > 0;
  priceElement.textContent = hasPrice
    ? `${formatPrice(variant.price)} ₽`
    : 'Цена по запросу';
  unitElement.hidden = !hasPrice;

  thicknessElement.textContent = variant.thickness
    ? `${variant.thickness} мм`
    : 'Уточняется';

  colorElement.textContent = variant.color || '';
  if (colorRowElement) colorRowElement.hidden = !variant.color;

  variantsElement.querySelectorAll('[data-option-color]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.optionColor === variant.color);
  });
  variantsElement.querySelectorAll('[data-option-thickness]').forEach((button) => {
    button.classList.toggle(
      'is-active',
      Number(button.dataset.optionThickness) === Number(variant.thickness),
    );
  });
  variantsElement.querySelectorAll('[data-variant-id]').forEach((button) => {
    button.classList.toggle(
      'is-active',
      Number(button.dataset.variantId) === Number(variant.id),
    );
  });
}

function updateSeo(product) {
  document.title = product.seo?.title || `${product.name} | Ландшафт Парк`;

  const metaDescription = document.querySelector('[data-product-description]');

  if (metaDescription) {
    metaDescription.setAttribute(
      'content',
      product.seo?.description ||
        product.shortDescription ||
        `${product.name} — Ландшафт Парк`,
    );
  }
}

function setRelatedState(state) {
  relatedLoadingState.hidden = state !== 'loading';

  relatedEmptyState.hidden = state !== 'empty';

  relatedGrid.hidden = state !== 'products';
}

function createRelatedProductCard(product) {
  const article = document.createElement('article');

  article.className = 'product-related-card';

  const productName = escapeHtml(product.name);

  const productSlug = encodeURIComponent(product.slug);

  const imagePath = escapeHtml(product.image?.path || '');

  const imageAlt = escapeHtml(product.image?.alt || product.name);

  const unit = escapeHtml(product.unit || 'шт.');

  const variant = Array.isArray(product.variants) ? product.variants[0] : null;

  const metaParts = [];

  if (variant?.thickness) {
    metaParts.push(`${escapeHtml(variant.thickness)} мм`);
  }

  if (variant?.color) {
    metaParts.push(escapeHtml(variant.color));
  }

  const meta = metaParts.join(' · ');

  const price = Number(product.minPrice);

  article.innerHTML = `
    <a
      class="product-related-card__image"
      href="/product?slug=${productSlug}"
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
          : `
            <div class="product-related-card__placeholder">
              Изображение готовится
            </div>
          `
      }
    </a>

    <div class="product-related-card__content">
      <p class="product-related-card__category">
        ${escapeHtml(product.category?.name || '')}
      </p>

      <a
        class="product-related-card__title"
        href="/product?slug=${productSlug}"
      >
        ${productName}
      </a>

      ${
        meta
          ? `
            <p class="product-related-card__meta">
              ${meta}
            </p>
          `
          : ''
      }

      ${
        Number.isFinite(price) && price > 0
          ? `
            <p class="product-related-card__price">
              от ${formatPrice(price)} ₽/${unit}
            </p>
          `
          : `<p class="product-related-card__price">Цена по запросу</p>`
      }

      <a
        class="product-related-card__link"
        href="/product?slug=${productSlug}"
      >
        Подробнее
        <span>→</span>
      </a>
    </div>
  `;

  return article;
}

function renderRelatedProducts(products) {
  relatedGrid.innerHTML = '';

  products.forEach((product) => {
    relatedGrid.append(createRelatedProductCard(product));
  });

  setRelatedState('products');
}

function showRelatedEmpty(message) {
  relatedEmptyText.textContent = message;

  relatedGrid.innerHTML = '';

  setRelatedState('empty');
}

async function loadRelatedProducts(product) {
  relatedSection.hidden = false;

  setRelatedState('loading');

  try {
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

    if (!response.ok || !Array.isArray(data.products)) {
      throw new Error('Не удалось загрузить подборку');
    }

    const relatedProducts = data.products
      .filter((item) => {
        const sameCategory = item.category?.id === product.category?.id;

        const isAnotherProduct = item.id !== product.id;

        return sameCategory && isAnotherProduct;
      })
      .slice(0, 4);

    if (!relatedProducts.length) {
      showRelatedEmpty('В этой категории пока нет других товаров.');

      return;
    }

    renderRelatedProducts(relatedProducts);
  } catch (error) {
    console.error('Ошибка загрузки похожих товаров:', error);

    showRelatedEmpty(
      'Сейчас не удалось загрузить подборку. Посмотрите весь каталог.',
    );
  }
}

function renderProduct(product) {
  currentProduct = product;

  titleElement.textContent = product.name;

  breadcrumbElement.textContent = product.name;

  categoryElement.textContent = product.category?.name || '';

  unitElement.textContent = `/ ${product.unit || 'шт.'}`;

  if (product.shortDescription) {
    shortDescriptionElement.textContent = product.shortDescription;

    shortDescriptionElement.hidden = false;
  }

  sizeElement.textContent = product.size || 'Уточняется';

  purposeElement.textContent = product.purpose || 'Уточняется';

  renderGallery(product);
  renderVariants(product);

  selectVariant(product.variants[0]);

  if (product.description) {
    fullDescriptionElement.textContent = product.description;

    descriptionSection.hidden = false;
  }

  updateSeo(product);

  loadingState.hidden = true;
  productView.hidden = false;
}

function addToCart() {
  if (!currentProduct || !selectedVariant) {
    return;
  }

  const areaValue = Number(areaInput.value);

  const area = Number.isFinite(areaValue) && areaValue > 0 ? areaValue : null;

  const cart = getCart();

  const existingItem = cart.find(
    (item) =>
      Number(item.variantId) === selectedVariant.id &&
      Number(item.area || 0) === Number(area || 0),
  );

  if (existingItem) {
    existingItem.quantity = area
      ? 1
      : (Number(existingItem.quantity) || 1) + 1;
  } else {
    const image = getMainImage(currentProduct);

    cart.push({
      productId: currentProduct.id,
      variantId: selectedVariant.id,

      slug: currentProduct.slug,
      name: currentProduct.name,

      variantName: selectedVariant.name,

      color: selectedVariant.color,
      colorHex: selectedVariant.colorHex,

      thickness: selectedVariant.thickness,

      image: image?.path || '',

      price: selectedVariant.price,

      unit: currentProduct.unit,

      quantity: 1,
      area,
    });
  }

  saveCart(cart);

  const originalText = addButton.textContent;

  addButton.textContent = 'Добавлено в корзину';

  addButton.classList.add('is-added');

  window.setTimeout(() => {
    addButton.textContent = originalText;

    addButton.classList.remove('is-added');
  }, 1200);
}

async function loadProduct(slug) {
  const response = await fetch(
    `/api/catalog/products/${encodeURIComponent(slug)}`,
    {
      method: 'GET',

      headers: {
        Accept: 'application/json',
      },

      cache: 'no-store',
    },
  );

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || 'Не удалось загрузить товар');
  }

  if (
    !data.product ||
    !Array.isArray(data.product.variants) ||
    data.product.variants.length === 0
  ) {
    throw new Error('Товар не содержит доступных вариантов');
  }

  return data.product;
}

function showError(error) {
  console.error('Ошибка страницы товара:', error);

  loadingState.hidden = true;
  productView.hidden = true;
  relatedSection.hidden = true;
  errorState.hidden = false;
}

async function initProductPage() {
  const slug = getSlug();

  if (!slug) {
    showError(new Error('В адресе отсутствует slug товара'));

    return;
  }

  try {
    const product = await loadProduct(slug);

    renderProduct(product);

    loadRelatedProducts(product);
  } catch (error) {
    showError(error);
  }
}

previousGalleryButton.addEventListener('click', () => {
  showImageByIndex(currentImageIndex - 1);
});

nextGalleryButton.addEventListener('click', () => {
  showImageByIndex(currentImageIndex + 1);
});

// swipe на мобильных устройствах

let swipeStartX = null;
let swipeStartY = null;

mainImageElement.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length !== 1 || getGalleryImages().length <= 1) {
      return;
    }

    const touch = event.touches[0];

    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
  },
  {
    passive: true,
  },
);

mainImageElement.addEventListener(
  'touchend',
  (event) => {
    if (
      swipeStartX === null ||
      swipeStartY === null ||
      !window.matchMedia('(max-width: 760px)').matches
    ) {
      swipeStartX = null;
      swipeStartY = null;

      return;
    }

    const touch = event.changedTouches[0];

    const deltaX = touch.clientX - swipeStartX;

    const deltaY = touch.clientY - swipeStartY;

    swipeStartX = null;
    swipeStartY = null;

    const minimumSwipeDistance = 45;

    if (
      Math.abs(deltaX) < minimumSwipeDistance ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    ) {
      return;
    }

    if (deltaX < 0) {
      showImageByIndex(currentImageIndex + 1);

      return;
    }

    showImageByIndex(currentImageIndex - 1);
  },
  {
    passive: true,
  },
);

addButton.addEventListener('click', addToCart);

initProductPage();
