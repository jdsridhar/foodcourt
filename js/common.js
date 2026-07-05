/**
 * common.js
 * Shared layout scaffolding injected into every page: toast container,
 * loading overlay, confirmation modal, and small DOM helpers.
 * Import and call initCommonLayout() once at the top of every page script.
 */

import { db, COLLECTIONS, SETTINGS_DOC_ID } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Injects the toast container, loading overlay and confirm modal markup once per page. */
export function initCommonLayout() {
  if (document.getElementById("toastContainer")) return; // already initialized

  const toastContainer = document.createElement("div");
  toastContainer.id = "toastContainer";
  toastContainer.className = "toast-container position-fixed top-0 end-0 p-3";
  toastContainer.style.zIndex = "1080";
  document.body.appendChild(toastContainer);

  const loadingOverlay = document.createElement("div");
  loadingOverlay.id = "loadingOverlay";
  loadingOverlay.className = "loading-overlay d-none";
  loadingOverlay.innerHTML = `<div class="spinner-border text-light" role="status"><span class="visually-hidden">Loading...</span></div>`;
  document.body.appendChild(loadingOverlay);

  const confirmModal = document.createElement("div");
  confirmModal.id = "confirmModal";
  confirmModal.className = "modal fade";
  confirmModal.tabIndex = -1;
  confirmModal.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Please Confirm</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">Are you sure?</div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" id="confirmModalOkBtn" class="btn btn-danger">Confirm</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(confirmModal);
  showTrackOrderButton();
}

/** Dynamically inject a "Track Order" button into the customer navbar if they have an active checkout session. */
export function showTrackOrderButton() {
  const checkoutId = localStorage.getItem("foodstreet_checkout_id");
  if (!checkoutId) return;

  const path = window.location.pathname;
  if (path.includes("/manager/") || path.includes("/admin/")) return;

  const cartBtn = document.querySelector(".cart-icon-btn");
  if (!cartBtn || document.getElementById("trackOrderNavbarBtn")) return;

  const trackBtn = document.createElement("a");
  trackBtn.id = "trackOrderNavbarBtn";
  const isSubdir = path.includes("/customer/");
  const href = isSubdir ? `order-status.html?checkoutId=${checkoutId}` : `customer/order-status.html?checkoutId=${checkoutId}`;

  trackBtn.href = href;
  trackBtn.className = "btn btn-outline-success me-2";
  trackBtn.innerHTML = `<i class="bi bi-receipt"></i> Track Order`;

  cartBtn.parentNode.insertBefore(trackBtn, cartBtn);
}

/** Fetch the single global food street settings document (name, currency, tax, logo, prefix). */
export async function getFoodStreetSettings() {
  const defaultSettings = {
    foodStreetName: "FoodStreet",
    logoUrl: "",
    currency: "₹",
    taxPercent: 5,
    orderPrefix: "FS"
  };
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC_ID));
    return snap.exists() ? { ...defaultSettings, ...snap.data() } : defaultSettings;
  } catch (err) {
    console.error("Failed to load settings:", err);
    return defaultSettings;
  }
}

/** Apply the food street name/logo to any element carrying [data-app-name] / [data-app-logo]. */
export function applyBranding(settings) {
  document.querySelectorAll("[data-app-name]").forEach((el) => {
    el.textContent = settings.foodStreetName;
  });
  document.querySelectorAll("[data-app-logo]").forEach((el) => {
    if (settings.logoUrl) el.src = settings.logoUrl;
  });
  document.title = document.title.replace("FoodStreet", settings.foodStreetName);
}

/** Highlight the current page link in a sidebar/navbar based on the file name. */
export function highlightActiveNav() {
  const current = window.location.pathname.split("/").pop();
  document.querySelectorAll(".nav-link[href]").forEach((link) => {
    const href = link.getAttribute("href").split("/").pop();
    if (href === current) link.classList.add("active");
  });
}
