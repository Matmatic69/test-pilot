// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCjcaGMALKwz1_dyiRCeJJ_aCDC6EbEA6Q",
  authDomain: "souvenir-qr-87641.firebaseapp.com",
  projectId: "souvenir-qr-87641",
  storageBucket: "souvenir-qr-87641.firebasestorage.app",
  messagingSenderId: "1066440095747",
  appId: "1:1066440095747:web:784ded15e461f627a5f636",
  measurementId: "G-JE7BYBRRB2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Export a constante pour les utiliser dans d'autres fichiers
export { db, storage };
