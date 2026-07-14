// File: public/js/firebase-config.js
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
    writeBatch
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

const firebaseConfig = {
    apiKey: "AIzaSyA-6Tqd5i20sCMixQccI5p1sOCgQWN88dE",
    authDomain: "productkuu.firebaseapp.com",
    projectId: "productkuu",
    storageBucket: "productkuu.firebasestorage.app",
    messagingSenderId: "6615996108",
    appId: "1:6615996108:web:daa6e17c1275d3061cd469",
    measurementId: "G-78ZPLZMFEJ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Export Firebase services
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
    // Auth functions
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    sendEmailVerification
};

// Database collections reference
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

// Helper: Get Firestore timestamp
export const getTimestamp = () => serverTimestamp();

// Helper: Convert Firestore data with timestamps
export const convertTimestamps = (data) => {
    if (!data) return null;
    const result = { ...data };
    for (const key in result) {
        if (result[key] && typeof result[key].toDate === 'function') {
            result[key] = result[key].toDate();
        }
    }
    return result;
};