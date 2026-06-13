/**
 * server.js — Chatify Backend
 *
 * Responsibilities:
 *   - Pusher Beams authenticated-users token generation (/beams-auth)
 *   - Trigger push notifications via Beams for:
 *       POST /notify/message  — new message to an offline recipient
 *       POST /notify/call     — incoming call alert
 *   - Socket.IO for real-time WebRTC call signaling (supplementing Firestore)
 *
 * Setup:
 *   1. Create a Pusher Beams instance at https://dashboard.pusher.com/beams
 *   2. Copy your Instance ID and Secret Key into .env (see .env.example)
 *   3. Run:  node server.js
 *   4. Point VITE_SERVER_URL in .env to this server's URL (default: http://localhost:3001)
 *
 * Dependencies (add to package.json):
 *   npm install express cors dotenv socket.io @pusher/push-notifications-server
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import PushNotifications from '@pusher/push-notifications-server';

// ─── CONFIG ────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3001;
const INSTANCE_ID   = process.env.BEAMS_INSTANCE_ID;
const BEAMS_SECRET  = process.env.BEAMS_SECRET_KEY;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

if (!INSTANCE_ID || !BEAMS_SECRET) {
  console.error('❌  Missing BEAMS_INSTANCE_ID or BEAMS_SECRET_KEY in .env');
  process.exit(1);
}

// ─── BEAMS CLIENT ──────────────────────────────────────────────────────────
const beamsClient = new PushNotifications({
  instanceId: INSTANCE_ID,
  secretKey: BEAMS_SECRET,
});

// ─── EXPRESS + HTTP ────────────────────────────────────────────────────────
const app  = express();
const http = createServer(app);

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// ─── SOCKET.IO ─────────────────────────────────────────────────────────────
const io = new SocketIOServer(http, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

// Map: firebaseUid → socket.id
const onlineUsers = new Map();

io.on('connection', (socket) => {
  // Client sends their UID when they connect
  socket.on('user-online', (uid) => {
    if (uid) {
      onlineUsers.set(uid, socket.id);
      console.log(`[Socket] ${uid} is online (${socket.id})`);
    }
  });

  // WebRTC signaling relay — forward any signal to the target user's socket
  socket.on('call-signal', ({ to, signal, from, chatId }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(targetSocket).emit('call-signal', { from, signal, chatId });
    }
  });

  socket.on('disconnect', () => {
    // Clean up from the online map
    for (const [uid, sId] of onlineUsers.entries()) {
      if (sId === socket.id) {
        onlineUsers.delete(uid);
        console.log(`[Socket] ${uid} went offline`);
        break;
      }
    }
  });
});

// ─── BEAMS AUTH ENDPOINT ────────────────────────────────────────────────────
/**
 * The Beams SDK calls this endpoint to get a signed token that proves
 * this device belongs to the given Firebase UID.
 *
 * The client passes `X-User-Id` header with the Firebase UID.
 * In production, validate this against your Firebase ID token instead.
 */
app.get('/beams-auth', (req, res) => {
  const userId = req.headers['x-user-id'];

  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return res.status(401).json({ error: 'Missing or invalid X-User-Id header.' });
  }

  try {
    const beamsToken = beamsClient.generateToken(userId.trim());
    console.log(`[Beams] Token issued for user: ${userId}`);
    return res.json(beamsToken);
  } catch (err) {
    console.error('[Beams] Token generation failed:', err);
    return res.status(500).json({ error: 'Failed to generate Beams token.' });
  }
});

// ─── PUSH: NEW MESSAGE ─────────────────────────────────────────────────────
/**
 * POST /notify/message
 * Body: { recipientUid, senderName, messageText, chatId, senderAvatar? }
 *
 * Called by the client (or could be a Firestore trigger) when a message is sent
 * and the recipient is not currently connected via Socket.IO (offline).
 */
app.post('/notify/message', async (req, res) => {
  const { recipientUid, senderName, messageText, chatId } = req.body;

  if (!recipientUid || !senderName || !chatId) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  // Don't send push if user is currently connected via Socket.IO
  if (onlineUsers.has(recipientUid)) {
    return res.json({ skipped: true, reason: 'User is online via WebSocket.' });
  }

  const body    = messageText ? (messageText.length > 80 ? messageText.slice(0, 80) + '…' : messageText) : 'Sent you a message';
  const deepLink = `${CLIENT_ORIGIN}/?chatId=${chatId}`;

  try {
    const publishResponse = await beamsClient.publishToUsers([recipientUid], {
      web: {
        notification: {
          title: senderName,
          body,
          icon: `${CLIENT_ORIGIN}/icon.svg`,
          deep_link: deepLink,
        },
        data: {
          type: 'message',
          chatId,
          senderName,
        },
      },
    });

    console.log(`[Beams] Message push sent to ${recipientUid}:`, publishResponse.publishId);
    return res.json({ success: true, publishId: publishResponse.publishId });
  } catch (err) {
    console.error('[Beams] Message push failed:', err);
    return res.status(500).json({ error: 'Push notification failed.' });
  }
});

// ─── PUSH: INCOMING CALL ───────────────────────────────────────────────────
/**
 * POST /notify/call
 * Body: { recipientUid, callerName, isVideoCall, chatId }
 *
 * Sends an urgent call push with requireInteraction: true so it stays on screen.
 * The deep_link opens the app straight to the call accept flow.
 */
app.post('/notify/call', async (req, res) => {
  const { recipientUid, callerName, isVideoCall, chatId } = req.body;

  if (!recipientUid || !callerName || !chatId) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const callType  = isVideoCall ? 'Video' : 'Voice';
  const deepLink  = `${CLIENT_ORIGIN}/?incomingCall=1&chatId=${chatId}`;

  try {
    const publishResponse = await beamsClient.publishToUsers([recipientUid], {
      web: {
        notification: {
          title: `📞 Incoming ${callType} Call`,
          body: `${callerName} is calling you...`,
          icon: `${CLIENT_ORIGIN}/icon.svg`,
          deep_link: deepLink,
          // requireInteraction keeps the notification visible until dismissed
          require_interaction: true,
        },
        data: {
          type: 'call',
          isVideoCall: String(isVideoCall),
          chatId,
          callerName,
        },
      },
    });

    console.log(`[Beams] Call push sent to ${recipientUid}:`, publishResponse.publishId);
    return res.json({ success: true, publishId: publishResponse.publishId });
  } catch (err) {
    console.error('[Beams] Call push failed:', err);
    return res.status(500).json({ error: 'Call notification failed.' });
  }
});

// ─── ONLINE STATUS CHECK ───────────────────────────────────────────────────
/**
 * GET /api/online/:uid
 * Returns whether a user is currently connected via Socket.IO.
 * Used by callers to decide whether to show "Ringing..." or "Calling..."
 */
app.get('/api/online/:uid', (req, res) => {
  const { uid } = req.params;
  res.json({ online: onlineUsers.has(uid), uid });
});

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ─── START ─────────────────────────────────────────────────────────────────
http.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   Chatify Push Server  –  v1.0.0         ║
║   http://localhost:${PORT}                 ║
║   Pusher Beams instance: ${INSTANCE_ID.slice(0, 12)}…  ║
╚══════════════════════════════════════════╝
  `);
});
