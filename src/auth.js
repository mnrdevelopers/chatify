import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';

export const auth = getAuth();
const provider = new GoogleAuthProvider();

const IMGBB_API_KEY = '41273c1308a4c8790fe1ba79e503ca9c';



export function setupAuth(onAuthStateChangedCb) {
  auth.onAuthStateChanged(onAuthStateChangedCb);
  
  const btnLogin = document.getElementById('btn-login');
  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        console.error("Login failed:", error);
      }
    });
  }
}

export async function logoutUser() {
  await signOut(auth);
}

export async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append('image', file);
  try {
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if(data && data.success) {
       return { url: data.data.url, deleteUrl: data.data.delete_url };
    }
    return null;
  } catch (error) {
    console.error("ImgBB Upload Failed:", error);
    return null;
  }
}

export async function getUserProfile(uid) {
  const docRef = doc(db, 'users', uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data();
  }
  return null;
}

export async function saveUserProfile(uid, phoneNumber, customPhotoURL = null, privacyPicture = 'everybody') {
  const user = auth.currentUser;
  if (!user) return;
  const payload = {
    phoneNumber,
    displayName: user.displayName,
    email: user.email,
    updatedAt: serverTimestamp()
  };
  
  // Maintain custom fields
  if(customPhotoURL) payload.customPhotoURL = customPhotoURL;
  if(privacyPicture) payload.privacyPicture = privacyPicture;

  await setDoc(doc(db, 'users', uid), payload, { merge: true });
}

export async function updateUserProfile(uid, { displayName, bio }) {
  const payload = {};
  if (displayName !== undefined) payload.displayName = displayName;
  if (bio !== undefined) payload.bio = bio;
  payload.updatedAt = serverTimestamp();
  await updateDoc(doc(db, 'users', uid), payload);
}

export async function deleteUserAccount() {
  const user = auth.currentUser;
  if (!user) return;
  // Delete Firestore document
  try { await deleteDoc(doc(db, 'users', user.uid)); } catch(e) { console.warn('Could not delete user doc:', e); }
  // Re-authenticate then delete Firebase Auth account
  try {
    await reauthenticateWithPopup(user, provider);
    await deleteUser(user);
  } catch (e) {
    console.error('Failed to delete account:', e);
    throw e;
  }
}

export async function searchUserByPhone(phoneNumber) {
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where("phoneNumber", "==", phoneNumber));
  const querySnapshot = await getDocs(q);
  
  const results = [];
  querySnapshot.forEach((doc) => {
    results.push({ uid: doc.id, ...doc.data() });
  });
  return results;
}

// Contact Management
export async function addContact(myUid, contactUid, customName) {
  const updates = {
      contacts: arrayUnion(contactUid)
  };
  if (customName) {
      updates[`contactNames.${contactUid}`] = customName.trim();
  }
  await updateDoc(doc(db, 'users', myUid), updates);
}

export async function removeContact(myUid, contactUid) {
  await setDoc(doc(db, 'users', myUid), {
      contacts: arrayRemove(contactUid)
  }, { merge: true });
}

export async function getContacts(myUid) {
  const profile = await getUserProfile(myUid);
  if(!profile || !profile.contacts || profile.contacts.length === 0) return [];
  
  const contactsDetails = [];
  // For small lists, we can fetch one by one natively
  for (const contactUid of profile.contacts) {
      const contactProfile = await getUserProfile(contactUid);
      if(contactProfile) contactsDetails.push({ uid: contactUid, ...contactProfile });
  }
  return contactsDetails;
}

// --- Presence System ---

export async function updateUserPresence(status) {
  if (!auth.currentUser) return;
  try {
    await setDoc(doc(db, 'users', auth.currentUser.uid), {
      status,
      lastActive: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn("Failed to update presence", e);
  }
}

export function listenToUserPresence(uid, callback) {
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'users', uid), (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().status || 'offline', docSnap.data().lastActive);
    } else {
      callback('offline', null);
    }
  });
}

// --- Block User System ---
export async function toggleBlockUser(myUid, targetUid, isBlocking) {
  const docRef = doc(db, 'users', myUid);
  if (isBlocking) {
      await updateDoc(docRef, { blockedUsers: arrayUnion(targetUid) });
  } else {
      await updateDoc(docRef, { blockedUsers: arrayRemove(targetUid) });
  }
}

// --- Chat Lock System ---
export async function setChatLockCode(myUid, code) {
  await updateDoc(doc(db, 'users', myUid), { chatLockCode: code }, { merge: true });
}

export async function toggleChatLock(myUid, chatId, isLocked) {
  const docRef = doc(db, 'users', myUid);
  if (isLocked) {
      await updateDoc(docRef, { lockedChats: arrayUnion(chatId) });
  } else {
      await updateDoc(docRef, { lockedChats: arrayRemove(chatId) });
  }
}
export async function toggleFavourite(myUid, chatId, isFavourite) {
    const docRef = doc(db, 'users', myUid);
    if (isFavourite) {
        await updateDoc(docRef, { favouriteChats: arrayUnion(chatId) });
    } else {
        await updateDoc(docRef, { favouriteChats: arrayRemove(chatId) });
    }
}

// --- Call Log Soft Delete ---
export async function hideCallLog(logId, myUid) {
    try {
        const docRef = doc(db, 'callLogs', logId);
        await updateDoc(docRef, { hiddenFor: arrayUnion(myUid) });
    } catch (e) {
        console.warn('hideCallLog failed:', e);
    }
}
