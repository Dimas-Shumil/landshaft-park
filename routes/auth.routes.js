'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const {
  ADMIN_CSRF_COOKIE,
  normalizeAdminEmail,
  hashOpaqueToken,
  createOpaqueToken,
  verifyAdminPassword,
  needsAdminPasswordRehash,
  hashAdminPassword,
  consumePasswordVerificationCost,
  getSessionDurationMs,
  setAdminAuthCookies,
  clearAdminAuthCookies,
  getCookieValue,
} = require('../lib/admin-auth');
const {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
} = require('../middleware/auth');

const router = express.Router();

const loginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(256),
    rememberMe: z.boolean().optional().default(false),
  })
  .strict();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Слишком много попыток входа. Попробуйте позже.',
  },
});

function validateAdminRequestOrigin(req, res, next) {
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

router.use(loadAdminSession);

router.post(
  '/login',
  loginLimiter,
  validateAdminRequestOrigin,
  async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: 'Проверьте email и пароль.',
        });
      }

      const email = normalizeAdminEmail(parsed.data.email);
      const adminUser = await prisma.adminUser.findUnique({
        where: {
          email,
        },
      });

      if (!adminUser) {
        await consumePasswordVerificationCost(parsed.data.password);

        return res.status(401).json({
          message: 'Неверный email или пароль.',
        });
      }

      const isPasswordValid = await verifyAdminPassword(
        parsed.data.password,
        adminUser.passwordHash,
      );

      if (!isPasswordValid || !adminUser.isActive) {
        return res.status(401).json({
          message: 'Неверный email или пароль.',
        });
      }

      const upgradedPasswordHash = needsAdminPasswordRehash(
        adminUser.passwordHash,
      )
        ? await hashAdminPassword(parsed.data.password)
        : null;

      const sessionToken = createOpaqueToken();
      const csrfToken = createOpaqueToken();
      const durationMs = getSessionDurationMs(parsed.data.rememberMe);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationMs);

      await prisma.$transaction(async (tx) => {
        await tx.adminSession.deleteMany({
          where: {
            expiresAt: {
              lte: now,
            },
          },
        });

        await tx.adminSession.create({
          data: {
            userId: adminUser.id,
            tokenHash: hashOpaqueToken(sessionToken),
            csrfTokenHash: hashOpaqueToken(csrfToken),
            expiresAt,
            lastUsedAt: now,
            ipAddress: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
          },
        });

        await tx.adminUser.update({
          where: {
            id: adminUser.id,
          },
          data: {
            lastLoginAt: now,
            ...(upgradedPasswordHash
              ? { passwordHash: upgradedPasswordHash }
              : {}),
          },
        });
      });

      setAdminAuthCookies(res, sessionToken, csrfToken, durationMs);

      return res.json({
        ok: true,
        csrfToken,
        user: {
          id: adminUser.id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get('/session', requireAdminAuth, async (req, res, next) => {
  try {
    const now = new Date();

    await prisma.adminSession.update({
      where: {
        id: req.adminAuth.sessionId,
      },
      data: {
        lastUsedAt: now,
      },
    });

    return res.json({
      ok: true,
      csrfToken: getCookieValue(req, ADMIN_CSRF_COOKIE),
      user: req.adminAuth.user,
      expiresAt: req.adminAuth.expiresAt,
    });
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/logout',
  validateAdminRequestOrigin,
  requireAdminAuth,
  requireAdminCsrf,
  async (req, res, next) => {
    try {
      await prisma.adminSession.deleteMany({
        where: {
          id: req.adminAuth.sessionId,
        },
      });

      clearAdminAuthCookies(res);

      return res.json({
        ok: true,
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
