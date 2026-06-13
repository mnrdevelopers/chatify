import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your actual Firebase project config 
// Make sure to enable Google Authentication, Firestore Database, and Storage in your Firebase Console!
const firebaseConfig = {
  apiKey: "AIzaSyDJ0ODkeq_lX1nGidiOPHr0pBVpjeLW3k0",
  authDomain: "chatify-303a4.firebaseapp.com",
  projectId: "chatify-303a4",
  storageBucket: "chatify-303a4.firebasestorage.app",
  messagingSenderId: "594236902017",
  appId: "1:594236902017:web:2e49c0e7217286b9e51b80",
  measurementId: "G-TMFRQXF2R9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
