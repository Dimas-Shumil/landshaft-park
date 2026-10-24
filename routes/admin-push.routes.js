'use strict';

const express = require('express');
const prisma = require('../lib/prisma');
const { loadAdminSession, requireAdminAuth, requireAdminCsrf } = require('../middleware/auth');
const { configured, PUBLIC_KEY, isValidSubscription, isAllowedEndpoint, sendTestNotification } = require('../lib/admin-push');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();
router.use(loadAdminSession, requireAdminAuth);
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false }));

function sameOrigin(req, res, next) {
  const origin = String(req.get('origin') || '');
  if (!origin) return next();
  try {
    if (new URL(origin).origin !== new URL(`${req.protocol}://${req.get('host')}`).origin) {
      return res.status(403).json({ message: 'Источник запроса не разрешён.' });
    }
  } catch {
    return res.status(403).json({ message: 'Источник запроса не разрешён.' });
  }
  return next();
}

router.get('/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, enabled: configured, publicKey: configured ? PUBLIC_KEY : null });
});

router.post('/subscriptions', sameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    if (!configured) return res.status(503).json({ message: 'Web Push не настроен на сервере.' });
    if (!isValidSubscription(req.body)) return res.status(400).json({ message: 'Некорректная push-подписка.' });
    const { endpoint, p256dh, auth } = req.body;
    await prisma.adminPushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, sessionId: req.adminAuth.sessionId },
      update: { p256dh, auth, sessionId: req.adminAuth.sessionId },
    });
    return res.status(201).json({ ok: true });
  } catch (error) { return next(error); }
});

router.delete('/subscriptions', sameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 2048 || !isAllowedEndpoint(endpoint)) {
      return res.status(400).json({ message: 'Некорректный endpoint.' });
    }
    await prisma.adminPushSubscription.deleteMany({
      where: { endpoint, sessionId: req.adminAuth.sessionId },
    });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

// A manual smoke-test for the current device only. Does not create a request/order or send email.
const testLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Слишком много тестовых уведомлений. Попробуйте позже.' },
});

router.post('/test', testLimiter, sameOrigin, requireAdminCsrf, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (!configured) return res.status(503).json({ message: 'Web Push не настроен на сервере.' });
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 2048 || !isAllowedEndpoint(endpoint)) {
      return res.status(400).json({ message: 'Некорректная Push-подписка.' });
    }
    const subscription = await prisma.adminPushSubscription.findFirst({
      where: { endpoint, sessionId: req.adminAuth.sessionId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (!subscription) return res.status(404).json({ message: 'Подписка этого устройства не найдена. Переподключите уведомления.' });
    const accepted = await sendTestNotification(subscription);
    if (!accepted) return res.status(410).json({ message: 'Push-подписка устарела. Отключите и снова включите уведомления.' });
    return res.json({ ok: true });
  } catch (error) {
    console.warn('Web Push: тестовое уведомление не отправлено:', error.message);
    return res.status(502).json({ message: 'Push-сервис не принял тестовое уведомление. Попробуйте позже.' });
  }
});

module.exports = router;
