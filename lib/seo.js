'use strict';

const { siteUrl, organization } = require('../config/site');

const DEFAULT_SHARE_IMAGE = '/site/images/hero-bgr.webp';
const LOCAL_BUSINESS_ID = `${siteUrl}/#local-business`;
const WEBSITE_ID = `${siteUrl}/#website`;

function createPublicUrl(pathname = '/') {
  return new URL(String(pathname || '/'), `${siteUrl}/`).href;
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

function escapeXml(value) {
  return escapeHtml(value).replace(/&#039;/g, '&apos;');
}

function serializeJsonLd(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitText(value, maxLength) {
  const text = normalizeText(value);

  if (text.length <= maxLength) {
    return text;
  }

  const shortened = text.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = shortened.lastIndexOf(' ');
  const safeEnd = lastSpace >= Math.floor(maxLength * 0.7) ? lastSpace : shortened.length;

  return `${shortened.slice(0, safeEnd).replace(/[.,;:!?\s-]+$/, '')}…`;
}

function getProductMeta(product) {
  const customTitle = normalizeText(product?.seoTitle);
  const customDescription = normalizeText(product?.seoDescription);
  const fallbackTitle = `${normalizeText(product?.title) || 'Товар'} в Черногорске | Ландшафт Парк`;
  const categoryName = normalizeText(product?.category?.name);
  const summary = normalizeText(product?.shortDescription);
  const localFallback = [
    `${normalizeText(product?.title) || 'Продукция'} от локального производителя «Ландшафт Парк» в Черногорске.`,
    summary || (categoryName ? `Категория: ${categoryName}.` : ''),
    'Характеристики, варианты и заказ с доставкой по Хакасии.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    title: customTitle || limitText(fallbackTitle, 75),
    description: customDescription || limitText(localFallback, 165),
    canonical: createPublicUrl(
      `/product?slug=${encodeURIComponent(normalizeText(product?.slug))}`,
    ),
  };
}

function getLocalBusinessSchema() {
  return {
    '@type': 'HomeAndConstructionBusiness',
    '@id': LOCAL_BUSINESS_ID,
    name: organization.name,
    legalName: organization.legalName,
    alternateName: organization.alternateName,
    description: organization.description,
    url: createPublicUrl('/'),
    image: createPublicUrl('/site/images/production.webp'),
    email: organization.email,
    telephone: organization.phones,
    address: {
      '@type': 'PostalAddress',
      streetAddress: organization.address.street,
      addressLocality: organization.address.locality,
      addressRegion: organization.address.region,
      postalCode: organization.address.postalCode,
      addressCountry: organization.address.country,
    },
    areaServed: organization.areaServed.map((area) => ({
      '@type': area.type,
      name: area.name,
    })),
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: organization.phones[0],
      contactType: 'sales',
      areaServed: 'RU-KK',
      availableLanguage: 'ru',
    },
    sameAs: organization.sameAs,
    knowsAbout: [
      'тротуарная плитка',
      'брусчатка',
      'бордюры',
      'водоотводы',
      'элементы благоустройства',
    ],
  };
}

function getWebsiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: createPublicUrl('/'),
    name: organization.name,
    alternateName: organization.alternateName,
    inLanguage: 'ru-RU',
    publisher: {
      '@id': LOCAL_BUSINESS_ID,
    },
  };
}

function getBreadcrumbSchema(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: createPublicUrl(item.path),
    })),
  };
}

function getHomeStructuredData() {
  const canonical = createPublicUrl('/');

  return {
    '@context': 'https://schema.org',
    '@graph': [
      getLocalBusinessSchema(),
      getWebsiteSchema(),
      {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: 'Тротуарная плитка в Черногорске — Ландшафт Парк',
        description:
          'Тротуарная плитка и элементы благоустройства собственного производства в Черногорске.',
        isPartOf: {
          '@id': WEBSITE_ID,
        },
        about: {
          '@id': LOCAL_BUSINESS_ID,
        },
        inLanguage: 'ru-RU',
      },
    ],
  };
}

function getContactsStructuredData() {
  const canonical = createPublicUrl('/contacts');

  return {
    '@context': 'https://schema.org',
    '@graph': [
      getLocalBusinessSchema(),
      getWebsiteSchema(),
      {
        '@type': 'ContactPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: 'Контакты Ландшафт Парк — Черногорск',
        description:
          'Адрес, телефоны, email и карта локального производства «Ландшафт Парк» в Черногорске.',
        isPartOf: {
          '@id': WEBSITE_ID,
        },
        about: {
          '@id': LOCAL_BUSINESS_ID,
        },
        breadcrumb: {
          '@id': `${canonical}#breadcrumb`,
        },
        inLanguage: 'ru-RU',
      },
      {
        ...getBreadcrumbSchema([
          { name: 'Главная', path: '/' },
          { name: 'Контакты', path: '/contacts' },
        ]),
        '@id': `${canonical}#breadcrumb`,
      },
    ],
  };
}

function getCatalogStructuredData(products) {
  const canonical = createPublicUrl('/catalog');
  const itemListElement = products.map((product, index) => {
    const url = createPublicUrl(
      `/product?slug=${encodeURIComponent(product.slug)}`,
    );
    const image = product.images?.find((item) => item.isMain) ||
      product.images?.[0] ||
      null;

    return {
      '@type': 'ListItem',
      position: index + 1,
      url,
      name: product.title,
      image: image?.imagePath ? createPublicUrl(image.imagePath) : undefined,
    };
  });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      getLocalBusinessSchema(),
      getWebsiteSchema(),
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: 'Каталог тротуарной плитки в Черногорске',
        description:
          'Каталог тротуарной плитки и элементов благоустройства локального производителя «Ландшафт Парк» в Черногорске.',
        isPartOf: {
          '@id': WEBSITE_ID,
        },
        about: {
          '@id': LOCAL_BUSINESS_ID,
        },
        breadcrumb: {
          '@id': `${canonical}#breadcrumb`,
        },
        mainEntity: {
          '@id': `${canonical}#products`,
        },
        inLanguage: 'ru-RU',
      },
      {
        ...getBreadcrumbSchema([
          { name: 'Главная', path: '/' },
          { name: 'Каталог', path: '/catalog' },
        ]),
        '@id': `${canonical}#breadcrumb`,
      },
      {
        '@type': 'ItemList',
        '@id': `${canonical}#products`,
        name: 'Товары Ландшафт Парк',
        numberOfItems: itemListElement.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement,
      },
    ],
  };
}

function getProductStructuredData(product) {
  const meta = getProductMeta(product);
  const imageUrls = (product.images || [])
    .map((image) => image.imagePath && createPublicUrl(image.imagePath))
    .filter(Boolean);
  const activeVariants = product.variants || [];
  const positivePrices = activeVariants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  const colors = [...new Set(
    activeVariants.map((variant) => normalizeText(variant.color)).filter(Boolean),
  )];
  const thicknesses = [...new Set(
    activeVariants
      .map((variant) => Number(variant.thicknessMm))
      .filter((value) => Number.isFinite(value) && value > 0),
  )].sort((a, b) => a - b);
  const additionalProperty = [
    product.dimensions && {
      '@type': 'PropertyValue',
      name: 'Размер',
      value: product.dimensions,
    },
    thicknesses.length && {
      '@type': 'PropertyValue',
      name: 'Толщина',
      value: `${thicknesses.join(', ')} мм`,
    },
    product.purpose && {
      '@type': 'PropertyValue',
      name: 'Назначение',
      value: product.purpose,
    },
  ].filter(Boolean);
  const productSchema = {
    '@type': 'Product',
    '@id': `${meta.canonical}#product`,
    name: product.title,
    description: meta.description,
    url: meta.canonical,
    mainEntityOfPage: {
      '@id': `${meta.canonical}#webpage`,
    },
    image: imageUrls.length ? imageUrls : undefined,
    category: product.category?.name || undefined,
    color: colors.length ? colors : undefined,
    additionalProperty: additionalProperty.length
      ? additionalProperty
      : undefined,
    brand: {
      '@type': 'Brand',
      name: organization.name,
    },
    manufacturer: {
      '@id': LOCAL_BUSINESS_ID,
    },
  };

  if (positivePrices.length) {
    productSchema.offers = {
      '@type': 'AggregateOffer',
      url: meta.canonical,
      priceCurrency: 'RUB',
      lowPrice: Math.min(...positivePrices),
      highPrice: Math.max(...positivePrices),
      offerCount: positivePrices.length,
      seller: {
        '@id': LOCAL_BUSINESS_ID,
      },
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      getLocalBusinessSchema(),
      getWebsiteSchema(),
      {
        '@type': 'WebPage',
        '@id': `${meta.canonical}#webpage`,
        url: meta.canonical,
        name: meta.title,
        description: meta.description,
        dateModified: product.updatedAt?.toISOString(),
        isPartOf: {
          '@id': WEBSITE_ID,
        },
        about: {
          '@id': `${meta.canonical}#product`,
        },
        breadcrumb: {
          '@id': `${meta.canonical}#breadcrumb`,
        },
        inLanguage: 'ru-RU',
      },
      {
        ...getBreadcrumbSchema([
          { name: 'Главная', path: '/' },
          { name: 'Каталог', path: '/catalog' },
          {
            name: product.title,
            path: `/product?slug=${encodeURIComponent(product.slug)}`,
          },
        ]),
        '@id': `${meta.canonical}#breadcrumb`,
      },
      productSchema,
    ],
  };
}

function createStructuredDataMarkup(data, nonce) {
  return `<script type="application/ld+json" nonce="${escapeHtml(nonce)}">${serializeJsonLd(data)}</script>`;
}

function injectStructuredData(template, data, nonce) {
  return template.replace(
    '</head>',
    `    ${createStructuredDataMarkup(data, nonce)}\n  </head>`,
  );
}

function getShareImage(product) {
  const image = product?.images?.find((item) => item.isMain) ||
    product?.images?.[0] ||
    null;

  return createPublicUrl(image?.imagePath || DEFAULT_SHARE_IMAGE);
}

module.exports = {
  LOCAL_BUSINESS_ID,
  createPublicUrl,
  escapeHtml,
  escapeXml,
  getCatalogStructuredData,
  getContactsStructuredData,
  getHomeStructuredData,
  getLocalBusinessSchema,
  getProductMeta,
  getProductStructuredData,
  getShareImage,
  injectStructuredData,
  normalizeText,
  serializeJsonLd,
};
