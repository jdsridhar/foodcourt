/**
 * admin.js
 * Full system control: stalls, managers, all orders, analytics and global settings.
 *
 * NOTE on creating manager accounts from the browser:
 * Firebase client SDKs have no admin API to create users without signing in as them.
 * We work around this by spinning up a SECONDARY, isolated Firebase App instance purely
 * to call createUserWithEmailAndPassword, which does not disturb the admin's own session
 * on the primary app instance. The secondary app is deleted immediately after use.
 */

import { app, db, storage, COLLECTIONS } from "./firebase-config.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  escapeHtml,
  formatCurrency,
  formatDateTime,
  statusBadgeClass,
  capitalize,
  isValidEmail,
  isValidPrice,
  isValidImage,
  showToast,
  showLoader,
  confirmDialog,
  exportToCSV,
  debounce
} from "./utils.js";

function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ------------------------------------------------------------------ */
/* DASHBOARD                                                           */
/* ------------------------------------------------------------------ */

export function initAdminDashboard() {
  onSnapshot(collection(db, COLLECTIONS.ORDERS), (orderSnap) => {
    const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrderStats(orders);
  });
  onSnapshot(collection(db, COLLECTIONS.STALLS), (stallSnap) => {
    const stalls = stallSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStallStats(stalls);
  });
}

function renderOrderStats(orders) {
  const now = new Date();
  const todayOrders = orders.filter((o) => o.createdAt && isSameDay(toDate(o.createdAt), now));
  const delivered = orders.filter((o) => o.status === "delivered");
  const active = orders.filter((o) => !["delivered", "rejected"].includes(o.status));
  const cancelled = orders.filter((o) => o.status === "rejected");

  const map = {
    totalRevenue: formatCurrency(delivered.reduce((s, o) => s + o.subtotal, 0)),
    todaysRevenue: formatCurrency(
      delivered.filter((o) => isSameDay(toDate(o.createdAt), now)).reduce((s, o) => s + o.subtotal, 0)
    ),
    totalOrders: orders.length,
    activeOrders: active.length,
    deliveredOrders: delivered.length,
    cancelledOrders: cancelled.length
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function renderStallStats(stalls) {
  const map = {
    activeStalls: stalls.filter((s) => s.status === "active").length,
    inactiveStalls: stalls.filter((s) => s.status !== "active").length
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

/* ------------------------------------------------------------------ */
/* STALL MANAGEMENT                                                    */
/* ------------------------------------------------------------------ */

export function initStallManagement() {
  const grid = document.getElementById("stallsGrid");
  const addBtn = document.getElementById("addStallBtn");
  const modalEl = document.getElementById("stallModal");
  if (!grid) return;

  let allStalls = [];
  onSnapshot(collection(db, COLLECTIONS.STALLS), (snapshot) => {
    allStalls = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(allStalls);
  });

  function render(stalls) {
    if (stalls.length === 0) {
      grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-shop"></i><p>No stalls yet.</p></div></div>`;
      return;
    }
    grid.innerHTML = stalls
      .map(
        (stall) => `
        <div class="col-12 col-sm-6 col-lg-4">
          <div class="card stall-card h-100">
            <img src="${escapeHtml(stall.logoUrl || "../assets/images/placeholder-food.svg")}" class="card-img-top" alt="${escapeHtml(stall.name)}">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <h5>${escapeHtml(stall.name)}</h5>
                <span class="badge ${stall.status === "active" ? "bg-success" : "bg-secondary"}">${capitalize(stall.status)}</span>
              </div>
              <p class="small text-muted">${escapeHtml(stall.description || "")}</p>
              <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-sm btn-outline-primary edit-stall-btn" data-id="${stall.id}"><i class="bi bi-pencil"></i> Edit</button>
                <button class="btn btn-sm btn-outline-${stall.status === "active" ? "secondary" : "success"} toggle-stall-btn" data-id="${stall.id}" data-status="${stall.status}">
                  ${stall.status === "active" ? "Deactivate" : "Activate"}
                </button>
                <button class="btn btn-sm btn-outline-danger delete-stall-btn" data-id="${stall.id}"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
        </div>`
      )
      .join("");

    grid.querySelectorAll(".edit-stall-btn").forEach((btn) =>
      btn.addEventListener("click", () => openStallModal(stalls.find((s) => s.id === btn.dataset.id)))
    );
    grid.querySelectorAll(".toggle-stall-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const newStatus = btn.dataset.status === "active" ? "inactive" : "active";
        await updateDoc(doc(db, COLLECTIONS.STALLS, btn.dataset.id), { status: newStatus });
        showToast(`Stall ${newStatus === "active" ? "activated" : "deactivated"}.`, "success");
      })
    );
    grid.querySelectorAll(".delete-stall-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog("Delete this stall permanently? This cannot be undone.", "Delete Stall");
        if (ok) {
          await deleteDoc(doc(db, COLLECTIONS.STALLS, btn.dataset.id));
          showToast("Stall deleted.", "success");
        }
      })
    );
  }

  if (addBtn) addBtn.addEventListener("click", () => openStallModal(null));

  function openStallModal(stall) {
    if (!modalEl) return;
    modalEl.querySelector("#stallModalTitle").textContent = stall ? "Edit Stall" : "Add Stall";
    modalEl.querySelector("#stallName").value = stall?.name || "";
    modalEl.querySelector("#stallDescription").value = stall?.description || "";
    modalEl.querySelector("#stallLogo").value = "";
    const form = modalEl.querySelector("#stallForm");
    form.classList.remove("was-validated");

    modalEl.querySelector("#stallSaveBtn").onclick = async () => {
      const name = modalEl.querySelector("#stallName").value.trim();
      const description = modalEl.querySelector("#stallDescription").value.trim();
      const logoFile = modalEl.querySelector("#stallLogo").files[0];

      if (!name) {
        form.classList.add("was-validated");
        return;
      }
      if (logoFile) {
        const validation = isValidImage(logoFile, 2);
        if (!validation.valid) {
          showToast(validation.message, "warning");
          return;
        }
      }

      showLoader(true);
      try {
        let logoUrl = stall?.logoUrl || "";
        const stallId = stall?.id || doc(collection(db, COLLECTIONS.STALLS)).id;
        if (logoFile) {
          const storageRef = ref(storage, `stallLogos/${stallId}/${Date.now()}_${logoFile.name}`);
          await uploadBytes(storageRef, logoFile);
          logoUrl = await getDownloadURL(storageRef);
        }
        const payload = { name, description, logoUrl, status: stall?.status || "active" };
        await setDoc(doc(db, COLLECTIONS.STALLS, stallId), payload, { merge: true });
        showToast("Stall saved.", "success");
        bootstrap.Modal.getInstance(modalEl).hide();
      } catch (err) {
        console.error(err);
        showToast("Failed to save stall.", "danger");
      } finally {
        showLoader(false);
      }
    };
    new bootstrap.Modal(modalEl).show();
  }
}

/* ------------------------------------------------------------------ */
/* MANAGER ACCOUNT MANAGEMENT                                         */
/* ------------------------------------------------------------------ */

export function initManagerManagement() {
  const tableBody = document.getElementById("managersTableBody");
  const addBtn = document.getElementById("addManagerBtn");
  const modalEl = document.getElementById("managerModal");
  if (!tableBody) return;

  let stallOptions = [];
  onSnapshot(collection(db, COLLECTIONS.STALLS), (snapshot) => {
    stallOptions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const select = modalEl?.querySelector("#managerStallSelect");
    if (select) {
      select.innerHTML = stallOptions
        .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
        .join("");
    }
  });

  const q = query(collection(db, COLLECTIONS.USERS), where("role", "==", "manager"));
  onSnapshot(q, (snapshot) => {
    const managers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(managers);
  });

  function stallName(stallId) {
    return stallOptions.find((s) => s.id === stallId)?.name || "-";
  }

  function render(managers) {
    if (managers.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No managers yet.</td></tr>`;
      return;
    }
    tableBody.innerHTML = managers
      .map(
        (m) => `
        <tr>
          <td>${escapeHtml(m.name)}</td>
          <td>${escapeHtml(m.email)}</td>
          <td>${escapeHtml(stallName(m.stallId))}</td>
          <td><span class="badge ${m.disabled ? "bg-secondary" : "bg-success"}">${m.disabled ? "Disabled" : "Active"}</span></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary reset-pwd-btn" data-email="${escapeHtml(m.email)}"><i class="bi bi-key"></i></button>
            <button class="btn btn-sm btn-outline-secondary toggle-disable-btn" data-id="${m.id}" data-disabled="${m.disabled ? "true" : "false"}">
              ${m.disabled ? "Enable" : "Disable"}
            </button>
            <button class="btn btn-sm btn-outline-danger delete-manager-btn" data-id="${m.id}"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`
      )
      .join("");

    tableBody.querySelectorAll(".reset-pwd-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        try {
          const secondaryAuth = getAuth(app);
          await sendPasswordResetEmail(secondaryAuth, btn.dataset.email);
          showToast("Password reset email sent.", "success");
        } catch (err) {
          showToast(err.message, "danger");
        }
      })
    );
    tableBody.querySelectorAll(".toggle-disable-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const disabled = btn.dataset.disabled !== "true";
        await updateDoc(doc(db, COLLECTIONS.USERS, btn.dataset.id), { disabled });
        showToast(`Manager ${disabled ? "disabled" : "enabled"}.`, "success");
      })
    );
    tableBody.querySelectorAll(".delete-manager-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog("Delete this manager account record?", "Delete Manager");
        if (ok) {
          await deleteDoc(doc(db, COLLECTIONS.USERS, btn.dataset.id));
          showToast("Manager record deleted. Remove the login from Firebase Authentication console too.", "info");
        }
      })
    );
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      modalEl.querySelector("#managerForm").reset();
      modalEl.querySelector("#managerForm").classList.remove("was-validated");
      new bootstrap.Modal(modalEl).show();
    });
  }

  const saveBtn = modalEl?.querySelector("#managerSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const name = modalEl.querySelector("#managerName").value.trim();
      const email = modalEl.querySelector("#managerEmail").value.trim();
      const password = modalEl.querySelector("#managerPassword").value;
      const stallId = modalEl.querySelector("#managerStallSelect").value;
      const form = modalEl.querySelector("#managerForm");

      if (!name || !isValidEmail(email) || password.length < 6 || !stallId) {
        form.classList.add("was-validated");
        showToast("Please fill all fields correctly (password min 6 chars).", "warning");
        return;
      }

      showLoader(true);
      // Use an isolated secondary app so creating the manager does not sign the admin out.
      const secondaryApp = initializeApp(app.options, `secondary-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      try {
        const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await setDoc(doc(db, COLLECTIONS.USERS, credential.user.uid), {
          name,
          email,
          role: "manager",
          stallId,
          disabled: false,
          createdAt: serverTimestamp()
        });
        showToast("Manager account created.", "success");
        bootstrap.Modal.getInstance(modalEl).hide();
      } catch (err) {
        console.error(err);
        showToast(err.message, "danger");
      } finally {
        await deleteApp(secondaryApp);
        showLoader(false);
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* ALL ORDERS (ADMIN VIEW)                                             */
/* ------------------------------------------------------------------ */

export function initAdminOrders() {
  const tableBody = document.getElementById("adminOrdersTableBody");
  const statusFilter = document.getElementById("orderStatusFilter");
  const searchInput = document.getElementById("orderSearchInput");
  const dateFilter = document.getElementById("orderDateFilter");
  const exportBtn = document.getElementById("exportOrdersBtn");
  if (!tableBody) return;

  let allOrders = [];
  let stallNames = {};
  let currentPage = 1;
  const pageSize = 15;

  onSnapshot(collection(db, COLLECTIONS.STALLS), (snapshot) => {
    stallNames = {};
    snapshot.docs.forEach((d) => (stallNames[d.id] = d.data().name));
  });

  onSnapshot(collection(db, COLLECTIONS.ORDERS), (snapshot) => {
    allOrders = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
    render();
  });

  function getFiltered() {
    const status = statusFilter?.value || "";
    const term = (searchInput?.value || "").toLowerCase();
    const dateVal = dateFilter?.value || "";
    return allOrders.filter((o) => {
      const matchesStatus = !status || o.status === status;
      const matchesTerm =
        !term ||
        o.orderNumber.toLowerCase().includes(term) ||
        (stallNames[o.stallId] || "").toLowerCase().includes(term);
      const matchesDate = !dateVal || isSameDay(toDate(o.createdAt), new Date(dateVal));
      return matchesStatus && matchesTerm && matchesDate;
    });
  }

  function render() {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    tableBody.innerHTML =
      pageItems.length === 0
        ? `<tr><td colspan="6" class="text-center text-muted py-4">No orders found.</td></tr>`
        : pageItems
            .map(
              (o) => `
        <tr>
          <td>#${escapeHtml(o.orderNumber)}<div class="small text-muted">${formatDateTime(o.createdAt)}</div></td>
          <td>${escapeHtml(stallNames[o.stallId] || "-")}</td>
          <td>Table ${escapeHtml(o.tableNumber)}</td>
          <td>${formatCurrency(o.subtotal)}</td>
          <td><span class="badge ${statusBadgeClass(o.status)}">${capitalize(o.status)}</span></td>
          <td>${escapeHtml(o.customerName || "Guest")}</td>
        </tr>`
            )
            .join("");

    const paginationEl = document.getElementById("ordersPagination");
    if (paginationEl) {
      paginationEl.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
        .map((p) => `<li class="page-item ${p === currentPage ? "active" : ""}"><button class="page-link" data-page="${p}">${p}</button></li>`)
        .join("");
      paginationEl.querySelectorAll("button[data-page]").forEach((btn) =>
        btn.addEventListener("click", () => {
          currentPage = Number(btn.dataset.page);
          render();
        })
      );
    }
  }

  [statusFilter, dateFilter].forEach((el) => el && el.addEventListener("change", () => { currentPage = 1; render(); }));
  if (searchInput) searchInput.addEventListener("input", debounce(() => { currentPage = 1; render(); }, 250));
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const rows = getFiltered().map((o) => ({
        OrderNumber: o.orderNumber,
        Stall: stallNames[o.stallId] || "-",
        Table: o.tableNumber,
        Customer: o.customerName || "Guest",
        Amount: o.subtotal,
        Status: o.status,
        PlacedAt: formatDateTime(o.createdAt)
      }));
      exportToCSV(rows, `orders-export-${Date.now()}.csv`);
    });
  }
}

/* ------------------------------------------------------------------ */
/* ANALYTICS                                                           */
/* ------------------------------------------------------------------ */

export function initAdminAnalytics() {
  onSnapshot(collection(db, COLLECTIONS.ORDERS), async (snapshot) => {
    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => o.status === "delivered");
    const stallsSnap = await getDocs(collection(db, COLLECTIONS.STALLS));
    const stallNames = {};
    stallsSnap.docs.forEach((d) => (stallNames[d.id] = d.data().name));

    renderOverallRevenue(orders);
    renderRevenueByStall(orders, stallNames);
    renderTopItems(orders);
    renderPeakHours(orders);
  });
}

function renderOverallRevenue(orders) {
  const el = document.getElementById("overallRevenue");
  if (el) el.textContent = formatCurrency(orders.reduce((s, o) => s + o.subtotal, 0));
}

function renderRevenueByStall(orders, stallNames) {
  const el = document.getElementById("revenueByStall");
  if (!el) return;
  const totals = {};
  orders.forEach((o) => (totals[o.stallId] = (totals[o.stallId] || 0) + o.subtotal));
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    el.innerHTML = `<p class="text-muted">No data yet.</p>`;
    return;
  }
  const max = sorted[0][1];
  el.innerHTML = sorted
    .map(
      ([stallId, total]) => `
      <div class="mb-2">
        <div class="d-flex justify-content-between small"><span>${escapeHtml(stallNames[stallId] || "Unknown")}</span><span>${formatCurrency(total)}</span></div>
        <div class="progress" style="height:8px;"><div class="progress-bar bg-primary" style="width:${(total / max) * 100}%"></div></div>
      </div>`
    )
    .join("");
}

function renderTopItems(orders) {
  const el = document.getElementById("adminTopItems");
  if (!el) return;
  const counts = {};
  orders.forEach((o) => o.items.forEach((i) => (counts[i.name] = (counts[i.name] || 0) + i.quantity)));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  el.innerHTML =
    sorted.length === 0
      ? `<p class="text-muted">No data yet.</p>`
      : sorted.map(([name, qty], idx) => `<div class="d-flex justify-content-between border-bottom py-1"><span>${idx + 1}. ${escapeHtml(name)}</span><strong>${qty}</strong></div>`).join("");
}

function renderPeakHours(orders) {
  const el = document.getElementById("peakHoursChart");
  if (!el) return;
  const hourCounts = Array(24).fill(0);
  orders.forEach((o) => {
    if (o.createdAt) hourCounts[toDate(o.createdAt).getHours()]++;
  });
  const max = Math.max(...hourCounts, 1);
  el.innerHTML = hourCounts
    .map(
      (count, hour) => `
      <div class="peak-hour-bar" title="${hour}:00 - ${count} orders">
        <div class="peak-hour-fill" style="height:${(count / max) * 100}%"></div>
        <span class="peak-hour-label">${hour}</span>
      </div>`
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* SETTINGS                                                            */
/* ------------------------------------------------------------------ */

export async function saveGlobalSettings({ foodStreetName, currency, taxPercent, orderPrefix, logoFile }) {
  const { SETTINGS_DOC_ID } = await import("./firebase-config.js");
  const payload = { foodStreetName, currency, taxPercent: Number(taxPercent), orderPrefix };
  if (logoFile) {
    const validation = isValidImage(logoFile, 2);
    if (!validation.valid) throw new Error(validation.message);
    const storageRef = ref(storage, `settings/logo_${Date.now()}_${logoFile.name}`);
    await uploadBytes(storageRef, logoFile);
    payload.logoUrl = await getDownloadURL(storageRef);
  }
  await setDoc(doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC_ID), payload, { merge: true });
}
