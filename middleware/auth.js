'use strict';

const prisma = require('../lib/prisma');
const {
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  hashOpaqueToken,
  safeEqualStrings,
  getCookieValue,
  clearAdminAuthCookies,
} = require('../lib/admin-auth');

async function loadAdminSession(req, res, next) {
  try {
    req.adminAuth = null;

    const sessionToken = getCookieValue(req, ADMIN_SESSION_COOKIE);

    if (!sessionToken) {
      return next();
    }

    const tokenHash = hashOpaqueToken(sessionToken);
    const session = await prisma.adminSession.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        csrfTokenHash: true,
        expiresAt: true,
        lastUsedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session) {
      clearAdminAuthCookies(res);
      return next();
    }

    const isExpired = session.expiresAt.getTime() <= Date.now();

    if (isExpired || !session.user.isActive) {
      await prisma.adminSession.deleteMany({
        where: {
          id: session.id,
        },
      });

      clearAdminAuthCookies(res);
      return next();
    }

    req.adminAuth = {
      sessionId: session.id,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      user: session.user,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAdminAuth(req, res, next) {
  if (!req.adminAuth) {
    return res.status(401).json({
      message: 'Требуется авторизация администратора.',
    });
  }

  return next();
}

function requireAdminCsrf(req, res, next) {
  if (!req.adminAuth) {
    return res.status(401).json({
      message: 'Требуется авторизация администратора.',
    });
  }

  const headerToken = String(req.get('x-csrf-token') || '').trim();
  const cookieToken = getCookieValue(req, ADMIN_CSRF_COOKIE);

  if (
    !headerToken ||
    !cookieToken ||
    !safeEqualStrings(headerToken, cookieToken) ||
    !safeEqualStrings(
      hashOpaqueToken(cookieToken),
      req.adminAuth.csrfTokenHash,
    )
  ) {
    return res.status(403).json({
      message: 'CSRF-проверка не пройдена.',
    });
  }

  return next();
}

module.exports = {
  loadAdminSession,
  requireAdminAuth,
  requireAdminCsrf,
};
