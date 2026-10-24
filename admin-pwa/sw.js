'use strict';

// Admin service worker. No authenticated HTML/API response is ever cached.
const VERSION = 'landshaft-admin-offline-v2';
const OFFLINE_URL = '/admin/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL, '/admin/offline.css', '/admin/offline.js'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('landshaft-admin-') && key !== VERSION).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && ['/admin/offline.css', '/admin/offline.js'].includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || !url.pathname.startsWith('/admin/')) return;
  event.respondWith(fetch(event.request).catch(async () => {
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = {}; }
  const title = String(data.title || 'Ландшафт Парк').slice(0, 90);
  const body = String(data.body || 'Новое обращение в магазине').slice(0, 130);
  const path = data.url === '/admin/settings'
    ? '/admin/settings'
    : (/^\/admin\/requests\?open=(order|calculate):\d+$/.test(data.url) ? data.url : '/admin/requests');
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/admin/icons/icon-192.png',
    badge: '/admin/icons/icon-192.png',
    tag: String(data.tag || 'landshaft-request').slice(0, 90),
    data: { path },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path || '/admin/requests';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const adminWindow = windows.find((client) => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith('/admin/'));
    if (adminWindow) {
      await adminWindow.navigate(target);
      return adminWindow.focus();
    }
    return self.clients.openWindow(target);
  })());
});
