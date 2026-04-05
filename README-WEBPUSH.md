# 🔔 Chatify — Pusher Beams Push Notification Setup

This guide walks you through setting up **Pusher Beams** for background + closed-app push notifications in Chatify.

---

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      CHATIFY APP                        │
│                                                         │
│  ┌──────────────┐    ┌────────────────────────────────┐ │
│  │  Frontend    │    │  Node.js Server (server.js)    │ │
│  │  (Vite :5173)│◄──►│  (:3001 — Express + Socket.IO) │ │
│  │              │    │                                │ │
│  │  src/beams.js│    │  /beams-auth   → Beams token   │ │
│  │  (web SDK)   │    │  /notify/message → push msg    │ │
│  │              │    │  /notify/call  → push call     │ │
│  └──────┬───────┘    └──────────┬─────────────────────┘ │
│         │                       │                        │
│  ┌──────▼───────┐    ┌──────────▼──────────────────────┐│
│  │  public/sw.js│    │                                  ││
│  │  (Service    │    │      Pusher Beams Cloud           ││
│  │   Worker)    │    │  (handles VAPID internally)       ││
│  └──────────────┘    └─────────────────────────────────-┘│
└─────────────────────────────────────────────────────────┘
```

**Key flow:**
1. User logs in → `initBeams(uid)` is called → device registered with Beams under the user's Firebase UID
2. User B sends a message → `chat.js` POSTs to `/notify/message`
3. Server checks if User A is online (via Socket.IO) — if not, calls `beamsClient.publishToUsers([uid])`
4. Pusher Beams delivers a Web Push notification to User A's browser even when closed
5. User A clicks notification → app opens to correct chat via deep link

---

## 🚀 Step 1: Create a Pusher Beams Instance

1. Go to [https://dashboard.pusher.com/beams](https://dashboard.pusher.com/beams)
2. **Sign up** (free sandbox tier — no credit card needed, up to 1,000 subscribers)
3. Click **"Create new Beams instance"**
4. Name it (e.g., `chatify`)
5. Navigate to **Keys** tab — copy:
   - **Instance ID** (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
   - **Secret Key** (looks like a long hex string)

---

## ⚙️ Step 2: Configure Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and fill in your real keys:

```env
# Pusher Beams
BEAMS_INSTANCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
BEAMS_SECRET_KEY=your-secret-key-here

# Server
PORT=3001
CLIENT_ORIGIN=http://localhost:5173

# Frontend (used by Vite)
VITE_SERVER_URL=http://localhost:3001
```

> ⚠️ **Never commit `.env` to git.** It's already in `.gitignore`.

---

## 🖥️ Step 3: Update `src/beams.js`

Open `src/beams.js` and replace the placeholder with your real Instance ID:

```js
export const BEAMS_INSTANCE_ID = 'YOUR_INSTANCE_ID_HERE';
// becomes:
export const BEAMS_INSTANCE_ID = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

---

## 📦 Step 4: Install Dependencies

```bash
npm install
```

All dependencies are already listed in `package.json`.

---

## 🏃 Step 5: Start Both Servers

You need **two terminals**:

**Terminal 1 — Vite frontend:**
```bash
npm run dev
```

**Terminal 2 — Node push server:**
```bash
npm run server
# or for auto-restart on changes:
npm run dev:server
```

The Vite proxy in `vite.config.js` automatically forwards `/beams-auth`, `/notify/*`, and `/health` to `http://localhost:3001`.

---

## ✅ Step 6: Test Push Notifications

1. Open `http://localhost:5173` in Chrome
2. Log in with Google
3. The app will ask for **notification permission** — click **Allow**
4. Open your browser console — you should see:
   ```
   [Beams] ✅ Registered. Device ID: web-xxxxxxxxxxxx
   ```
5. Open the app in a **second browser window** (as a different user)
6. Send a message from user B to user A
7. **Minimize** user A's browser window
8. A push notification should appear in your OS notification tray! 🎉

---

## 📞 Testing Call Notifications

1. User A logs in (open in Chrome Tab 1)
2. User B logs in (open in Chrome Tab 2 or Incognito, and add User A as contact)
3. User B initiates an audio/video call to User A
4. **Close** or **minimize** User A's window — they should get a push notification:
   > 📞 Incoming Voice Call  
   > User B is calling you...
5. Clicking the notification opens the app to the call accept screen

---

## 🔒 Security Notes

| Concern | Solution |
|---|---|
| Who can trigger pushes? | Only authenticated requests from your frontend (same-origin) |
| VAPID key management | Handled by Pusher Beams internally (no key needed on your end) |
| User targeting | `/beams-auth` generates a signed token using the server SDK, preventing spoofing |
| Production auth | For production, validate Firebase ID token in `/beams-auth` instead of trusting the `X-User-Id` header directly |

### Production Auth Hardening (Optional for dev, important for prod)

Replace the simple header trust in `server.js` `/beams-auth` with Firebase token verification:

```js
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// In /beams-auth handler:
const idToken = req.headers['authorization']?.replace('Bearer ', '');
const decoded = await getAuth().verifyIdToken(idToken);
const userId = decoded.uid;
const beamsToken = beamsClient.generateToken(userId);
res.json(beamsToken);
```

---

## 🌐 Browser Support

| Browser | Support |
|---|---|
| Chrome (desktop + Android) | ✅ Full support |
| Edge (Chromium) | ✅ Full support |
| Firefox | ✅ Supported (may need permission prompting) |
| Safari (macOS 13+) | ✅ With site added to dock/pinned tab |
| iOS Safari | ⚠️ iOS 16.4+ only, **app must be installed to Home Screen as PWA** |
| Samsung Internet | ✅ Supported |

---

## 🚀 Deploying to Production

### Frontend (GitHub Pages)
```bash
npm run build
# Deploy /dist to GitHub Pages
```
Update `vite.config.js` `base` to match your repo path.

### Backend (Render.com — Free tier)
1. Push to GitHub
2. Create a **Web Service** on [render.com](https://render.com)
3. Build command: *(none)*
4. Start command: `node server.js`
5. Add environment variables in Render dashboard
6. Update `VITE_SERVER_URL` in your frontend to point to the Render URL

---

## 🐛 Troubleshooting

| Issue | Fix |
|---|---|
| `[Beams] Please set your real BEAMS_INSTANCE_ID` | Edit `src/beams.js` with your actual ID |
| `Missing BEAMS_INSTANCE_ID or BEAMS_SECRET_KEY` | Check your `.env` file |
| No notification permission prompt | Go to browser settings and reset notification permission for `localhost` |
| Push not received | Check if "Do Not Disturb" is on in your OS settings |
| `[Beams] Could not start push notifications` | Must be on HTTPS or localhost; check browser console for details |
| Server not starting | Run `npm install` first, then `node server.js` |
