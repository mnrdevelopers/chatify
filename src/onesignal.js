/**
 * onesignal.js — OneSignal Web Push client for Chatify PWA
 *
 * Uses OneSignal CDN SDK (v16) — no npm package required.
 * Fully serverless — OneSignal's servers handle push delivery.
 *
 * Setup (one-time):
 *   1. Create a free account at https://onesignal.com
 *   2. New App → Web Push → enter your site URL
 *   3. Copy the App ID → paste into VITE_ONESIGNAL_APP_ID in .env
 *   4. Copy the REST API Key → paste into VITE_ONESIGNAL_REST_API_KEY in .env
 */

import { db } from './firebase-config.js';
import { doc, setDoc, deleteField, updateDoc } from 'firebase/firestore';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';
const OS_REST_API_KEY  = import.meta.env.VITE_ONESIGNAL_REST_API_KEY || '';

// ─── STATE ───────────────────────────────────────────────────────────────────
let osInitialized = false;

/** Returns the OneSignal global (loaded via CDN script in index.html) */
function getOS() {
  return window.OneSignal;
}

/**
 * Wait for OneSignal to be available on window (CDN async load)
 */
function waitForOneSignal(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.OneSignal?.initialized) return resolve(window.OneSignal);
    const start = Date.now();
    const check = setInterval(() => {
      if (window.OneSignal) { clearInterval(check); resolve(window.OneSignal); }
      else if (Date.now() - start > timeout) { clearInterval(check); reject(new Error('OneSignal SDK timed out')); }
    }, 100);
  });
}

/**
 * Initialize OneSignal and link the device to the logged-in Firebase user.
 *
 * @param {string}   firebaseUid  — Firebase Auth UID of the current user
 * @param {Function} onSuccess    — called with the OneSignal subscription ID
 * @param {Function} onError      — called on failure
 */
export async function initOneSignal(firebaseUid, onSuccess, onError) {
  if (!firebaseUid) return;

  if (!ONESIGNAL_APP_ID) {
    console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID is not set in .env. Skipping init.');
    return;
  }

  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.warn('[OneSignal] Web Push requires HTTPS. Skipping init.');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[OneSignal] Service Workers not supported.');
    return;
  }

  try {
    const OneSignal = await waitForOneSignal();

    // Determine base directory dynamically to support GitHub Pages subfolder (e.g., /chatify/)
    const baseDir = window.location.pathname.includes('/chatify') ? '/chatify/' : '/';

    // ── Initialize (safe to call multiple times — OneSignal guards internally) ──
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerParam: { scope: baseDir },
      serviceWorkerPath: baseDir + 'OneSignalSDKWorker.js',
      allowLocalhostAsSecureOrigin: true,
      notifyButton: { enable: false },
    });

    // ── Request Permission ────────────────────────────────────────────────────
    if (Notification.permission === 'denied') {
      console.warn('[OneSignal] Notifications blocked by user.');
      return;
    }

    if (Notification.permission !== 'granted') {
      await OneSignal.Notifications.requestPermission();
    }

    const isSubscribed = OneSignal.User.PushSubscription.optedIn;
    if (!isSubscribed) {
      await OneSignal.User.PushSubscription.optIn();
    }

    // ── Link Firebase UID as External User ID ─────────────────────────────────
    await OneSignal.login(firebaseUid);

    // ── Save subscription ID to Firestore ─────────────────────────────────────
    const subscriptionId = OneSignal.User.PushSubscription.id;
    if (subscriptionId) {
      await setDoc(
        doc(db, 'users', firebaseUid),
        { osSubscriptionId: subscriptionId, osUpdatedAt: Date.now() },
        { merge: true }
      );
      console.log('[OneSignal] ✅ Registered. Subscription ID saved to Firestore.');
    }

    osInitialized = true;

    // ── Notification click → deep-link into chat ──────────────────────────────
    OneSignal.Notifications.addEventListener('click', (event) => {
      const data = event.notification.additionalData || {};
      console.log('[OneSignal] Notification clicked:', data);
      window.focus();
      if (data.type === 'message' && data.chatId) {
        window.dispatchEvent(new CustomEvent('onesignal:open-chat', { detail: { chatId: data.chatId } }));
      } else if (data.type === 'call' && data.chatId) {
        window.dispatchEvent(new CustomEvent('onesignal:incoming-call', { detail: { chatId: data.chatId } }));
      }
    });

    // ── Foreground notification display ───────────────────────────────────────
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
      console.log('[OneSignal] Foreground notification received:', event.notification);
      // Allow OneSignal to show it — do NOT call event.preventDefault()
    });

    if (onSuccess) onSuccess(subscriptionId);

  } catch (err) {
    console.error('[OneSignal] ❌ Init failed:', err);
    if (onError) onError(err);
  }
}

/**
 * Stop OneSignal on logout — opt out and remove from Firestore.
 *
 * @param {string} firebaseUid
 */
export async function stopOneSignal(firebaseUid) {
  if (!osInitialized) return;
  try {
    const OneSignal = getOS();
    if (OneSignal) {
      await OneSignal.User.PushSubscription.optOut();
      await OneSignal.logout();
    }
    if (firebaseUid) {
      await updateDoc(doc(db, 'users', firebaseUid), {
        osSubscriptionId: deleteField(),
        osUpdatedAt: deleteField(),
      });
    }
    osInitialized = false;
    console.log('[OneSignal] Stopped and subscription cleared.');
  } catch (err) {
    console.warn('[OneSignal] Stop error:', err);
  }
}

/** Returns whether OneSignal is currently active. */
export function isOneSignalActive() {
  return osInitialized;
}

/**
 * Send a push notification to a specific user via OneSignal REST API.
 *
 * Reads the recipient's osSubscriptionId from Firestore and calls
 * OneSignal's REST API to deliver the push.
 *
 * ⚠️  In production, move this to a Firebase Cloud Function to keep
 *     your REST API key off the client. For dev/testing, set
 *     VITE_ONESIGNAL_REST_API_KEY in .env.
 *
 * @param {string} subscriptionId  — recipient's OneSignal subscription ID
 * @param {string} senderName      — display name of the sender
 * @param {string} messageText     — notification body
 * @param {string} chatId          — chat ID for deep-linking
 * @param {'message'|'call'} type  — notification type
 */
export async function sendOneSignalPush(subscriptionId, senderName, messageText, chatId, type = 'message') {
  if (!OS_REST_API_KEY) {
    console.warn('[OneSignal] VITE_ONESIGNAL_REST_API_KEY not set. Skipping push.');
    return;
  }
  if (!subscriptionId) {
    console.warn('[OneSignal] No subscription ID — recipient may not have notifications enabled.');
    return;
  }

  const isCall = type === 'call';
  const title  = isCall ? '📞 Incoming Call' : senderName;
  const body   = isCall
    ? `${senderName} is calling you...`
    : (messageText?.length > 80 ? messageText.slice(0, 80) + '…' : messageText || 'Sent you a message');

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${OS_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_subscription_ids: [subscriptionId],
        headings:  { en: title },
        contents:  { en: body },
        chrome_web_icon:  '/icon.svg',
        chrome_web_badge: '/icon.svg',
        data: { type, chatId, senderName },
        require_interaction: isCall,
        web_push_topic: isCall ? 'incoming-call' : `chat-${chatId}`,
      }),
    });

    const result = await res.json();
    if (result.errors) {
      console.error('[OneSignal] Push error:', result.errors);
    } else {
      console.log('[OneSignal] ✅ Push sent, id:', result.id);
    }
    return result;
  } catch (err) {
    console.error('[OneSignal] Failed to send push:', err);
  }
}
