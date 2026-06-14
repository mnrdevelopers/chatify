/**
 * OneSignalSDKWorker.js
 *
 * Required by OneSignal for background push delivery in PWAs.
 * This file MUST be served at the root of your domain:
 *   https://yoursite.com/OneSignalSDKWorker.js
 *
 * For GitHub Pages (docs/ folder), copy this file into docs/ on each build.
 * Vite serves this file at / in dev mode automatically.
 */
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
