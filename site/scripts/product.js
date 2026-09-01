'use strict';

const PRODUCT_CART_KEY = 'landshaftParkCart';
const PRODUCT_MAX_ESTIMATED_TOTAL = 2_000_000_000;
const FENCE_LAYOUT_EPSILON = 1e-9;

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
const basicAreaWrap = document.querySelector('[data-product-area-basic]');
const basicAreaInput = document.querySelector('[data-product-area-basic-input]');
const calculatorElement = document.querySelector('[data-product-calculator]');
const calculatorTitle = document.querySelector('[data-calculator-title]');
const pavingCalculator = document.querySelector('[data-calculator-paving]');
const fenceCalculator = document.querySelector('[data-calculator-fence]');
const fenceLengthInput = document.querySelector('[data-fence-length]');
const fenceHeightInput = document.querySelector('[data-fence-height]');
const calculatorMessage = document.querySelector('[data-calculator-message]');
const calculatorResult = document.querySelector('[data-calculator-result]');
const calculatorResultContent = document.querySelector('[data-calculator-result-content]');
const calculatorDisclaimer = document.querySelector('[data-calculator-disclaimer]');

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
let currentCalculation = null;

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

function formatMeasurement(value) {
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function roundMeasurement(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getCalculatorType() {
  const type = String(currentProduct?.calculator?.type || 'NONE');
  return ['PAVING', 'FENCE'].includes(type) ? type : 'NONE';
}

function getSelectedVariantLabel() {
  return [
    selectedVariant?.name,
    selectedVariant?.color,
    selectedVariant?.thickness ? `${selectedVariant.thickness} мм` : '',
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' / ');
}

function hideCalculation() {
  currentCalculation = null;
  calculatorResult.hidden = true;
  calculatorResultContent.innerHTML = '';
  calculatorMessage.hidden = true;
  calculatorMessage.textContent = '';
}

function showCalculatorMessage(message) {
  currentCalculation = null;
  calculatorResult.hidden = true;
  calculatorResultContent.innerHTML = '';
  calculatorMessage.textContent = message;
  calculatorMessage.hidden = false;
}

function renderCalculation(rows, disclaimer) {
  calculatorResultContent.innerHTML = rows
    .map(
      ({ label, value, strong = false }) => `
        <div${strong ? ' class="is-total"' : ''}>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `,
    )
    .join('');
  calculatorDisclaimer.textContent = disclaimer;
  calculatorMessage.hidden = true;
  calculatorResult.hidden = false;
}

function updatePavingCalculation() {
  const rawArea = String(areaInput?.value || '').trim();

  if (!rawArea) {
    hideCalculation();
    return;
  }

  const area = Number(rawArea);
  const wastePercent = Number(currentProduct?.calculator?.paving?.wastePercent);

  if (!Number.isFinite(area) || area <= 0 || area > 100000) {
    showCalculatorMessage('Укажите площадь от 0,1 до 100 000 м².');
    return;
  }

  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent > 50) {
    showCalculatorMessage('Для товара пока не настроен процент запаса. Менеджер рассчитает его вручную.');
    return;
  }

  const wasteArea = roundMeasurement((area * wastePercent) / 100);
  const purchaseArea = roundMeasurement(area + wasteArea);
  const unitPrice = Number(selectedVariant?.price);
  const hasPrice = Number.isFinite(unitPrice) && unitPrice > 0;
  const total = hasPrice ? Math.round(purchaseArea * unitPrice) : null;

  if (total !== null && (!Number.isSafeInteger(total) || total > PRODUCT_MAX_ESTIMATED_TOTAL)) {
    showCalculatorMessage('Предварительная стоимость превышает допустимый лимит. Оставьте заявку для ручного расчёта.');
    return;
  }

  currentCalculation = {
    type: 'PAVING',
    area: roundMeasurement(area),
    wastePercent,
    wasteArea,
    purchaseArea,
    unitPrice: hasPrice ? unitPrice : null,
    total,
  };

  renderCalculation(
    [
      { label: 'Площадь участка', value: `${formatMeasurement(area)} м²` },
      { label: `Рекомендуемый запас ${formatMeasurement(wastePercent)}%`, value: `+${formatMeasurement(wasteArea)} м²` },
      { label: 'К закупке', value: `${formatMeasurement(purchaseArea)} м²` },
      { label: currentProduct.name, value: getSelectedVariantLabel() || 'Стандарт' },
      { label: 'Цена', value: hasPrice ? `${formatPrice(unitPrice)} ₽/м²` : 'По запросу' },
      { label: 'Предварительная стоимость', value: total === null ? 'Уточнит менеджер' : `${formatPrice(total)} ₽`, strong: true },
    ],
    'Расчёт предварительный. Точное количество и итоговую стоимость подтвердит менеджер.',
  );
}

function updateFenceCalculation() {
  const rawLength = String(fenceLengthInput?.value || '').trim();
  const rawHeight = String(fenceHeightInput?.value || '').trim();

  if (!rawLength || !rawHeight) {
    hideCalculation();
    return;
  }

  const length = Number(rawLength);
  const height = Number(rawHeight);

  if (!Number.isFinite(length) || length <= 0 || length > 100000) {
    showCalculatorMessage('Укажите длину забора от 0,1 до 100 000 м.');
    return;
  }

  if (!Number.isFinite(height) || height <= 0 || height > 20) {
    showCalculatorMessage('Укажите высоту забора от 0,1 до 20 м.');
    return;
  }

  const sectionWidth = Number(currentProduct?.calculator?.fence?.sectionWidth);
  const panelHeight = Number(currentProduct?.calculator?.fence?.panelHeight);
  const postWidth = Number(currentProduct?.calculator?.fence?.postWidth);
  const postHeight = Number(currentProduct?.calculator?.fence?.postHeight);
  const postPriceValue = currentProduct?.calculator?.fence?.postPrice;
  const postPrice = postPriceValue === null ? null : Number(postPriceValue);
  const panelPrice = Number(selectedVariant?.price);

  if (
    !Number.isFinite(sectionWidth) ||
    sectionWidth <= 0 ||
    !Number.isFinite(panelHeight) ||
    panelHeight <= 0 ||
    !Number.isFinite(postWidth) ||
    postWidth <= 0 ||
    !Number.isFinite(postHeight) ||
    postHeight <= 0 ||
    !Number.isInteger(postPrice) ||
    postPrice < 0
  ) {
    showCalculatorMessage('Для этого забора пока не заполнены технические параметры. Менеджер выполнит расчёт вручную.');
    return;
  }

  if (height > postHeight) {
    showCalculatorMessage(
      `Высота забора не должна превышать ${formatMeasurement(postHeight)} м — высоту столба.`,
    );
    return;
  }

  const sections = Math.max(
    1,
    Math.ceil(
      (length - postWidth) / (sectionWidth + postWidth) -
        FENCE_LAYOUT_EPSILON,
    ),
  );
  const panelsPerSection = Math.ceil(height / panelHeight);
  const panels = sections * panelsPerSection;
  const posts = sections + 1;
  const configuredLength = roundMeasurement(
    sections * sectionWidth + posts * postWidth,
  );

  if (
    ![sections, panelsPerSection, panels, posts].every(Number.isSafeInteger) ||
    !Number.isFinite(configuredLength)
  ) {
    showCalculatorMessage('Получилось слишком большое количество элементов. Уменьшите длину или высоту.');
    return;
  }

  const hasPanelPrice = Number.isFinite(panelPrice) && panelPrice > 0;
  const panelsTotal = hasPanelPrice ? panels * panelPrice : null;
  const postsTotal = posts * postPrice;
  const total = panelsTotal === null ? null : panelsTotal + postsTotal;

  if (
    [panelsTotal, postsTotal, total].some(
      (value) =>
        value !== null &&
        (!Number.isSafeInteger(value) || value > PRODUCT_MAX_ESTIMATED_TOTAL),
    )
  ) {
    showCalculatorMessage('Предварительная стоимость превышает допустимый лимит. Оставьте заявку для ручного расчёта.');
    return;
  }

  currentCalculation = {
    type: 'FENCE',
    length: roundMeasurement(length),
    height: roundMeasurement(height),
    sectionWidth,
    panelHeight,
    postWidth,
    postHeight,
    configuredLength,
    sections,
    panelsPerSection,
    panels,
    posts,
    panelPrice: hasPanelPrice ? panelPrice : null,
    postPrice,
    panelsTotal,
    postsTotal,
    total,
  };

  renderCalculation(
    [
      { label: 'Длина забора', value: `${formatMeasurement(length)} м` },
      { label: 'Высота', value: `${formatMeasurement(height)} м` },
      { label: 'Расчётная длина', value: `${formatMeasurement(configuredLength)} м` },
      { label: 'Пролётов', value: `${sections} шт.` },
      { label: 'Заборных плит', value: `${panels} шт.` },
      { label: 'Столбов', value: `${posts} шт. (${formatMeasurement(postWidth)} × ${formatMeasurement(postHeight)} м)` },
      { label: 'Стоимость плит', value: panelsTotal === null ? 'По запросу' : `${formatPrice(panelsTotal)} ₽` },
      { label: 'Стоимость столбов', value: `${formatPrice(postsTotal)} ₽` },
      { label: 'Ориентировочная стоимость', value: total === null ? 'Уточнит менеджер' : `${formatPrice(total)} ₽`, strong: true },
    ],
    'Расчёт предварительный. Точное количество элементов, комплектацию и итоговую стоимость подтвердит менеджер.',
  );
}

function updateCalculator() {
  const type = getCalculatorType();
  if (type === 'PAVING') updatePavingCalculation();
  else if (type === 'FENCE') updateFenceCalculation();
  else hideCalculation();
}

function configureCalculator() {
  const type = getCalculatorType();
  calculatorElement.hidden = type === 'NONE';
  basicAreaWrap.hidden = type !== 'NONE';
  pavingCalculator.hidden = type !== 'PAVING';
  fenceCalculator.hidden = type !== 'FENCE';
  calculatorTitle.textContent = type === 'FENCE' ? 'Рассчитать забор' : 'Рассчитать плитку';
  hideCalculation();
}

function selectVariant(variant) {
  selectedVariant = variant;

  const hasPrice = Number(variant.price) > 0;
  priceElement.textContent = hasPrice
    ? `от ${formatPrice(variant.price)} ₽`
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

  updateCalculator();

}

function setMetaContent(attribute, name, content) {
  let meta = document.head.querySelector(`meta[${attribute}="${name}"]`);

  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.append(meta);
  }

  meta.setAttribute('content', String(content || ''));
}

function getAbsoluteUrl(value, baseUrl) {
  try {
    return new URL(String(value || ''), baseUrl).href;
  } catch {
    return '';
  }
}

function updateSeo(product) {
  const title = product.seo?.title || `${product.name} | Ландшафт Парк`;
  const description =
    product.seo?.description ||
    product.shortDescription ||
    `${product.name} — Ландшафт Парк`;
  const canonical = product.seo?.canonical || window.location.href;
  const mainImage = getMainImage(product);
  const imageUrl = mainImage
    ? getAbsoluteUrl(mainImage.path, canonical)
    : '';

  document.title = title;

  const metaDescription = document.querySelector('[data-product-description]');

  if (metaDescription) {
    metaDescription.setAttribute('content', description);
  }

  let canonicalLink = document.head.querySelector('link[rel="canonical"]');

  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.append(canonicalLink);
  }

  canonicalLink.href = canonical;

  setMetaContent('property', 'og:type', 'product');
  setMetaContent('property', 'og:site_name', 'Ландшафт Парк');
  setMetaContent('property', 'og:title', title);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:url', canonical);

  if (imageUrl) {
    setMetaContent('property', 'og:image', imageUrl);
  }

  setMetaContent('name', 'twitter:card', 'summary_large_image');
  setMetaContent('name', 'twitter:title', title);
  setMetaContent('name', 'twitter:description', description);

  if (imageUrl) {
    setMetaContent('name', 'twitter:image', imageUrl);
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

  unitElement.textContent = `/${product.unit || 'шт.'}`;

  if (product.shortDescription) {
    shortDescriptionElement.textContent = product.shortDescription;

    shortDescriptionElement.hidden = false;
  }

  sizeElement.textContent = product.size || 'Уточняется';

  purposeElement.textContent = product.purpose || 'Уточняется';

  renderGallery(product);
  renderVariants(product);
  configureCalculator();

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

  const calculatorType = getCalculatorType();
  const areaSource = calculatorType === 'NONE' ? basicAreaInput : areaInput;
  const areaValue = Number(areaSource?.value);
  const area = Number.isFinite(areaValue) && areaValue > 0 ? areaValue : null;
  const calculation = currentCalculation
    ? JSON.parse(JSON.stringify(currentCalculation))
    : null;
  const calculationKey = calculation
    ? calculation.type === 'PAVING'
      ? `PAVING:${calculation.area}`
      : `FENCE:${calculation.length}:${calculation.height}`
    : '';

  const cart = getCart();

  const existingItem = cart.find(
    (item) =>
      Number(item.variantId) === selectedVariant.id &&
      Number(item.area || 0) === Number(area || 0) &&
      String(item.calculationKey || '') === calculationKey,
  );

  if (existingItem) {
    existingItem.price = selectedVariant.price;
    existingItem.calculation = calculation;
    existingItem.calculationKey = calculationKey;
    existingItem.quantity = area || calculation
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
      calculation,
      calculationKey,
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
areaInput?.addEventListener('input', updateCalculator);
fenceLengthInput?.addEventListener('input', updateCalculator);
fenceHeightInput?.addEventListener('input', updateCalculator);

initProductPage();
