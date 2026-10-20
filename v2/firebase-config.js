/*
 * COREBIQ Firebase configuration placeholder.
 * 1. Replace the values below with your Firebase project settings.
 * 2. Load this file before app.js (already linked in index.html).
 * 3. Import Firebase SDK modules in the module scripts for pages that need Firestore/Auth.
 *
 * This file deliberately does not enable anonymous sign-in or grant permissions.
 * Configure Firebase Authentication and restrictive Firestore Security Rules in Firebase Console.
 */
window.COREBIQ_FIREBASE_CONFIG = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID"
};

// Optional page-level Firebase initialization can use this config.
// Example (in a type="module" script):
// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
// const app = initializeApp(window.COREBIQ_FIREBASE_CONFIG);
