'use strict';

(() => {
  const banner = document.querySelector('[data-admin-install-banner]');
  const installButton = document.querySelector('[data-admin-install]');
  const closeButton = document.querySelector('[data-admin-install-close]');
  const installHint = document.querySelector('[data-admin-install-hint]');
  const pushButton = document.querySelector('[data-admin-push-toggle]');
  const pushStatus = document.querySelector('[data-admin-push-status]');
  const testButton = document.querySelector('[data-admin-push-test]');
  const testResult = document.querySelector('[data-admin-push-test-result]');

  let deferredPrompt = null;
  let registration = null;
  let vapidKey = '';
  let saving = false;
  let subscribed = false;
  let testing = false;

  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function storageGet(key) {
    try { return window.sessionStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch { /* Storage may be restricted. */ }
  }
  function showBanner() {
    if (!banner || standalone() || storageGet('lp_admin_install_dismissed') === '1') return;
    banner.hidden = false;
  }
  function hideBanner() {
    if (banner) banner.hidden = true;
  }
  function setPushStatus(value) {
    if (pushStatus) pushStatus.textContent = value;
  }
  function updateToggle() {
    if (!pushButton) return;
    pushButton.disabled = saving || testing || !registration || !vapidKey || Notification.permission === 'denied';
    pushButton.textContent = saving ? 'Сохраняем…' : (subscribed ? 'Отключить' : 'Включить');
    pushButton.setAttribute('aria-pressed', String(subscribed));
    if (testButton) {
      testButton.disabled = saving || testing || !subscribed || !registration || !vapidKey || Notification.permission !== 'granted';
      testButton.textContent = testing ? 'Отправляем…' : 'Тестовая заявка';
    }
  }
  function setTestResult(message) {
    if (!testResult) return;
    testResult.textContent = message;
    testResult.hidden = !message;
  }
  function csrf() {
    const cookie = document.cookie.split('; ').find((value) => value.startsWith('lp_admin_csrf='));
    if (!cookie) return '';
    try { return decodeURIComponent(cookie.slice('lp_admin_csrf='.length)); } catch { return ''; }
  }
  async function api(url, method, body) {
    const response = await fetch(url, {
      method, credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) {
      window.location.replace('/admin/login');
      throw new Error('Сессия завершена');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || `Ошибка ${response.status}`);
    }
    return response.json();
  }
  function decodeKey(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const result = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(result, (x) => x.charCodeAt(0));
  }
  async function syncSubscription() {
    if (!registration || !vapidKey || !pushButton) return;
    if (Notification.permission === 'denied') {
      setPushStatus('Уведомления запрещены в настройках браузера. Разрешите их для этого сайта.');
      updateToggle();
      return;
    }
    const existing = await registration.pushManager.getSubscription();
    if (existing && Notification.permission === 'granted') {
      const json = existing.toJSON();
      await api('/api/admin/push/subscriptions', 'POST', {
        endpoint: existing.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth,
      });
      subscribed = true;
      setPushStatus('Активны на этом устройстве');
    } else {
      subscribed = false;
      setPushStatus('Сейчас выключены');
    }
    updateToggle();
  }
  async function togglePush() {
    if (saving || !registration || !vapidKey) return;
    saving = true;
    updateToggle();
    try {
      if (subscribed) {
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          await api('/api/admin/push/subscriptions', 'DELETE', { endpoint: existing.endpoint });
          await existing.unsubscribe();
        }
        subscribed = false;
        setPushStatus('Уведомления выключены на этом устройстве');
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setPushStatus('Разрешите уведомления для сайта в настройках браузера');
          return;
        }
        let existing = await registration.pushManager.getSubscription();
        if (!existing) {
          existing = await registration.pushManager.subscribe({
            userVisibleOnly: true, applicationServerKey: decodeKey(vapidKey),
          });
        }
        const json = existing.toJSON();
        await api('/api/admin/push/subscriptions', 'POST', {
          endpoint: existing.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth,
        });
        subscribed = true;
        setPushStatus('Уведомления активны на этом устройстве');
      }
    } catch (error) {
      setPushStatus(error.message || 'Не удалось обновить подписку');
    } finally {
      saving = false;
      updateToggle();
    }
  }

  async function sendTestPush() {
    if (testing || saving || !subscribed || !registration || !vapidKey || Notification.permission !== 'granted') return;
    testing = true;
    setTestResult('');
    updateToggle();
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscribed = false;
        setPushStatus('Подписка отсутствует — включите уведомления снова.');
        throw new Error('На этом устройстве нет активной Push-подписки.');
      }
      await api('/api/admin/push/test', 'POST', { endpoint: subscription.endpoint });
      setTestResult('Тестовое Push передано сервису уведомлений. Проверьте уведомления на этом устройстве.');
    } catch (error) {
      setTestResult(error.message || 'Не удалось отправить тестовое уведомление.');
    } finally {
      testing = false;
      updateToggle();
    }
  }

  pushButton?.addEventListener('click', togglePush);
  testButton?.addEventListener('click', sendTestPush);
  closeButton?.addEventListener('click', () => {
    storageSet('lp_admin_install_dismissed', '1');
    hideBanner();
  });
  installButton?.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') hideBanner();
      return;
    }
    if (installHint) {
      installHint.textContent = ios
        ? 'Safari: нажмите «Поделиться», затем «На экран Домой». Откройте приложение с экрана Домой.'
        : 'Откройте меню браузера и выберите «Установить приложение».';
      installHint.hidden = false;
    }
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showBanner();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    storageSet('lp_admin_install_dismissed', '1');
    hideBanner();
  });

  (async () => {
    if (!('serviceWorker' in navigator)) {
      setPushStatus('Браузер не поддерживает Service Worker');
      if (pushButton) pushButton.disabled = true;
      return;
    }
    try {
      registration = await navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
      if (!standalone()) showBanner();
    } catch (error) {
      setPushStatus(`Не удалось запустить PWA: ${error.message || 'ошибка Service Worker'}`);
      if (pushButton) pushButton.disabled = true;
      return;
    }

    // Push settings are initialized only on /admin/settings. Other admin pages
    // register the service worker but never request notification permissions.
    if (!pushButton) return;
    if (ios && !standalone()) {
      setPushStatus('На iPhone/iPad сначала установите админку на экран Домой через Safari и откройте её оттуда.');
      pushButton.disabled = true;
      return;
    }
    if (!('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('Web Push не поддерживается этим браузером');
      pushButton.disabled = true;
      return;
    }
    try {
      const config = await api('/api/admin/push/config', 'GET');
      if (!config.enabled || !config.publicKey) {
        setPushStatus('Web Push не настроен на сервере. Проверьте VAPID-ключи в .env.');
        pushButton.disabled = true;
        return;
      }
      vapidKey = config.publicKey;
      await syncSubscription();
    } catch (error) {
      setPushStatus(error.message || 'Ошибка подключения уведомлений');
      pushButton.disabled = true;
    }
  })();
})();
