'use strict';

require('dotenv').config();

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('./lib/prisma');

const publicRouter = require('./routes/public.routes');
const adminRouter = require('./routes/admin.routes');
const authRouter = require('./routes/auth.routes');
const adminApiRouter = require('./routes/admin-api.routes');
const adminCatalogRouter = require('./routes/admin-catalog.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();

function getCommandLineOption(name) {
  const optionIndex = process.argv.indexOf(name);

  if (optionIndex === -1) {
    return '';
  }

  return String(process.argv[optionIndex + 1] || '').trim();
}

const HOST = process.env.HOST || getCommandLineOption('--host') || '127.0.0.1';
const PORT =
  Number(process.env.PORT || getCommandLineOption('--port')) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// smtp

function parseBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '')
      .trim()
      .toLowerCase(),
  );
}

function isSmtpConfigured() {
  return Boolean(
    String(process.env.SMTP_HOST || '').trim() &&
    String(process.env.SMTP_USER || '').trim() &&
    String(process.env.SMTP_PASS || '') &&
    String(process.env.TO_EMAIL || '').trim(),
  );
}

const smtpTransporter = isSmtpConfigured()
  ? nodemailer.createTransport({
      host: String(process.env.SMTP_HOST || '').trim(),
      port: Number(process.env.SMTP_PORT) || 465,
      secure: parseBoolean(process.env.SMTP_SECURE),

      auth: {
        user: String(process.env.SMTP_USER || '').trim(),
        pass: String(process.env.SMTP_PASS || ''),
      },

      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

// заявка на расчёт

const CALCULATE_FORM_MIN_AGE_MS = 3_000;
const CALCULATE_FORM_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const CALCULATE_FORM_CHALLENGE_LIMIT = 5_000;
const CALCULATE_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const CALCULATE_SPAM_SCORE_LIMIT = 5;

const calculateFormChallenges = new Map();

const CALCULATE_SPAM_RULES = [
  {
    score: 2,
    pattern:
      /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[a-z0-9-]+\.(?:ru|com|net|org|рф)\b)/iu,
  },
  {
    score: 1,
    pattern: /(?:виджет|чат[-\s]?бот|интеграц|автоматизац)\w*/iu,
  },
  {
    score: 1,
    pattern: /(?:маркетинг|таргет|реклам|лидогенерац)\w*/iu,
  },
  {
    score: 1,
    pattern: /(?:разработк|создани)\w*\s+(?:сайт|лендинг|приложени)\w*/iu,
  },
  {
    score: 1,
    pattern: /(?:предлага\w*|предложени\w*|увеличим\w*|привлеч[её]м\w*)/iu,
  },
  {
    score: 2,
    pattern: /(?:продвижени\w*\s+(?:сайт|бизнес|компан)|seo|сео|раскрут\w*)/iu,
  },
  {
    score: 1,
    pattern: /(?:сотрудничеств\w*\s+(?:по|для)|агентств\w*)/iu,
  },
  {
    score: 1,
    pattern: /(?:ваших?|для ваших?)\s+клиент\w*/iu,
  },
  {
    score: 1,
    pattern: /онлайн[-\s]?запис\w*/iu,
  },
];

const PURPOSE_LABELS = {
  paths: 'Дорожки и зоны отдыха',
  parking: 'Въезд и парковка',
  garden: 'Сад и декоративные элементы',
  commercial: 'Коммерческое благоустройство',
  other: 'Другое',
};

const calculateRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform((value) => value.replace(/\s+/g, ' ')),

    phone: z.string().trim().min(7).max(30),

    area: z.number().finite().positive().max(100_000).nullable().optional(),

    purpose: z
      .enum(['paths', 'parking', 'garden', 'commercial', 'other'])
      .nullable()
      .optional(),

    comment: z.string().trim().max(1500).optional().default(''),

    delivery: z.boolean().optional().default(false),

    personalDataConsent: z.literal(true),

    company: z.string().trim().max(200).optional().default(''),

    formToken: z.string().trim().min(32).max(200),

    formElapsedMs: z.number().int().min(0).max(CALCULATE_FORM_MAX_AGE_MS),
  })
  .strict();

const calculateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Слишком много попыток. Подождите немного и попробуйте снова.',
  },
});

// заказ

const ORDER_MAX_ITEMS = 50;
const ORDER_MAX_ESTIMATED_TOTAL = 2_000_000_000;

const orderItemSchema = z.object({
  variantId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(999),
  area: z.number().finite().positive().max(100_000).nullable().optional(),
});

const orderSchema = z.object({
  customer: z.object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .transform((value) => value.replace(/\s+/g, ' ')),
    phone: z.string().trim().min(7).max(30),
    comment: z.string().trim().max(1500).optional().default(''),
    fulfillmentMethod: z.enum(['PICKUP', 'DELIVERY']),
    deliveryAddress: z.string().trim().max(500).optional().default(''),
    personalDataConsent: z.literal(true),
  }),
  company: z.string().trim().max(200).optional().default(''),
  items: z.array(orderItemSchema).min(1).max(ORDER_MAX_ITEMS),
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message:
      'Слишком много попыток оформления. Подождите немного и попробуйте снова.',
  },
});

function cleanupCalculateFormChallenges(now = Date.now()) {
  for (const [token, createdAt] of calculateFormChallenges) {
    if (now - createdAt <= CALCULATE_FORM_MAX_AGE_MS) {
      continue;
    }

    calculateFormChallenges.delete(token);
  }

  while (calculateFormChallenges.size >= CALCULATE_FORM_CHALLENGE_LIMIT) {
    const oldestToken = calculateFormChallenges.keys().next().value;

    if (!oldestToken) {
      break;
    }

    calculateFormChallenges.delete(oldestToken);
  }
}

function createCalculateFormChallenge() {
  cleanupCalculateFormChallenges();

  const token = crypto.randomBytes(32).toString('base64url');

  calculateFormChallenges.set(token, Date.now());

  return token;
}

function isValidCalculateFormChallenge(token, formElapsedMs) {
  const normalizedToken = String(token || '').trim();
  const createdAt = calculateFormChallenges.get(normalizedToken);

  if (!createdAt) {
    return false;
  }

  const serverElapsedMs = Date.now() - createdAt;

  return (
    serverElapsedMs >= CALCULATE_FORM_MIN_AGE_MS &&
    serverElapsedMs <= CALCULATE_FORM_MAX_AGE_MS &&
    Number.isInteger(formElapsedMs) &&
    formElapsedMs >= CALCULATE_FORM_MIN_AGE_MS &&
    formElapsedMs <= CALCULATE_FORM_MAX_AGE_MS
  );
}

function consumeCalculateFormChallenge(token) {
  calculateFormChallenges.delete(String(token || '').trim());
}

function createCalculateRequestFingerprint(data) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        phone: data.phone,
        purpose: data.purpose || '',
        area: data.area || null,
        delivery: Boolean(data.delivery),
        comment: data.comment || '',
      }),
    )
    .digest('hex');
}

function normalizeRussianPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.length === 10) {
    digits = `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }

  if (!/^7\d{10}$/.test(digits)) {
    return '';
  }

  return `+${digits}`;
}

function isValidCustomerName(value) {
  const name = String(value || '').trim();
  const letters = name.match(/\p{L}/gu) || [];

  return letters.length >= 2 && /^[\p{L}\s.'’`-]+$/u.test(name);
}

function isSquareMeterUnit(value) {
  const unit = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  return ['м²', 'м2', 'м^2', 'кв.м', 'кв.м.'].includes(unit);
}

function calculateOrderLineTotal(unitPrice, unit, quantity, area) {
  const usesArea =
    area !== null && area !== undefined && isSquareMeterUnit(unit);
  const multiplier = usesArea ? area : quantity;
  const total = Math.round(Number(unitPrice) * Number(multiplier));

  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > ORDER_MAX_ESTIMATED_TOTAL
  ) {
    return null;
  }

  return total;
}

function createOrderPublicNumber() {
  const datePart = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Krasnoyarsk',
  })
    .format(new Date())
    .replace(/-/g, '');

  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();

  return `LP-${datePart}-${randomPart}`;
}

function calculateRequestSpamScore(data) {
  const content = `${data.name} ${data.comment}`.toLowerCase();

  return CALCULATE_SPAM_RULES.reduce(
    (score, rule) => score + (rule.pattern.test(content) ? rule.score : 0),
    0,
  );
}

function getRequestIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '')
    .replace(/^::ffff:/, '')
    .trim()
    .slice(0, 64);
}

function getRequestUserAgent(req) {
  return String(req.get('user-agent') || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 500);
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

function getPublicVariantColor(variant) {
  const color = String(variant?.color || '').trim();
  const colorHex = String(variant?.colorHex || '').trim().toLowerCase();

  if (!color || !/^#[0-9a-f]{6}$/.test(colorHex)) {
    return { color: '', colorHex: null };
  }

  return { color, colorHex };
}

function cleanMailHeader(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function formatRequestDate(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Krasnoyarsk',
  }).format(date);
}

function validateRequestOrigin(req, res, next) {
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

function acceptRequestSilently(res) {
  return res.status(201).json({
    ok: true,
    message: 'Заявка отправлена',
  });
}

function buildCalculateEmailText(request) {
  return [
    'Новая заявка на расчёт с сайта «Ландшафт Парк»',
    '',
    `Имя: ${request.name}`,
    `Телефон: ${request.phone}`,
    `Площадь: ${request.area ? `${request.area} м²` : 'Не указана'}`,
    `Задача: ${request.purposeLabel}`,
    `Доставка: ${request.delivery ? 'Нужна' : 'Не указана'}`,
    `Комментарий: ${request.comment || 'Не указан'}`,
    `Получена: ${formatRequestDate(request.createdAt)}`,
  ].join('\n');
}

function buildCalculateEmailHtml(request) {
  const safeName = escapeHtml(request.name);
  const safePhone = escapeHtml(request.phone);
  const safeArea = escapeHtml(
    request.area ? `${request.area} м²` : 'Не указана',
  );
  const safePurpose = escapeHtml(request.purposeLabel);
  const safeDelivery = request.delivery ? 'Нужна' : 'Не указана';
  const safeComment = request.comment
    ? escapeHtml(request.comment).replace(/\r?\n/g, '<br>')
    : 'Не указан';
  const safeDate = escapeHtml(formatRequestDate(request.createdAt));

  return `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width">
        <title>Новая заявка — Ландшафт Парк</title>
      </head>

      <body style="margin:0;padding:0;background:#fbfaf6;">
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="width:100%;background:#fbfaf6;"
        >
          <tr>
            <td align="center" style="padding:32px 14px;">
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  width:100%;
                  max-width:640px;
                  overflow:hidden;
                  border:1px solid rgba(47,74,47,.16);
                  border-radius:18px;
                  background:#ffffff;
                "
              >
                <tr>
                  <td
                    style="
                      padding:30px 34px;
                      background:linear-gradient(135deg,#2f4a2f 0%,#1f331f 100%);
                    "
                  >
                    <div
                      style="
                        margin-bottom:28px;
                        color:rgba(255,255,255,.66);
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:10px;
                        font-weight:700;
                        letter-spacing:.18em;
                        text-transform:uppercase;
                      "
                    >
                      Заявка с сайта
                    </div>

                    <div
                      style="
                        margin-bottom:10px;
                        color:#ffffff;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:32px;
                        font-weight:800;
                        line-height:1.05;
                      "
                    >
                      Ландшафт Парк
                    </div>

                    <div
                      style="
                        color:rgba(255,255,255,.72);
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:13px;
                        line-height:1.6;
                      "
                    >
                      Новый запрос на расчёт объёма и стоимости.
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:34px;">
                    <div
                      style="
                        margin-bottom:28px;
                        color:#172017;
                        font-family:Arial,Helvetica,sans-serif;
                        font-size:28px;
                        font-weight:800;
                        line-height:1.1;
                      "
                    >
                      ${safeName}
                    </div>

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="border-top:1px solid rgba(31,51,31,.10);"
                    >
                      <tr>
                        <td
                          width="34%"
                          valign="top"
                          style="
                            padding:17px 12px 17px 0;
                            color:#74806f;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:.1em;
                            text-transform:uppercase;
                          "
                        >
                          Телефон
                        </td>
                        <td
                          valign="top"
                          style="
                            padding:17px 0;
                            color:#172017;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:15px;
                            line-height:1.6;
                          "
                        >
                          <a
                            href="tel:${safePhone}"
                            style="color:#172017;text-decoration:none;"
                          >
                            ${safePhone}
                          </a>
                        </td>
                      </tr>

                      <tr>
                        <td
                          width="34%"
                          valign="top"
                          style="
                            padding:17px 12px 17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#74806f;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:.1em;
                            text-transform:uppercase;
                          "
                        >
                          Площадь
                        </td>
                        <td
                          valign="top"
                          style="
                            padding:17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#384538;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;
                            line-height:1.6;
                          "
                        >
                          ${safeArea}
                        </td>
                      </tr>

                      <tr>
                        <td
                          width="34%"
                          valign="top"
                          style="
                            padding:17px 12px 17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#74806f;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:.1em;
                            text-transform:uppercase;
                          "
                        >
                          Задача
                        </td>
                        <td
                          valign="top"
                          style="
                            padding:17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#384538;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;
                            line-height:1.6;
                          "
                        >
                          ${safePurpose}
                        </td>
                      </tr>

                      <tr>
                        <td
                          width="34%"
                          valign="top"
                          style="
                            padding:17px 12px 17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#74806f;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:.1em;
                            text-transform:uppercase;
                          "
                        >
                          Доставка
                        </td>
                        <td
                          valign="top"
                          style="
                            padding:17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#384538;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;
                            line-height:1.6;
                          "
                        >
                          ${safeDelivery}
                        </td>
                      </tr>

                      <tr>
                        <td
                          width="34%"
                          valign="top"
                          style="
                            padding:17px 12px 17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#74806f;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:.1em;
                            text-transform:uppercase;
                          "
                        >
                          Комментарий
                        </td>
                        <td
                          valign="top"
                          style="
                            padding:17px 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#384538;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;
                            line-height:1.7;
                          "
                        >
                          ${safeComment}
                        </td>
                      </tr>

                      <tr>
                        <td
                          width="34%"
                          valign="top"
                          style="
                            padding:17px 12px 0 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#74806f;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:10px;
                            font-weight:700;
                            letter-spacing:.1em;
                            text-transform:uppercase;
                          "
                        >
                          Получена
                        </td>
                        <td
                          valign="top"
                          style="
                            padding:17px 0 0;
                            border-top:1px solid rgba(31,51,31,.07);
                            color:#384538;
                            font-family:Arial,Helvetica,sans-serif;
                            font-size:14px;
                            line-height:1.6;
                          "
                        >
                          ${safeDate}
                        </td>
                      </tr>
                    </table>

                    <div style="padding-top:30px;">
                      <a
                        href="tel:${safePhone}"
                        style="
                          display:inline-block;
                          padding:13px 20px;
                          border-radius:7px;
                          color:#ffffff;
                          background:#2f4a2f;
                          font-family:Arial,Helvetica,sans-serif;
                          font-size:11px;
                          font-weight:700;
                          letter-spacing:.06em;
                          text-decoration:none;
                          text-transform:uppercase;
                        "
                      >
                        Позвонить клиенту
                      </a>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:18px 34px;
                      border-top:1px solid rgba(31,51,31,.08);
                      color:#74806f;
                      background:#f3f5f1;
                      font-family:Arial,Helvetica,sans-serif;
                      font-size:11px;
                      line-height:1.6;
                    "
                  >
                    Заявка отправлена с формы расчёта на сайте «Ландшафт Парк».
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendCalculateEmail(request) {
  if (!smtpTransporter) {
    throw new Error('SMTP не настроен');
  }

  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const toEmail = String(process.env.TO_EMAIL || '').trim();
  const fromName =
    cleanMailHeader(process.env.MAIL_FROM_NAME) || 'Ландшафт Парк';

  const safeSubjectName = cleanMailHeader(request.name);

  return smtpTransporter.sendMail({
    from: `"${fromName}" <${smtpUser}>`,
    to: toEmail,
    subject: `Новая заявка на расчёт — ${safeSubjectName}`,
    text: buildCalculateEmailText(request),
    html: buildCalculateEmailHtml(request),
  });
}

function formatOrderNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0';
  }

  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  }).format(number);
}

function formatOrderMoney(value) {
  return `${formatOrderNumber(value)} ₽`;
}

function getFulfillmentMethodLabel(value) {
  return value === 'DELIVERY' ? 'Доставка' : 'Самовывоз';
}

function buildOrderEmailText(order) {
  const lines = [
    `Новый заказ ${order.publicNumber} с сайта «Ландшафт Парк»`,
    '',
    `Клиент: ${order.customerName}`,
    `Телефон: ${order.phone}`,
    `Способ получения: ${getFulfillmentMethodLabel(order.fulfillmentMethod)}`,
  ];

  if (order.fulfillmentMethod === 'DELIVERY') {
    lines.push(`Адрес доставки: ${order.deliveryAddress || 'Не указан'}`);
  }

  lines.push(`Комментарий: ${order.comment || 'Не указан'}`, '');
  lines.push('Состав заказа:');

  order.items.forEach((item, index) => {
    lines.push('', `${index + 1}. ${item.productTitleSnapshot}`);

    if (item.variantNameSnapshot) {
      lines.push(`Вариант: ${item.variantNameSnapshot}`);
    }

    if (item.colorSnapshot) {
      lines.push(`Цвет: ${item.colorSnapshot}`);
    }

    if (item.thicknessMmSnapshot !== null) {
      lines.push(`Толщина: ${formatOrderNumber(item.thicknessMmSnapshot)} мм`);
    }

    lines.push(`Количество: ${formatOrderNumber(item.requestedQuantity)}`);

    if (item.requestedArea !== null) {
      lines.push(`Площадь: ${formatOrderNumber(item.requestedArea)} м²`);
    }

    lines.push(
      `Цена: ${formatOrderMoney(item.unitPriceSnapshot)}${item.unitSnapshot ? `/${item.unitSnapshot}` : ''}`,
      `Предварительная сумма позиции: ${formatOrderMoney(item.estimatedLineTotal)}`,
    );
  });

  lines.push(
    '',
    `Предварительный итог: ${formatOrderMoney(order.estimatedTotal)}`,
    `Получен: ${formatRequestDate(order.createdAt)}`,
    '',
    'Важно: стоимость предварительная. Наличие, необходимое количество, доставку и итоговую стоимость менеджер подтверждает после обработки заказа.',
  );

  return lines.join('\n');
}

function buildOrderEmailHtml(order) {
  const safePublicNumber = escapeHtml(order.publicNumber);
  const safeCustomerName = escapeHtml(order.customerName);
  const safePhone = escapeHtml(order.phone);
  const safeFulfillment = escapeHtml(
    getFulfillmentMethodLabel(order.fulfillmentMethod),
  );
  const safeDeliveryAddress = order.deliveryAddress
    ? escapeHtml(order.deliveryAddress).replace(/\r?\n/g, '<br>')
    : 'Не указан';
  const safeComment = order.comment
    ? escapeHtml(order.comment).replace(/\r?\n/g, '<br>')
    : 'Не указан';
  const safeEstimatedTotal = escapeHtml(formatOrderMoney(order.estimatedTotal));
  const safeDate = escapeHtml(formatRequestDate(order.createdAt));

  const itemRows = order.items
    .map((item, index) => {
      const safeTitle = escapeHtml(item.productTitleSnapshot);
      const safeVariant = item.variantNameSnapshot
        ? escapeHtml(item.variantNameSnapshot)
        : 'Не указан';
      const safeColor = item.colorSnapshot
        ? escapeHtml(item.colorSnapshot)
        : 'Не указан';
      const safeThickness =
        item.thicknessMmSnapshot !== null
          ? `${escapeHtml(formatOrderNumber(item.thicknessMmSnapshot))} мм`
          : 'Не указана';
      const safeQuantity = escapeHtml(
        formatOrderNumber(item.requestedQuantity),
      );
      const safeArea =
        item.requestedArea !== null
          ? `${escapeHtml(formatOrderNumber(item.requestedArea))} м²`
          : 'Не указана';
      const safeUnit = escapeHtml(item.unitSnapshot || '');
      const safeUnitPrice = escapeHtml(
        formatOrderMoney(item.unitPriceSnapshot),
      );
      const safeLineTotal = escapeHtml(
        formatOrderMoney(item.estimatedLineTotal),
      );

      return `
        <tr>
          <td style="padding:22px 0;${index ? 'border-top:1px solid rgba(31,51,31,.10);' : ''}">
            <div style="margin-bottom:12px;color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;line-height:1.35;">
              ${index + 1}. ${safeTitle}
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td style="padding:5px 14px 5px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Вариант</td>
                <td align="right" style="padding:5px 0;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeVariant}</td>
              </tr>
              <tr>
                <td style="padding:5px 14px 5px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Цвет</td>
                <td align="right" style="padding:5px 0;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeColor}</td>
              </tr>
              <tr>
                <td style="padding:5px 14px 5px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Толщина</td>
                <td align="right" style="padding:5px 0;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeThickness}</td>
              </tr>
              <tr>
                <td style="padding:5px 14px 5px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Количество</td>
                <td align="right" style="padding:5px 0;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeQuantity}</td>
              </tr>
              <tr>
                <td style="padding:5px 14px 5px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Площадь</td>
                <td align="right" style="padding:5px 0;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeArea}</td>
              </tr>
              <tr>
                <td style="padding:5px 14px 5px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Цена</td>
                <td align="right" style="padding:5px 0;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeUnitPrice}${safeUnit ? `/${safeUnit}` : ''}</td>
              </tr>
              <tr>
                <td style="padding:7px 14px 0 0;color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">Предварительно</td>
                <td align="right" style="padding:7px 0 0;color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;line-height:1.5;">${safeLineTotal}</td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join('');

  const deliveryRow =
    order.fulfillmentMethod === 'DELIVERY'
      ? `
        <tr>
          <td style="padding:10px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Адрес доставки</td>
          <td align="right" style="padding:10px 0 10px 18px;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeDeliveryAddress}</td>
        </tr>
      `
      : '';

  return `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Новый заказ ${safePublicNumber}</title>
      </head>
      <body style="margin:0;padding:0;background:#eef1eb;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef1eb;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding:28px 14px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;border-collapse:collapse;background:#fbfaf6;border-radius:12px;overflow:hidden;">
                <tr>
                  <td style="padding:30px 34px;background:#2f4a2f;color:#ffffff;">
                    <div style="margin-bottom:8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;opacity:.74;">Ландшафт Парк</div>
                    <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;">Новый заказ ${safePublicNumber}</div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:30px 34px 8px;">
                    <div style="margin-bottom:18px;color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;">Клиент</div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="padding:10px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Имя</td>
                        <td align="right" style="padding:10px 0 10px 18px;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeCustomerName}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Телефон</td>
                        <td align="right" style="padding:10px 0 10px 18px;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safePhone}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">Получение</td>
                        <td align="right" style="padding:10px 0 10px 18px;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeFulfillment}</td>
                      </tr>
                      ${deliveryRow}
                      <tr>
                        <td style="padding:10px 0;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;vertical-align:top;">Комментарий</td>
                        <td align="right" style="padding:10px 0 10px 18px;color:#384538;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:1.5;">${safeComment}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 34px 4px;">
                    <div style="color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;">Состав заказа</div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                      ${itemRows}
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 34px;background:#f3f5f1;border-top:1px solid rgba(31,51,31,.08);">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;">Предварительный итог</td>
                        <td align="right" style="color:#1f331f;font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:800;">${safeEstimatedTotal}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top:12px;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">
                          Стоимость предварительная. Наличие, необходимое количество, доставку и итоговую стоимость менеджер подтверждает после обработки заказа.
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top:14px;color:#74806f;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;">Получен: ${safeDate}</td>
                      </tr>
                    </table>

                    <div style="padding-top:22px;">
                      <a href="tel:${safePhone}" style="display:inline-block;padding:13px 20px;border-radius:7px;color:#ffffff;background:#2f4a2f;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.06em;text-decoration:none;text-transform:uppercase;">Позвонить клиенту</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendOrderEmail(order) {
  if (!smtpTransporter) {
    throw new Error('SMTP не настроен');
  }

  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const toEmail = String(process.env.TO_EMAIL || '').trim();
  const fromName =
    cleanMailHeader(process.env.MAIL_FROM_NAME) || 'Ландшафт Парк';

  const safePublicNumber = cleanMailHeader(order.publicNumber);
  const safeCustomerName = cleanMailHeader(order.customerName);

  return smtpTransporter.sendMail({
    from: `"${fromName}" <${smtpUser}>`,
    to: toEmail,
    subject: `Новый заказ ${safePublicNumber} — ${safeCustomerName}`,
    text: buildOrderEmailText(order),
    html: buildOrderEmailHtml(order),
  });
}

// express

if (isProduction) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },

    strictTransportSecurity: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
        }
      : false,

    crossOriginResourcePolicy: { policy: 'same-origin' },
  }),
);

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  }),
);

// static

app.use('/site/css', express.static(path.join(__dirname, 'site', 'css')));
app.use('/site/fonts', express.static(path.join(__dirname, 'site', 'fonts')));
app.use('/site/images', express.static(path.join(__dirname, 'site', 'images')));
app.use(
  '/site/scripts',
  express.static(path.join(__dirname, 'site', 'scripts')),
);
app.use('/components', express.static(path.join(__dirname, 'components')));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// admin auth api

app.use('/api/admin/auth', authRouter);
app.use('/api/admin/catalog', adminCatalogRouter);
app.use('/api/admin', adminApiRouter);

// admin pages

app.use('/admin', adminRouter);

// public api

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'landshaft-park',
  });
});

app.get('/api/catalog/products', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        isPublished: true,

        variants: {
          some: {
            isActive: true,
          },
        },
      },

      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: {
        id: true,
        title: true,
        slug: true,

        shortDescription: true,

        unit: true,
        dimensions: true,
        purpose: true,

        sortOrder: true,

        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },

        images: {
          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              id: 'asc',
            },
          ],

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

          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              price: 'asc',
            },
            {
              id: 'asc',
            },
          ],

          select: {
            id: true,
            name: true,
            sku: true,

            color: true,
            colorHex: true,
            thicknessMm: true,
            price: true,

            sortOrder: true,
          },
        },
      },
    });

    const catalogProducts = products.map((product) => {
      const mainImage =
        product.images.find((image) => image.isMain) ||
        product.images[0] ||
        null;

      const prices = product.variants.map((variant) => variant.price);

      const minPrice = prices.length ? Math.min(...prices) : null;

      return {
        id: product.id,

        name: product.title,
        slug: product.slug,

        shortDescription: product.shortDescription,

        category: product.category,

        image: mainImage
          ? {
              id: mainImage.id,
              path: mainImage.imagePath,
              alt: mainImage.alt || product.title,
            }
          : null,

        unit: product.unit,
        size: product.dimensions,
        purpose: product.purpose,

        order: product.sortOrder,
        minPrice,

        variants: product.variants.map((variant) => {
          const publicColor = getPublicVariantColor(variant);
          return {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            ...publicColor,
            thickness: variant.thicknessMm,
            price: variant.price,
            order: variant.sortOrder,
          };
        }),
      };
    });

    return res.json({
      ok: true,
      products: catalogProducts,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/catalog/products/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();

    if (!slug) {
      return res.status(400).json({
        error: 'Не указан slug товара',
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        slug,
        isPublished: true,
      },

      select: {
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

        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },

        images: {
          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              id: 'asc',
            },
          ],

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

          orderBy: [
            {
              sortOrder: 'asc',
            },
            {
              price: 'asc',
            },
            {
              id: 'asc',
            },
          ],

          select: {
            id: true,
            name: true,
            sku: true,
            color: true,
            colorHex: true,
            thicknessMm: true,
            price: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!product || product.variants.length === 0) {
      return res.status(404).json({
        error: 'Товар не найден',
      });
    }

    return res.json({
      ok: true,

      product: {
        id: product.id,
        name: product.title,
        slug: product.slug,

        shortDescription: product.shortDescription,
        description: product.description,

        unit: product.unit,
        size: product.dimensions,
        purpose: product.purpose,

        seo: {
          title: product.seoTitle,
          description: product.seoDescription,
        },

        category: product.category,

        images: product.images.map((image) => ({
          id: image.id,
          path: image.imagePath,
          alt: image.alt || product.title,
          isMain: image.isMain,
          order: image.sortOrder,
        })),

        variants: product.variants.map((variant) => {
          const publicColor = getPublicVariantColor(variant);
          return {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            ...publicColor,
            thickness: variant.thicknessMm,
            price: variant.price,
            order: variant.sortOrder,
          };
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.get(
  '/api/requests/calculate/challenge',
  validateRequestOrigin,
  (req, res) => {
    return res.json({
      ok: true,
      formToken: createCalculateFormChallenge(),
    });
  },
);

app.post(
  '/api/requests/calculate',
  calculateLimiter,
  validateRequestOrigin,
  async (req, res, next) => {
    try {
      const ipAddress = getRequestIp(req);
      const userAgent = getRequestUserAgent(req);
      const company = String(req.body?.company || '').trim();

      if (company) {
        console.warn(`Антиспам: заполнена ловушка, IP: ${ipAddress}`);

        return acceptRequestSilently(res);
      }

      const parsed = calculateRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: 'Проверьте правильность заполнения формы.',
        });
      }

      const phone = normalizeRussianPhone(parsed.data.phone);

      if (!phone) {
        return res.status(400).json({
          message: 'Введите корректный российский номер телефона.',
        });
      }

      if (!isValidCustomerName(parsed.data.name)) {
        return res.status(400).json({
          message: 'Введите корректное имя без цифр и ссылок.',
        });
      }

      const hasValidChallenge = isValidCalculateFormChallenge(
        parsed.data.formToken,
        parsed.data.formElapsedMs,
      );

      if (!hasValidChallenge) {
        console.warn(
          `Антиспам: форма отправлена без корректного токена или слишком быстро, ` +
            `IP: ${ipAddress}`,
        );

        return acceptRequestSilently(res);
      }

      const spamScore = calculateRequestSpamScore(parsed.data);

      if (spamScore >= CALCULATE_SPAM_SCORE_LIMIT) {
        consumeCalculateFormChallenge(parsed.data.formToken);

        console.warn(
          `Антиспам: рекламный текст, score=${spamScore}, IP: ${ipAddress}`,
        );

        return acceptRequestSilently(res);
      }

      const duplicateFingerprint = createCalculateRequestFingerprint({
        phone,
        purpose: parsed.data.purpose,
        area: parsed.data.area,
        delivery: parsed.data.delivery,
        comment: parsed.data.comment,
      });

      const duplicateSince = new Date(
        Date.now() - CALCULATE_DUPLICATE_WINDOW_MS,
      );

      const duplicateRequest = await prisma.calculateRequest.findFirst({
        where: {
          dedupFingerprint: duplicateFingerprint,
          createdAt: {
            gte: duplicateSince,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicateRequest) {
        consumeCalculateFormChallenge(parsed.data.formToken);

        console.warn(`Антиспам: повтор заявки, IP: ${ipAddress}`);

        return acceptRequestSilently(res);
      }

      consumeCalculateFormChallenge(parsed.data.formToken);

      const createdAt = new Date();

      const request = await prisma.calculateRequest.create({
        data: {
          name: parsed.data.name,
          phone,
          area: parsed.data.area ?? null,
          purpose: parsed.data.purpose ?? null,
          comment: parsed.data.comment,
          delivery: parsed.data.delivery,

          source: 'website',

          dedupFingerprint: duplicateFingerprint,

          ipAddress,
          userAgent,

          consentAccepted: true,
          consentAcceptedAt: createdAt,
        },
      });

      const mailRequest = {
        ...request,

        purposeLabel: request.purpose
          ? PURPOSE_LABELS[request.purpose]
          : 'Не указана',
      };

      if (smtpTransporter) {
        try {
          await sendCalculateEmail(mailRequest);

          console.log(`Письмо по заявке #${request.id} отправлено менеджеру`);
        } catch (error) {
          console.error(
            `SMTP: заявка #${request.id} сохранена, но письмо не отправлено:`,
            error.message,
          );
        }
      } else {
        console.error(
          `SMTP не настроен: заявка #${request.id} сохранена в базе без отправки письма`,
        );
      }

      console.log(
        `Заявка на расчёт #${request.id} сохранена: ${request.name}, ${request.phone}`,
      );

      return res.status(201).json({
        ok: true,
        message: 'Заявка отправлена',
      });
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  '/api/orders',
  orderLimiter,
  validateRequestOrigin,
  async (req, res, next) => {
    try {
      const parsed = orderSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: 'Проверьте данные заказа и состав корзины.',
        });
      }

      if (parsed.data.company) {
        console.warn(`Антиспам заказа: заполнена ловушка, IP: ${getRequestIp(req)}`);
        return res.status(201).json({
          ok: true,
          message: 'Заказ принят',
          order: { publicNumber: createOrderPublicNumber(), estimatedTotal: 0 },
        });
      }

      const customer = parsed.data.customer;
      const phone = normalizeRussianPhone(customer.phone);

      if (!phone) {
        return res.status(400).json({
          message: 'Введите корректный российский номер телефона.',
        });
      }

      if (!isValidCustomerName(customer.name)) {
        return res.status(400).json({
          message: 'Введите корректное имя без цифр и ссылок.',
        });
      }


      const spamScore = calculateRequestSpamScore(customer);
      if (spamScore >= CALCULATE_SPAM_SCORE_LIMIT) {
        console.warn(
          `Антиспам заказа: рекламный текст, score=${spamScore}, IP: ${getRequestIp(req)}`,
        );
        return res.status(201).json({
          ok: true,
          message: 'Заказ принят',
          order: { publicNumber: createOrderPublicNumber(), estimatedTotal: 0 },
        });
      }

      if (
        customer.fulfillmentMethod === 'DELIVERY' &&
        !customer.deliveryAddress
      ) {
        return res.status(400).json({
          message: 'Укажите адрес доставки.',
        });
      }

      const variantIds = [
        ...new Set(parsed.data.items.map((item) => item.variantId)),
      ];

      const variants = await prisma.productVariant.findMany({
        where: {
          id: {
            in: variantIds,
          },
        },
        select: {
          id: true,
          name: true,
          sku: true,
          color: true,
          thicknessMm: true,
          price: true,
          isActive: true,
          product: {
            select: {
              id: true,
              title: true,
              slug: true,
              unit: true,
              dimensions: true,
              isPublished: true,
              images: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: {
                  imagePath: true,
                  isMain: true,
                },
              },
            },
          },
        },
      });

      const variantsById = new Map(
        variants.map((variant) => [variant.id, variant]),
      );

      const unavailableItem = parsed.data.items.find((item) => {
        const variant = variantsById.get(item.variantId);

        return !variant || !variant.isActive || !variant.product.isPublished;
      });

      if (unavailableItem) {
        return res.status(409).json({
          message:
            'Один из товаров больше недоступен. Обновите корзину и попробуйте снова.',
        });
      }

      const orderItems = [];
      let estimatedTotal = 0;

      for (const item of parsed.data.items) {
        const variant = variantsById.get(item.variantId);
        const product = variant.product;
        const requestedArea = item.area ?? null;
        const usesArea =
          requestedArea !== null && isSquareMeterUnit(product.unit);
        const requestedQuantity = usesArea ? 1 : item.quantity;
        const estimatedLineTotal = calculateOrderLineTotal(
          variant.price,
          product.unit,
          requestedQuantity,
          requestedArea,
        );

        if (estimatedLineTotal === null) {
          return res.status(400).json({
            message: 'Не удалось корректно рассчитать сумму заказа.',
          });
        }

        estimatedTotal += estimatedLineTotal;

        if (
          !Number.isSafeInteger(estimatedTotal) ||
          estimatedTotal > ORDER_MAX_ESTIMATED_TOTAL
        ) {
          return res.status(400).json({
            message: 'Предварительная сумма заказа превышает допустимый лимит.',
          });
        }

        orderItems.push({
          productId: product.id,
          variantId: variant.id,

          productTitleSnapshot: product.title,
          productSlugSnapshot: product.slug,

          variantNameSnapshot: variant.name,
          skuSnapshot: variant.sku || '',

          imagePathSnapshot:
            product.images.find((image) => image.isMain)?.imagePath ||
            product.images[0]?.imagePath ||
            '',
          unitSnapshot: product.unit,
          dimensionsSnapshot: product.dimensions,

          colorSnapshot: variant.color,
          thicknessMmSnapshot: variant.thicknessMm,

          unitPriceSnapshot: variant.price,

          requestedQuantity,
          requestedArea,

          estimatedLineTotal,
        });
      }

      const createdAt = new Date();
      const ipAddress = getRequestIp(req);
      const userAgent = getRequestUserAgent(req);

      const order = await prisma.$transaction(async (tx) => {
        return tx.order.create({
          data: {
            publicNumber: createOrderPublicNumber(),
            idempotencyKey: crypto.randomUUID(),

            customerName: customer.name,
            phone,
            comment: customer.comment,

            fulfillmentMethod: customer.fulfillmentMethod,
            deliveryAddress:
              customer.fulfillmentMethod === 'DELIVERY'
                ? customer.deliveryAddress
                : '',

            estimatedTotal,
            source: 'catalog',

            consentAccepted: true,
            consentAcceptedAt: createdAt,

            ipAddress,
            userAgent,

            items: {
              create: orderItems,
            },
          },
          select: {
            id: true,
            publicNumber: true,
            customerName: true,
            phone: true,
            comment: true,
            fulfillmentMethod: true,
            deliveryAddress: true,
            estimatedTotal: true,
            createdAt: true,
            items: {
              orderBy: {
                id: 'asc',
              },
              select: {
                id: true,
                productTitleSnapshot: true,
                variantNameSnapshot: true,
                unitSnapshot: true,
                colorSnapshot: true,
                thicknessMmSnapshot: true,
                unitPriceSnapshot: true,
                requestedQuantity: true,
                requestedArea: true,
                estimatedLineTotal: true,
              },
            },
          },
        });
      });

      console.log(
        `Заказ ${order.publicNumber} сохранён: ${customer.name}, ${phone}, позиций: ${order.items.length}`,
      );

      if (smtpTransporter) {
        try {
          await sendOrderEmail(order);

          console.log(
            `Письмо по заказу ${order.publicNumber} отправлено менеджеру`,
          );
        } catch (error) {
          console.error(
            `SMTP: заказ ${order.publicNumber} сохранён, но письмо не отправлено:`,
            error.message,
          );
        }
      } else {
        console.error(
          `SMTP не настроен: заказ ${order.publicNumber} сохранён в базе без отправки письма`,
        );
      }

      return res.status(201).json({
        ok: true,
        message:
          'Заказ принят. Менеджер подтвердит наличие, количество, доставку и итоговую стоимость.',
        order: {
          publicNumber: order.publicNumber,
          estimatedTotal: order.estimatedTotal,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

// pages

app.use(publicRouter);

// 404 / errors

app.use(notFoundHandler);
app.use(errorHandler);

// start

const server = app.listen(PORT, HOST, async () => {
  console.log(`Ландшафт Парк запущен на http://${HOST}:${PORT}`);

  if (!smtpTransporter) {
    console.warn('SMTP не настроен: заполните SMTP_* и TO_EMAIL в .env');
    return;
  }

  try {
    await smtpTransporter.verify();

    console.log('SMTP готов к отправке писем');
  } catch (error) {
    console.error('SMTP не прошёл проверку:', error.message);
  }
});

// shutdown

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal}: корректная остановка`);

  if (smtpTransporter) {
    smtpTransporter.close();
  }

  if (!server.listening) {
    process.exit(0);
    return;
  }

  server.close((error) => {
    if (error) {
      console.error('Ошибка при остановке сервера:', error);
      process.exit(1);
      return;
    }

    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
