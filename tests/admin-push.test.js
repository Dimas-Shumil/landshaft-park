'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const vapid = crypto.createECDH('prime256v1');
vapid.generateKeys();
process.env.VAPID_PUBLIC_KEY = vapid.getPublicKey().toString('base64url');
process.env.VAPID_PRIVATE_KEY = vapid.getPrivateKey().toString('base64url');
process.env.VAPID_SUBJECT = 'mailto:tests@example.org';
// Allow testing pure push cryptography without installing the Prisma package.
require.cache[require.resolve('../lib/prisma')] = { exports: {} };
const push = require('../lib/admin-push');
const b64 = (b) => Buffer.from(b).toString('base64url');

test('VAPID signature uses ES256 and correct aud/sub/exp', () => {
  assert.equal(push.configured, true);
  const token = push.makeVapidToken('https://fcm.googleapis.com/fcm/send/123', 1800000000000);
  const [header, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg:'ES256', typ:'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url').toString()), {
    aud: 'https://fcm.googleapis.com', exp: 1800043200, sub: 'mailto:tests@example.org',
  });
  const pub = vapid.getPublicKey();
  const publicKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64(pub.subarray(1,33)), y: b64(pub.subarray(33,65)) }, format: 'jwk' });
  assert.equal(crypto.verify('sha256', Buffer.from(`${header}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
});

test('Push payload decrypts as RFC8291 aes128gcm single record', () => {
  const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
  const sender = crypto.createECDH('prime256v1'); sender.generateKeys();
  const auth = crypto.randomBytes(16);
  const salt = crypto.randomBytes(16);
  const data = JSON.stringify({ title: 'Новый заказ', body: 'Заказ #1234' });
  const encrypted = push.encryptPayload(data, receiver.getPublicKey(), auth, salt, sender);
  assert.deepEqual(encrypted.subarray(0,16), salt);
  assert.equal(encrypted.readUInt32BE(16), 4096);
  assert.equal(encrypted[20], 65);
  assert.deepEqual(encrypted.subarray(21,86), sender.getPublicKey());
  const secret = receiver.computeSecret(sender.getPublicKey());
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), sender.getPublicKey()]);
  const ikm = crypto.hkdfSync('sha256', secret, auth, info, 32);
  const cek = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'),16);
  const nonce = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'),12);
  const payloadWithTag = encrypted.subarray(86);
  const decipher = crypto.createDecipheriv('aes-128-gcm',Buffer.from(cek), Buffer.from(nonce));
  decipher.setAuthTag(payloadWithTag.subarray(-16));
  const plain = Buffer.concat([decipher.update(payloadWithTag.subarray(0,-16)),decipher.final()]);
  assert.equal(plain.at(-1),2);
  assert.equal(plain.subarray(0,-1).toString(),data);
});

test('Push subscription validates browser keys and rejects SSRF endpoints', () => {
  const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
  const keys = { p256dh:b64(receiver.getPublicKey()), auth:b64(crypto.randomBytes(16)) };
  assert.equal(push.isValidSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/abc',...keys}),true);
  assert.equal(push.isValidSubscription({endpoint:'https://web.push.apple.com/abc',...keys}),true);
  assert.equal(push.isValidSubscription({endpoint:'https://127.0.0.1/push',...keys}),false);
  assert.equal(push.isValidSubscription({endpoint:'https://evil.example/push',...keys}),false);
  assert.equal(push.isValidSubscription({endpoint:'http://fcm.googleapis.com/push',...keys}),false);
  assert.equal(push.isValidSubscription({endpoint:'https://fcm.googleapis.com.evil.test/push',...keys}),false);
  assert.equal(push.isValidSubscription({endpoint:'https://fcm.googleapis.com/push', p256dh:'a', auth:keys.auth}),false);
});

test('test push uses a safe non-production payload and the Settings deep link', () => {
  const payload = push.buildTestPayload();
  assert.equal(payload.title, 'Тестовая заявка — Ландшафт Парк');
  assert.match(payload.body, /Настоящая заявка не создана/);
  assert.equal(payload.url, '/admin/settings');
  assert.match(payload.tag, /^landshaft-test-[0-9a-f-]{36}$/);
  assert.notEqual(payload.tag, push.buildTestPayload().tag);
});

test('manual push test sends via Web Push provider, not the request creation flow', async () => {
  const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
  const subscription = {
    id: 1,
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-id',
    p256dh: b64(receiver.getPublicKey()),
    auth: b64(crypto.randomBytes(16)),
  };
  const originalFetch = global.fetch;
  let captured = null;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 201 };
  };
  try {
    assert.equal(await push.sendTestNotification(subscription), true);
    assert.equal(captured.url, subscription.endpoint);
    assert.equal(captured.options.method, 'POST');
    assert.equal(captured.options.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(captured.options.headers.TTL, '3600');
    assert.ok(Buffer.isBuffer(captured.options.body));
  } finally {
    global.fetch = originalFetch;
  }
});
