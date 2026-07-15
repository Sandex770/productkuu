// ============================================
// FIREBASE CONFIGURATION
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit, 
    startAfter, 
    updateDoc, 
    deleteDoc, 
    addDoc,
    serverTimestamp,
    onSnapshot,
    increment,
    arrayUnion,
    arrayRemove,
    runTransaction,
    getCountFromServer,
    writeBatch,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ============================================
// FIREBASE CONFIG
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyA-6Tqd5i20sCMixQccI5p1sOCgQWN88dE",
    authDomain: "productkuu.firebaseapp.com",
    projectId: "productkuu",
    storageBucket: "productkuu.firebasestorage.app",
    messagingSenderId: "6615996108",
    appId: "1:6615996108:web:daa6e17c1275d3061cd469",
    measurementId: "G-78ZPLZMFEJ"
};

// ============================================
// INIT FIREBASE
// ============================================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

console.log('🔥 [FIREBASE] Initialized successfully');

// ============================================
// EXPORTS
// ============================================
export { 
    db, 
    auth,
    // Firestore functions
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    updateDoc,
    deleteDoc,
    addDoc,
    serverTimestamp,
    onSnapshot,
    increment,
    arrayUnion,
    arrayRemove,
    runTransaction,
    getCountFromServer,
    writeBatch,
    Timestamp,
    // Auth functions
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    sendEmailVerification
};

// ============================================
// COLLECTIONS REFERENCE
// ============================================
export const collections = {
    users: 'users',
    products: 'products',
    orders: 'orders',
    categories: 'categories',
    banners: 'banners',
    withdrawals: 'withdrawals',
    notifications: 'notifications',
    reviews: 'reviews',
    settings: 'settings'
};

// ============================================
// HELPER FUNCTIONS
// ============================================
export function formatPrice(price) {
    if (!price && price !== 0) return '0';
    return new Intl.NumberFormat('id-ID').format(price);
}

export function formatDate(date) {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function getTimestamp() {
    return serverTimestamp();
}

export function convertTimestamps(data) {
    if (!data) return null;
    const result = { ...data };
    for (const key in result) {
        if (result[key] && typeof result[key].toDate === 'function') {
            result[key] = result[key].toDate();
        }
    }
    return result;
}