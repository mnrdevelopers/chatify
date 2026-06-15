/**
 * sw.js — Chatify Service Worker
 *
 * Handles:
 *   1. Static asset caching (PWA offline support)
 *   2. OneSignal push notification delegation
 *   3. Notification clicks with deep-link routing
 *
 * OneSignal registers its OWN worker (OneSignalSDKWorker.js) for push delivery.
 * This file handles PWA caching + notification click routing for the app shell.
 */

// ── Cache Config ───────────────────────────────────────────────────────────
const CACHE_NAME = 'chatify-pwa-v7';
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./favicon.png",
  "./favicon.svg",
  "./icon.svg",
  "./icons.svg",
  "./assets/auth-CkxBG8sY.js",
  "./assets/auth-DHZMF2cQ.css",
  "./assets/favicon-a5-zD-vB.png",
  "./assets/firebase-config-N-L0v_2X.js",
  "./assets/index.esm-BWZxc9_b.js",
  "./assets/login-vCuvenXU.js",
  "./assets/main-CjLYjoQX.js",
  "./assets/manifest-D1h_DOwc.json",
  "./assets/rolldown-runtime-WNZMJCWm.js"
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Cache failed for', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

// ── Fetch (Cache-First for static assets) ─────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass Firebase, OneSignal, and external API calls — always fresh
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('onesignal.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
          return response;
        })
        .catch((err) => {
          console.warn('[SW] Network failed, not in cache:', err);
          throw err;
        });
    })
  );
});

// ── Notification Click ─────────────────────────────────────────────────────
// OneSignal's worker handles most notificationclicks. This is a fallback
// for any notifications triggered directly from this SW (e.g., foreground).
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  const data     = notification.data || {};
  const type     = data.type;
  const chatId   = data.chatId;
  const deepLink = data.url || './';

  let targetUrl = './';
  if (type === 'message' && chatId) {
    targetUrl = `./?chatId=${chatId}`;
  } else if (type === 'call' && chatId) {
    targetUrl = `./?incomingCall=1&chatId=${chatId}`;
  } else if (deepLink && deepLink !== './') {
    targetUrl = deepLink;
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'PUSH_NAVIGATE', targetUrl, notifType: type, chatId });
            return;
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Push fallback (for raw non-OneSignal pushes) ───────────────────────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: 'Chatify', body: event.data?.text() || 'New notification' } };
  }

  const notif = payload.notification || payload;
  const title  = notif.title || 'Chatify';
  const body   = notif.body  || 'You have a new notification';
  const data   = payload.data || {};

  const options = {
    body,
    icon:  '/icon.svg',
    badge: '/icon.svg',
    data,
    requireInteraction: data.type === 'call',
    vibrate: data.type === 'call' ? [300, 200, 300, 200, 300] : [200, 100, 200],
    tag: data.type === 'call' ? 'incoming-call' : `msg-${data.chatId || Date.now()}`,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
