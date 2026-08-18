'use strict';

require('dotenv').config();

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');

const publicRouter = require('./routes/public.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
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
const CALCULATE_SPAM_SCORE_LIMIT = 3;

const calculateFormChallenges = new Map();
const recentCalculateRequests = new Map();

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
    pattern:
      /(?:продвижени|маркетинг|таргет|реклам|seo|лидогенерац)\w*/iu,
  },
  {
    score: 1,
    pattern:
      /(?:разработк|создани)\w*\s+(?:сайт|лендинг|приложени)\w*/iu,
  },
  {
    score: 1,
    pattern:
      /(?:предлага\w*|предложени\w*|сотрудничеств\w*|увеличим\w*|привлеч[её]м\w*)/iu,
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

    formElapsedMs: z
      .number()
      .int()
      .min(0)
      .max(CALCULATE_FORM_MAX_AGE_MS),
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

function cleanupRecentCalculateRequests(now = Date.now()) {
  for (const [fingerprint, createdAt] of recentCalculateRequests) {
    if (now - createdAt <= CALCULATE_DUPLICATE_WINDOW_MS) {
      continue;
    }

    recentCalculateRequests.delete(fingerprint);
  }
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

function isDuplicateCalculateRequest(fingerprint) {
  cleanupRecentCalculateRequests();

  const createdAt = recentCalculateRequests.get(fingerprint);

  return Boolean(
    createdAt && Date.now() - createdAt <= CALCULATE_DUPLICATE_WINDOW_MS,
  );
}

function rememberCalculateRequest(fingerprint) {
  cleanupRecentCalculateRequests();
  recentCalculateRequests.set(fingerprint, Date.now());
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
    const requestOrigin = new URL(
      `${req.protocol}://${req.get('host') || ''}`,
    ).origin;

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

// public api

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'landshaft-park',
  });
});

app.get('/api/requests/calculate/challenge', validateRequestOrigin, (req, res) => {
  return res.json({
    ok: true,
    formToken: createCalculateFormChallenge(),
  });
});

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

      if (isDuplicateCalculateRequest(duplicateFingerprint)) {
        consumeCalculateFormChallenge(parsed.data.formToken);

        console.warn(`Антиспам: повтор заявки, IP: ${ipAddress}`);

        return acceptRequestSilently(res);
      }

      if (!smtpTransporter) {
        return res.status(503).json({
          message:
            'Отправка заявок временно недоступна. Позвоните нам по телефону.',
        });
      }

      const request = {
        name: parsed.data.name,
        phone,
        area: parsed.data.area || null,
        purpose: parsed.data.purpose || null,
        purposeLabel: parsed.data.purpose
          ? PURPOSE_LABELS[parsed.data.purpose]
          : 'Не указана',
        comment: parsed.data.comment,
        delivery: parsed.data.delivery,
        ipAddress,
        userAgent,
        createdAt: new Date(),
      };

      consumeCalculateFormChallenge(parsed.data.formToken);

      await sendCalculateEmail(request);
      rememberCalculateRequest(duplicateFingerprint);

      console.log(
        `Заявка на расчёт отправлена: ${request.name}, ${request.phone}`,
      );

      return res.status(201).json({
        ok: true,
        message: 'Заявка отправлена',
      });
    } catch (error) {
      if (
        error?.code === 'EAUTH' ||
        error?.code === 'ECONNECTION' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ESOCKET'
      ) {
        console.error('SMTP: письмо не отправлено:', error.message);

        return res.status(503).json({
          message:
            'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.',
        });
      }

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
