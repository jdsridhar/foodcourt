/**
 * auth.js
 * Firebase Authentication helpers shared by manager and admin login/dashboard pages.
 * Customer flow requires NO authentication at all.
 *
 * User roles are stored in Firestore `users/{uid}` as: { role: "manager" | "admin", stallId, name, email, ... }
 */

import { auth, db, COLLECTIONS } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, showLoader } from "./utils.js";

/** Sign in with email/password and return the merged Firestore user profile (includes role). */
export async function loginWithEmailPassword(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await fetchUserProfile(credential.user.uid);
  if (!profile) {
    await signOut(auth);
    throw new Error("No profile found for this account. Contact the administrator.");
  }
  return profile;
}

/** Fetch the Firestore user profile document for a given uid. */
export async function fetchUserProfile(uid) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/** Sign the current user out and redirect to the given login page. */
export async function logout(redirectUrl = "login.html") {
  await signOut(auth);
  window.location.href = redirectUrl;
}

/**
 * Guard a page so only an authenticated user with the expected role can view it.
 * Redirects to loginUrl otherwise. Resolves with the full user profile on success.
 */
export function requireRole(expectedRole, loginUrl = "login.html") {
  return new Promise((resolve) => {
    showLoader(true);
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = loginUrl;
        return;
      }
      const profile = await fetchUserProfile(user.uid);
      showLoader(false);
      if (!profile || profile.role !== expectedRole || profile.disabled === true) {
        showToast("You do not have access to this page.", "danger");
        await signOut(auth);
        window.location.href = loginUrl;
        return;
      }
      resolve(profile);
    });
  });
}

/** Change the currently logged-in user's password (requires re-authentication). */
export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}
