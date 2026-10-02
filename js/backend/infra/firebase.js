import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail, onAuthStateChanged, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, deleteField, doc, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAK0HdAeAIYZSIqfWEPfFC_uQG-7w5JlWg",
  authDomain: "campuscare-4869e.firebaseapp.com",
  projectId: "campuscare-4869e",
  storageBucket: "campuscare-4869e.firebasestorage.app",
  messagingSenderId: "312151114188",
  appId: "1:312151114188:web:6db704d3de9ce989579d69"
};

const app = initializeApp(firebaseConfig);
// Persistent offline cache: served from IndexedDB, so returning users see data
// instantly (no network round-trip) and repeat reads don't re-hit Firestore.
// persistentMultipleTabManager keeps the student/technician/admin tabs in sync.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('Persistent cache unavailable, using default cache:', e && e.message);
  db = getFirestore(app);
}
const auth = getAuth(app);

// Secondary app instance: lets the Admin create staff accounts WITHOUT
// being signed out of their own session (Firebase auto-signs-in new users).
const secondaryApp = initializeApp(firebaseConfig, "staff-provisioning");
const secondaryAuth = getAuth(secondaryApp);

export { db, auth, secondaryAuth, setPersistence, browserSessionPersistence, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword, sendPasswordResetEmail, onAuthStateChanged, deleteUser, collection, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, deleteField, doc, query, where, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove, onSnapshot };
