import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc } from 'firebase/firestore';

let device;
let socket;
let sendTransport;
let recvTransport;

export let currentGroupCallRoom = null;
let consumers = new Map(); // id -> consumer
let remoteStreams = new Map(); // id -> MediaStreamTrack

let callTimerInterval = null;
let callStartTime = null;

// This should map to your hosted Mediasoup server
const SERVER_URL = 'https://chatify-sfu-backend.onrender.com'; // Replace with actual backend

/**
 * Join or Create a Mediasoup Group Call
 */
export async function joinGroupCall(groupId, isVideoCall = true) {
  currentGroupCallRoom = groupId;
  
  // Connect to custom SFU Signaler
  socket = io(SERVER_URL, {
    timeout: 5000,
    reconnection: false, // Don't silently retry — fail fast and inform the user
  });

  // ── Connection timeout / error handling ────────────────────────────────────
  const connectTimeout = setTimeout(() => {
    console.error('[GroupCall] SFU server not reachable:', SERVER_URL);
    const durationEl = document.getElementById('active-group-duration');
    if (durationEl) durationEl.textContent = 'Connection failed';
    endGroupCall();
    alert('Group call server is not available. Group calls require a separate media server.');
  }, 5000);

  socket.on('connect_error', (err) => {
    clearTimeout(connectTimeout);
    console.error('[GroupCall] Cannot connect to SFU:', err.message);
    const durationEl = document.getElementById('active-group-duration');
    if (durationEl) durationEl.textContent = 'Connection failed';
    endGroupCall();
    alert('Group call server is not available. Group calls require a separate media server.');
  });

  socket.on('connect', async () => {
    clearTimeout(connectTimeout);

    // 1. Enter room
    socket.emit('joinRoom', { roomId: groupId }, async (response) => {
        if (response.error) {
            console.error(response.error);
            return;
        }

        // 2. Load Device
        socket.emit('getRouterRtpCapabilities', async (rtpCapabilities) => {
            device = new Device();
            await device.load({ routerRtpCapabilities: rtpCapabilities });

            // 3. Create Transports
            await createSendTransport(isVideoCall);
            await createRecvTransport();
            
            // 4. Start UI Timer once successfully connected
            startCallTimer();
        });
    });
  });

  // Listen for new people talking/joining
  socket.on('new-producer', async ({ producerId, socketId }) => {
      await consumeNewTrack(producerId);
  });

  // Handle participant disconnections to break down their video
  socket.on('producer-closed', ({ producerId }) => {
     removeConsumer(producerId);
  });
}

/**
 * Setup publisher transport and local camera
 */
async function createSendTransport(isVideoCall) {
  socket.emit('createWebRtcTransport', { sender: true }, async (params) => {
    if (params.error) return console.error(params.error);
    
    sendTransport = device.createSendTransport(params);

    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      socket.emit('transport-connect', { transportId: sendTransport.id, dtlsParameters }, (res) => {
         if (res && res.error) errback(res.error);
         callback();
      });
    });

    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      socket.emit('transport-produce', { transportId: sendTransport.id, kind, rtpParameters }, ({ id, error }) => {
        if (error) errback(error);
        callback({ id });
      });
    });

    try {
        // Capture Local Camera
        const stream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
        
        // Mount to UI
        const localVideoGridEl = document.getElementById('local-group-video');
        if(localVideoGridEl) {
           localVideoGridEl.srcObject = stream;
        }

        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        // Publish to SFU
        if (videoTrack) await sendTransport.produce({ track: videoTrack });
        if (audioTrack) await sendTransport.produce({ track: audioTrack });
        
    } catch(err) {
        console.error("Camera access failed", err);
    }
  });
}

/**
 * Setup consumer transport
 */
async function createRecvTransport() {
  socket.emit('createWebRtcTransport', { sender: false }, async (params) => {
    if (params.error) return console.error(params.error);

    recvTransport = device.createRecvTransport(params);

    recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      socket.emit('transport-connect', { transportId: recvTransport.id, dtlsParameters }, (res) => {
         if(res && res.error) errback(res.error);
         callback();
      });
    });
    
    // Once receive transport is ready, ask server "who is already publishing?"
    socket.emit('getProducers', async (producerIds) => {
        for(let id of producerIds) {
            await consumeNewTrack(id);
        }
    });
  });
}

/**
 * Decode an incoming video/audio track from the SFU
 */
async function consumeNewTrack(producerId) {
  socket.emit('consume', {
    rtpCapabilities: device.rtpCapabilities,
    producerId: producerId,
    transportId: recvTransport.id
  }, async (params) => {
    if (params.error) return console.error(params.error);

    const consumer = await recvTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind,
      rtpParameters: params.rtpParameters,
    });

    consumers.set(consumer.id, consumer);
    
    // Mount track to Grid View
    mountConsumerToGrid(consumer);

    // Tell server to start sending packets
    socket.emit('consumer-resume', { consumerId: consumer.id });
  });
}

/**
 * DOM Manipulation for Grid
 */
function mountConsumerToGrid(consumer) {
    const track = consumer.track;
    const gridContainer = document.getElementById('group-call-grid');
    if (!gridContainer) return;

    let mediaEl = document.createElement(consumer.kind === 'video' ? 'video' : 'audio');
    
    // We attach an identifier to the wrapper frame
    const wrapper = document.createElement('div');
    wrapper.classList.add('grid-video-wrapper');
    wrapper.id = `consumer-${consumer.producerId}`;
    
    mediaEl.srcObject = new MediaStream([track]);
    mediaEl.autoplay = true;
    mediaEl.playsInline = true;
    
    wrapper.appendChild(mediaEl);
    gridContainer.appendChild(wrapper);
    
    autoResolveGridSize();
}

function removeConsumer(producerId) {
    const wrapper = document.getElementById(`consumer-${producerId}`);
    if (wrapper) wrapper.remove();
    autoResolveGridSize();
}

function autoResolveGridSize() {
    const gridContainer = document.getElementById('group-call-grid');
    if(!gridContainer) return;

    const count = gridContainer.children.length;
    let cols = 1;
    if (count > 1) cols = 2;
    if (count >= 5) cols = 3;
    if (count > 9) cols = 4;
    
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

export function endGroupCall() {
    if(socket) socket.disconnect();
    if(sendTransport) sendTransport.close();
    if(recvTransport) recvTransport.close();
    
    socket = null;
    currentGroupCallRoom = null;
    
    stopCallTimer();
    
    // Cleanup UI
    const gridContainer = document.getElementById('group-call-grid');
    if(gridContainer) {
        // Clear all but local video
        const localVid = document.getElementById('local-group-video');
        gridContainer.innerHTML = '';
        if(localVid) {
            localVid.srcObject = null;
            const w = document.createElement('div');
            w.classList.add('grid-video-wrapper');
            w.appendChild(localVid);
            gridContainer.appendChild(w);
        }
    }
}

function startCallTimer() {
    const durationEl = document.getElementById('active-group-duration');
    if (!durationEl) return;
    
    callStartTime = Date.now();
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
    const durationEl = document.getElementById('active-group-duration');
    if (durationEl) durationEl.textContent = 'Ended';
}
