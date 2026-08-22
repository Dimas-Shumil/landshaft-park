'use strict';

require('dotenv').config();

const prisma = require('../lib/prisma');

const CATEGORIES = [
  {
    name: 'Тротуарная плитка',
    slug: 'trotuarnaya-plitka',
    sortOrder: 10,
  },
  {
    name: 'Бордюры',
    slug: 'bordyury',
    sortOrder: 20,
  },
  {
    name: 'Водостоки',
    slug: 'vodostoki',
    sortOrder: 30,
  },
  {
    name: 'Ступени',
    slug: 'stupeni',
    sortOrder: 40,
  },
  {
    name: 'Элементы благоустройства',
    slug: 'elementy-blagoustroystva',
    sortOrder: 50,
  },
];

/*
 * Временные стартовые данные.
 *
 * Они перенесены из текущего TEMP_CATALOG_PRODUCTS,
 * чтобы каталог перестал получать данные из frontend-кода.
 *
 * Перед production цены и характеристики должны быть
 * сверены с актуальным прайсом клиента.
 */
const INITIAL_PRODUCTS = [
  {
    title: 'Старый город',
    slug: 'staryy-gorod',

    categorySlug: 'trotuarnaya-plitka',

    dimensions: '60 / 90 / 120 мм',
    purpose: 'Для двора и дорожек',
    unit: 'м²',

    sortOrder: 10,

    images: [
      '/site/images/main-tovari/old-city.png',
      '/site/images/main-tovari/kirpichik.png',
      '/site/images/main-tovari/classik.png',
      '/site/images/main-tovari/parket.png',
    ],

    variant: {
      name: 'Стандарт',
      color: 'Серый',
      thicknessMm: 60,
      price: 1250,
    },
  },

  {
    title: 'Кирпичик',
    slug: 'kirpichik',

    categorySlug: 'trotuarnaya-plitka',

    dimensions: '200 × 100 × 60 мм',
    purpose: 'Парковки и отмостки',
    unit: 'м²',

    sortOrder: 20,

    imagePath: '/site/images/main-tovari/kirpichik.png',

    variant: {
      name: 'Стандарт',
      color: 'Коричневый',
      thicknessMm: 60,
      price: 1150,
    },
  },

  {
    title: 'Классика',
    slug: 'klassika',

    categorySlug: 'trotuarnaya-plitka',

    dimensions: '200 × 200 × 60 мм',
    purpose: 'Универсальное решение',
    unit: 'м²',

    sortOrder: 30,

    imagePath: '/site/images/main-tovari/classik.png',

    variant: {
      name: 'Стандарт',
      color: 'Серый',
      thicknessMm: 60,
      price: 1190,
    },
  },

  {
    title: 'Паркет',
    slug: 'parket',

    categorySlug: 'trotuarnaya-plitka',

    dimensions: '300 × 150 × 60 мм',
    purpose: 'Премиальный вид',
    unit: 'м²',

    sortOrder: 40,

    imagePath: '/site/images/main-tovari/parket.png',

    variant: {
      name: 'Стандарт',
      color: 'Графит',
      thicknessMm: 60,
      price: 1290,
    },
  },
];

async function seedCategories() {
  const categoriesBySlug = new Map();

  for (const categoryData of CATEGORIES) {
    const category = await prisma.productCategory.upsert({
      where: {
        slug: categoryData.slug,
      },

      update: {
        name: categoryData.name,
        sortOrder: categoryData.sortOrder,
        isPublished: true,
      },

      create: {
        name: categoryData.name,
        slug: categoryData.slug,

        description: '',
        imagePath: '',

        seoTitle: '',
        seoDescription: '',

        sortOrder: categoryData.sortOrder,
        isPublished: true,
      },
    });

    categoriesBySlug.set(category.slug, category);
  }

  return categoriesBySlug;
}

async function seedProduct(productData, categoriesBySlug) {
  const category = categoriesBySlug.get(productData.categorySlug);

  if (!category) {
    throw new Error(
      `Не найдена категория для товара "${productData.title}": ${productData.categorySlug}`,
    );
  }

  const product = await prisma.product.upsert({
    where: {
      slug: productData.slug,
    },

    update: {
      title: productData.title,

      shortDescription: '',
      description: '',

      unit: productData.unit,
      dimensions: productData.dimensions,
      purpose: productData.purpose,

      categoryId: category.id,

      isPublished: true,
      sortOrder: productData.sortOrder,
    },

    create: {
      title: productData.title,
      slug: productData.slug,

      shortDescription: '',
      description: '',

      unit: productData.unit,
      dimensions: productData.dimensions,
      purpose: productData.purpose,

      seoTitle: '',
      seoDescription: '',

      categoryId: category.id,

      isPublished: true,
      sortOrder: productData.sortOrder,
    },
  });

  const existingVariant = await prisma.productVariant.findFirst({
    where: {
      productId: product.id,
      color: productData.variant.color,
      thicknessMm: productData.variant.thicknessMm,
    },

    orderBy: {
      sortOrder: 'asc',
    },
  });

  if (existingVariant) {
    await prisma.productVariant.update({
      where: {
        id: existingVariant.id,
      },

      data: {
        name: productData.variant.name,

        color: productData.variant.color,
        thicknessMm: productData.variant.thicknessMm,
        price: productData.variant.price,

        isActive: true,
        sortOrder: 10,
      },
    });
  } else {
    await prisma.productVariant.create({
      data: {
        productId: product.id,

        name: productData.variant.name,
        sku: null,

        color: productData.variant.color,
        thicknessMm: productData.variant.thicknessMm,
        price: productData.variant.price,

        isActive: true,
        sortOrder: 10,
      },
    });
  }

  const imagePaths = Array.isArray(productData.images)
    ? productData.images
    : [productData.imagePath].filter(Boolean);

  if (!imagePaths.length) {
    throw new Error(
      `У товара "${productData.title}" не указано ни одного изображения`,
    );
  }

  /*
   * ВАЖНО: seed больше не удаляет ProductImage товара.
   * Админка сохраняет реальные изображения менеджера в эту же таблицу,
   * поэтому deleteMany здесь мог бы уничтожить пользовательскую галерею.
   *
   * Seed только добавляет недостающие dev-изображения по imagePath и
   * обновляет их alt/sortOrder. Уже загруженные менеджером фото не трогаем.
   */
  const existingImages = await prisma.productImage.findMany({
    where: {
      productId: product.id,
    },
    select: {
      imagePath: true,
    },
  });

  const existingPaths = new Set(
    existingImages.map((image) => image.imagePath),
  );
  const productAlreadyHasImages = existingImages.length > 0;

  for (const [index, imagePath] of imagePaths.entries()) {
    /*
     * Ничего не обновляем у уже существующей записи ProductImage:
     * менеджер мог поменять alt, порядок или главное фото через админку.
     * Seed только добавляет отсутствующие dev-картинки.
     */
    if (existingPaths.has(imagePath)) {
      continue;
    }

    await prisma.productImage.create({
      data: {
        productId: product.id,
        imagePath,
        alt: productData.title,
        isMain: !productAlreadyHasImages && index === 0,
        sortOrder: (index + 1) * 10,
      },
    });
  }

  console.log(`Seed: товар "${product.title}" добавлен/обновлён`);
}

async function main() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Seed отключён в production.');
  }

  console.log('Seed: начало заполнения базы');

  const categoriesBySlug = await seedCategories();

  for (const productData of INITIAL_PRODUCTS) {
    await seedProduct(productData, categoriesBySlug);
  }

  console.log('Seed: база заполнена');
}

main()
  .catch((error) => {
    console.error('Seed: ошибка:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
