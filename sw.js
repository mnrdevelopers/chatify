/**
 * service-worker.js — Chatify Enhanced Service Worker
 *
 * This service worker handles:
 *   1. Static asset caching (PWA offline support)
 *   2. Pusher Beams push notifications via importScripts delegation
 *   3. Push events (message + call notifications)
 *   4. Notification clicks with deep-link routing
 *
 * Integrating Beams into an existing SW:
 *   https://pusher.com/docs/beams/guides/existing-service-worker/
 */

// ── Delegate push handling to Pusher Beams ─────────────────────────────────
// This must come before any other push/notificationclick listeners.
importScripts('https://js.pusher.com/beams/service-worker.js');

// ── Cache Config ───────────────────────────────────────────────────────────
const CACHE_NAME = 'chatify-pwa-v6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './light-mode.css',
  './icon.svg',
  './manifest.json',
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

  // Bypass Firebase, Pusher, and API calls — always fresh
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('pusher') ||
    url.hostname.includes('pushnotifications') ||
    url.pathname.startsWith('/beams-auth') ||
    url.pathname.startsWith('/notify/')
  ) {
    return; // Let the browser handle it natively
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
// Beams handles the basic notificationclick, but we extend it here for
// deep-linking into the correct chat or accepting an incoming call.
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  // Beams attaches push payload as notification.data
  const data    = notification.data || {};
  const type    = data.type;
  const chatId  = data.chatId;
  const deepLink = notification.data?.url || './';

  // Build the target URL based on notification type
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
        // If app is already open, focus it and post a message to navigate
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'PUSH_NAVIGATE', targetUrl, notifType: type, chatId });
            return;
          }
        }
        // App is closed — open a new window
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Push (manual fallback, in case not caught by Beams SW) ─────────────────
// Beams' importScripts handles most pushes. This is a safety net for
// custom payloads that fall through.
self.addEventListener('push', (event) => {
  // Beams' SW script processes first. Only handle raw pushes here.
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
