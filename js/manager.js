/**
 * manager.js
 * All Stall Manager functionality: dashboard stats, order management, menu CRUD,
 * analytics and profile management. Every query is scoped to the manager's own stallId.
 */

import { db, storage, COLLECTIONS } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  escapeHtml,
  formatCurrency,
  formatDateTime,
  statusBadgeClass,
  capitalize,
  isValidPrice,
  isValidImage,
  showToast,
  showLoader,
  confirmDialog,
  exportToCSV,
  debounce
} from "./utils.js";

/* ------------------------------------------------------------------ */
/* DASHBOARD                                                          */
/* ------------------------------------------------------------------ */

/** Wire up the realtime dashboard summary cards + recent orders + popular items for one stall. */
export function initManagerDashboard(stallId) {
  const q = query(collection(db, COLLECTIONS.ORDERS), where("stallId", "==", stallId));

  onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDashboardStats(orders);
    renderRecentOrders(orders);
    renderPopularItems(orders);
  });
}

function isSameDay(date, ref) {
  return (
    date.getFullYear() === ref.getFullYear() &&
    date.getMonth() === ref.getMonth() &&
    date.getDate() === ref.getDate()
  );
}

function toDate(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
}

function renderDashboardStats(orders) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayOrders = orders.filter((o) => o.createdAt && isSameDay(toDate(o.createdAt), now));
  const weekOrders = orders.filter((o) => o.createdAt && toDate(o.createdAt) >= startOfWeek);
  const monthOrders = orders.filter((o) => o.createdAt && toDate(o.createdAt) >= startOfMonth);

  const counters = {
    todaysOrdersCount: todayOrders.length,
    pendingCount: orders.filter((o) => o.status === "pending").length,
    preparingCount: orders.filter((o) => o.status === "preparing").length,
    readyCount: orders.filter((o) => o.status === "ready").length,
    deliveredCount: orders.filter((o) => o.status === "delivered").length,
    rejectedCount: orders.filter((o) => o.status === "rejected").length,
    todaysRevenue: formatCurrency(sumRevenue(todayOrders)),
    weeklyRevenue: formatCurrency(sumRevenue(weekOrders)),
    monthlyRevenue: formatCurrency(sumRevenue(monthOrders))
  };

  Object.entries(counters).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function sumRevenue(orders) {
  return orders
    .filter((o) => o.status === "delivered")
    .reduce((sum, o) => sum + (o.subtotal || 0), 0);
}

function renderRecentOrders(orders) {
  const container = document.getElementById("recentOrdersList");
  if (!container) return;
  const recent = [...orders]
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
    .slice(0, 8);

  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="bi bi-receipt"></i><p>No orders yet.</p></div>`;
    return;
  }

  container.innerHTML = recent
    .map(
      (o) => `
      <div class="d-flex justify-content-between align-items-center border-bottom py-2">
        <div>
          <strong>#${escapeHtml(o.orderNumber)}</strong> - Table ${escapeHtml(o.tableNumber)}
          <div class="small text-muted">${formatDateTime(o.createdAt)}</div>
        </div>
        <span class="badge ${statusBadgeClass(o.status)}">${capitalize(o.status)}</span>
      </div>`
    )
    .join("");
}

function renderPopularItems(orders) {
  const container = document.getElementById("popularItemsList");
  if (!container) return;
  const counts = {};
  orders.forEach((o) =>
    o.items.forEach((item) => {
      counts[item.name] = (counts[item.name] || 0) + item.quantity;
    })
  );
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = `<p class="text-muted small mb-0">No sales data yet.</p>`;
    return;
  }

  container.innerHTML = sorted
    .map(
      ([name, qty], idx) => `
      <div class="d-flex justify-content-between border-bottom py-2">
        <span>${idx + 1}. ${escapeHtml(name)}</span>
        <span class="fw-bold">${qty} sold</span>
      </div>`
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* ORDER MANAGEMENT                                                    */
/* ------------------------------------------------------------------ */

const NEXT_STATUS = {
  pending: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "delivered"
};

/** Realtime order list for manager/orders.html with status filter + search + pagination. */
export function initManagerOrders(stallId) {
  const tableBody = document.getElementById("ordersTableBody");
  const statusFilter = document.getElementById("orderStatusFilter");
  const searchInput = document.getElementById("orderSearchInput");
  const dateFilter = document.getElementById("orderDateFilter");
  if (!tableBody) return;

  let allOrders = [];
  let currentPage = 1;
  const pageSize = 10;

  const q = query(collection(db, COLLECTIONS.ORDERS), where("stallId", "==", stallId));
  onSnapshot(q, (snapshot) => {
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
        String(o.tableNumber).toLowerCase().includes(term);
      const matchesDate = !dateVal || isSameDay(toDate(o.createdAt), new Date(dateVal));
      return matchesStatus && matchesTerm && matchesDate;
    });
  }

  function render() {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    if (pageItems.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No orders found.</td></tr>`;
    } else {
      tableBody.innerHTML = pageItems
        .map((o) => {
          const itemsSummary = o.items.map((i) => `${i.quantity}x ${escapeHtml(i.name)}`).join(", ");
          const nextStatus = NEXT_STATUS[o.status];
          return `
          <tr>
            <td>
              <strong>#${escapeHtml(o.orderNumber)}</strong>
              <div class="small text-muted">${formatDateTime(o.createdAt)}</div>
            </td>
            <td>Table ${escapeHtml(o.tableNumber)}</td>
            <td class="small">${itemsSummary}</td>
            <td>${formatCurrency(o.subtotal)}</td>
            <td><span class="badge ${statusBadgeClass(o.status)}">${capitalize(o.status)}</span></td>
            <td class="text-end">
              ${
                o.status === "pending"
                  ? `<button class="btn btn-sm btn-success accept-btn" data-id="${o.id}"><i class="bi bi-check-lg"></i> Accept</button>
                     <button class="btn btn-sm btn-outline-danger reject-btn" data-id="${o.id}"><i class="bi bi-x-lg"></i> Reject</button>`
                  : nextStatus
                  ? `<button class="btn btn-sm btn-primary advance-btn" data-id="${o.id}" data-next="${nextStatus}">Mark ${capitalize(nextStatus)}</button>`
                  : `<span class="text-muted small">Completed</span>`
              }
            </td>
          </tr>`;
        })
        .join("");
    }

    renderPagination(totalPages);
    attachRowHandlers();
  }

  function renderPagination(totalPages) {
    const paginationEl = document.getElementById("ordersPagination");
    if (!paginationEl) return;
    let html = "";
    for (let p = 1; p <= totalPages; p++) {
      html += `<li class="page-item ${p === currentPage ? "active" : ""}"><button class="page-link" data-page="${p}">${p}</button></li>`;
    }
    paginationEl.innerHTML = html;
    paginationEl.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentPage = Number(btn.dataset.page);
        render();
      });
    });
  }

  function attachRowHandlers() {
    tableBody.querySelectorAll(".accept-btn").forEach((btn) =>
      btn.addEventListener("click", () => updateOrderStatus(btn.dataset.id, "accepted"))
    );
    tableBody.querySelectorAll(".advance-btn").forEach((btn) =>
      btn.addEventListener("click", () => updateOrderStatus(btn.dataset.id, btn.dataset.next))
    );
    tableBody.querySelectorAll(".reject-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog("Reject this order? This cannot be undone.", "Reject Order");
        if (ok) updateOrderStatus(btn.dataset.id, "rejected");
      })
    );
  }

  [statusFilter, dateFilter].forEach((el) => el && el.addEventListener("change", () => { currentPage = 1; render(); }));
  if (searchInput) searchInput.addEventListener("input", debounce(() => { currentPage = 1; render(); }, 250));
}

async function updateOrderStatus(orderId, status) {
  try {
    await updateDoc(doc(db, COLLECTIONS.ORDERS, orderId), { status, updatedAt: serverTimestamp() });
    showToast(`Order marked as ${status}.`, "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to update order status.", "danger");
  }
}

/* ------------------------------------------------------------------ */
/* MENU MANAGEMENT                                                     */
/* ------------------------------------------------------------------ */

/** Realtime menu item grid for manager/menu.html with add/edit/delete/availability/price. */
export function initManagerMenu(stallId) {
  const grid = document.getElementById("managerMenuGrid");
  const addBtn = document.getElementById("addMenuItemBtn");
  const modalEl = document.getElementById("menuItemModal");
  if (!grid) return;

  const q = query(collection(db, COLLECTIONS.MENU_ITEMS), where("stallId", "==", stallId));
  onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(items);
  });

  function render(items) {
    if (items.length === 0) {
      grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-egg-fried"></i><p>No menu items yet. Add your first item.</p></div></div>`;
      return;
    }
    grid.innerHTML = items
      .map(
        (item) => `
        <div class="col-12 col-sm-6 col-lg-4">
          <div class="card menu-item-card h-100">
            <img src="${escapeHtml(item.imageUrl || "../assets/images/placeholder-food.svg")}" class="card-img-top" alt="${escapeHtml(item.name)}">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <h6>${escapeHtml(item.name)}</h6>
                <strong class="text-primary">${formatCurrency(item.price)}</strong>
              </div>
              <p class="small text-muted">${escapeHtml(item.category || "")}</p>
              <div class="form-check form-switch mb-2">
                <input class="form-check-input avail-toggle" type="checkbox" data-id="${item.id}" ${item.available !== false ? "checked" : ""}>
                <label class="form-check-label small">${item.available !== false ? "Available" : "Out of Stock"}</label>
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline-primary edit-item-btn" data-id="${item.id}"><i class="bi bi-pencil"></i> Edit</button>
                <button class="btn btn-sm btn-outline-danger delete-item-btn" data-id="${item.id}"><i class="bi bi-trash"></i> Delete</button>
              </div>
            </div>
          </div>
        </div>`
      )
      .join("");

    grid.querySelectorAll(".avail-toggle").forEach((cb) =>
      cb.addEventListener("change", () =>
        updateDoc(doc(db, COLLECTIONS.MENU_ITEMS, cb.dataset.id), { available: cb.checked })
      )
    );
    grid.querySelectorAll(".edit-item-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        const item = items.find((i) => i.id === btn.dataset.id);
        openMenuItemModal(item);
      })
    );
    grid.querySelectorAll(".delete-item-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog("Delete this menu item permanently?", "Delete Item");
        if (ok) {
          await deleteDoc(doc(db, COLLECTIONS.MENU_ITEMS, btn.dataset.id));
          showToast("Item deleted.", "success");
        }
      })
    );
  }

  if (addBtn) addBtn.addEventListener("click", () => openMenuItemModal(null));

  function openMenuItemModal(item) {
    if (!modalEl) return;
    modalEl.querySelector("#menuItemModalTitle").textContent = item ? "Edit Item" : "Add Item";
    modalEl.querySelector("#menuItemName").value = item?.name || "";
    modalEl.querySelector("#menuItemCategory").value = item?.category || "";
    modalEl.querySelector("#menuItemPrice").value = item?.price || "";
    modalEl.querySelector("#menuItemDescription").value = item?.description || "";
    modalEl.querySelector("#menuItemImage").value = "";
    const form = modalEl.querySelector("#menuItemForm");
    form.classList.remove("was-validated");

    modalEl.querySelector("#menuItemSaveBtn").onclick = async () => {
      const name = modalEl.querySelector("#menuItemName").value.trim();
      const category = modalEl.querySelector("#menuItemCategory").value.trim();
      const price = modalEl.querySelector("#menuItemPrice").value;
      const description = modalEl.querySelector("#menuItemDescription").value.trim();
      const imageFile = modalEl.querySelector("#menuItemImage").files[0];

      if (!name || !isValidPrice(price)) {
        form.classList.add("was-validated");
        showToast("Please fill required fields with valid values.", "warning");
        return;
      }
      if (imageFile) {
        const validation = isValidImage(imageFile);
        if (!validation.valid) {
          showToast(validation.message, "warning");
          return;
        }
      }

      showLoader(true);
      try {
        let imageUrl = item?.imageUrl || "";
        if (imageFile) {
          const path = `menuItems/${stallId}/${Date.now()}_${imageFile.name}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, imageFile);
          imageUrl = await getDownloadURL(storageRef);
        }
        const payload = {
          stallId,
          name,
          category,
          price: Number(price),
          description,
          imageUrl,
          available: item?.available !== false
        };
        if (item) {
          await updateDoc(doc(db, COLLECTIONS.MENU_ITEMS, item.id), payload);
        } else {
          await addDoc(collection(db, COLLECTIONS.MENU_ITEMS), payload);
        }
        showToast("Menu item saved.", "success");
        bootstrap.Modal.getInstance(modalEl).hide();
      } catch (err) {
        console.error(err);
        showToast("Failed to save menu item.", "danger");
      } finally {
        showLoader(false);
      }
    };
    new bootstrap.Modal(modalEl).show();
  }
}

/* ------------------------------------------------------------------ */
/* ANALYTICS                                                           */
/* ------------------------------------------------------------------ */

/** Render daily/weekly/monthly sales + top-selling items chart data on manager/analytics.html. */
export function initManagerAnalytics(stallId) {
  const q = query(collection(db, COLLECTIONS.ORDERS), where("stallId", "==", stallId));
  onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((o) => o.status === "delivered");
    renderSalesSummary(orders);
    renderTopItems(orders);
  });
}

function renderSalesSummary(orders) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const daily = orders.filter((o) => isSameDay(toDate(o.createdAt), now));
  const weekly = orders.filter((o) => toDate(o.createdAt) >= startOfWeek);
  const monthly = orders.filter((o) => toDate(o.createdAt) >= startOfMonth);

  const map = {
    analyticsDailySales: formatCurrency(sumRevenue(daily.map((o) => ({ ...o, status: "delivered" })))),
    analyticsWeeklySales: formatCurrency(sumRevenue(weekly.map((o) => ({ ...o, status: "delivered" })))),
    analyticsMonthlySales: formatCurrency(sumRevenue(monthly.map((o) => ({ ...o, status: "delivered" }))))
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function renderTopItems(orders) {
  const el = document.getElementById("analyticsTopItems");
  if (!el) return;
  const counts = {};
  orders.forEach((o) => o.items.forEach((i) => (counts[i.name] = (counts[i.name] || 0) + i.quantity)));
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sorted.length === 0) {
    el.innerHTML = `<p class="text-muted">No sales data yet.</p>`;
    return;
  }
  const max = sorted[0][1];
  el.innerHTML = sorted
    .map(
      ([name, qty]) => `
      <div class="mb-2">
        <div class="d-flex justify-content-between small"><span>${escapeHtml(name)}</span><span>${qty}</span></div>
        <div class="progress" style="height:8px;"><div class="progress-bar bg-accent" style="width:${(qty / max) * 100}%"></div></div>
      </div>`
    )
    .join("");
}

/* ------------------------------------------------------------------ */
/* PROFILE                                                             */
/* ------------------------------------------------------------------ */

/** Load & save stall profile details (name, description, logo) on manager/profile.html. */
export async function loadStallProfile(stallId) {
  const snap = await getDoc(doc(db, COLLECTIONS.STALLS, stallId));
  return snap.exists() ? { id: stallId, ...snap.data() } : null;
}

export async function saveStallProfile(stallId, { name, description, logoFile }) {
  const payload = { name, description };
  if (logoFile) {
    const validation = isValidImage(logoFile, 2);
    if (!validation.valid) throw new Error(validation.message);
    const path = `stallLogos/${stallId}/${Date.now()}_${logoFile.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, logoFile);
    payload.logoUrl = await getDownloadURL(storageRef);
  }
  await updateDoc(doc(db, COLLECTIONS.STALLS, stallId), payload);
}
