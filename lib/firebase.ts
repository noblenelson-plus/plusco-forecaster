import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD8Y56gUQc-Uzih2ApfuLB5-HF6Or-DQ9I",
  authDomain: "pluscoops.firebaseapp.com",
  projectId: "pluscoops",
  storageBucket: "pluscoops.firebasestorage.app",
  messagingSenderId: "359847900101",
  appId: "1:359847900101:web:85dee4eaae7a80a61351ac",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
console.log("Firebase app initialized:", app.name);

export const db = getFirestore(app);
console.log("Firestore db initialized:", db);

export const auth = getAuth(app);
console.log("Firebase auth initialized:", auth);
