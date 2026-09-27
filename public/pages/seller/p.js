<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyATjxVpO2jso_tm91It2kR_DOFC6vtaDVw",
  authDomain: "productkuu.firebaseapp.com",
  projectId: "productkuu",
  storageBucket: "productkuu.firebasestorage.app",
  messagingSenderId: "6615996108",
  appId: "1:6615996108:web:daa6e17c1275d3061cd469"
};

const app = initializeApp(firebaseConfig);

try {
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: "ISI_VAPID_KEY_FIREBASE_DI_SINI"
  });

  console.log('FCM Token:', token);

  // Simpan token ke Firestore jika diperlukan
} catch (e) {
  console.log('FCM tidak aktif:', e);
}
</script>