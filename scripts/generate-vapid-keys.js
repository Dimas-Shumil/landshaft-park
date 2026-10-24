'use strict';
const crypto = require('node:crypto');
const keys = crypto.createECDH('prime256v1');
keys.generateKeys();
console.log('# Добавьте в .env на VPS. НЕ коммитьте приватный ключ!');
console.log(`VAPID_PUBLIC_KEY=${keys.getPublicKey().toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${keys.getPrivateKey().toString('base64url')}`);
console.log('# Укажите реальный адрес связи для VAPID:');
console.log('VAPID_SUBJECT=mailto:YOUR_REAL_EMAIL@YOUR_DOMAIN.RU');
