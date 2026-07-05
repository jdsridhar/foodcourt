/**
 * cart.js
 * Client-side shopping cart stored in sessionStorage. Supports items from MULTIPLE stalls
 * within a single order (grouped by stallId at checkout time).
 */

import { escapeHtml, formatCurrency, showToast } from "./utils.js";

const CART_KEY = "foodstreet_cart";

/** Return the current cart as an array of line items. */
export function getCart() {
  try {
    return JSON.parse(sessionStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

/** Add an item to the cart. Merges with an existing identical line (same item + instructions). */
export function addItemToCart({ itemId, stallId, name, price, quantity, instructions }) {
  const cart = getCart();
  const existing = cart.find(
    (ci) => ci.itemId === itemId && ci.instructions === instructions
  );
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ itemId, stallId, name, price, quantity, instructions: instructions || "" });
  }
  saveCart(cart);
}

/** Update the quantity of a specific cart line (identified by index). Removes if qty <= 0. */
export function updateCartQuantity(index, quantity) {
  const cart = getCart();
  if (!cart[index]) return;
  if (quantity <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].quantity = quantity;
  }
  saveCart(cart);
}

/** Remove a single cart line by index. */
export function removeCartItem(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}

/** Clear the entire cart (called after successful order placement). */
export function clearCart() {
  sessionStorage.removeItem(CART_KEY);
  updateCartBadge();
}

/** Total cart amount (before tax). */
export function getCartTotal() {
  return getCart().reduce((sum, ci) => sum + ci.price * ci.quantity, 0);
}

/** Group cart items by stallId -> [items]. Used to split an order per stall for managers. */
export function groupCartByStall() {
  const groups = {};
  getCart().forEach((ci) => {
    if (!groups[ci.stallId]) groups[ci.stallId] = [];
    groups[ci.stallId].push(ci);
  });
  return groups;
}

/** Update any [data-cart-count] badge elements on the page (e.g. navbar cart icon). */
export function updateCartBadge() {
  const count = getCart().reduce((sum, ci) => sum + ci.quantity, 0);
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = count;
    el.classList.toggle("d-none", count === 0);
  });
}

/** Render the full cart table on cart.html, grouped by stall, with qty controls. */
export function renderCartPage(stallNamesById = {}) {
  const container = document.getElementById("cartContainer");
  const summaryEl = document.getElementById("cartSummary");
  if (!container) return;

  const cart = getCart();
  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="bi bi-cart-x"></i><p>Your cart is empty.</p>
      <a href="../index.html" class="btn btn-primary mt-2">Browse Stalls</a></div>`;
    if (summaryEl) summaryEl.innerHTML = "";
    return;
  }

  const groups = groupCartByStall();
  container.innerHTML = Object.entries(groups)
    .map(([stallId, items]) => {
      const stallName = stallNamesById[stallId] || "Stall";
      return `
      <div class="card mb-3 cart-stall-group">
        <div class="card-header bg-secondary-subtle fw-semibold"><i class="bi bi-shop me-2"></i>${escapeHtml(stallName)}</div>
        <ul class="list-group list-group-flush">
          ${items
            .map((item) => {
              const globalIndex = cart.indexOf(item);
              return `
              <li class="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <div class="fw-semibold">${escapeHtml(item.name)}</div>
                  ${item.instructions ? `<div class="small text-muted">Note: ${escapeHtml(item.instructions)}</div>` : ""}
                  <div class="small text-primary">${formatCurrency(item.price)} each</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <div class="input-group input-group-sm qty-control">
                    <button class="btn btn-outline-secondary qty-decrease" data-index="${globalIndex}">-</button>
                    <span class="btn btn-light disabled">${item.quantity}</span>
                    <button class="btn btn-outline-secondary qty-increase" data-index="${globalIndex}">+</button>
                  </div>
                  <span class="fw-bold">${formatCurrency(item.price * item.quantity)}</span>
                  <button class="btn btn-sm btn-outline-danger remove-item-btn" data-index="${globalIndex}"><i class="bi bi-trash"></i></button>
                </div>
              </li>`;
            })
            .join("")}
        </ul>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".qty-increase").forEach((btn) =>
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      updateCartQuantity(idx, cart[idx].quantity + 1);
      renderCartPage(stallNamesById);
    })
  );
  container.querySelectorAll(".qty-decrease").forEach((btn) =>
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      updateCartQuantity(idx, cart[idx].quantity - 1);
      renderCartPage(stallNamesById);
    })
  );
  container.querySelectorAll(".remove-item-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      removeCartItem(Number(btn.dataset.index));
      showToast("Item removed from cart.", "info");
      renderCartPage(stallNamesById);
    })
  );

  if (summaryEl) {
    const subtotal = getCartTotal();
    summaryEl.innerHTML = `
      <div class="d-flex justify-content-between"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
      <div class="d-flex justify-content-between text-muted small" id="taxLine"></div>
      <hr>
      <div class="d-flex justify-content-between fw-bold fs-5"><span>Total</span><span id="cartGrandTotal">${formatCurrency(subtotal)}</span></div>
    `;
  }
}
