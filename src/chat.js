import { collection, doc, setDoc, updateDoc, query, orderBy, onSnapshot, limit, serverTimestamp, where, addDoc, increment, getDocs, deleteDoc, arrayRemove, getDoc, deleteField } from 'firebase/firestore';
import { db, auth } from './firebase-config.js';

export function listenToRecentChats(renderChats) {
  if (!auth.currentUser) return () => {};
  const q = query(
    collection(db, 'chats'), 
    where('participants', 'array-contains', auth.currentUser.uid)
  );
  
  return onSnapshot(q, (snapshot) => {
    const chats = [];
    snapshot.forEach(doc => {
      chats.push({ id: doc.id, ...doc.data() });
    });
    
    chats.sort((a, b) => {
      const timeA = a.updatedAt ? a.updatedAt.toMillis() : 0;
      const timeB = b.updatedAt ? b.updatedAt.toMillis() : 0;
      return timeB - timeA;
    });
    
    renderChats(chats);
  });
}

export function listenToTyping(chatId, onTypingChange) {
  if (!chatId) return () => {};
  return onSnapshot(doc(db, 'chats', chatId), (docSnap) => {
    if (docSnap.exists()) {
      onTypingChange(docSnap.data().typing || {});
    } else {
      onTypingChange({});
    }
  });
}

export function setTypingStatus(chatId, isTyping) {
  if (!auth.currentUser || !chatId) return;
  const uid = auth.currentUser.uid;
  setDoc(doc(db, 'chats', chatId), {
    typing: { [uid]: isTyping }
  }, { merge: true });
}

export function setupChat(chatId, renderMessages, onChatUpdate, myBlockedUsers = []) {
  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const q = query(messagesRef, orderBy('createdAt', 'desc'), limit(50));
  
  const myUid = auth.currentUser ? auth.currentUser.uid : null;
  if (myUid) {
    setDoc(doc(db, 'chats', chatId), {
      unreadCount: { [myUid]: 0 }
    }, { merge: true }).catch(()=>{});
  }
  
  // Listen to the parent chat document for disappearing status 
  const unsubChat = onSnapshot(doc(db, 'chats', chatId), (docSnap) => {
      if(docSnap.exists() && onChatUpdate) {
          onChatUpdate(docSnap.data());
      }
  });

  let firstLoad = true;
  const unsubscribe = onSnapshot(q, async (snapshot) => {
    // Background Notifications logic
    if (!firstLoad && document.visibilityState === 'hidden') {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                if (myUid && data.uid !== myUid && !myBlockedUsers.includes(data.uid)) {
                    const senderName = data.displayName || 'Friend';
                    const textSnippet = data.text || (data.imageUrl ? 'Photo' : (data.audioUrl ? 'Voice Message' : 'New Message'));
                    if (Notification.permission === 'granted') {
                        new Notification(`New message from ${senderName}`, {
                            body: textSnippet,
                            icon: './icon.svg'
                        });
                    }
                }
            }
        });
    }
    firstLoad = false;

    const msgs = [];
    
    // Check disappearing messages
    const chatDoc = await getDoc(doc(db, 'chats', chatId));
    const isDisappearing = chatDoc.exists() && chatDoc.data().disappearing === true;
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    snapshot.forEach(document => {
      const data = document.data();
      
      // Auto-delete if older than 24h
      if (isDisappearing && data.createdAt) {
          const msgTime = data.createdAt.toMillis();
          if (now - msgTime > TWENTY_FOUR_HOURS) {
              deleteDoc(doc(db, `chats/${chatId}/messages`, document.id)).catch(()=>{});
              return; // Skip adding to UI
          }
      }

      // Filter out deleted-for-me messages
      if (myUid && data.deletedFor && data.deletedFor[myUid] === true) {
         return; // Skip adding to UI
      }

      const isBlockedByMe = myUid && data.uid !== myUid && myBlockedUsers.includes(data.uid);

      if (myUid && data.uid !== myUid && data.status !== 'read' && !isBlockedByMe) {
        updateDoc(doc(db, `chats/${chatId}/messages`, document.id), { status: 'read' }).catch(()=>{});
      }
      msgs.push({ id: document.id, ...data });
    });
    
    msgs.reverse(); 
    renderMessages(msgs);
  });
  
  return unsubscribe;
}

export async function sendMessage(chatId, otherUser, text, imageUrl = null, audioUrl = null, replyTo = null, deleteUrl = null, audioDuration = 0) {
  if (!auth.currentUser || !chatId || !otherUser) return;
  const uid = auth.currentUser.uid;
  const displayName = auth.currentUser.displayName;
  const photoURL = auth.currentUser.photoURL;
  
  if (!text.trim() && !imageUrl && !audioUrl) return;

  const messagesRef = collection(db, `chats/${chatId}/messages`);
  const chatDocRef = doc(db, 'chats', chatId);
  
  try {
    // Check if sender is blocked by receiver to enforce phantom behavior securely
    const targetUserDoc = await getDoc(doc(db, 'users', otherUser.uid));
    let amIBlocked = false;
    if (targetUserDoc.exists()) {
       amIBlocked = (targetUserDoc.data().blockedUsers || []).includes(uid);
    }

    const msgPayload = {
      uid,
      text: text.trim() || '',
      createdAt: serverTimestamp(),
      photoURL,
      displayName,
      status: 'sent'
    };
    
    // Ensure the message is totally invisible to the person who blocked the sender
    if (amIBlocked) {
       msgPayload.deletedFor = { [otherUser.uid]: true };
    }
    if (imageUrl) msgPayload.imageUrl = imageUrl;
    if (audioUrl) { msgPayload.audioUrl = audioUrl; if (audioDuration) msgPayload.audioDuration = audioDuration; }
    if (replyTo) msgPayload.replyTo = replyTo;
    if (deleteUrl) msgPayload.deleteUrl = deleteUrl;

    // Save message
    await addDoc(messagesRef, msgPayload);
    
    // Only bump chat metadata if the sender is not blocked
    if (!amIBlocked) {
        let lastMsgPreview = text.trim() || (imageUrl ? 'Photo' : 'Voice Message');
        await setDoc(chatDocRef, {
          participants: [uid, otherUser.uid], 
          participantDetails: {
            [uid]: { displayName: displayName || 'Unknown', photoURL: photoURL || '' },
            [otherUser.uid]: { displayName: otherUser.displayName || 'Unknown', photoURL: otherUser.photoURL || '' }
          },
          lastMessage: lastMsgPreview,
          lastMessageType: deleteField(), // clear stale call type so latest message shows correctly
          lastSenderId: uid,
          clearedFor: {}, 
          unreadCount: {
            [otherUser.uid]: increment(1)
          },
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // ── Pusher Beams: trigger push to recipient if they are offline ─────────
        // The server checks if the user is online via Socket.IO and skips if so.
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
        fetch(`${serverUrl}/notify/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientUid: otherUser.uid,
            senderName: displayName || 'Someone',
            messageText: lastMsgPreview,
            chatId,
          }),
        }).catch((err) => console.warn('[Beams] Message push trigger failed (server offline?):', err));
    }
    
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// Administration features
export async function toggleDisappearing(chatId, state) {
    await setDoc(doc(db, 'chats', chatId), { disappearing: state }, { merge: true });
}

export async function deleteSingleMessage(chatId, msgId, type) {
    if(!auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const msgRef = doc(db, `chats/${chatId}/messages`, msgId);

    if (type === 'everyone') {
        const msgDoc = await getDoc(msgRef);
        if (msgDoc.exists()) {
            const data = msgDoc.data();
            if (data.deleteUrl) {
                // Execute destructive API Bypass against ImgBB servers to delete original hosting
                const match = data.deleteUrl.match(/ibb\.co\/([^\/]+)\/([^\/]+)/);
                if (match && match.length === 3) {
                    const formData = new FormData();
                    formData.append('action', 'delete');
                    formData.append('delete[id]', match[1]);
                    formData.append('delete[hash]', match[2]);
                    // Fire-and-forget background destroy technique
                    fetch('https://ibb.co/json', { method: 'POST', body: formData, mode: 'no-cors' }).catch(()=>{});
                }
            }
        }
        await updateDoc(msgRef, {
            isDeleted: true,
            text: '',
            imageUrl: deleteField(),
            audioUrl: deleteField(),
            replyTo: deleteField()
        });
        await updateLastMessagePreview(chatId);
    } else {
        await updateDoc(msgRef, {
            [`deletedFor.${myUid}`]: true
        });
    }
}

export async function editMessage(chatId, msgId, newText) {
    if(!auth.currentUser) return;
    const msgRef = doc(db, `chats/${chatId}/messages`, msgId);
    await updateDoc(msgRef, {
        text: newText,
        isEdited: true
    });
    await updateLastMessagePreview(chatId);
}

async function updateLastMessagePreview(chatId) {
    const msgsRef = collection(db, `chats/${chatId}/messages`);
    const q = query(msgsRef, orderBy('createdAt', 'desc'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
        const lastMsg = snap.docs[0].data();
        let preview = '...';
        if (lastMsg.isDeleted) {
            preview = '🚫 This message was deleted';
        } else {
            preview = lastMsg.text || (lastMsg.imageUrl ? 'Photo' : (lastMsg.audioUrl ? 'Voice Message' : '...'));
        }
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: preview,
            lastMessageType: deleteField() // clear stale call type
        }).catch(()=>{});
    } else {
        await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: '...',
            lastMessageType: deleteField()
        }).catch(()=>{});
    }
}

export async function reactToMessage(chatId, msgId, emoji) {
    if(!auth.currentUser) return;
    const msgRef = doc(db, `chats/${chatId}/messages`, msgId);
    await updateDoc(msgRef, {
        [`reactions.${auth.currentUser.uid}`]: emoji
    }, { merge: true }); 
}

export async function removeReaction(chatId, msgId) {
    if(!auth.currentUser) return;
    const msgRef = doc(db, `chats/${chatId}/messages`, msgId);
    await updateDoc(msgRef, {
        [`reactions.${auth.currentUser.uid}`]: deleteField()
    });
}

export async function clearChat(chatId, type) {
    if(!auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const msgsRef = collection(db, `chats/${chatId}/messages`);
    const q = query(msgsRef);
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        if (type === 'everyone') {
            await deleteDoc(doc(db, `chats/${chatId}/messages`, docSnap.id));
        } else {
            await updateDoc(doc(db, `chats/${chatId}/messages`, docSnap.id), {
                [`deletedFor.${myUid}`]: true
            });
        }
    }

    // Update parent document preview 
    if (type === 'everyone') {
        await updateDoc(doc(db, 'chats', chatId), { lastMessage: '' }).catch(()=>{});
    } else {
        await updateDoc(doc(db, 'chats', chatId), { [`clearedFor.${myUid}`]: true }).catch(()=>{});
    }
}

export async function deleteChat(chatId, type) {
    if(!auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    
    // First clear messages
    await clearChat(chatId, type);

    // Then handle parent document
    if (type === 'everyone') {
        await deleteDoc(doc(db, 'chats', chatId));
    } else {
        await updateDoc(doc(db, 'chats', chatId), {
            participants: arrayRemove(myUid),
            [`clearedFor.${myUid}`]: true
        }).catch(()=>{});
    }
}
export async function updateChatCallMetadata(chatId, type, status, callerId) {
    if (!chatId) return;
    const chatDocRef = doc(db, 'chats', chatId);
    const label = status === 'missed' ? `call_missed_${type}` : `call_${type}`;
    
    await updateDoc(chatDocRef, {
        lastMessage: '', // Use type for detection
        lastMessageType: label,
        lastSenderId: callerId,
        updatedAt: serverTimestamp()
    }).catch(e => console.error("Failed to update chat metadata for call:", e));
}

// ─── Pin / Unpin Message ─────────────────────────────────────────────
export async function pinMessage(chatId, msg) {
    if (!chatId || !msg) return;
    // currentMessageActionContext stores message ID as 'msgId'; raw message objects use 'id'
    const msgId = msg.msgId || msg.id;
    if (!msgId) { console.error('pinMessage: could not resolve message ID', msg); return; }
    const preview = msg.text
        ? msg.text.substring(0, 80)
        : (msg.imageUrl ? '📷 Photo' : (msg.audioUrl ? '🎤 Voice Message' : '📌 Message'));
    await updateDoc(doc(db, 'chats', chatId), {
        pinnedMessage: {
            id: msgId,
            text: preview,
            pinnedAt: serverTimestamp()
        }
    }).catch(e => console.error('pinMessage failed:', e));
}

export async function unpinMessage(chatId) {
    if (!chatId) return;
    await updateDoc(doc(db, 'chats', chatId), {
        pinnedMessage: deleteField()
    }).catch(e => console.error('unpinMessage failed:', e));
}
