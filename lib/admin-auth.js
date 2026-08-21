'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const argon2 = require('argon2');

const scryptAsync = promisify(crypto.scrypt);

const ADMIN_SESSION_COOKIE = 'lp_admin_session';
const ADMIN_CSRF_COOKIE = 'lp_admin_csrf';

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Argon2id parameters follow a deliberately memory-hard profile suitable for
// interactive administrator logins. memoryCost is measured in KiB.
const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});

// Legacy scrypt constants are kept only so an administrator created before
// the Argon2id migration can log in once and have the hash upgraded safely.
const LEGACY_SCRYPT_KEY_LENGTH = 64;
const LEGACY_SCRYPT_MAXMEM = 64 * 1024 * 1024;

function normalizeAdminEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashOpaqueToken(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function createOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateAdminPassword(password) {
  const normalizedPassword = String(password || '');

  if (normalizedPassword.length < 12 || normalizedPassword.length > 256) {
    throw new Error('Пароль администратора должен содержать от 12 до 256 символов.');
  }

  return normalizedPassword;
}

async function hashAdminPassword(password) {
  const normalizedPassword = validateAdminPassword(password);

  return argon2.hash(normalizedPassword, ARGON2_OPTIONS);
}

async function verifyLegacyScryptPassword(password, passwordHash) {
  const parts = String(passwordHash || '').split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N < 2 ||
    r < 1 ||
    p < 1
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(rawSalt, 'base64url');
    const expectedHash = Buffer.from(rawHash, 'base64url');
    const actualHash = Buffer.from(
      await scryptAsync(String(password || ''), salt, LEGACY_SCRYPT_KEY_LENGTH, {
        N,
        r,
        p,
        maxmem: LEGACY_SCRYPT_MAXMEM,
      }),
    );

    if (actualHash.length !== expectedHash.length) {
      return false;
    }

    return crypto.timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

async function verifyAdminPassword(password, passwordHash) {
  const storedHash = String(passwordHash || '');

  if (storedHash.startsWith('$argon2id$')) {
    try {
      return await argon2.verify(storedHash, String(password || ''));
    } catch {
      return false;
    }
  }

  if (storedHash.startsWith('scrypt$')) {
    return verifyLegacyScryptPassword(password, storedHash);
  }

  return false;
}

function needsAdminPasswordRehash(passwordHash) {
  return !String(passwordHash || '').startsWith('$argon2id$');
}

async function consumePasswordVerificationCost(password) {
  // Keeps the "unknown email" path computationally expensive as well, which
  // reduces timing differences that could otherwise aid user enumeration.
  await argon2.hash(String(password || ''), ARGON2_OPTIONS);
}

function getCookieValue(req, name) {
  const cookieHeader = String(req.headers.cookie || '');

  if (!cookieHeader) {
    return '';
  }

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = pair.slice(0, separatorIndex).trim();

    if (key !== name) {
      continue;
    }

    const rawValue = pair.slice(separatorIndex + 1).trim();

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return '';
    }
  }

  return '';
}

function getSessionDurationMs(rememberMe) {
  return rememberMe
    ? ADMIN_REMEMBER_SESSION_TTL_MS
    : ADMIN_SESSION_TTL_MS;
}

function getAdminCookieOptions(maxAge) {
  const options = {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };

  if (Number.isFinite(maxAge)) {
    options.maxAge = maxAge;
  }

  return options;
}

function getAdminCsrfCookieOptions(maxAge) {
  const options = {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };

  if (Number.isFinite(maxAge)) {
    options.maxAge = maxAge;
  }

  return options;
}

function setAdminAuthCookies(res, sessionToken, csrfToken, durationMs) {
  res.cookie(
    ADMIN_SESSION_COOKIE,
    sessionToken,
    getAdminCookieOptions(durationMs),
  );
  res.cookie(
    ADMIN_CSRF_COOKIE,
    csrfToken,
    getAdminCsrfCookieOptions(durationMs),
  );
}

function clearAdminAuthCookies(res) {
  res.clearCookie(ADMIN_SESSION_COOKIE, getAdminCookieOptions());
  res.clearCookie(ADMIN_CSRF_COOKIE, getAdminCsrfCookieOptions());
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
  normalizeAdminEmail,
  hashOpaqueToken,
  createOpaqueToken,
  safeEqualStrings,
  hashAdminPassword,
  verifyAdminPassword,
  needsAdminPasswordRehash,
  consumePasswordVerificationCost,
  getCookieValue,
  getSessionDurationMs,
  setAdminAuthCookies,
  clearAdminAuthCookies,
};
