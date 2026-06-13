import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, deleteUser, reauthenticateWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, arrayUnion, arrayRemove, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from './firebase-config.js';

export const auth = getAuth();
const provider = new GoogleAuthProvider();

const IMGBB_API_KEY = '41273c1308a4c8790fe1ba79e503ca9c';



export function setupAuth(onAuthStateChangedCb) {
  auth.onAuthStateChanged(onAuthStateChangedCb);
  
  // ── Google Sign-In ────────────────────────────────────────────────────────
  const btnLogin = document.getElementById('btn-login-google');
  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      setAuthError('');
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        setAuthError(friendlyAuthError(error.code));
      }
    });
  }

  // ── Email/Password Login ──────────────────────────────────────────────────
  const btnEmailLogin = document.getElementById('btn-login-email');
  if (btnEmailLogin) {
    btnEmailLogin.addEventListener('click', async () => {
      setAuthError('');
      const email = document.getElementById('auth-email')?.value?.trim();
      const password = document.getElementById('auth-password')?.value;
      if (!email || !password) { setAuthError('Please enter your email and password.'); return; }
      btnEmailLogin.disabled = true;
      btnEmailLogin.innerHTML = '<i class="bx bx-loader bx-spin"></i> Signing in...';
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        setAuthError(friendlyAuthError(error.code));
        btnEmailLogin.disabled = false;
        btnEmailLogin.innerHTML = '<i class="bx bx-log-in"></i> Sign In';
      }
    });
  }

  // ── Register ─────────────────────────────────────────────────────────────
  const btnRegister = document.getElementById('btn-register');
  if (btnRegister) {
    btnRegister.addEventListener('click', async () => {
      setAuthError('');
      const name = document.getElementById('reg-name')?.value?.trim();
      const email = document.getElementById('reg-email')?.value?.trim();
      const password = document.getElementById('reg-password')?.value;
      const confirm = document.getElementById('reg-confirm')?.value;
      if (!name || !email || !password || !confirm) { setAuthError('Please fill in all fields.'); return; }
      if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }
      if (password !== confirm) { setAuthError('Passwords do not match.'); return; }
      btnRegister.disabled = true;
      btnRegister.innerHTML = '<i class="bx bx-loader bx-spin"></i> Creating account...';
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        // Force token refresh so displayName is available immediately
        await cred.user.reload();
      } catch (error) {
        setAuthError(friendlyAuthError(error.code));
        btnRegister.disabled = false;
        btnRegister.innerHTML = '<i class="bx bx-user-plus"></i> Create Account';
      }
    });
  }

  // ── Forgot Password ───────────────────────────────────────────────────────
  const btnForgot = document.getElementById('btn-forgot-password');
  if (btnForgot) {
    btnForgot.addEventListener('click', async () => {
      setAuthError('');
      const email = document.getElementById('auth-email')?.value?.trim();
      if (!email) { setAuthError('Enter your email above first.'); return; }
      try {
        await sendPasswordResetEmail(auth, email);
        setAuthError('✅ Reset link sent! Check your inbox.', 'success');
      } catch (error) {
        setAuthError(friendlyAuthError(error.code));
      }
    });
  }
}

/** Map Firebase error codes to friendly messages */
function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

function setAuthError(msg, type = 'error') {
  const el = document.getElementById('auth-error-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'success' ? '#10b981' : '#f87171';
  el.style.display = msg ? 'block' : 'none';
}

/** Exported so main.js can call on register flow */
export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred;
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
    const providerId = user.providerData?.[0]?.providerId;
    if (providerId === 'password') {
      // Email/password user — prompt for password
      const pwd = window.prompt('Re-enter your password to confirm account deletion:');
      if (!pwd) throw new Error('Cancelled');
      const credential = EmailAuthProvider.credential(user.email, pwd);
      await reauthenticateWithCredential(user, credential);
    } else {
      // Google (or other OAuth) user
      await reauthenticateWithPopup(user, provider);
    }
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
