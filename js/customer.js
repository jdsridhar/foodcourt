/**
 * customer.js
 * Powers index.html (stall listing) and customer/menu.html (menu browsing).
 * No authentication required for customers.
 */

import { db, COLLECTIONS } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { debounce, escapeHtml, formatCurrency, getQueryParam, showToast, skeletonCards } from "./utils.js";
import { addItemToCart, getCart } from "./cart.js";

const TABLE_KEY = "foodstreet_table_number";

/** Persist the scanned table number (from ?table=12) for the whole ordering session. */
export function captureTableNumber() {
  const table = getQueryParam("table");
  if (table) {
    sessionStorage.setItem(TABLE_KEY, table);
  }
  return sessionStorage.getItem(TABLE_KEY) || "";
}

export function getTableNumber() {
  return sessionStorage.getItem(TABLE_KEY) || "";
}

/**
 * Render the list of active stalls on index.html with realtime updates + search.
 */
export function initStallListing() {
  const grid = document.getElementById("stallGrid");
  const searchInput = document.getElementById("stallSearchInput");
  if (!grid) return;

  grid.innerHTML = skeletonCards(6);
  let allStalls = [];

  const q = query(
    collection(db, COLLECTIONS.STALLS),
    where("status", "==", "active"),
    orderBy("name")
  );

  onSnapshot(
    q,
    (snapshot) => {
      allStalls = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderStalls(allStalls, searchInput ? searchInput.value : "");
    },
    (err) => {
      console.error(err);
      grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Unable to load stalls right now.</div></div>`;
    }
  );

  function renderStalls(stalls, term) {
    const filtered = term
      ? stalls.filter((s) => s.name.toLowerCase().includes(term.toLowerCase()))
      : stalls;

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-shop"></i><p>No stalls found.</p></div></div>`;
      return;
    }

    grid.innerHTML = filtered
      .map(
        (stall) => `
        <div class="col-12 col-sm-6 col-lg-4 col-xl-3">
          <a href="customer/menu.html?stallId=${stall.id}&table=${getTableNumber()}" class="text-decoration-none">
            <div class="card stall-card h-100">
              <img src="${escapeHtml(stall.logoUrl || "assets/images/placeholder-food.svg")}" class="card-img-top" alt="${escapeHtml(stall.name)}">
              <div class="card-body">
                <h5 class="card-title">${escapeHtml(stall.name)}</h5>
                <p class="card-text text-muted small">${escapeHtml(stall.description || "")}</p>
                <span class="badge bg-success-subtle text-success"><i class="bi bi-circle-fill me-1 small"></i>Open Now</span>
              </div>
            </div>
          </a>
        </div>`
      )
      .join("");
  }

  if (searchInput) {
    searchInput.addEventListener(
      "input",
      debounce(() => renderStalls(allStalls, searchInput.value), 250)
    );
  }
}

/**
 * Render menu items for a single stall on customer/menu.html with search + category filter.
 */
export function initMenuBrowsing() {
  const grid = document.getElementById("menuGrid");
  const categoryFilter = document.getElementById("categoryFilter");
  const searchInput = document.getElementById("menuSearchInput");
  const stallId = getQueryParam("stallId");
  if (!grid || !stallId) return;

  grid.innerHTML = skeletonCards(6);
  let allItems = [];

  const q = query(
    collection(db, COLLECTIONS.MENU_ITEMS),
    where("stallId", "==", stallId)
  );

  onSnapshot(
    q,
    (snapshot) => {
      allItems = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      populateCategories(allItems);
      renderItems();
    },
    (err) => {
      console.error(err);
      grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Unable to load menu right now.</div></div>`;
    }
  );

  function populateCategories(items) {
    if (!categoryFilter) return;
    const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
    categoryFilter.innerHTML =
      `<option value="">All Categories</option>` +
      categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  }

  function renderItems() {
    const term = (searchInput?.value || "").toLowerCase();
    const category = categoryFilter?.value || "";

    const filtered = allItems.filter((item) => {
      const matchesTerm = !term || item.name.toLowerCase().includes(term);
      const matchesCategory = !category || item.category === category;
      return matchesTerm && matchesCategory;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-egg-fried"></i><p>No items match your search.</p></div></div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((item) => {
        const outOfStock = item.available === false;
        const cartQty = getCart().reduce(
          (sum, ci) => (ci.itemId === item.id ? sum + ci.quantity : sum),
          0
        );
        return `
        <div class="col-12 col-sm-6 col-lg-4">
          <div class="card menu-item-card h-100 ${outOfStock ? "opacity-50" : ""}">
            <img src="${escapeHtml(item.imageUrl || "assets/images/placeholder-food.svg")}" class="card-img-top" alt="${escapeHtml(item.name)}">
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between align-items-start">
                <h6 class="card-title mb-1">${escapeHtml(item.name)}</h6>
                <span class="fw-bold text-primary">${formatCurrency(item.price)}</span>
              </div>
              <p class="card-text text-muted small flex-grow-1">${escapeHtml(item.description || "")}</p>
              ${
                outOfStock
                  ? `<span class="badge bg-danger-subtle text-danger">Out of Stock</span>`
                  : `<button class="btn btn-accent btn-sm add-to-cart-btn" data-item-id="${item.id}">
                      <i class="bi bi-plus-lg me-1"></i>Add to Cart ${cartQty > 0 ? `(${cartQty} in cart)` : ""}
                    </button>`
              }
            </div>
          </div>
        </div>`;
      })
      .join("");

    grid.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
      btn.addEventListener("click", () => openAddItemModal(btn.dataset.itemId));
    });
  }

  function openAddItemModal(itemId) {
    const item = allItems.find((i) => i.id === itemId);
    if (!item) return;
    const modalEl = document.getElementById("addItemModal");
    modalEl.querySelector("#addItemModalTitle").textContent = item.name;
    modalEl.querySelector("#addItemQty").value = 1;
    modalEl.querySelector("#addItemInstructions").value = "";
    modalEl.querySelector("#addItemConfirmBtn").onclick = () => {
      const qty = parseInt(modalEl.querySelector("#addItemQty").value, 10) || 1;
      const instructions = modalEl.querySelector("#addItemInstructions").value.trim();
      addItemToCart({
        itemId: item.id,
        stallId,
        name: item.name,
        price: item.price,
        quantity: qty,
        instructions
      });
      showToast(`${item.name} added to cart.`, "success");
      bootstrap.Modal.getInstance(modalEl).hide();
      renderItems();
    };
    new bootstrap.Modal(modalEl).show();
  }

  if (searchInput) searchInput.addEventListener("input", debounce(renderItems, 250));
  if (categoryFilter) categoryFilter.addEventListener("change", renderItems);
}
