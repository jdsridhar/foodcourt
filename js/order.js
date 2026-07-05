/**
 * order.js
 * Order placement (customer/cart.html) and realtime order tracking (customer/order-status.html).
 *
 * IMPORTANT: A single customer checkout can span multiple stalls. We store ONE order document
 * per stall (so each stall manager only ever sees their own orders), but tag all sibling orders
 * with a shared `checkoutId` so the customer can track the whole group together.
 */

import { db, COLLECTIONS } from "./firebase-config.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { groupCartByStall, clearCart } from "./cart.js";
import { generateOrderNumber, escapeHtml, formatCurrency, formatDateTime, statusBadgeClass, capitalize, showToast } from "./utils.js";

const CHECKOUT_KEY = "foodstreet_checkout_id";

/**
 * Place the order(s): one Firestore document per stall present in the cart.
 * Returns the shared checkoutId used for order-status.html.
 */
export async function placeOrder({ tableNumber, customerName, customerPhone, orderPrefix = "FS" }) {
  const groups = groupCartByStall();
  const stallIds = Object.keys(groups);
  if (stallIds.length === 0) throw new Error("Your cart is empty.");

  const checkoutId = `${orderPrefix}-${Date.now()}`;

  const writes = stallIds.map((stallId) => {
    const items = groups[stallId];
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    return addDoc(collection(db, COLLECTIONS.ORDERS), {
      checkoutId,
      orderNumber: generateOrderNumber(orderPrefix),
      stallId,
      tableNumber,
      customerName: customerName || "Guest",
      customerPhone: customerPhone || "",
      items: items.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        instructions: i.instructions || ""
      })),
      subtotal,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await Promise.all(writes);
  sessionStorage.setItem(CHECKOUT_KEY, checkoutId);
  clearCart();
  return checkoutId;
}

export function getLastCheckoutId() {
  return sessionStorage.getItem(CHECKOUT_KEY) || "";
}

const STATUS_STEPS = ["pending", "accepted", "preparing", "ready", "delivered"];

/**
 * Realtime-render the order tracking timeline for a given checkoutId on order-status.html.
 */
export function trackCheckout(checkoutId) {
  const container = document.getElementById("orderStatusContainer");
  if (!container || !checkoutId) return;

  const q = query(
    collection(db, COLLECTIONS.ORDERS),
    where("checkoutId", "==", checkoutId)
  );

  onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `<div class="empty-state"><i class="bi bi-receipt"></i><p>No order found.</p></div>`;
        return;
      }
      const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const stallCache = {};
      for (const order of orders) {
        if (!stallCache[order.stallId]) {
          const stallSnap = await getDoc(doc(db, COLLECTIONS.STALLS, order.stallId));
          stallCache[order.stallId] = stallSnap.exists() ? stallSnap.data().name : "Stall";
        }
      }
      renderOrders(orders, stallCache);
    },
    (err) => {
      console.error(err);
      container.innerHTML = `<div class="alert alert-danger">Unable to load order status.</div>`;
    }
  );

  function renderOrders(orders, stallNames) {
    container.innerHTML = orders
      .map((order) => {
        const isRejected = order.status === "rejected";
        const currentIndex = STATUS_STEPS.indexOf(order.status);
        return `
        <div class="card order-tracking-card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <div>
              <strong>${escapeHtml(stallNames[order.stallId])}</strong>
              <span class="text-muted small ms-2">#${escapeHtml(order.orderNumber)}</span>
            </div>
            <span class="badge ${statusBadgeClass(order.status)}">${capitalize(order.status)}</span>
          </div>
          <div class="card-body">
            ${
              isRejected
                ? `<div class="alert alert-danger mb-3"><i class="bi bi-x-circle me-1"></i>This order was rejected by the stall.</div>`
                : `<div class="order-timeline mb-3">
                    ${STATUS_STEPS.map((step, idx) => `
                      <div class="timeline-step ${idx <= currentIndex ? "done" : ""}">
                        <span class="timeline-dot"></span>
                        <span class="timeline-label">${capitalize(step)}</span>
                      </div>`).join("")}
                  </div>`
            }
            <ul class="list-group list-group-flush mb-2">
              ${order.items
                .map(
                  (item) => `
                <li class="list-group-item d-flex justify-content-between">
                  <span>${item.quantity} x ${escapeHtml(item.name)}</span>
                  <span>${formatCurrency(item.price * item.quantity)}</span>
                </li>`
                )
                .join("")}
            </ul>
            <div class="d-flex justify-content-between fw-bold">
              <span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span>
            </div>
            <div class="text-muted small mt-2">Placed at ${formatDateTime(order.createdAt)}</div>
          </div>
        </div>`;
      })
      .join("");
  }
}
