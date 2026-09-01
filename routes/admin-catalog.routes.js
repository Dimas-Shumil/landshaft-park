'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
} = require('../middleware/auth');
const {
  productImageUpload,
  saveProductImage,
  removeManagedProductImage,
  MAX_PRODUCT_IMAGE_SIZE,
  MAX_PRODUCT_IMAGES_PER_REQUEST,
} = require('../lib/upload');

const router = express.Router();

const CATALOG_PAGE_SIZE = 20;
const CATALOG_MAX_PAGE_SIZE = 100;
const MAX_VARIANTS_PER_PRODUCT = 40;
const MAX_PRICE = 2_000_000_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const listStatusSchema = z.enum(['ALL', 'PUBLISHED', 'DRAFT']);

const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  status: listStatusSchema.optional().default('ALL'),
  categoryId: z.preprocess(
    (value) => (value === undefined || value === '' ? undefined : Number(value)),
    z.number().int().positive().optional(),
  ),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CATALOG_MAX_PAGE_SIZE)
    .optional()
    .default(CATALOG_PAGE_SIZE),
});

const categoryListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  status: listStatusSchema.optional().default('ALL'),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CATALOG_MAX_PAGE_SIZE)
    .optional()
    .default(CATALOG_PAGE_SIZE),
});

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(SLUG_PATTERN, 'Slug должен содержать только a-z, 0-9 и дефисы.');

const categoryPayloadSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    description: z.string().trim().max(3000).optional().default(''),
    imagePath: z.string().trim().max(500).optional().default(''),
    seoTitle: z.string().trim().max(180).optional().default(''),
    seoDescription: z.string().trim().max(320).optional().default(''),
    sortOrder: z.number().int().min(0).max(1_000_000).optional().default(100),
    isPublished: z.boolean().optional().default(true),
  })
  .strict();

const nullableSkuSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized || null;
  },
  z.string().max(120).nullable(),
);

const nullableThicknessSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.number().int().min(1).max(1000).nullable(),
);

const nullablePositiveNumberSchema = (max) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.number().finite().positive().max(max).nullable(),
  );

const nullablePriceSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.number().int().min(0).max(MAX_PRICE).nullable(),
);

const VARIANT_COLOR_PALETTE = Object.freeze({
  '': null,
  'Белый': '#f3f2ed',
  'Светло-серый': '#c9c9c5',
  'Серый': '#8f8b82',
  'Тёмно-серый': '#5f605e',
  'Графит': '#414344',
  'Чёрный': '#202120',
  'Кремовый': '#e8d8b9',
  'Бежевый': '#c9b28a',
  'Песочный': '#d4b483',
  'Жёлтый': '#d4b85a',
  'Оранжевый': '#d9772b',
  'Красный': '#c93632',
  'Бордовый': '#7a2630',
  'Коричневый': '#735444',
  'Тёмно-коричневый': '#4b352b',
  'Зелёный': '#5f7655',
  'Оливковый': '#7d8050',
  'Голубой': '#72a6bd',
  'Синий': '#35658f',
  'Фиолетовый': '#70527c',
});

const variantColorSchema = z.enum(Object.keys(VARIANT_COLOR_PALETTE));

const variantPayloadSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(120).default('Стандарт'),
    sku: nullableSkuSchema.optional().default(null),
    color: variantColorSchema.optional().default(''),
    thicknessMm: nullableThicknessSchema.optional().default(null),
    price: z.number().int().min(0).max(MAX_PRICE),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().min(0).max(1_000_000).optional().default(100),
  })
  .strict();

const productPayloadSchema = z
  .object({
    title: z.string().trim().min(2).max(180),
    slug: slugSchema,
    shortDescription: z.string().trim().max(1000).optional().default(''),
    description: z.string().trim().max(20_000).optional().default(''),
    unit: z.string().trim().min(1).max(40),
    dimensions: z.string().trim().max(160).optional().default(''),
    purpose: z.string().trim().max(300).optional().default(''),
    calculatorType: z.enum(['NONE', 'PAVING', 'FENCE']).optional().default('NONE'),
    pavingWastePercent: z.number().finite().min(0).max(50).optional().default(7),
    fenceSectionWidth: nullablePositiveNumberSchema(1000).optional().default(null),
    fencePanelHeight: nullablePositiveNumberSchema(20).optional().default(null),
    fencePostWidth: nullablePositiveNumberSchema(10).optional().default(null),
    fencePostHeight: nullablePositiveNumberSchema(20).optional().default(null),
    fencePostPrice: nullablePriceSchema.optional().default(null),
    seoTitle: z.string().trim().max(180).optional().default(''),
    seoDescription: z.string().trim().max(320).optional().default(''),
    categoryId: z.number().int().positive(),
    isPublished: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(0).max(1_000_000).optional().default(100),
    variants: z
      .array(variantPayloadSchema)
      .min(1)
      .max(MAX_VARIANTS_PER_PRODUCT),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.calculatorType !== 'FENCE') return;

    for (const [field, fieldValue] of [
      ['fenceSectionWidth', value.fenceSectionWidth],
      ['fencePanelHeight', value.fencePanelHeight],
      ['fencePostWidth', value.fencePostWidth],
      ['fencePostHeight', value.fencePostHeight],
      ['fencePostPrice', value.fencePostPrice],
    ]) {
      if (fieldValue === null) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'обязательное поле для калькулятора забора',
        });
      }
    }
  });

const PRODUCT_FIELD_LABELS = {
  title: 'название',
  slug: 'slug',
  categoryId: 'категория',
  unit: 'единица измерения',
  calculatorType: 'тип расчёта',
  pavingWastePercent: 'запас плитки',
  fenceSectionWidth: 'ширина плиты / пролёта',
  fencePanelHeight: 'высота заборной плиты',
  fencePostWidth: 'ширина столба',
  fencePostHeight: 'высота столба',
  fencePostPrice: 'цена столба',
  variants: 'варианты',
  name: 'название варианта',
  sku: 'SKU',
  color: 'цвет',
  thicknessMm: 'толщина',
  price: 'цена',
};

function formatProductValidationError(error) {
  const issue = error.issues?.[0];
  if (!issue) return 'Проверьте данные товара.';
  const path = issue.path || [];
  const field = path[path.length - 1];
  const variantIndex = path[0] === 'variants' && Number.isInteger(path[1])
    ? ` варианта ${path[1] + 1}`
    : '';
  const label = PRODUCT_FIELD_LABELS[field] || String(field || 'данные');
  return `Не удалось сохранить товар: поле «${label}${variantIndex}» — ${issue.message}`;
}

const imageUpdateSchema = z
  .object({
    alt: z.string().trim().max(300).optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
    isMain: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Нет данных для обновления изображения.',
  });

function validateAdminWriteOrigin(req, res, next) {
  const origin = String(req.get('origin') || '').trim();

  if (!origin) {
    return next();
  }

  try {
    const requestOrigin = new URL(`${req.protocol}://${req.get('host') || ''}`)
      .origin;

    if (new URL(origin).origin !== requestOrigin) {
      return res.status(403).json({ message: 'Источник запроса не разрешён.' });
    }
  } catch {
    return res.status(403).json({ message: 'Источник запроса не разрешён.' });
  }

  return next();
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isUniqueConstraintError(error) {
  return error?.code === 'P2002';
}

function uniqueConstraintMessage(error) {
  const target = Array.isArray(error?.meta?.target)
    ? error.meta.target.join(',')
    : String(error?.meta?.target || '');

  if (target.includes('slug')) {
    return 'Такой slug уже используется.';
  }

  if (target.includes('sku')) {
    return 'Такой SKU уже используется другим вариантом.';
  }

  return 'Значение должно быть уникальным.';
}

function buildProductWhere({ q, status, categoryId }) {
  const where = {};

  if (status === 'PUBLISHED') {
    where.isPublished = true;
  } else if (status === 'DRAFT') {
    where.isPublished = false;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { slug: { contains: q } },
      { purpose: { contains: q } },
      { variants: { some: { sku: { contains: q } } } },
    ];
  }

  return where;
}

function buildCategoryWhere({ q, status }) {
  const where = {};

  if (status === 'PUBLISHED') {
    where.isPublished = true;
  } else if (status === 'DRAFT') {
    where.isPublished = false;
  }

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { slug: { contains: q } },
    ];
  }

  return where;
}

function mapProductListItem(product) {
  const activeVariants = product.variants.filter((variant) => variant.isActive);
  const activePrices = activeVariants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isSafeInteger(price) && price >= 0);

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    unit: product.unit,
    dimensions: product.dimensions,
    purpose: product.purpose,
    isPublished: product.isPublished,
    sortOrder: product.sortOrder,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    category: product.category,
    image: product.images[0] || null,
    variantsCount: product.variants.length,
    activeVariantsCount: activeVariants.length,
    minPrice: activePrices.length ? Math.min(...activePrices) : null,
    maxPrice: activePrices.length ? Math.max(...activePrices) : null,
  };
}

function mapCategoryListItem(category) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imagePath: category.imagePath,
    isPublished: category.isPublished,
    sortOrder: category.sortOrder,
    productsCount: category._count.products,
    publishedProductsCount: category.products.length,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function mapProductDetail(product) {
  return {
    ...product,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map((variant) => ({
      ...variant,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    })),
    images: product.images.map((image) => ({
      ...image,
      createdAt: image.createdAt.toISOString(),
      updatedAt: image.updatedAt.toISOString(),
    })),
  };
}

async function getProductDetail(id) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          isPublished: true,
        },
      },
      variants: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      },
      images: {
        orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      },
    },
  });
}

async function ensureCategoryExists(categoryId) {
  return prisma.productCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, isPublished: true },
  });
}

async function validateProductCanPublish({ productId = null, categoryId, variants }) {
  const category = await ensureCategoryExists(categoryId);

  if (!category) {
    return 'Выбранная категория не найдена.';
  }

  if (!category.isPublished) {
    return 'Нельзя опубликовать товар в скрытой категории.';
  }

  if (!variants.some((variant) => variant.isActive)) {
    return 'Для публикации нужен хотя бы один активный вариант.';
  }

  if (productId) {
    const imageCount = await prisma.productImage.count({
      where: { productId },
    });

    if (imageCount === 0) {
      return 'Для публикации загрузите хотя бы одно изображение товара.';
    }
  } else {
    return 'Сначала сохраните товар как черновик и загрузите изображение.';
  }

  return null;
}

function buildProductData(payload) {
  return {
    title: payload.title,
    slug: payload.slug,
    shortDescription: payload.shortDescription,
    description: payload.description,
    unit: payload.unit,
    dimensions: payload.dimensions,
    purpose: payload.purpose,
    calculatorType: payload.calculatorType,
    pavingWastePercent: payload.pavingWastePercent,
    fenceSectionWidth: payload.fenceSectionWidth,
    fencePanelHeight: payload.fencePanelHeight,
    fencePostWidth: payload.fencePostWidth,
    fencePostHeight: payload.fencePostHeight,
    fencePostPrice: payload.fencePostPrice,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    categoryId: payload.categoryId,
    isPublished: payload.isPublished,
    sortOrder: payload.sortOrder,
  };
}

function buildVariantData(variant) {
  return {
    name: variant.name,
    sku: variant.sku,
    color: variant.color,
    colorHex: VARIANT_COLOR_PALETTE[variant.color],
    thicknessMm: variant.thicknessMm,
    price: variant.price,
    isActive: variant.isActive,
    sortOrder: variant.sortOrder,
  };
}

function runImageUpload(req, res, next) {
  productImageUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: `Изображение слишком большое. Максимум ${Math.round(MAX_PRODUCT_IMAGE_SIZE / 1024 / 1024)} МБ.`,
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        message: `За один раз можно загрузить не более ${MAX_PRODUCT_IMAGES_PER_REQUEST} изображений.`,
      });
    }

    return res.status(400).json({
      message: error.message || 'Не удалось принять изображения.',
    });
  });
}

router.use(loadAdminSession);
router.use(requireAdminAuth);

router.get('/summary', async (req, res, next) => {
  try {
    const [
      totalProducts,
      publishedProducts,
      totalCategories,
      publishedCategories,
      activeVariants,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isPublished: true } }),
      prisma.productCategory.count(),
      prisma.productCategory.count({ where: { isPublished: true } }),
      prisma.productVariant.count({ where: { isActive: true } }),
    ]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      metrics: {
        totalProducts,
        publishedProducts,
        totalCategories,
        publishedCategories,
        activeVariants,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const parsed = productListQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные параметры списка товаров.' });
    }

    const filters = parsed.data;
    const where = buildProductWhere(filters);
    const skip = (filters.page - 1) * filters.limit;

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        select: {
          id: true,
          title: true,
          slug: true,
          unit: true,
          dimensions: true,
          purpose: true,
          isPublished: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
          variants: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { id: true, price: true, isActive: true },
          },
          images: {
            orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
            take: 1,
            select: { id: true, imagePath: true, alt: true, isMain: true },
          },
        },
      }),
    ]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      items: products.map(mapProductListItem),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: 'Некорректный ID товара.' });
    }

    const product = await getProductDetail(id);

    if (!product) {
      return res.status(404).json({ message: 'Товар не найден.' });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, product: mapProductDetail(product) });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/products',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const parsed = productPayloadSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: formatProductValidationError(parsed.error),
        });
      }

      const payload = parsed.data;
      const category = await ensureCategoryExists(payload.categoryId);

      if (!category) {
        return res.status(400).json({ message: 'Выбранная категория не найдена.' });
      }

      if (payload.isPublished) {
        const publishError = await validateProductCanPublish({
          categoryId: payload.categoryId,
          variants: payload.variants,
        });

        if (publishError) {
          return res.status(409).json({ message: publishError });
        }
      }

      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            ...buildProductData(payload),
            variants: {
              create: payload.variants.map(buildVariantData),
            },
          },
          select: { id: true },
        });

        return created;
      });

      const detail = await getProductDetail(product.id);
      return res.status(201).json({ ok: true, product: mapProductDetail(detail) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({ message: uniqueConstraintMessage(error) });
      }

      return next(error);
    }
  },
);

router.patch(
  '/products/:id',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID товара.' });
      }

      const parsed = productPayloadSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: formatProductValidationError(parsed.error),
        });
      }

      const payload = parsed.data;
      const existing = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          variants: { select: { id: true } },
        },
      });

      if (!existing) {
        return res.status(404).json({ message: 'Товар не найден.' });
      }

      const category = await ensureCategoryExists(payload.categoryId);

      if (!category) {
        return res.status(400).json({ message: 'Выбранная категория не найдена.' });
      }

      const incomingExistingIds = payload.variants
        .filter((variant) => variant.id)
        .map((variant) => variant.id);
      const existingIds = new Set(existing.variants.map((variant) => variant.id));

      if (incomingExistingIds.some((variantId) => !existingIds.has(variantId))) {
        return res.status(400).json({
          message: 'Один из вариантов не принадлежит этому товару.',
        });
      }

      if (new Set(incomingExistingIds).size !== incomingExistingIds.length) {
        return res.status(400).json({ message: 'Варианты товара продублированы.' });
      }

      if (payload.isPublished) {
        const publishError = await validateProductCanPublish({
          productId: id,
          categoryId: payload.categoryId,
          variants: payload.variants,
        });

        if (publishError) {
          return res.status(409).json({ message: publishError });
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: buildProductData(payload),
        });

        // Удаляем исключённые варианты до обновлений. OrderItem сохраняет snapshots,
        // а variantId автоматически станет null благодаря onDelete: SetNull.
        await tx.productVariant.deleteMany({
          where: incomingExistingIds.length > 0
            ? {
                productId: id,
                id: { notIn: incomingExistingIds },
              }
            : { productId: id },
        });

        // SKU уникален глобально. Внутри одной транзакции временно освобождаем SKU
        // существующих вариантов, чтобы менеджер мог поменять их местами без P2002.
        if (incomingExistingIds.length > 0) {
          await tx.productVariant.updateMany({
            where: {
              productId: id,
              id: { in: incomingExistingIds },
            },
            data: { sku: null },
          });
        }

        for (const variant of payload.variants) {
          if (variant.id) {
            await tx.productVariant.update({
              where: { id: variant.id },
              data: buildVariantData(variant),
            });
          } else {
            await tx.productVariant.create({
              data: {
                productId: id,
                ...buildVariantData(variant),
              },
            });
          }
        }
      });

      const detail = await getProductDetail(id);
      return res.json({ ok: true, product: mapProductDetail(detail) });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({ message: uniqueConstraintMessage(error) });
      }

      return next(error);
    }
  },
);

router.delete(
  '/products/:id',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID товара.' });
      }

      const product = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          images: { select: { imagePath: true } },
        },
      });

      if (!product) {
        return res.status(404).json({ message: 'Товар не найден.' });
      }

      await prisma.product.delete({ where: { id } });

      const cleanupResults = await Promise.allSettled(
        product.images.map((image) => removeManagedProductImage(image.imagePath)),
      );

      for (const result of cleanupResults) {
        if (result.status === 'rejected') {
          console.error('Не удалось удалить файл изображения товара:', result.reason);
        }
      }

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/products/:id/images',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  runImageUpload,
  async (req, res, next) => {
    const savedPaths = [];
    let imagesCommitted = false;

    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID товара.' });
      }

      const product = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          images: {
            orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { sortOrder: true },
          },
          _count: { select: { images: true } },
        },
      });

      if (!product) {
        return res.status(404).json({ message: 'Товар не найден.' });
      }

      const files = Array.isArray(req.files) ? req.files : [];

      if (files.length === 0) {
        return res.status(400).json({ message: 'Выберите изображения для загрузки.' });
      }

      for (const file of files) {
        const imagePath = await saveProductImage(file.buffer);
        savedPaths.push(imagePath);
      }

      const startSortOrder = Number(product.images[0]?.sortOrder || 0);
      const mainImageCount = await prisma.productImage.count({
        where: {
          productId: id,
          isMain: true,
        },
      });
      const shouldSetMain = mainImageCount === 0;

      await prisma.$transaction(
        savedPaths.map((imagePath, index) =>
          prisma.productImage.create({
            data: {
              productId: id,
              imagePath,
              alt: product.title,
              isMain: shouldSetMain && index === 0,
              sortOrder: startSortOrder + (index + 1) * 10,
            },
          }),
        ),
      );
      imagesCommitted = true;

      const detail = await getProductDetail(id);
      return res.status(201).json({ ok: true, images: mapProductDetail(detail).images });
    } catch (error) {
      if (!imagesCommitted) {
        await Promise.allSettled(savedPaths.map(removeManagedProductImage));
      }
      return next(error);
    }
  },
);

router.patch(
  '/products/:productId/images/:imageId',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const productId = parsePositiveId(req.params.productId);
      const imageId = parsePositiveId(req.params.imageId);

      if (!productId || !imageId) {
        return res.status(400).json({ message: 'Некорректный ID изображения.' });
      }

      const parsed = imageUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: 'Проверьте данные изображения.' });
      }

      const image = await prisma.productImage.findFirst({
        where: { id: imageId, productId },
        select: { id: true },
      });

      if (!image) {
        return res.status(404).json({ message: 'Изображение не найдено.' });
      }

      const data = parsed.data;

      await prisma.$transaction(async (tx) => {
        if (data.isMain === true) {
          await tx.productImage.updateMany({
            where: { productId },
            data: { isMain: false },
          });
        }

        const updateData = {};

        if (data.alt !== undefined) updateData.alt = data.alt;
        if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
        if (data.isMain === true) updateData.isMain = true;

        if (Object.keys(updateData).length > 0) {
          await tx.productImage.update({
            where: { id: imageId },
            data: updateData,
          });
        }
      });

      const detail = await getProductDetail(productId);
      return res.json({ ok: true, images: mapProductDetail(detail).images });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/products/:productId/images/:imageId',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const productId = parsePositiveId(req.params.productId);
      const imageId = parsePositiveId(req.params.imageId);

      if (!productId || !imageId) {
        return res.status(400).json({ message: 'Некорректный ID изображения.' });
      }

      const [product, image, imageCount] = await Promise.all([
        prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, isPublished: true },
        }),
        prisma.productImage.findFirst({
          where: { id: imageId, productId },
          select: { id: true, imagePath: true, isMain: true },
        }),
        prisma.productImage.count({ where: { productId } }),
      ]);

      if (!product || !image) {
        return res.status(404).json({ message: 'Изображение не найдено.' });
      }

      if (product.isPublished && imageCount <= 1) {
        return res.status(409).json({
          message: 'Нельзя удалить последнее изображение опубликованного товара.',
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.productImage.delete({ where: { id: imageId } });

        if (image.isMain && imageCount > 1) {
          const nextImage = await tx.productImage.findFirst({
            where: { productId },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { id: true },
          });

          if (nextImage) {
            await tx.productImage.update({
              where: { id: nextImage.id },
              data: { isMain: true },
            });
          }
        }
      });

      try {
        await removeManagedProductImage(image.imagePath);
      } catch (cleanupError) {
        console.error('Не удалось удалить файл изображения товара:', cleanupError);
      }

      const detail = await getProductDetail(productId);
      return res.json({ ok: true, images: mapProductDetail(detail).images });
    } catch (error) {
      return next(error);
    }
  },
);

router.get('/categories', async (req, res, next) => {
  try {
    const parsed = categoryListQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные параметры списка категорий.' });
    }

    const filters = parsed.data;
    const where = buildCategoryWhere(filters);
    const skip = (filters.page - 1) * filters.limit;

    const [total, categories] = await Promise.all([
      prisma.productCategory.count({ where }),
      prisma.productCategory.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          imagePath: true,
          isPublished: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { products: true } },
          products: {
            where: { isPublished: true },
            select: { id: true },
          },
        },
      }),
    ]);

    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      items: categories.map(mapCategoryListItem),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/categories/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: 'Некорректный ID категории.' });
    }

    const category = await prisma.productCategory.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!category) {
      return res.status(404).json({ message: 'Категория не найдена.' });
    }

    return res.json({ ok: true, category });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/categories',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const parsed = categoryPayloadSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: 'Проверьте данные категории.' });
      }

      const category = await prisma.productCategory.create({ data: parsed.data });
      return res.status(201).json({ ok: true, category });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({ message: uniqueConstraintMessage(error) });
      }

      return next(error);
    }
  },
);

router.patch(
  '/categories/:id',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID категории.' });
      }

      const parsed = categoryPayloadSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: 'Проверьте данные категории.' });
      }

      const existing = await prisma.productCategory.findUnique({
        where: { id },
        select: {
          id: true,
          isPublished: true,
          _count: { select: { products: true } },
        },
      });

      if (!existing) {
        return res.status(404).json({ message: 'Категория не найдена.' });
      }

      if (existing.isPublished && !parsed.data.isPublished) {
        const publishedProducts = await prisma.product.count({
          where: { categoryId: id, isPublished: true },
        });

        if (publishedProducts > 0) {
          return res.status(409).json({
            message: 'Сначала скройте опубликованные товары этой категории.',
          });
        }
      }

      const category = await prisma.productCategory.update({
        where: { id },
        data: parsed.data,
      });

      return res.json({ ok: true, category });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return res.status(409).json({ message: uniqueConstraintMessage(error) });
      }

      return next(error);
    }
  },
);

router.delete(
  '/categories/:id',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID категории.' });
      }

      const category = await prisma.productCategory.findUnique({
        where: { id },
        select: {
          id: true,
          _count: { select: { products: true } },
        },
      });

      if (!category) {
        return res.status(404).json({ message: 'Категория не найдена.' });
      }

      if (category._count.products > 0) {
        return res.status(409).json({
          message: 'Нельзя удалить категорию, пока в ней есть товары.',
        });
      }

      await prisma.productCategory.delete({ where: { id } });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
