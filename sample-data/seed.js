/**
 * seed.js
 * One-time LOCAL DEV UTILITY to populate Firestore with sample stalls, menu items,
 * settings, an admin account and a manager account for testing.
 *
 * This script is NOT part of the deployed web app (the app itself is 100% static
 * HTML/CSS/JS + Firebase, no server). It only exists to save you from manually
 * typing sample data into the Firebase console.
 *
 * Setup:
 *   1. npm install firebase-admin
 *   2. Download a service account key from
 *      Firebase Console -> Project Settings -> Service Accounts -> Generate new private key
 *      Save it as sample-data/serviceAccountKey.json (DO NOT COMMIT THIS FILE).
 *   3. Run: node sample-data/seed.js
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("./serviceAccountKey.json");
const stalls = require("./stalls.json");
const menuItems = require("./menuItems.json");
const settings = require("./settings.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

async function seedStalls() {
  const batch = db.batch();
  stalls.forEach((stall) => {
    const { id, ...data } = stall;
    batch.set(db.collection("stalls").doc(id), data, { merge: true });
  });
  await batch.commit();
  console.log(`Seeded ${stalls.length} stalls.`);
}

async function seedMenuItems() {
  const collectionRef = db.collection("menuItems");
  const snapshot = await collectionRef.get();
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  const writeBatch = db.batch();
  menuItems.forEach((item) => {
    writeBatch.set(collectionRef.doc(), item);
  });
  await writeBatch.commit();
  console.log(`Seeded ${menuItems.length} menu items.`);
}

async function seedSettings() {
  await db.collection("settings").doc("foodStreetSettings").set(settings, { merge: true });
  console.log("Seeded global settings.");
}

async function seedAdmin() {
  const email = "admin@foodstreet.test";
  const password = "Admin@123";
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName: "Super Admin" });
  }
  await db.collection("users").doc(user.uid).set({
    name: "Super Admin",
    email,
    role: "admin",
    disabled: false
  });
  console.log(`Admin account ready -> email: ${email}  password: ${password}`);
}

async function seedManager() {
  const email = "manager.pizza@foodstreet.test";
  const password = "Manager@123";
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName: "Pizza Point Manager" });
  }
  await db.collection("users").doc(user.uid).set({
    name: "Pizza Point Manager",
    email,
    role: "manager",
    stallId: "stall-pizza-point",
    disabled: false
  });
  console.log(`Manager account ready -> email: ${email}  password: ${password}`);
}

(async () => {
  try {
    await seedStalls();
    await seedMenuItems();
    await seedSettings();
    await seedAdmin();
    await seedManager();
    console.log("\nSample data seeding complete!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
})();
