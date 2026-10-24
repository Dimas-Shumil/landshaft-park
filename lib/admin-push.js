'use strict';

// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID), using Node.js built-ins.
// Never include customers' personal data in push payloads.
const crypto = require('node:crypto');
const prisma = require('./prisma');

const b64url = (data) => Buffer.from(data).toString('base64url');
const decode = (data) => Buffer.from(data, 'base64url');
const PUSH_SUBJECT = String(process.env.VAPID_SUBJECT || '').trim();
const PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const tokenCache = new Map();
const configured = (() => {
  try {
    if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i.test(PUSH_SUBJECT)) return false;
    const pub = decode(PUBLIC_KEY);
    const priv = decode(PRIVATE_KEY);
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return false;
    const jwk = crypto.createECDH('prime256v1');
    jwk.setPrivateKey(priv);
    return crypto.timingSafeEqual(jwk.getPublicKey(), pub);
  } catch {
    return false;
  }
})();

function isAllowedEndpoint(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return false;
    const host = url.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      (host === 'web.push.apple.com' || host.endsWith('.push.apple.com')) ||
      host === 'android.googleapis.com' ||
      host === 'push.services.mozilla.com' ||
      host.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}

function isValidSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;
  const { endpoint, p256dh, auth } = subscription;
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !isAllowedEndpoint(endpoint)) return false;
  if (typeof p256dh !== 'string' || p256dh.length > 120 || !/^[A-Za-z0-9_-]+$/.test(p256dh)) return false;
  if (typeof auth !== 'string' || auth.length > 80 || !/^[A-Za-z0-9_-]+$/.test(auth)) return false;
  const pub = decode(p256dh);
  const secret = decode(auth);
  if (pub.length !== 65 || pub[0] !== 4 || secret.length !== 16) return false;
  try {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    ecdh.computeSecret(pub);
    return true;
  } catch {
    return false;
  }
}

function makeVapidToken(endpoint, now = Date.now()) {
  if (!configured) throw new Error('Web Push VAPID не настроен');
  const audience = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const claims = b64url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: PUSH_SUBJECT,
  })));
  const pub = decode(PUBLIC_KEY);
  const priv = decode(PRIVATE_KEY);
  const privateJwk = {
    kty: 'EC', crv: 'P-256',
    x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)), d: b64url(priv),
  };
  const data = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(data), {
    key: crypto.createPrivateKey({ key: privateJwk, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  });
  return `${data}.${b64url(signature)}`;
}

function cachedVapidToken(endpoint) {
  const audience = new URL(endpoint).origin;
  const current = tokenCache.get(audience);
  if (current && current.issuedAt + 60 * 60 * 1000 > Date.now()) return current.token;
  const token = makeVapidToken(endpoint);
  tokenCache.set(audience, { token, issuedAt: Date.now() });
  return token;
}

function encryptPayload(data, recipientPublic, authSecret, salt = crypto.randomBytes(16), sender = crypto.createECDH('prime256v1')) {
  // RFC 8291 section 3.3: IKM = HKDF(auth, ECDH, "WebPush: info" || 0 || ua || as).
  if (!sender.getPublicKey || !sender.getPrivateKey) throw new Error('Invalid ECDH key');
  let senderPublic;
  try {
    senderPublic = sender.getPublicKey();
  } catch {
    sender.generateKeys();
    senderPublic = sender.getPublicKey();
  }
  const sharedSecret = sender.computeSecret(recipientPublic);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), recipientPublic, senderPublic]);
  const ikm = crypto.hkdfSync('sha256', sharedSecret, authSecret, info, 32);
  const contentKey = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', Buffer.from(contentKey), Buffer.from(nonce));
  // One record, trailing 0x02; max payload well below the 4096-byte record size.
  const plain = Buffer.concat([Buffer.from(data, 'utf8'), Buffer.from([2])]);
  const cipherText = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = senderPublic.length;
  return Buffer.concat([header, senderPublic, cipherText]);
}

async function sendSingle(subscription, payload) {
  const encrypted = encryptPayload(
    JSON.stringify(payload), decode(subscription.p256dh), decode(subscription.auth),
  );
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Authorization': `vapid t=${cachedVapidToken(subscription.endpoint)}, k=${PUBLIC_KEY}`,
      'TTL': '3600',
      'Urgency': 'high',
    },
    body: encrypted,
    redirect: 'error',
    signal: AbortSignal.timeout(7000),
  });
  if (response.status === 404 || response.status === 410) {
    await prisma.adminPushSubscription.deleteMany({ where: { id: subscription.id } });
    return false;
  }
  if (!response.ok) throw new Error(`Push endpoint status ${response.status}`);
  return true;
}

function buildTestPayload() {
  return {
    title: 'Тестовая заявка — Ландшафт Парк',
    body: 'Проверка уведомлений: Web Push работает. Настоящая заявка не создана.',
    url: '/admin/settings',
    tag: `landshaft-test-${crypto.randomUUID()}`,
  };
}

async function sendTestNotification(subscription) {
  return sendSingle(subscription, buildTestPayload());
}

async function notifyAdmins(payload) {
  if (!configured) return;
  // No PII in notification payload, even on a locked screen.
  const safePayload = {
    title: String(payload.title || 'Новое обращение').slice(0, 90),
    body: String(payload.body || 'Откройте админ-панель для просмотра').slice(0, 130),
    url: /^\/admin\/requests\?open=(?:order|calculate):\d+$/.test(payload.url)
      ? payload.url : '/admin/requests',
    tag: String(payload.tag || 'landshaft-request').slice(0, 90),
  };
  try {
    const subs = await prisma.adminPushSubscription.findMany({
      where: { session: { expiresAt: { gt: new Date() }, user: { isActive: true } } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
      take: 250,
    });
    const batchSize = 5;
    for (let i = 0; i < subs.length; i += batchSize) {
      await Promise.allSettled(subs.slice(i, i + batchSize).map(async (sub) => {
        try {
          await sendSingle(sub, safePayload);
        } catch (error) {
          console.warn(`Web Push: ошибка доставки подписке #${sub.id}: ${error.message}`);
        }
      }));
    }
  } catch (error) {
    console.error('Web Push: ошибка при поиске подписок:', error.message);
  }
}

module.exports = { configured, PUBLIC_KEY, isValidSubscription, isAllowedEndpoint, makeVapidToken, encryptPayload, notifyAdmins, buildTestPayload, sendTestNotification };
