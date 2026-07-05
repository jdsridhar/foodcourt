/**
 * utils.js
 * Generic, reusable helper functions used across customer / manager / admin modules.
 * No Firebase imports here — keep this file framework-agnostic and dependency-free.
 */

/** Format a number as currency using the food street's configured currency symbol. */
export function formatCurrency(amount, currencySymbol = "₹") {
  const value = Number(amount) || 0;
  return `${currencySymbol}${value.toFixed(2)}`;
}

/** Format a Firestore Timestamp (or Date) into a human readable date-time string. */
export function formatDateTime(timestampOrDate) {
  if (!timestampOrDate) return "-";
  const date = typeof timestampOrDate.toDate === "function"
    ? timestampOrDate.toDate()
    : new Date(timestampOrDate);
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** Format only the time portion (used in order tracking timelines). */
export function formatTime(timestampOrDate) {
  if (!timestampOrDate) return "-";
  const date = typeof timestampOrDate.toDate === "function"
    ? timestampOrDate.toDate()
    : new Date(timestampOrDate);
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** Debounce helper for search inputs (instant search without hammering Firestore/DOM). */
export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Generate a short unique order id prefix, e.g. FS-93821 (final number stored server-side too). */
export function generateOrderNumber(prefix = "FS") {
  const random = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${random}`;
}

/** Read a query-string parameter by name from the current URL. */
export function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/** Basic required-field validator. Returns true if value is non-empty after trimming. */
export function isRequired(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

/** Validate an email address format. */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).trim());
}

/** Validate an Indian-style 10-digit phone number (adjust regex for other locales). */
export function isValidPhone(phone) {
  const re = /^[6-9]\d{9}$/;
  return re.test(String(phone).trim());
}

/** Validate a positive numeric price value. */
export function isValidPrice(price) {
  const num = Number(price);
  return !Number.isNaN(num) && num > 0;
}

/** Validate a positive integer quantity, within an optional max. */
export function isValidQuantity(qty, max = 99) {
  const num = Number(qty);
  return Number.isInteger(num) && num > 0 && num <= max;
}

/** Validate an uploaded image file (type + size in MB). */
export function isValidImage(file, maxSizeMB = 3) {
  if (!file) return { valid: false, message: "Please select an image." };
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, message: "Only JPG, PNG or WEBP images are allowed." };
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { valid: false, message: `Image must be smaller than ${maxSizeMB}MB.` };
  }
  return { valid: true, message: "" };
}

/** Escape HTML to avoid injection when rendering user-supplied text (e.g. special instructions). */
export function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Capitalize the first letter of a string (used for status badges). */
export function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Map an order status to a Bootstrap color class for badges. */
export function statusBadgeClass(status) {
  const map = {
    pending: "bg-warning text-dark",
    accepted: "bg-info text-dark",
    preparing: "bg-primary",
    ready: "bg-success",
    delivered: "bg-secondary",
    rejected: "bg-danger"
  };
  return map[status] || "bg-secondary";
}

/** Convert an array of plain objects to a CSV string and trigger a browser download. */
export function exportToCSV(rows, filename = "export.csv") {
  if (!rows || rows.length === 0) {
    showToast("No data available to export.", "warning");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ];
  const csvContent = csvLines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Show a Bootstrap toast notification.
 * Expects a <div id="toastContainer"> to exist in the page (added by common.js layout).
 */
export function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) {
    // eslint-disable-next-line no-alert
    alert(message);
    return;
  }
  const iconMap = {
    success: "bi-check-circle-fill",
    danger: "bi-x-circle-fill",
    warning: "bi-exclamation-triangle-fill",
    info: "bi-info-circle-fill"
  };
  const toastEl = document.createElement("div");
  toastEl.className = `toast align-items-center text-bg-${type} border-0 mb-2`;
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi ${iconMap[type] || iconMap.info} me-2"></i>${escapeHtml(message)}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
  toast.show();
  toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
}

/** Show/hide a full-page loading spinner overlay. Expects #loadingOverlay in the DOM. */
export function showLoader(show = true) {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  overlay.classList.toggle("d-none", !show);
}

/**
 * Show a Bootstrap-modal-based confirmation dialog and resolve true/false.
 * Expects #confirmModal (added by common.js layout) to exist in the DOM.
 */
export function confirmDialog(message, title = "Please Confirm") {
  return new Promise((resolve) => {
    const modalEl = document.getElementById("confirmModal");
    if (!modalEl) {
      // eslint-disable-next-line no-alert
      resolve(window.confirm(message));
      return;
    }
    modalEl.querySelector(".modal-title").textContent = title;
    modalEl.querySelector(".modal-body").textContent = message;
    const confirmBtn = modalEl.querySelector("#confirmModalOkBtn");
    const modal = new bootstrap.Modal(modalEl);

    const cleanup = (result) => {
      confirmBtn.removeEventListener("click", onConfirm);
      modal.hide();
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    confirmBtn.addEventListener("click", onConfirm);
    modalEl.addEventListener("hidden.bs.modal", () => resolve(false), { once: true });
    modal.show();
  });
}

/** Render a skeleton loading placeholder (used while Firestore listeners fetch first data). */
export function skeletonCards(count = 4) {
  return Array.from({ length: count })
    .map(
      () => `
      <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
        <div class="card skeleton-card">
          <div class="skeleton skeleton-img"></div>
          <div class="card-body">
            <div class="skeleton skeleton-line w-75"></div>
            <div class="skeleton skeleton-line w-50"></div>
          </div>
        </div>
      </div>`
    )
    .join("");
}
