import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyA-6Tqd5i20sCMixQccI5p1sOCgQWN88dE",
  authDomain: "productkuu.firebaseapp.com",
  projectId: "productkuu",
  storageBucket: "productkuu.firebasestorage.app",
  messagingSenderId: "6615996108",
  appId: "1:6615996108:web:daa6e17c1275d3061cd469",
  measurementId: "G-78ZPLZMFEJ"
};

// Initialize Firebase
let app
try {
  app = initializeApp(firebaseConfig)
} catch (error) {
  console.error('Firebase initialization error:', error)
}

export const auth = getAuth(app)
export const db = getFirestore(app)