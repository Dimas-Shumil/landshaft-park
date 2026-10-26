'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const prisma = require('../lib/prisma');
const { siteUrl } = require('../config/site');
const {
  createPublicUrl,
  escapeHtml,
  escapeXml,
  getCatalogStructuredData,
  getContactsStructuredData,
  getHomeStructuredData,
  getProductMeta,
  getProductStructuredData,
  getShareImage,
  injectStructuredData,
} = require('../lib/seo');

const router = express.Router();
const publicDir = path.join(__dirname, '..', 'public');
const componentsDir = path.join(__dirname, '..', 'components');
const headerTemplate = fs.readFileSync(
  path.join(componentsDir, 'header.html'),
  'utf8',
);
const footerTemplate = fs.readFileSync(
  path.join(componentsDir, 'footer.html'),
  'utf8',
);

function loadPageTemplate(filename) {
  return fs
    .readFileSync(path.join(publicDir, filename), 'utf8')
    .replace(
      '<div data-include="/components/header.html"></div>',
      headerTemplate,
    )
    .replace(
      '<div data-include="/components/footer.html"></div>',
      footerTemplate,
    );
}

const pageTemplates = Object.freeze({
  index: loadPageTemplate('index.html'),
  catalog: loadPageTemplate('catalog.html'),
  product: loadPageTemplate('product.html'),
  cart: loadPageTemplate('cart.html'),
  contacts: loadPageTemplate('contacts.html'),
});

const publishedProductWhere = {
  isPublished: true,
  variants: { some: { isActive: true } },
};

const catalogSeoProductSelect = {
  id: true,
  title: true,
  slug: true,
  images: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      imagePath: true,
      isMain: true,
    },
  },
};

function withServerRenderedCatalog(html, products) {
  // Товары видны в HTML ещё до выполнения JavaScript. Затем каталог
  // перерисует карточки с фильтрами, вариантами и кнопками корзины.
  const cards = products.map((product) => {
    const url = `/product?slug=${encodeURIComponent(product.slug)}`;
    const image = product.images?.find((item) => item.isMain) ||
      product.images?.[0] || null;
    const imageMarkup = image?.imagePath
      ? `<img src="${escapeHtml(image.imagePath)}" alt="${escapeHtml(product.title)}" loading="lazy" />`
      : '';

    return `<article class="catalog-card"><a class="catalog-card__image" href="${url}" aria-label="${escapeHtml(product.title)}">${imageMarkup}</a><div class="catalog-card__content"><a class="catalog-card__title" href="${url}">${escapeHtml(product.title)}</a></div></article>`;
  }).join('');

  return html.replace(
    '<div class="catalog-grid" data-products-grid></div>',
    `<div class="catalog-grid" data-products-grid>${cards}</div>`,
  );
}

function renderCategoryCatalog(category, products) {
  const pathname = `/catalog/${category.slug}`;
  const canonical = createPublicUrl(pathname);
  const title = category.seoTitle ||
    `${category.name} в Черногорске | Ландшафт Парк`;
  const description = category.seoDescription ||
    `${category.name} от производителя «Ландшафт Парк» в Черногорске. Характеристики, варианты и цены.`;

  const html = pageTemplates.catalog
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/\s*>/i,
      `<meta name="description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      /<link rel="canonical"[^>]*>/i,
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    )
    .replace(
      /<meta property="og:title"[\s\S]*?\/\s*>/i,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
    )
    .replace(
      /<meta property="og:description"[\s\S]*?\/\s*>/i,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      /<meta property="og:url"[^>]*>/i,
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:title"[\s\S]*?\/\s*>/i,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    )
    .replace(
      /<meta\s+name="twitter:description"[\s\S]*?\/\s*>/i,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    )
    .replace(
      '<span>Каталог</span>',
      `<a href="/catalog">Каталог</a><span aria-hidden="true">›</span><span>${escapeHtml(category.name)}</span>`,
    )
    .replace(
      '<h1>Каталог тротуарной плитки и элементов благоустройства</h1>',
      `<h1>${escapeHtml(category.name)}</h1>`,
    );

  return withServerRenderedCatalog(html, products);
}

const productSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  description: true,
  unit: true,
  dimensions: true,
  purpose: true,
  seoTitle: true,
  seoDescription: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  images: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      imagePath: true,
      alt: true,
      isMain: true,
      sortOrder: true,
    },
  },
  variants: {
    where: {
      isActive: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      sku: true,
      color: true,
      colorHex: true,
      thicknessMm: true,
      fencePanelCount: true,
      price: true,
      sortOrder: true,
    },
  },
};

function sendHtml(res, html, status = 200) {
  res
    .status(status)
    .type('html')
    .set('Cache-Control', 'no-store')
    .send(html);
}

function replaceElementContent(html, tagName, dataAttribute, content) {
  const pattern = new RegExp(
    `(<${tagName}\\b[^>]*\\b${dataAttribute}(?:=(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*>)[\\s\\S]*?(</${tagName}>)`,
    'i',
  );

  return html.replace(pattern, `$1${content}$2`);
}

function removeHiddenFromElement(html, dataAttribute) {
  const pattern = new RegExp(
    `(<[^>]+\\b${dataAttribute}(?:=(?:"[^"]*"|'[^']*'|[^\\s>]+))?[^>]*)\\shidden([^>]*>)`,
    'i',
  );

  return html.replace(pattern, '$1$2');
}

function addHiddenToElement(html, dataAttribute) {
  const pattern = new RegExp(
    `(<[^>]+\\b${dataAttribute}(?:=(?:"[^"]*"|'[^']*'|[^\\s>]+))?)([^>]*>)`,
    'i',
  );

  return html.replace(pattern, (match, start, end) => {
    if (/\shidden(?:\s|>)/i.test(match)) {
      return match;
    }

    return `${start} hidden${end}`;
  });
}

function formatPrice(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
}

function getSafeColorHex(value) {
  const colorHex = String(value || '').trim().toLowerCase();

  return /^#[0-9a-f]{6}$/.test(colorHex) ? colorHex : '#777777';
}

function createVariantMarkup(product) {
  if (!Array.isArray(product.variants) || product.variants.length <= 1) {
    return '';
  }

  const groups = [];
  const colors = [...new Map(
    product.variants
      .filter((variant) => String(variant.color || '').trim())
      .map((variant) => [variant.color, variant]),
  ).values()];
  const fence = /забор/i.test(product.category?.name || '');
  const panels = [...new Map(product.variants.filter((v) => Number.isInteger(v.fencePanelCount) && v.fencePanelCount >= 1 && v.fencePanelCount <= 4).map((v) => [v.fencePanelCount, v])).values()].sort((a,b) => a.fencePanelCount - b.fencePanelCount);
  const thicknesses = [...new Map(
    product.variants
      .filter((variant) => Number.isFinite(Number(variant.thicknessMm)))
      .map((variant) => [Number(variant.thicknessMm), variant]),
  ).values()].sort(
    (first, second) => Number(first.thicknessMm) - Number(second.thicknessMm),
  );

  if (colors.length) {
    const buttons = colors
      .map((variant, index) => {
        const color = escapeHtml(variant.color);
        const colorHex = escapeHtml(getSafeColorHex(variant.colorHex));

        return `<button type="button" class="product-info__variant${index === 0 ? ' is-active' : ''}" data-option-color="${color}"><svg class="product-info__swatch" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="${colorHex}"></circle></svg><span>${color}</span></button>`;
      })
      .join('');

    groups.push(`<div class="product-info__variant-group"><p class="product-info__variants-label">Цвет</p><div class="product-info__variants-list">${buttons}</div></div>`);
  }

  if (fence && panels.length) {
    const buttons = panels.map((v, index) => `<button type="button" class="product-info__variant${index === 0 ? ' is-active' : ''}" data-option-panels="${v.fencePanelCount}">${v.fencePanelCount} ${v.fencePanelCount === 1 ? 'плита' : 'плиты'}</button>`).join('');
    groups.push(`<div class="product-info__variant-group"><p class="product-info__variants-label">Количество плит</p><div class="product-info__variants-list">${buttons}</div></div>`);
  }

  if (!fence && thicknesses.length) {
    const buttons = thicknesses
      .map((variant, index) => {
        const thickness = escapeHtml(variant.thicknessMm);

        return `<button type="button" class="product-info__variant${index === 0 ? ' is-active' : ''}" data-option-thickness="${thickness}">${thickness} мм</button>`;
      })
      .join('');

    groups.push(`<div class="product-info__variant-group"><p class="product-info__variants-label">Толщина</p><div class="product-info__variants-list">${buttons}</div></div>`);
  }

  const combinationsCount = new Set(
    product.variants.map(
      (variant) => `${variant.color || ''}\u0000${fence ? variant.fencePanelCount ?? '' : variant.thicknessMm ?? ''}`,
    ),
  ).size;

  if (
    (!colors.length && !(fence ? panels.length : thicknesses.length)) ||
    combinationsCount < product.variants.length
  ) {
    const buttons = product.variants
      .map((variant, index) => {
        const label = [variant.name, variant.sku]
          .filter(Boolean)
          .map(escapeHtml)
          .join(' · ') || 'Вариант';

        return `<button type="button" class="product-info__variant${index === 0 ? ' is-active' : ''}" data-variant-id="${variant.id}">${label}</button>`;
      })
      .join('');

    groups.push(`<div class="product-info__variant-group"><p class="product-info__variants-label">Вариант</p><div class="product-info__variants-list">${buttons}</div></div>`);
  }

  return groups.join('');
}

function createGalleryMarkup(product) {
  const images = product.images || [];
  const mainImage = images.find((image) => image.isMain) || images[0] || null;

  if (!mainImage) {
    return {
      main: '<div class="product-gallery__placeholder">Изображение готовится</div>',
      thumbnails: '',
    };
  }

  const main = `<img src="${escapeHtml(mainImage.imagePath)}" alt="${escapeHtml(mainImage.alt || product.title)}" draggable="false" />`;
  const thumbnails = images
    .map((image, index) => {
      const isActive = image.id === mainImage.id;

      return `<button type="button" class="product-gallery__thumb${isActive ? ' is-active' : ''}" data-image-id="${image.id}" aria-label="Показать изображение ${index + 1}" aria-current="${isActive ? 'true' : 'false'}"><img src="${escapeHtml(image.imagePath)}" alt="${escapeHtml(image.alt || product.title)}" loading="lazy" draggable="false" /></button>`;
    })
    .join('');

  return { main, thumbnails };
}

function renderProductPage(product, nonce) {
  const meta = getProductMeta(product);
  const shareImage = getShareImage(product);
  const variant = product.variants[0];
  const hasPrice = Number(variant.price) > 0;
  const gallery = createGalleryMarkup(product);
  const headMarkup = [
    '<meta name="robots" content="index,follow,max-image-preview:large" data-product-robots />',
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" data-product-canonical />`,
    '<meta property="og:locale" content="ru_RU" />',
    '<meta property="og:type" content="product" />',
    '<meta property="og:site_name" content="Ландшафт Парк" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(shareImage)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(shareImage)}" />`,
  ].join('\n    ');
  let html = pageTemplates.product
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?data-product-description[\s\S]*?\/>/i,
      `<meta name="description" content="${escapeHtml(meta.description)}" data-product-description />`,
    )
    .replace(
      '<link rel="stylesheet" href="/site/css/product.min.css" />',
      `${headMarkup}\n\n    <link rel="stylesheet" href="/site/css/product.min.css" />`,
    );

  html = replaceElementContent(
    html,
    'span',
    'data-product-breadcrumb',
    escapeHtml(product.title),
  );
  html = replaceElementContent(
    html,
    'div',
    'data-product-main-image',
    gallery.main,
  );
  html = replaceElementContent(
    html,
    'div',
    'data-product-thumbnails',
    gallery.thumbnails,
  );
  html = replaceElementContent(
    html,
    'p',
    'data-product-category',
    escapeHtml(product.category?.name || ''),
  );
  html = replaceElementContent(
    html,
    'h1',
    'data-product-title',
    escapeHtml(product.title),
  );
  html = replaceElementContent(
    html,
    'p',
    'data-product-short-description',
    escapeHtml(product.shortDescription),
  );
  html = replaceElementContent(
    html,
    'strong',
    'data-product-price',
    hasPrice ? `от ${formatPrice(variant.price)} ₽` : 'Цена по запросу',
  );
  html = replaceElementContent(
    html,
    'span',
    'data-product-unit',
    hasPrice ? `/${escapeHtml(product.unit || 'шт.')}` : '',
  );
  html = replaceElementContent(
    html,
    'div',
    'data-product-variants',
    createVariantMarkup(product),
  );
  html = replaceElementContent(
    html,
    'dd',
    'data-product-size',
    escapeHtml(product.dimensions || 'Уточняется'),
  );
  if (/забор/i.test(product.category?.name || '')) {
    html = html.replace(/(<div[^>]*data-product-thickness-row[^>]*>\s*<dt>)[^<]*(<\/dt>)/, '$1Количество плит$2');
  }
  html = replaceElementContent(
    html,
    'dd',
    'data-product-thickness',
    /забор/i.test(product.category?.name || '')
      ? (variant.fencePanelCount ? `${variant.fencePanelCount} ${variant.fencePanelCount === 1 ? 'плита' : 'плиты'}` : 'Уточняется')
      : (variant.thicknessMm ? `${escapeHtml(variant.thicknessMm)} мм` : 'Уточняется'),
  );
  html = replaceElementContent(
    html,
    'dd',
    'data-product-color',
    escapeHtml(variant.color || ''),
  );
  html = replaceElementContent(
    html,
    'dd',
    'data-product-purpose',
    escapeHtml(product.purpose || 'Уточняется'),
  );
  html = replaceElementContent(
    html,
    'div',
    'data-product-full-description',
    escapeHtml(product.description),
  );
  html = removeHiddenFromElement(html, 'data-product-view');
  html = addHiddenToElement(html, 'data-product-loading');

  if (product.shortDescription) {
    html = removeHiddenFromElement(html, 'data-product-short-description');
  }

  if (product.description) {
    html = removeHiddenFromElement(html, 'data-product-description-section');
  }

  if (!variant.color) {
    html = addHiddenToElement(html, 'data-product-color-row');
  }

  if (!hasPrice) {
    html = addHiddenToElement(html, 'data-product-unit');
  }

  return injectStructuredData(
    html,
    getProductStructuredData(product),
    nonce,
  );
}

function renderProductNotFound() {
  const canonical = createPublicUrl('/product');
  let html = pageTemplates.product
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Товар не найден | Ландшафт Парк</title>')
    .replace(
      '<h1 data-product-title></h1>',
      '<h2 data-product-title hidden></h2>',
    )
    .replace(
      '<h2 data-product-error-title>Товар не найден</h2>',
      '<h1 data-product-error-title>Товар не найден</h1>',
    )
    .replace(
      /<meta\s+name="description"[\s\S]*?data-product-description[\s\S]*?\/>/i,
      '<meta name="description" content="Запрошенный товар не найден." data-product-description />',
    )
    .replace(
      '<link rel="stylesheet" href="/site/css/product.min.css" />',
      `<meta name="robots" content="noindex,follow" data-product-robots />\n    <link rel="canonical" href="${escapeHtml(canonical)}" data-product-canonical />\n\n    <link rel="stylesheet" href="/site/css/product.min.css" />`,
    );

  html = addHiddenToElement(html, 'data-product-loading');
  html = removeHiddenFromElement(html, 'data-product-error');

  return html;
}

router.get('/robots.txt', (req, res) => {
  const hostname = new URL(siteUrl).hostname;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&gclid&yclid&fbclid /',
    `Host: ${hostname}`,
    `Sitemap: ${createPublicUrl('/sitemap.xml')}`,
    '',
  ].join('\n');

  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(body);
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: publishedProductWhere,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: {
        title: true,
        slug: true,
        updatedAt: true,
        images: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            imagePath: true,
            alt: true,
            isMain: true,
          },
        },
      },
    });
    const categories = await prisma.productCategory.findMany({
      where: {
        isPublished: true,
        products: { some: publishedProductWhere },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { slug: true },
    });
    const staticUrls = ['/', '/catalog', '/contacts']
      .map((pathname) => `<url><loc>${escapeXml(createPublicUrl(pathname))}</loc></url>`)
      .join('');
    const categoryUrls = categories
      .map((category) => `<url><loc>${escapeXml(createPublicUrl(`/catalog/${category.slug}`))}</loc></url>`)
      .join('');
    const productUrls = products
      .map((product) => {
        const location = createPublicUrl(
          `/product?slug=${encodeURIComponent(product.slug)}`,
        );
        const images = product.images
          .filter((image) => image.imagePath)
          .map(
            (image) => `<image:image><image:loc>${escapeXml(createPublicUrl(image.imagePath))}</image:loc><image:title>${escapeXml(image.alt || product.title)}</image:title></image:image>`,
          )
          .join('');

        return `<url><loc>${escapeXml(location)}</loc><lastmod>${product.updatedAt.toISOString()}</lastmod>${images}</url>`;
      })
      .join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${staticUrls}${categoryUrls}${productUrls}</urlset>`;

    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600')
      .send(xml);
  } catch (error) {
    next(error);
  }
});

router.get('/', (req, res) => {
  sendHtml(
    res,
    injectStructuredData(
      pageTemplates.index,
      getHomeStructuredData(),
      res.locals.cspNonce,
    ),
  );
});

router.get('/catalog', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: publishedProductWhere,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: catalogSeoProductSelect,
    });

    sendHtml(
      res,
      injectStructuredData(
        withServerRenderedCatalog(pageTemplates.catalog, products),
        getCatalogStructuredData(products),
        res.locals.cspNonce,
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/catalog/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
      return next();
    }

    const category = await prisma.productCategory.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        seoTitle: true,
        seoDescription: true,
        isPublished: true,
      },
    });

    if (!category || !category.isPublished) {
      return next();
    }

    const products = await prisma.product.findMany({
      where: { ...publishedProductWhere, categoryId: category.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: catalogSeoProductSelect,
    });

    // Не отдаём индексируемую пустую категорию.
    if (products.length === 0) {
      return next();
    }

    sendHtml(
      res,
      injectStructuredData(
        renderCategoryCatalog(category, products),
        getCatalogStructuredData(products, category),
        res.locals.cspNonce,
      ),
    );
  } catch (error) {
    next(error);
  }
});

router.get('/product', async (req, res, next) => {
  try {
    const slug = String(req.query.slug || '').trim();

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
      sendHtml(res, renderProductNotFound(), 404);
      return;
    }

    const product = await prisma.product.findFirst({
      where: {
        slug,
        isPublished: true,
      },
      select: productSelect,
    });

    if (!product || product.variants.length === 0) {
      sendHtml(res, renderProductNotFound(), 404);
      return;
    }

    sendHtml(res, renderProductPage(product, res.locals.cspNonce));
  } catch (error) {
    next(error);
  }
});

router.get('/cart', (req, res) => {
  sendHtml(res, pageTemplates.cart);
});

router.get('/contacts', (req, res) => {
  sendHtml(
    res,
    injectStructuredData(
      pageTemplates.contacts,
      getContactsStructuredData(),
      res.locals.cspNonce,
    ),
  );
});

module.exports = router;
