import { sendMessage } from './chat.js';
import { uploadToImgBB } from './auth.js';

export function setupMediaHandling() {
  const photoInput   = document.getElementById('input-photo');
  const cameraInput  = document.getElementById('input-camera');
  const btnVoice     = document.getElementById('btn-voice');

  // New WhatsApp-style recording UI elements
  const voiceRecordBar    = document.getElementById('voice-record-bar');
  const voiceLockedBar    = document.getElementById('voice-locked-bar');
  const voiceRecordTime   = document.getElementById('voice-record-time');
  const voiceLockedTime   = document.getElementById('voice-locked-time');
  const voiceCancelHint   = document.getElementById('voice-cancel-hint');
  const voiceLockArrow    = document.getElementById('voice-lock-arrow');
  const btnVoiceCancel    = document.getElementById('btn-voice-cancel');
  const btnVoiceSend      = document.getElementById('btn-voice-send');

  const sendingOverlay = document.getElementById('image-sending-overlay');
  const sendingPreview = document.getElementById('image-sending-preview');

  // ─── Photo & Camera Upload via ImgBB ─────────────────────────────────
  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const chatId    = window.getCurrentChatId    ? window.getCurrentChatId()    : null;
    const otherUser = window.getCurrentOtherUser ? window.getCurrentOtherUser() : null;
    if (!chatId || !otherUser) return;

    const localUrl = URL.createObjectURL(file);
    sendingPreview.src = localUrl;
    sendingOverlay.classList.remove('hidden');
    setTimeout(() => sendingOverlay.classList.add('active'), 10);

    e.target.value = '';

    try {
      const result = await uploadToImgBB(file);
      if (result && result.url) {
        sendingOverlay.classList.remove('active');
        sendingOverlay.classList.add('fly-out');

        const replyContext = window.getCurrentReplyContext ? window.getCurrentReplyContext() : null;
        await sendMessage(chatId, otherUser, '', result.url, null, replyContext, result.deleteUrl);
        if (window.clearReplyContext) window.clearReplyContext();

        setTimeout(() => {
          sendingOverlay.classList.add('hidden');
          sendingOverlay.classList.remove('fly-out');
          URL.revokeObjectURL(localUrl);
        }, 600);
      } else {
        sendingOverlay.classList.remove('active');
        sendingOverlay.classList.add('hidden');
        alert('ImgBB Upload Failed');
      }
    } catch (err) {
      console.error(err);
      sendingOverlay.classList.remove('active');
      sendingOverlay.classList.add('hidden');
      alert('Photo upload failed. Check the network or ImgBB key.');
    }
  };

  if (photoInput)  photoInput.addEventListener('change',  handleImageSelect);
  if (cameraInput) cameraInput.addEventListener('change', handleImageSelect);

  // ─── WhatsApp-Style Voice Recording ─────────────────────────────────
  let mediaRecorder  = null;
  let audioChunks    = [];
  let isRecording    = false;
  let isLocked       = false;   // Locked mode: finger released but still recording
  let startX         = 0;
  let startY         = 0;
  let startTime      = 0;
  let timerInterval  = null;
  let stream         = null;
  let cancelled      = false;

  // Thresholds (px)
  const CANCEL_THRESHOLD = 80;  // swipe left this far → cancel
  const LOCK_THRESHOLD   = 60;  // swipe up this far   → lock

  // ── Helpers ────────────────────────────────────────────────────────

  function formatDuration(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const label   = formatDuration(elapsed);
      if (voiceRecordTime)  voiceRecordTime.textContent  = label;
      if (voiceLockedTime)  voiceLockedTime.textContent  = label;
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function showRecordBar() {
    btnVoice.classList.add('active-recording');
    voiceRecordBar.classList.remove('hidden');
    voiceLockedBar.classList.add('hidden');
    if (voiceRecordTime) voiceRecordTime.textContent = '0:00';
    if (voiceCancelHint) voiceCancelHint.style.opacity = '1';
    if (voiceLockArrow)  { voiceLockArrow.classList.remove('locked'); voiceLockArrow.style.transform = ''; }
  }

  function hideAll() {
    btnVoice.classList.remove('active-recording');
    voiceRecordBar.classList.add('hidden');
    voiceLockedBar.classList.add('hidden');
  }

  function enterLockedMode() {
    isLocked = true;
    voiceRecordBar.classList.add('hidden');
    voiceLockedBar.classList.remove('hidden');
    btnVoice.classList.remove('active-recording');
    if (voiceLockedTime) voiceLockedTime.textContent = voiceRecordTime.textContent;
  }

  // ── Start Recording ─────────────────────────────────────────────────
  async function startRecording(x, y) {
    if (isRecording) return;
    cancelled = false;
    isLocked  = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Mic access denied:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('Microphone permission is required for voice messages. Please allow mic access in your browser settings.');
      } else {
        alert('Unable to access the microphone. Please check your device settings.');
      }
      return;
    }

    // Choose best supported MIME type
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']
      .find(m => MediaRecorder.isTypeSupported(m)) || '';

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    audioChunks   = [];
    isRecording   = true;
    startX        = x;
    startY        = y;
    startTime     = Date.now();

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      stream = null;

      if (cancelled) return; // Discarded

      const duration = Date.now() - startTime;
      if (duration < 800) return; // Too short, discard silently

      const type = mimeType || 'audio/webm';
      const ext  = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(audioChunks, { type });

      try {
        await uploadMedia(blob, `audio/voice_${Date.now()}.${ext}`, 'audio', duration);
      } catch (err) {
        console.error('Voice upload failed:', err);
      }
    };

    mediaRecorder.start(100); // Collect data every 100ms
    showRecordBar();
    startTimer();
  }

  // ── Stop Recording ──────────────────────────────────────────────────
  function stopRecording(send = true) {
    if (!isRecording) return;
    cancelled = !send;
    isRecording = false;
    isLocked    = false;
    stopTimer();
    hideAll();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  // ── Track Pointer Position for Swipe logic ──────────────────────────
  function onPointerMove(x, y) {
    if (!isRecording || isLocked) return;

    const dx = startX - x;   // Positive = swipe left
    const dy = startY - y;   // Positive = swipe up

    // ── Lock: swipe up ──────────────────────────────────────────────
    if (dy > LOCK_THRESHOLD) {
      // Show lock indicator as "locked" colour and snap
      if (voiceLockArrow) {
        const progress = Math.min((dy - LOCK_THRESHOLD) / 30, 1);
        voiceLockArrow.style.transform = `translateY(${-progress * 15}px)`;
        if (progress >= 1) {
          voiceLockArrow.classList.add('locked');
          enterLockedMode();
        }
      }
      return;
    } else {
      if (voiceLockArrow) {
        const progress = Math.min(dy / LOCK_THRESHOLD, 1);
        voiceLockArrow.style.transform = `translateY(${-progress * 10}px)`;
        voiceLockArrow.classList.remove('locked');
      }
    }

    // ── Cancel: swipe left ──────────────────────────────────────────
    if (dx > 0 && voiceCancelHint) {
      const opacity = Math.max(1 - dx / 80, 0.1);
      voiceCancelHint.style.opacity = String(opacity);

      if (dx > CANCEL_THRESHOLD) {
        stopRecording(false); // Cancel (discard)
      }
    } else if (voiceCancelHint) {
      voiceCancelHint.style.opacity = '1';
    }
  }

  // ─── Touch events ──────────────────────────────────────────────────
  btnVoice.addEventListener('touchstart', async (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    await startRecording(t.clientX, t.clientY);
  }, { passive: false });

  btnVoice.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onPointerMove(t.clientX, t.clientY);
  }, { passive: false });

  btnVoice.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (isLocked) return; // Handle via locked bar buttons
    stopRecording(true);  // Release → send
  }, { passive: false });

  // ─── Mouse events (desktop) ────────────────────────────────────────
  btnVoice.addEventListener('mousedown', async (e) => {
    await startRecording(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (isRecording && !isLocked) onPointerMove(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => {
    if (isRecording && !isLocked) stopRecording(true);
  });

  // ─── Locked-bar button actions ────────────────────────────────────
  if (btnVoiceCancel) {
    btnVoiceCancel.addEventListener('click', () => stopRecording(false));
  }
  if (btnVoiceSend) {
    btnVoiceSend.addEventListener('click', () => stopRecording(true));
  }
}

// ─── Convert blob → base64 data URL (stored in Firestore) ───────────────────
// Voice messages are typically 5–60 sec → 20–300 KB base64, well within
// Firestore's 1 MB document limit. No external upload service needed.
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror  = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

// ─── Main upload helper ──────────────────────────────────────────────────────
async function uploadMedia(fileOrBlob, _storagePath, type, durationMs = 0) {
  const chatId    = window.getCurrentChatId    ? window.getCurrentChatId()    : null;
  const otherUser = window.getCurrentOtherUser ? window.getCurrentOtherUser() : null;
  if (!chatId || !otherUser) { console.warn('No active chat.'); return; }

  const replyContext = window.getCurrentReplyContext ? window.getCurrentReplyContext() : null;

  if (type === 'audio') {
    try {
      // Rough size guard — Firestore doc limit is 1 MB
      if (fileOrBlob.size > 700_000) {
        alert('Voice message is too long (max ~2 minutes). Please try a shorter recording.');
        return;
      }
      const dataUrl = await blobToDataURL(fileOrBlob);
      await sendMessage(chatId, otherUser, '', null, dataUrl, replyContext, null, durationMs);
      if (window.clearReplyContext) window.clearReplyContext();
      console.log('✅ Voice message saved to Firestore');
    } catch (err) {
      console.error('Voice message failed:', err);
      alert('Voice message failed. Please try again.');
    }
  } else {
    // Images still go through ImgBB (already working fine)
    console.warn('uploadMedia called for non-audio type without URL.');
  }
}

// ─── Custom Voice Message Player (called from renderMessages in main.js) ──
export function createVoicePlayer(audioUrl, durationMs) {
  const container = document.createElement('div');
  container.className = 'voice-msg-player';

  const SPEEDS = [1, 1.5, 2];
  let speedIdx = 0;
  let audioEl  = null;
  let rafId    = null;

  const formatSecs = (s) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const totalStr = durationMs ? formatSecs(durationMs / 1000) : '0:00';

  container.innerHTML = `
    <button class="voice-play-btn" title="Play / Pause">
      <i class="bx bx-play"></i>
    </button>
    <div class="voice-progress-wrap">
      <input type="range" class="voice-progress" min="0" max="100" value="0" step="0.1" />
      <span class="voice-dur">0:00 / ${totalStr}</span>
    </div>
    <button class="voice-speed-btn" title="Playback speed">1×</button>
  `;

  const playBtn   = container.querySelector('.voice-play-btn');
  const progress  = container.querySelector('.voice-progress');
  const durLabel  = container.querySelector('.voice-dur');
  const speedBtn  = container.querySelector('.voice-speed-btn');

  function ensureAudio() {
    if (!audioEl) {
      audioEl = new Audio(audioUrl);
      container._audioEl = audioEl; // expose for cross-player control
      audioEl.preload = 'metadata';
      audioEl.addEventListener('loadedmetadata', () => {
        if (!durationMs) durLabel.textContent = `0:00 / ${formatSecs(audioEl.duration)}`;
      });
      audioEl.addEventListener('ended', () => {
        playBtn.innerHTML = '<i class="bx bx-play"></i>';
        progress.value = 0;
        durLabel.textContent = `${formatSecs(audioEl.duration || 0)} / ${formatSecs(audioEl.duration || 0)}`;
        cancelAnimationFrame(rafId);
      });
    }
  }

  function tick() {
    if (!audioEl) return;
    const cur = audioEl.currentTime;
    const dur = audioEl.duration || (durationMs / 1000) || 0;
    progress.value = dur ? (cur / dur) * 100 : 0;
    durLabel.textContent = `${formatSecs(cur)} / ${formatSecs(dur)}`;
    if (!audioEl.paused) rafId = requestAnimationFrame(tick);
  }

  // Stop ALL clicks/inputs inside the player from bubbling to the message handler
  container.addEventListener('click',     (e) => e.stopPropagation());
  container.addEventListener('mousedown',  (e) => e.stopPropagation());
  container.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureAudio();
    if (audioEl.paused) {
      // Pause all other voice players first
      document.querySelectorAll('.voice-msg-player').forEach(el => {
        if (el === container) return;
        const otherAudio = el._audioEl;
        if (otherAudio && !otherAudio.paused) {
          otherAudio.pause();
          const btn = el.querySelector('.voice-play-btn');
          if (btn) btn.innerHTML = '<i class="bx bx-play"></i>';
        }
      });
      audioEl.play().catch(err => console.warn('Audio play failed:', err));
      playBtn.innerHTML = '<i class="bx bx-pause"></i>';
      rafId = requestAnimationFrame(tick);
    } else {
      audioEl.pause();
      playBtn.innerHTML = '<i class="bx bx-play"></i>';
      cancelAnimationFrame(rafId);
    }
  });

  progress.addEventListener('input', (e) => {
    e.stopPropagation();
    ensureAudio();
    const dur = audioEl.duration || (durationMs / 1000) || 0;
    audioEl.currentTime = (parseFloat(progress.value) / 100) * dur;
  });
  progress.addEventListener('click', (e) => e.stopPropagation());

  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ensureAudio();
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    const sp = SPEEDS[speedIdx];
    audioEl.playbackRate = sp;
    speedBtn.textContent = `${sp}×`;
  });

  return container;
}
