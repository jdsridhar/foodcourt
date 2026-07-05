/**
 * firebase-config.js
 * Central Firebase initialization for the entire FoodStreet application.
 * Every HTML page includes this file (as a module) BEFORE any other app script.
 *
 * Replace the placeholder values below with your own Firebase project config.
 * Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and configuration
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  connectStorageEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ============================================================
// TODO: Replace with your Firebase project configuration
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAIXx5RL2TUVLMAGqhEOVeU9ejn6m54Zb4",
  authDomain: "foodcourt-123.firebaseapp.com",
  projectId: "foodcourt-123",
  storageBucket: "foodcourt-123.firebasestorage.app",
  messagingSenderId: "1031050355946",
  appId: "1:1031050355946:web:ab6a32ca01793ad3992393",
  measurementId: "G-GJZXPDRHZD"
};

// Initialize Firebase App (singleton)
const app = initializeApp(firebaseConfig);

if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  console.error(
    "⚠️ Firebase configuration placeholders detected!\n" +
    "Please replace the placeholder values in 'js/firebase-config.js' with your real Firebase web app credentials to connect the app to the live backend."
  );
}

// Initialize core services used across the app
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Set to true only while developing locally against the Firebase Emulator Suite
const USE_EMULATORS = false;
if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectStorageEmulator(storage, "localhost", 9199);
}

// Firestore collection name constants (single source of truth, avoids typos)
export const COLLECTIONS = {
  USERS: "users",
  STALLS: "stalls",
  MENU_ITEMS: "menuItems",
  ORDERS: "orders",
  SETTINGS: "settings"
};

// Fixed document id for the single global settings document
export const SETTINGS_DOC_ID = "foodStreetSettings";

export { app, auth, db, storage };
