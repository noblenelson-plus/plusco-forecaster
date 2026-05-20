// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; 


const firebaseConfig = {
  apiKey: "AIzaSyD8Y56gUQc-Uzih2ApfuLB5-HF6Or-DQ9I",
  authDomain: "pluscoops.firebaseapp.com",
  projectId: "pluscoops",
  storageBucket: "pluscoops.firebasestorage.app",
  messagingSenderId: "359847900101",
  appId: "1:359847900101:web:85dee4eaae7a80a61351ac"
};


const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
console.log("Firebase app initialized:", app.name);

// Remplace initializeFirestore par getFirestore
export const db = getFirestore(app);
console.log("Firestore db initialized:", db.type);