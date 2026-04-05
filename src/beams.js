/**
 * beams.js — Pusher Beams Web Push client
 *
 * This module manages the Pusher Beams lifecycle:
 *   - Initialise the BeamsClient
 *   - Authenticate the device to a specific Firebase UID (via /beams-auth)
 *   - Subscribe to user-scoped interest for targeted push
 *   - Foreground message/call notification handler
 *
 * ⚠️  Replace BEAMS_INSTANCE_ID with your real Pusher Beams Instance ID.
 *     Get it from: https://dashboard.pusher.com/beams → Your Instance → Keys
 */

import * as PusherPushNotifications from '@pusher/push-notifications-web';

export const BEAMS_INSTANCE_ID = '19ad669a-8f07-4d05-ab97-93c13d80bf7b';

// The URL of your Node.js backend (server.js)
// In dev this is proxied via Vite; in prod point to your deployed server URL
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// ─── STATE ─────────────────────────────────────────────────────────────────
let beamsClient = null;
let beamsStarted = false;

/**
 * Initialise and start Pusher Beams.
 * Must be called after user is authenticated.
 *
 * @param {string} firebaseUid  — the Firebase Auth UID of the logged-in user
 * @param {Function} onSuccess  — called when registration succeeds (deviceId)
 * @param {Function} onError    — called on failure
 */
export async function initBeams(firebaseUid, onSuccess, onError) {
  if (!firebaseUid) return;

  // Beams requires HTTPS (or localhost)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.warn('[Beams] Web Push requires HTTPS. Skipping Beams init.');
    return;
  }

  if (!BEAMS_INSTANCE_ID || BEAMS_INSTANCE_ID === 'YOUR_INSTANCE_ID_HERE') {
    console.warn('[Beams] Please set your real BEAMS_INSTANCE_ID in src/beams.js');
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[Beams] Service workers not supported in this browser.');
    return;
  }

  try {
    // ─── Use the existing sw.js registration ────────────────────────────────
    // Beams by default tries to register /service-worker.js which Vite serves
    // as text/html (404 fallback). We must pass our own registration instead.
    // See: https://pusher.com/docs/beams/guides/existing-service-worker/
    const swRegistration = await navigator.serviceWorker.ready;

    // Initialise the Beams client (singleton), pointing at our existing SW
    if (!beamsClient) {
      beamsClient = new PusherPushNotifications.Client({
        instanceId: BEAMS_INSTANCE_ID,
        serviceWorkerRegistration: swRegistration,
      });
    }

    // Use Authenticated Users so pushes are targeted per Firebase UID
    // See: https://pusher.com/docs/beams/guides/publish-to-specific-user/web
    const tokenProvider = new PusherPushNotifications.TokenProvider({
      url: `${SERVER_URL}/beams-auth`,
      headers: {
        // Send the Firebase UID so the server can verify + generate a Beams token
        'X-User-Id': firebaseUid,
      },
    });

    await beamsClient.start();

    // Associate this device with the logged-in user
    await beamsClient.setUserId(firebaseUid, tokenProvider);

    const deviceId = await beamsClient.getDeviceId();
    beamsStarted = true;

    console.log('[Beams] ✅ Registered. Device ID:', deviceId);
    if (onSuccess) onSuccess(deviceId);
  } catch (err) {
    console.error('[Beams] ❌ Init failed:', err);
    if (onError) onError(err);
  }
}

/**
 * Stop Beams and clear the registration for the current user.
 * Call this on logout.
 */
export async function stopBeams() {
  if (!beamsClient || !beamsStarted) return;
  try {
    await beamsClient.stop();
    beamsStarted = false;
    beamsClient = null;
    console.log('[Beams] Stopped and cleared.');
  } catch (err) {
    console.warn('[Beams] Stop error:', err);
  }
}

/**
 * Returns whether Beams is currently active.
 */
export function isBeamsActive() {
  return beamsStarted;
}
