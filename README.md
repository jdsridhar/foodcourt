# FoodStreet — QR-Based Multi-Stall Digital Food Ordering System

A production-ready, serverless food-court ordering system. Customers scan a table QR code,
browse every stall's menu, place a single checkout that can span multiple stalls, and track
their order live. Each stall manager sees only their own orders in real time. Admins get full
control over stalls, managers, orders, analytics and system settings.

Built with **HTML5 + CSS3 + Vanilla JavaScript (ES6 modules)** on the frontend and
**Firebase (Firestore, Authentication, Storage, Hosting)** as the entire backend — no custom
server required.

---

## 1. Project Structure

```
FoodStreet/
├── index.html                  Customer landing page (stall listing)
├── customer/
│   ├── menu.html                Stall menu browsing
│   ├── cart.html                Multi-stall cart + checkout
│   └── order-status.html        Live order tracking
├── manager/
│   ├── login.html
│   ├── dashboard.html
│   ├── orders.html
│   ├── menu.html
│   ├── analytics.html
│   └── profile.html
├── admin/
│   ├── login.html
│   ├── dashboard.html
│   ├── stalls.html
│   ├── managers.html
│   ├── orders.html
│   ├── analytics.html
│   └── settings.html
├── css/
│   ├── style.css
│   └── responsive.css
├── js/
│   ├── firebase-config.js
│   ├── common.js
│   ├── auth.js
│   ├── utils.js
│   ├── customer.js
│   ├── cart.js
│   ├── order.js
│   ├── manager.js
│   └── admin.js
├── assets/
│   ├── images/         (placeholder food image)
│   ├── icons/           (favicon)
│   └── logos/           (default logo)
├── sample-data/          (seed script + sample JSON, dev tool only)
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
└── .firebaserc
```

---

## 2. Firebase Project Setup

1. Go to the [Firebase Console](https://console.firebase.google.com) and create a new project.
2. Enable the following products:
   - **Authentication** → Sign-in method → Email/Password
   - **Firestore Database** → Start in production mode (rules are provided below)
   - **Storage**
   - **Hosting**
3. Register a Web App (</> icon) inside Project Settings → General → Your apps.
   Copy the generated `firebaseConfig` object.
4. Paste it into [`js/firebase-config.js`](js/firebase-config.js), replacing the placeholder
   `firebaseConfig` values (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`).
5. Update [`.firebaserc`](.firebaserc) with your real Firebase project ID.

---

## 3. Firestore Data Model

| Collection   | Document shape |
|--------------|-----------------|
| `users`      | `{ name, email, role: "manager"\|"admin", stallId?, disabled, createdAt }` — doc id = Firebase Auth UID |
| `stalls`     | `{ name, description, logoUrl, status: "active"\|"inactive" }` |
| `menuItems`  | `{ stallId, name, category, price, description, imageUrl, available }` |
| `orders`     | `{ checkoutId, orderNumber, stallId, tableNumber, customerName, customerPhone, items: [{itemId,name,price,quantity,instructions}], subtotal, status, createdAt, updatedAt }` |
| `settings`   | Single doc `foodStreetSettings`: `{ foodStreetName, logoUrl, currency, taxPercent, orderPrefix }` |

A single customer checkout that includes items from multiple stalls creates **one order
document per stall**, all sharing the same `checkoutId` — this is how each stall manager only
ever sees their own orders while the customer can still track everything as one order.

---

## 4. Deploying Security Rules

Install the Firebase CLI once: `npm install -g firebase-tools`

```bash
firebase login
firebase use --add            # select your project, alias "default"
firebase deploy --only firestore:rules,firestore:indexes,storage
```

The provided [`firestore.rules`](firestore.rules) enforce:
- Anyone (no login) can **read** stalls, menu items and settings, and **create** an order —
  required because customers never authenticate.
- Only the assigned stall manager (or admin) can update/delete their stall's menu items and
  advance/reject orders for their stall.
- Customers can never edit an order after submission (no update permission).
- Admin has full read/write access everywhere.

---

## 5. Creating the First Admin Account

Client-side Firebase has no way to create a user without also signing in as them, so the
**first** admin account must be created manually:

1. Firebase Console → Authentication → Users → Add user (email + password).
2. Firestore Console → `users` collection → create a document with that user's **UID** as the
   document ID, containing:
   ```json
   { "name": "Super Admin", "email": "admin@yourdomain.com", "role": "admin", "disabled": false }
   ```
3. Log in at `admin/login.html` with that email/password.

Once logged in, the admin can create every subsequent **manager** account directly from
`admin/managers.html` (Admin → Manage Managers → Create Manager) — no console access needed
after this bootstrap step.

Alternatively, run the provided [`sample-data/seed.js`](sample-data/seed.js) script (see below)
which creates a ready-to-use admin + manager account automatically.

---

## 6. Sample Data

The `sample-data/` folder contains sample stalls, menu items, and global settings, plus a
Node.js seeding script (`seed.js`) that uses the Firebase **Admin SDK** to populate everything
in one shot, including a test admin and manager login. This script is a one-time local dev
utility — it is never deployed and is not part of the running web app.

```bash
cd sample-data
npm install firebase-admin
# Download a service account key (Firebase Console -> Project Settings -> Service Accounts)
# and save it as sample-data/serviceAccountKey.json
node seed.js
```

This creates:
- 4 sample stalls (Pizza Point, Burger Barn, Juice Junction, Noodle House)
- 9 sample menu items across those stalls
- Global settings (name, currency ₹, 5% tax, order prefix `FS`)
- **Admin login:** `admin@foodstreet.test` / `Admin@123`
- **Manager login:** `manager.pizza@foodstreet.test` / `Manager@123` (assigned to Pizza Point)

**Change these passwords immediately after first login.**

---

## 7. Generating Table QR Codes

Each table's QR code should simply encode a URL like:

```
https://your-domain.web.app/index.html?table=12
```

Use any free QR generator (e.g. `qrcode` npm package, or an online QR generator) to turn that
URL into a printable QR code per table. When scanned, `index.html` captures `?table=12` into
`sessionStorage` and carries it through menu browsing, cart, checkout and order tracking
automatically (see [`js/customer.js`](js/customer.js) `captureTableNumber()`).

---

## 8. Running Locally

Because the app uses ES module imports (`<script type="module">`), it must be served over
HTTP(S), not opened directly as a `file://` path. Options:

```bash
# Firebase Hosting emulator (recommended, matches production)
firebase emulators:start --only hosting

# OR any static file server
npx serve .
```

Then open `http://localhost:5000` (or whatever port your server prints).

---

## 9. Deploying to Firebase Hosting

```bash
firebase deploy --only hosting
```

Your app will be live at `https://<your-project-id>.web.app`.

---

## 10. Feature Checklist

- ✅ QR-based table detection, carried through the entire session
- ✅ No login required for customers; browse, search, filter, multi-stall cart, checkout
- ✅ Realtime order tracking with a visual status timeline (Firestore `onSnapshot`)
- ✅ Stall Manager: dashboard KPIs, order lifecycle management, full menu CRUD with image
  upload, availability toggle, analytics, stall profile + password change
- ✅ Admin: system-wide dashboard, stall CRUD + activate/deactivate, manager account creation
  (via isolated secondary Firebase App instance) + password reset + disable/delete, all-orders
  view with search/filter/pagination/CSV export, system analytics, global settings
- ✅ Form validation everywhere (required fields, email, phone, price, quantity, image
  type/size) with Bootstrap validation styling
- ✅ Toast notifications, loading overlay, skeleton loading states, confirmation modals
- ✅ Fully responsive (desktop / tablet / mobile) with a dedicated `responsive.css`
- ✅ Firestore security rules enforcing per-role, per-stall access control
- ✅ Firebase Storage rules for menu images, stall logos and the site logo

---

## 11. Notes & Trade-offs

- Orders are readable by anyone (`allow read: if true` in `firestore.rules`) because customers
  are never authenticated and need to track their own order by `checkoutId`. No sensitive data
  (payment info, etc.) is stored in an order document.
- Deleting a manager's Firestore profile from `admin/managers.html` does **not** delete their
  Firebase Authentication login (client SDKs cannot delete other users' auth accounts). Remove
  the login separately from the Firebase Console, or upgrade to Cloud Functions with the Admin
  SDK if you need this automated.
