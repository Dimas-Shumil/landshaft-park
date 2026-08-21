'use strict';

const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
} = require('../middleware/auth');

const router = express.Router();

const RECENT_ACTIVITY_LIMIT = 8;
const REQUESTS_PAGE_SIZE = 20;
const REQUESTS_MAX_PAGE_SIZE = 50;
const MAX_CONFIRMED_TOTAL = 2_000_000_000;
const MAX_CONFIRMED_NUMBER = 1_000_000;

const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
const CALCULATE_STATUSES = ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const ALL_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
];

const requestListQuerySchema = z.object({
  type: z
    .enum(['ALL', 'ORDER', 'CALCULATE_REQUEST'])
    .optional()
    .default('ALL'),
  status: z.enum(ALL_STATUSES).optional(),
  q: z.string().trim().max(100).optional().default(''),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REQUESTS_MAX_PAGE_SIZE)
    .optional()
    .default(REQUESTS_PAGE_SIZE),
});

const orderItemConfirmationSchema = z
  .object({
    id: z.number().int().positive(),
    isAvailable: z.boolean().nullable(),
    confirmedQuantity: z
      .number()
      .finite()
      .positive()
      .max(MAX_CONFIRMED_NUMBER)
      .nullable(),
    confirmedArea: z
      .number()
      .finite()
      .positive()
      .max(MAX_CONFIRMED_NUMBER)
      .nullable(),
    confirmedUnitPrice: z
      .number()
      .int()
      .min(0)
      .max(MAX_CONFIRMED_TOTAL)
      .nullable(),
  })
  .strict();

const orderUpdateSchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    confirmedTotal: z
      .number()
      .int()
      .min(0)
      .max(MAX_CONFIRMED_TOTAL)
      .nullable()
      .optional(),
    internalComment: z.string().trim().max(3000).optional(),
    items: z.array(orderItemConfirmationSchema).max(50).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Нет данных для обновления.',
  });

const calculateUpdateSchema = z
  .object({
    status: z.enum(CALCULATE_STATUSES).optional(),
    internalComment: z.string().trim().max(3000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Нет данных для обновления.',
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
      return res.status(403).json({
        message: 'Источник запроса не разрешён.',
      });
    }
  } catch {
    return res.status(403).json({
      message: 'Источник запроса не разрешён.',
    });
  }

  return next();
}

function countGroupedStatus(groups, status) {
  const group = groups.find((item) => item.status === status);
  return Number(group?._count?._all || 0);
}

function getGroupedTotal(groups) {
  return groups.reduce(
    (total, item) => total + Number(item?._count?._all || 0),
    0,
  );
}

function createCalculateRequestNumber(request) {
  const year = request.createdAt.getFullYear();
  return `CR-${year}-${String(request.id).padStart(4, '0')}`;
}

function parsePositiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isSquareMeterUnit(value) {
  const unit = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  return ['м²', 'м2', 'м^2', 'кв.м', 'кв.м.'].includes(unit);
}

function calculateConfirmedLineTotal(unitPrice, unit, quantity, area) {
  const multiplier = isSquareMeterUnit(unit) && area !== null ? area : quantity;
  const total = Math.round(Number(unitPrice) * Number(multiplier));

  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > MAX_CONFIRMED_TOTAL
  ) {
    return null;
  }

  return total;
}

function mapOrderActivity(order) {
  return {
    id: `order:${order.id}`,
    entityId: order.id,
    publicNumber: order.publicNumber,
    type: 'ORDER',
    customerName: order.customerName,
    phone: order.phone,
    status: order.status,
    estimatedTotal: order.estimatedTotal,
    area: null,
    createdAt: order.createdAt.toISOString(),
  };
}

function mapCalculateActivity(request) {
  return {
    id: `calculate:${request.id}`,
    entityId: request.id,
    publicNumber: createCalculateRequestNumber(request),
    type: 'CALCULATE_REQUEST',
    customerName: request.name,
    phone: request.phone,
    status: request.status,
    estimatedTotal: null,
    area: request.area,
    createdAt: request.createdAt.toISOString(),
  };
}

function mapOrderListItem(order) {
  return {
    id: order.id,
    publicNumber: order.publicNumber,
    type: 'ORDER',
    customerName: order.customerName,
    phone: order.phone,
    status: order.status,
    fulfillmentMethod: order.fulfillmentMethod,
    estimatedTotal: order.estimatedTotal,
    confirmedTotal: order.confirmedTotal,
    area: null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function mapCalculateListItem(request) {
  return {
    id: request.id,
    publicNumber: createCalculateRequestNumber(request),
    type: 'CALCULATE_REQUEST',
    customerName: request.name,
    phone: request.phone,
    status: request.status,
    fulfillmentMethod: null,
    estimatedTotal: null,
    confirmedTotal: null,
    area: request.area,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function buildOrderWhere({ status, q }) {
  const where = {};

  if (status) {
    if (!ORDER_STATUSES.includes(status)) {
      return { id: -1 };
    }

    where.status = status;
  }

  if (q) {
    where.OR = [
      { publicNumber: { contains: q } },
      { customerName: { contains: q } },
      { phone: { contains: q } },
    ];
  }

  return where;
}

function buildCalculateWhere({ status, q }) {
  const where = {};

  if (status) {
    if (!CALCULATE_STATUSES.includes(status)) {
      return { id: -1 };
    }

    where.status = status;
  }

  if (q) {
    const searchConditions = [
      { name: { contains: q } },
      { phone: { contains: q } },
      { comment: { contains: q } },
    ];

    const numberMatch = /^CR-\d{4}-(\d+)$/i.exec(q);

    if (numberMatch) {
      const id = Number(numberMatch[1]);
      if (Number.isInteger(id) && id > 0) {
        searchConditions.push({ id });
      }
    }

    where.OR = searchConditions;
  }

  return where;
}

async function getRequestsList(query) {
  const offset = (query.page - 1) * query.limit;
  const orderWhere = buildOrderWhere(query);
  const calculateWhere = buildCalculateWhere(query);

  if (query.type === 'ORDER') {
    const [total, orders] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.order.findMany({
        where: orderWhere,
        skip: offset,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          publicNumber: true,
          customerName: true,
          phone: true,
          status: true,
          fulfillmentMethod: true,
          estimatedTotal: true,
          confirmedTotal: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      total,
      items: orders.map(mapOrderListItem),
    };
  }

  if (query.type === 'CALCULATE_REQUEST') {
    const [total, requests] = await Promise.all([
      prisma.calculateRequest.count({ where: calculateWhere }),
      prisma.calculateRequest.findMany({
        where: calculateWhere,
        skip: offset,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          phone: true,
          area: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      total,
      items: requests.map(mapCalculateListItem),
    };
  }

  const takePerSource = offset + query.limit;

  const [orderTotal, calculateTotal, orders, requests] = await Promise.all([
    prisma.order.count({ where: orderWhere }),
    prisma.calculateRequest.count({ where: calculateWhere }),
    prisma.order.findMany({
      where: orderWhere,
      take: takePerSource,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        publicNumber: true,
        customerName: true,
        phone: true,
        status: true,
        fulfillmentMethod: true,
        estimatedTotal: true,
        confirmedTotal: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.calculateRequest.findMany({
      where: calculateWhere,
      take: takePerSource,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        area: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const items = [
    ...orders.map(mapOrderListItem),
    ...requests.map(mapCalculateListItem),
  ]
    .sort((left, right) => {
      const dateDifference =
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return right.id - left.id;
    })
    .slice(offset, offset + query.limit);

  return {
    total: orderTotal + calculateTotal,
    items,
  };
}

async function getRequestTypeCounts() {
  const [orders, calculateRequests] = await Promise.all([
    prisma.order.count(),
    prisma.calculateRequest.count(),
  ]);

  return {
    all: orders + calculateRequests,
    orders,
    calculateRequests,
  };
}

async function getOrderDetail(id) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      publicNumber: true,
      status: true,
      customerName: true,
      phone: true,
      comment: true,
      fulfillmentMethod: true,
      deliveryAddress: true,
      estimatedTotal: true,
      confirmedTotal: true,
      confirmedAt: true,
      source: true,
      consentAccepted: true,
      consentAcceptedAt: true,
      internalComment: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productId: true,
          variantId: true,
          productTitleSnapshot: true,
          productSlugSnapshot: true,
          variantNameSnapshot: true,
          skuSnapshot: true,
          imagePathSnapshot: true,
          unitSnapshot: true,
          dimensionsSnapshot: true,
          colorSnapshot: true,
          thicknessMmSnapshot: true,
          unitPriceSnapshot: true,
          requestedQuantity: true,
          requestedArea: true,
          estimatedLineTotal: true,
          isAvailable: true,
          confirmedQuantity: true,
          confirmedArea: true,
          confirmedUnitPrice: true,
          confirmedLineTotal: true,
          createdAt: true,
        },
      },
    },
  });
}

async function getCalculateDetail(id) {
  return prisma.calculateRequest.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      area: true,
      purpose: true,
      comment: true,
      delivery: true,
      status: true,
      internalComment: true,
      source: true,
      consentAccepted: true,
      consentAcceptedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

router.use(loadAdminSession);
router.use(requireAdminAuth);

router.get('/dashboard', async (req, res, next) => {
  try {
    const [
      calculateStatusGroups,
      orderStatusGroups,
      totalProducts,
      publishedProducts,
      recentCalculateRequests,
      recentOrders,
    ] = await Promise.all([
      prisma.calculateRequest.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      }),
      prisma.order.groupBy({
        by: ['status'],
        _count: {
          _all: true,
        },
      }),
      prisma.product.count(),
      prisma.product.count({
        where: {
          isPublished: true,
        },
      }),
      prisma.calculateRequest.findMany({
        take: RECENT_ACTIVITY_LIMIT,
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        select: {
          id: true,
          name: true,
          phone: true,
          area: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        take: RECENT_ACTIVITY_LIMIT,
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        select: {
          id: true,
          publicNumber: true,
          customerName: true,
          phone: true,
          status: true,
          estimatedTotal: true,
          createdAt: true,
        },
      }),
    ]);

    const recentActivity = [
      ...recentCalculateRequests.map(mapCalculateActivity),
      ...recentOrders.map(mapOrderActivity),
    ]
      .sort((left, right) => {
        const dateDifference =
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

        if (dateDifference !== 0) {
          return dateDifference;
        }

        return right.entityId - left.entityId;
      })
      .slice(0, RECENT_ACTIVITY_LIMIT);

    const newCalculateRequests = countGroupedStatus(
      calculateStatusGroups,
      'NEW',
    );
    const newOrders = countGroupedStatus(orderStatusGroups, 'NEW');
    const totalCalculateRequests = getGroupedTotal(calculateStatusGroups);
    const totalOrders = getGroupedTotal(orderStatusGroups);

    res.set('Cache-Control', 'no-store');

    return res.json({
      ok: true,
      metrics: {
        newCalculateRequests,
        newOrders,
        totalProducts,
        publishedProducts,
      },
      statuses: {
        new: newCalculateRequests + newOrders,
        inProgress: countGroupedStatus(
          calculateStatusGroups,
          'IN_PROGRESS',
        ),
        confirmed: countGroupedStatus(orderStatusGroups, 'CONFIRMED'),
        total: totalCalculateRequests + totalOrders,
      },
      recentActivity,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    const parsed = requestListQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Некорректные параметры списка обращений.',
      });
    }

    const [result, counts] = await Promise.all([
      getRequestsList(parsed.data),
      getRequestTypeCounts(),
    ]);

    res.set('Cache-Control', 'no-store');

    return res.json({
      ok: true,
      items: result.items,
      counts,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / parsed.data.limit)),
      },
      filters: {
        type: parsed.data.type,
        status: parsed.data.status || '',
        q: parsed.data.q,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/requests/orders/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: 'Некорректный ID заказа.' });
    }

    const order = await getOrderDetail(id);

    if (!order) {
      return res.status(404).json({ message: 'Заказ не найден.' });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, order });
  } catch (error) {
    return next(error);
  }
});

router.get('/requests/calculate/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);

    if (!id) {
      return res.status(400).json({ message: 'Некорректный ID заявки.' });
    }

    const request = await getCalculateDetail(id);

    if (!request) {
      return res.status(404).json({ message: 'Заявка не найдена.' });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      request: {
        ...request,
        publicNumber: createCalculateRequestNumber(request),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/requests/orders/:id',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID заказа.' });
      }

      const parsed = orderUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: 'Проверьте данные заказа.',
        });
      }

      const existingOrder = await getOrderDetail(id);

      if (!existingOrder) {
        return res.status(404).json({ message: 'Заказ не найден.' });
      }

      const existingItemsById = new Map(
        existingOrder.items.map((item) => [item.id, item]),
      );

      const itemUpdates = [];

      for (const itemInput of parsed.data.items || []) {
        const existingItem = existingItemsById.get(itemInput.id);

        if (!existingItem) {
          return res.status(400).json({
            message: `Позиция заказа #${itemInput.id} не найдена.`,
          });
        }

        if (itemInput.isAvailable !== true) {
          itemUpdates.push({
            id: itemInput.id,
            data: {
              isAvailable: itemInput.isAvailable,
              confirmedQuantity: null,
              confirmedArea: null,
              confirmedUnitPrice: null,
              confirmedLineTotal: null,
            },
          });
          continue;
        }

        if (itemInput.confirmedUnitPrice === null) {
          return res.status(400).json({
            message: `Укажите подтверждённую цену для «${existingItem.productTitleSnapshot}».`,
          });
        }

        const usesArea =
          isSquareMeterUnit(existingItem.unitSnapshot) &&
          existingItem.requestedArea !== null;

        if (usesArea && itemInput.confirmedArea === null) {
          return res.status(400).json({
            message: `Укажите подтверждённую площадь для «${existingItem.productTitleSnapshot}».`,
          });
        }

        if (!usesArea && itemInput.confirmedQuantity === null) {
          return res.status(400).json({
            message: `Укажите подтверждённое количество для «${existingItem.productTitleSnapshot}».`,
          });
        }

        const confirmedQuantity = usesArea
          ? itemInput.confirmedQuantity ?? existingItem.requestedQuantity
          : itemInput.confirmedQuantity;
        const confirmedArea = usesArea ? itemInput.confirmedArea : null;
        const confirmedLineTotal = calculateConfirmedLineTotal(
          itemInput.confirmedUnitPrice,
          existingItem.unitSnapshot,
          confirmedQuantity,
          confirmedArea,
        );

        if (confirmedLineTotal === null) {
          return res.status(400).json({
            message: `Не удалось рассчитать подтверждённую сумму для «${existingItem.productTitleSnapshot}».`,
          });
        }

        itemUpdates.push({
          id: itemInput.id,
          data: {
            isAvailable: true,
            confirmedQuantity,
            confirmedArea,
            confirmedUnitPrice: itemInput.confirmedUnitPrice,
            confirmedLineTotal,
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        for (const itemUpdate of itemUpdates) {
          await tx.orderItem.update({
            where: {
              id: itemUpdate.id,
            },
            data: itemUpdate.data,
          });
        }

        const orderData = {};

        if (parsed.data.status !== undefined) {
          orderData.status = parsed.data.status;

          if (
            parsed.data.status === 'CONFIRMED' &&
            existingOrder.confirmedAt === null
          ) {
            orderData.confirmedAt = new Date();
          }
        }

        if (parsed.data.confirmedTotal !== undefined) {
          orderData.confirmedTotal = parsed.data.confirmedTotal;
        }

        if (parsed.data.internalComment !== undefined) {
          orderData.internalComment = parsed.data.internalComment;
        }

        if (Object.keys(orderData).length > 0) {
          await tx.order.update({
            where: { id },
            data: orderData,
          });
        }
      });

      const order = await getOrderDetail(id);

      res.set('Cache-Control', 'no-store');
      return res.json({ ok: true, order });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/requests/calculate/:id',
  validateAdminWriteOrigin,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);

      if (!id) {
        return res.status(400).json({ message: 'Некорректный ID заявки.' });
      }

      const parsed = calculateUpdateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: 'Проверьте данные заявки.',
        });
      }

      const exists = await prisma.calculateRequest.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!exists) {
        return res.status(404).json({ message: 'Заявка не найдена.' });
      }

      await prisma.calculateRequest.update({
        where: { id },
        data: {
          ...(parsed.data.status !== undefined
            ? { status: parsed.data.status }
            : {}),
          ...(parsed.data.internalComment !== undefined
            ? { internalComment: parsed.data.internalComment }
            : {}),
        },
      });

      const request = await getCalculateDetail(id);

      res.set('Cache-Control', 'no-store');
      return res.json({
        ok: true,
        request: {
          ...request,
          publicNumber: createCalculateRequestNumber(request),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
