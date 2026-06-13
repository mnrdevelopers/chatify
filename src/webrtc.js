import { db, auth } from './firebase-config.js';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, collection, addDoc } from 'firebase/firestore';
import { updateChatCallMetadata } from './chat.js';

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

let pc = null;
export let localStream = null;
let remoteStream = null;
let currentCameraFacing = 'user';

let callDocUnsubscribe = null;
let callerCandidatesUnsub = null;
let calleeCandidatesUnsub = null;

let callTimerInterval = null;
let callStartTime = null;

function startCallTimer() {
    const durationEl = document.getElementById('active-call-duration');
    if (!durationEl) return;
    callStartTime = Date.now();
    // Clear any "Calling..." / "Ringing..." span HTML and reset to plain timer text
    durationEl.innerHTML = '';
    durationEl.textContent = '0:00';
    
    callTimerInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - callStartTime) / 1000);
        const mins = Math.floor(diff / 60);
        const secs = (diff % 60).toString().padStart(2, '0');
        durationEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
}

// Call Logging Helper
export async function logCallHistory(callerId, calleeId, type, status, duration = 0, chatId = null) {
    try {
        const logData = {
            callerId,
            calleeId,
            type,
            status,
            duration,
            timestamp: Date.now()
        };
        await addDoc(collection(db, 'callLogs'), logData);
        if(chatId) {
            await updateChatCallMetadata(chatId, type, status, callerId);
        }
    } catch (err) {
        console.error("Failed to log call:", err);
    }
}

// Setup local media and bind to video elements
async function initMedia(isVideoCall, localVideoEl, remoteVideoEl) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
  } catch (err) {
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        if (isVideoCall) {
            console.warn("Camera not found. Falling back to audio only.");
            try {
                localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                alert("No camera detected. Proceeding with voice only.");
            } catch (audioErr) {
                alert("Hardware Error: No microphone found either. You need a mic to make a call!");
                throw audioErr;
            }
        } else {
            alert("Hardware Error: No microphone found! You need a mic to make voice calls.");
            throw err;
        }
    } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert("Permission Denied: You must grant camera and microphone access to make calls.");
        throw err;
    } else {
        console.error("Error accessing media devices.", err);
        throw err;
    }
  }

  remoteStream = new MediaStream();

  if (isVideoCall) {
      localVideoEl.style.display = 'block';
      remoteVideoEl.style.display = 'block';
      localVideoEl.srcObject = localStream;
      remoteVideoEl.srcObject = remoteStream;
      initVideoSwapLogic();
  } else {
      // For audio calls, hide video elements but still bind remoteStream
      // so incoming audio tracks are routed through the remote video element
      localVideoEl.style.display = 'none';
      remoteVideoEl.style.display = 'none';
      remoteVideoEl.srcObject = remoteStream; // Audio output via hidden element
  }

  // Always close any stale peer connection before creating a new one
  if (pc) { try { pc.close(); } catch(_) {} pc = null; }
  pc = new RTCPeerConnection(servers);

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };
}

export async function startCall(chatId, myUid, otherUid, isVideoCall, localVideoEl, remoteVideoEl) {
  await initMedia(isVideoCall, localVideoEl, remoteVideoEl);

  const callDoc = doc(db, 'calls', chatId);
  const offerCandidates = collection(callDoc, 'callerCandidates');
  const answerCandidates = collection(callDoc, 'calleeCandidates');

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(offerCandidates, event.candidate.toJSON());
    }
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDoc, { 
     offer, 
     callerId: myUid, 
     calleeId: otherUid,
     status: 'ringing',
     isVideoCall: isVideoCall,
     updatedAt: Date.now()
  });

  // ── Pusher Beams: push call notification to recipient ──────────────────────
  // This fires even if the recipient has the app closed, so they get an OS alert.
  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
  const callerName = auth.currentUser?.displayName || 'Someone';
  fetch(`${serverUrl}/notify/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientUid: otherUid,
      callerName,
      isVideoCall,
      chatId,
    }),
  }).catch((err) => console.warn('[Beams] Call push trigger failed (server offline?):', err));

  // Missed Call Timeout (45 seconds)
  const ringingTimeout = setTimeout(async () => {
      const snap = await getDoc(callDoc);
      if (snap.exists() && snap.data().status === 'ringing') {
          await logCallHistory(myUid, otherUid, isVideoCall ? 'video' : 'voice', 'missed', 0, chatId);
          await updateDoc(callDoc, { status: 'rejected' }); // Hidden reject
          cleanupCall();
          document.getElementById('active-call-screen').classList.add('hidden');
      }
  }, 45000);

  // Listen for remote answer
  callDocUnsubscribe = onSnapshot(callDoc, async (snapshot) => {
    const data = snapshot.data();
    if (!data) return;
    
    if (data.status === 'connected') {
        clearTimeout(ringingTimeout);
        if (!callTimerInterval) startCallTimer(); // Guard: only start once
    }
    if (!pc.currentRemoteDescription && data.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      await pc.setRemoteDescription(answerDescription);

      // ONLY start listening to remote candidates AFTER setting remote description
      calleeCandidatesUnsub = onSnapshot(answerCandidates, (candSnap) => {
        candSnap.docChanges().forEach((change) => {
          if (change.type === 'added') {
             pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(e => console.error(e));
          }
        });
      });
    }

    if (data.status === 'ended' || data.status === 'rejected') {
        clearTimeout(ringingTimeout);
        cleanupCall();
        document.getElementById('active-call-screen').classList.add('hidden');
    }

    // Handle incoming video upgrade request
    if (data.upgradeStatus === 'requested' && data.upgradeOffer) {
        document.getElementById('video-upgrade-modal').classList.remove('hidden');
    }

    // Handle accepted video upgrade
    if (data.upgradeStatus === 'completed' && data.upgradeAnswer) {
        const remoteDesc = new RTCSessionDescription(data.upgradeAnswer);
        if (pc.signalingState !== 'stable') {
           pc.setRemoteDescription(remoteDesc).catch(e => console.error("Renegotiation Error", e));
           updateDoc(doc(db, 'calls', chatId), { upgradeStatus: 'done' });
        }
    }
  });
}

export async function answerCall(chatId, localVideoEl, remoteVideoEl) {
  const callDoc = doc(db, 'calls', chatId);
  const callData = (await getDoc(callDoc)).data();
  
  if (!callData) return;
  const isVideoCall = callData.isVideoCall;

  await initMedia(isVideoCall, localVideoEl, remoteVideoEl);

  const offerCandidates = collection(callDoc, 'callerCandidates');
  const answerCandidates = collection(callDoc, 'calleeCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(answerCandidates, event.candidate.toJSON());
    }
  };

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await updateDoc(callDoc, { answer, status: 'connected', connectedAt: Date.now() });
  
  startCallTimer();

  // Listen to remote ICE candidates
  callerCandidatesUnsub = onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(e => console.error(e));
      }
    });
  });
  
  // Listen for hangup
  callDocUnsubscribe = onSnapshot(callDoc, (snapshot) => {
     const data = snapshot.data();
     if(data && (data.status === 'ended' || data.status === 'rejected')) {
         cleanupCall();
         document.getElementById('active-call-screen').classList.add('hidden');
         document.getElementById('pip-call-bubble').classList.add('hidden');
     }

     // Handle incoming video upgrade request
    if (data && data.upgradeStatus === 'requested' && data.upgradeOffer) {
        document.getElementById('video-upgrade-modal').classList.remove('hidden');
    }

    // Handle accepted video upgrade (if this side initiated it)
    if (data && data.upgradeStatus === 'completed' && data.upgradeAnswer) {
        const remoteDesc = new RTCSessionDescription(data.upgradeAnswer);
        if (pc.signalingState !== 'stable') {
           pc.setRemoteDescription(remoteDesc).catch(e => console.error(e));
           updateDoc(doc(db, 'calls', chatId), { upgradeStatus: 'done' });
        }
    }
  });
}

export async function rejectCall(chatId) {
    const callDoc = doc(db, 'calls', chatId);
    const snap = await getDoc(callDoc);
    if(snap.exists()) {
        const data = snap.data();
        await logCallHistory(data.callerId, data.calleeId, data.isVideoCall ? 'video' : 'voice', 'rejected', 0, chatId);
    }
    await updateDoc(callDoc, { status: 'rejected' });
}

export async function endCall(chatId) {
    if (!chatId) { cleanupCall(); return; }
    try {
        const callDoc = doc(db, 'calls', chatId);
        const snap = await getDoc(callDoc);
        if (snap.exists()) {
            const data = snap.data();
            // Only log and update if the call is not already ended
            if (data.status !== 'ended' && data.status !== 'rejected') {
                const duration = Math.floor((Date.now() - (data.connectedAt || Date.now())) / 1000);
                await logCallHistory(data.callerId, data.calleeId, data.isVideoCall ? 'video' : 'voice', 'completed', duration, chatId);
                await updateDoc(callDoc, { status: 'ended' });
            }
        }
    } catch (err) {
        console.warn('[WebRTC] endCall error (call doc may not exist):', err);
    } finally {
        cleanupCall();
    }
}

// Global listener for incoming calls targeted at MyUID
// Returns an unsubscribe function so it can be cleaned up on logout.
export function listenForIncomingCalls(myUid, onIncomingCall, onCallUpdate) {
   let unsubscribeFn = null;

   import('firebase/firestore').then(({ query, where, onSnapshot: fsOnSnapshot, collection: fsCollection }) => {
       const q = query(fsCollection(db, 'calls'), where('calleeId', '==', myUid));
       unsubscribeFn = fsOnSnapshot(q, (snapshot) => {
           snapshot.docChanges().forEach((change) => {
               const data = change.doc.data();
               const chatId = change.doc.id;

               if (change.type === 'added' || change.type === 'modified') {
                   if (data.status === 'ringing') {
                       // Only ring for fresh calls (within last 30s) to avoid ghost rings on reconnect
                       if (Date.now() - (data.updatedAt || 0) < 30000) {
                           onIncomingCall(chatId, data);
                       }
                   } else {
                       onCallUpdate(chatId, data);
                   }
               }
           });
       }, (err) => {
           console.error('[WebRTC] Call listener error:', err);
       });
   });

   // Return an unsubscribe wrapper — safe to call even before the listener is set
   return () => { if (unsubscribeFn) { unsubscribeFn(); unsubscribeFn = null; } };
}

export function cleanupCall() {
  stopCallTimer();
  const durationEl = document.getElementById('active-call-duration');
  if (durationEl) durationEl.textContent = 'Ended';

  // Close peer connection (guard against double-close)
  if (pc) {
    try { pc.close(); } catch (_) {}
    pc = null;
  }

  // Stop all local tracks
  if (localStream) {
    localStream.getTracks().forEach(track => { try { track.stop(); } catch(_) {} });
    localStream = null;
  }

  // Stop all remote tracks
  if (remoteStream) {
    remoteStream.getTracks().forEach(track => { try { track.stop(); } catch(_) {} });
    remoteStream = null;
  }

  // Unsubscribe Firestore listeners
  if (callDocUnsubscribe) { try { callDocUnsubscribe(); } catch(_) {} callDocUnsubscribe = null; }
  if (callerCandidatesUnsub) { try { callerCandidatesUnsub(); } catch(_) {} callerCandidatesUnsub = null; }
  if (calleeCandidatesUnsub) { try { calleeCandidatesUnsub(); } catch(_) {} calleeCandidatesUnsub = null; }

  // Reset video elements
  const localVideoEl = document.getElementById('localVideo');
  const remoteVideoEl = document.getElementById('remoteVideo');
  if (localVideoEl) localVideoEl.srcObject = null;
  if (remoteVideoEl) remoteVideoEl.srcObject = null;

  // Hide upgrade modal
  const upgradeModal = document.getElementById('video-upgrade-modal');
  if (upgradeModal) upgradeModal.classList.add('hidden');
}

export async function requestVideoUpgrade(chatId, localVideoEl) {
   try {
       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
       const videoTrack = stream.getVideoTracks()[0];
       
       localStream.addTrack(videoTrack);
       localVideoEl.srcObject = localStream;
       document.getElementById('btn-call-swap-cam').classList.remove('hidden');

       const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
       if (sender) {
           sender.replaceTrack(videoTrack);
       } else {
           pc.addTrack(videoTrack, localStream);
       }

       const offerDesc = await pc.createOffer();
       await pc.setLocalDescription(offerDesc);

       await updateDoc(doc(db, 'calls', chatId), {
           upgradeOffer: { type: offerDesc.type, sdp: offerDesc.sdp },
           upgradeStatus: 'requested'
       });
   } catch(err) {
       console.error("Upgrade denied or failed:", err);
   }
}

export async function acceptVideoUpgrade(chatId, localVideoEl) {
   try {
       const data = (await getDoc(doc(db, 'calls', chatId))).data();
       const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
       const videoTrack = stream.getVideoTracks()[0];
       
       localStream.addTrack(videoTrack);
       localVideoEl.srcObject = localStream;
       document.getElementById('btn-call-swap-cam').classList.remove('hidden');

       const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
       if(sender) sender.replaceTrack(videoTrack);
       else pc.addTrack(videoTrack, localStream);

       await pc.setRemoteDescription(new RTCSessionDescription(data.upgradeOffer));
       const answerDesc = await pc.createAnswer();
       await pc.setLocalDescription(answerDesc);

       await updateDoc(doc(db, 'calls', chatId), {
           upgradeAnswer: { type: answerDesc.type, sdp: answerDesc.sdp },
           upgradeStatus: 'completed'
       });
   } catch (err) {
       console.error("Failed to accept video upgrade:", err);
       rejectVideoUpgrade(chatId);
   }
}

export async function rejectVideoUpgrade(chatId) {
    await updateDoc(doc(db, 'calls', chatId), { upgradeStatus: 'rejected' });
}

export async function swapCamera(localVideoEl) {
   if (!localStream || localStream.getVideoTracks().length === 0) return;
   const oldVideoTrack = localStream.getVideoTracks()[0];
   
   currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';

   try {
       const stream = await navigator.mediaDevices.getUserMedia({
           video: { facingMode: currentCameraFacing }
       });
       const newVideoTrack = stream.getVideoTracks()[0];

       localStream.removeTrack(oldVideoTrack);
       oldVideoTrack.stop();
       localStream.addTrack(newVideoTrack);

       const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
       if (sender) sender.replaceTrack(newVideoTrack);

       localVideoEl.srcObject = localStream;
   } catch(err) {
       console.error("Camera swap failed:", err);
       currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user'; // revert
   }
}

export function toggleAudio() {
    if(!localStream) return false;
    const audioTrack = localStream.getAudioTracks()[0];
    if(audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
    }
    return false;
}

export function toggleVideo() {
    if(!localStream) return false;
    const videoTrack = localStream.getVideoTracks()[0];
    if(videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
    }
    return false;
}

export function initVideoSwapLogic() {
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    if(!localVideo || !remoteVideo) return;
    
    // Tap to swap logic
    localVideo.addEventListener('click', () => {
        if(localVideo.classList.contains('video-pip')) {
            localVideo.classList.remove('video-pip');
            localVideo.classList.add('video-full');
            localVideo.style.transform = '';
            
            remoteVideo.classList.remove('video-full');
            remoteVideo.classList.add('video-pip');
        } else {
            localVideo.classList.remove('video-full');
            localVideo.classList.add('video-pip');
            
            remoteVideo.classList.remove('video-pip');
            remoteVideo.classList.add('video-full');
            remoteVideo.style.transform = '';
        }
    });

    remoteVideo.addEventListener('click', () => {
        if(remoteVideo.classList.contains('video-pip')) {
            remoteVideo.classList.remove('video-pip');
            remoteVideo.classList.add('video-full');
            remoteVideo.style.transform = '';
            
            localVideo.classList.remove('video-full');
            localVideo.classList.add('video-pip');
        }
    });

    // Make active PIP draggable
    let isDragging = false;
    let initialX, initialY, currentX, currentY, xOffset = 0, yOffset = 0;
    
    const dragStart = (e) => {
        const target = e.target;
        if(!target.classList.contains('video-pip')) return;
        
        if(e.type === 'touchstart') {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        if(target === localVideo || target === remoteVideo) isDragging = target;
    };
    
    const dragEnd = () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    };
    
    const drag = (e) => {
        if(!isDragging) return;
        e.preventDefault();
        
        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }
        xOffset = currentX;
        yOffset = currentY;
        
        isDragging.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    };
    
    document.addEventListener('touchstart', dragStart, {passive: false});
    document.addEventListener('touchend', dragEnd);
    document.addEventListener('touchmove', drag, {passive: false});
    
    document.addEventListener('mousedown', dragStart);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('mousemove', drag);
}
