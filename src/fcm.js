/**
 * fcm.js — Firebase Cloud Messaging (FCM) Web Push client
 *
 * Replaces Pusher Beams. Fully serverless — no custom backend required.
 *
 * How it works:
 *   1. User grants notification permission
 *   2. FCM registers the device and returns an FCM token
 *   3. The token is saved to Firestore under users/{uid}/fcmToken
 *   4. When user A sends a message to user B, a Firestore Cloud Function
 *      (or the sender client, for foreground) reads user B's fcmToken
 *      and calls the FCM HTTP API to deliver the push.
 *
 *   For a fully client-side approach (no Cloud Functions), we use the
 *   Firestore trigger pattern: sender writes a "pendingNotification" doc,
 *   and the recipient's service worker picks it up via a real-time listener
 *   when the app is in the background.
 *
 * Setup (one-time, in Firebase Console):
 *   1. Go to Project Settings → Cloud Messaging
 *   2. Generate a "Web Push certificate" (VAPID key)
 *   3. Copy the "Key pair" (public key) into VAPID_KEY below
 */

import { messaging } from './firebase-config.js';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { db } from './firebase-config.js';
import { doc, setDoc, deleteField, updateDoc } from 'firebase/firestore';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// Get this from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
export const VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || '';

// ─── STATE ──────────────────────────────────────────────────────────────────
let fcmInitialized = false;
let foregroundUnsubscribe = null;

/**
 * Initialize Firebase Cloud Messaging.
 * Must be called after user is authenticated.
 *
 * @param {string} firebaseUid  — the logged-in user's Firebase UID
 * @param {Function} onSuccess  — called with the FCM token on success
 * @param {Function} onError    — called on failure
 */
export async function initFCM(firebaseUid, onSuccess, onError) {
  if (!firebaseUid) return;
  if (!messaging) {
    console.warn('[FCM] Firebase Messaging is not supported in this browser.');
    return;
  }

  // FCM requires HTTPS (or localhost)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.warn('[FCM] Web Push requires HTTPS. Skipping FCM init.');
    return;
  }

  if (!VAPID_KEY) {
    console.warn('[FCM] VITE_FCM_VAPID_KEY is not set in .env. Skipping FCM.');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[FCM] Service Workers not supported.');
    return;
  }

  // Check / request notification permission
  if (Notification.permission === 'denied') {
    console.warn('[FCM] Notifications are blocked by user.');
    return;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission not granted.');
      return;
    }
  }

  try {
    // Use the existing sw.js registration (avoids Vite's 404 fallback issue)
    const swRegistration = await navigator.serviceWorker.ready;

    // Get the FCM device token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      throw new Error('FCM returned an empty token.');
    }

    // Save the token to Firestore so other users can send pushes to this device
    await setDoc(
      doc(db, 'users', firebaseUid),
      { fcmToken: token, fcmTokenUpdatedAt: Date.now() },
      { merge: true }
    );

    fcmInitialized = true;
    console.log('[FCM] ✅ Registered. Token saved to Firestore.');
    if (onSuccess) onSuccess(token);

    // ── Foreground message handler ────────────────────────────────────────
    // When the app is open (foreground), FCM doesn't show a notification automatically.
    // We manually show one so the user still gets alerted.
    if (foregroundUnsubscribe) foregroundUnsubscribe(); // cleanup any previous listener
    foregroundUnsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      const { title, body, icon } = payload.notification || {};
      const data = payload.data || {};

      // Show a native browser notification while app is open
      if (Notification.permission === 'granted') {
        const notif = new Notification(title || 'Chatify', {
          body: body || '',
          icon: icon || '/icon.svg',
          badge: '/icon.svg',
          tag: data.type === 'call' ? 'incoming-call' : `msg-${data.chatId || Date.now()}`,
          requireInteraction: data.type === 'call',
          data,
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
          if (data.type === 'message' && data.chatId) {
            window.dispatchEvent(new CustomEvent('fcm:open-chat', { detail: { chatId: data.chatId } }));
          }
        };
      }
    });

  } catch (err) {
    console.error('[FCM] ❌ Init failed:', err);
    if (onError) onError(err);
  }
}

/**
 * Stop FCM, delete the token from FCM servers and Firestore.
 * Call this on logout.
 *
 * @param {string} firebaseUid
 */
export async function stopFCM(firebaseUid) {
  if (!messaging) return;
  try {
    // Unsubscribe foreground listener
    if (foregroundUnsubscribe) {
      foregroundUnsubscribe();
      foregroundUnsubscribe = null;
    }

    // Delete token from FCM servers
    await deleteToken(messaging);

    // Remove token from Firestore so no one sends stale pushes
    if (firebaseUid) {
      await updateDoc(doc(db, 'users', firebaseUid), {
        fcmToken: deleteField(),
        fcmTokenUpdatedAt: deleteField(),
      });
    }

    fcmInitialized = false;
    console.log('[FCM] Stopped and token cleared.');
  } catch (err) {
    console.warn('[FCM] Stop error:', err);
  }
}

/**
 * Returns whether FCM is currently active.
 */
export function isFCMActive() {
  return fcmInitialized;
}

/**
 * Send a push notification to another user using their FCM token.
 *
 * ⚠️  Calling the FCM HTTP API directly from a browser requires
 *     your FCM Server Key, which MUST NOT be exposed client-side in production.
 *
 *     For production, use one of these secure approaches:
 *       A) Firebase Cloud Functions (recommended, free tier available)
 *       B) Your own server endpoint
 *
 *     For LOCAL DEV / DEMO, this function uses the FCM Legacy HTTP API.
 *     Set VITE_FCM_SERVER_KEY in .env only for local testing.
 *
 * @param {string} recipientToken — FCM token of the recipient device
 * @param {object} notification   — { title, body, icon }
 * @param {object} data           — custom payload (type, chatId, etc.)
 */
export async function sendPushToToken(recipientToken, notification, data = {}) {
  const serverKey = import.meta.env.VITE_FCM_SERVER_KEY;
  if (!serverKey) {
    // Silently skip — production should use Cloud Functions instead
    console.warn('[FCM] VITE_FCM_SERVER_KEY not set. Skipping direct push. Use Firebase Cloud Functions in production.');
    return;
  }

  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${serverKey}`,
      },
      body: JSON.stringify({
        to: recipientToken,
        notification: {
          title: notification.title || 'Chatify',
          body: notification.body || '',
          icon: notification.icon || '/icon.svg',
          click_action: notification.clickAction || '/',
        },
        data,
        webpush: {
          notification: {
            requireInteraction: data.type === 'call',
            vibrate: data.type === 'call' ? [300, 200, 300] : [200, 100, 200],
            tag: data.type === 'call' ? 'incoming-call' : `msg-${data.chatId}`,
            renotify: true,
          },
        },
      }),
    });
    const result = await res.json();
    console.log('[FCM] Push sent:', result);
    return result;
  } catch (err) {
    console.error('[FCM] Failed to send push:', err);
  }
}
