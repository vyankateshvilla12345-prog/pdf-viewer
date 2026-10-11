# Secure PDF Viewer with Location Gating, Access Tracking, and Admin Dashboard

A security-focused, full-stack application that serves a confidential PDF document strictly upon visitor geolocation approval and short-lived cryptographic session tokens. Includes authoritative Firebase Cloud Firestore audit logging and a protected administrator dashboard.

---

## 1. Architecture Overview

```
                      +------------------------------------------+
                      |         Visitor Web Browser              |
                      +--------------------+---------------------+
                                           |
        +----------------------------------+----------------------------------+
        |                                  |                                  |
   Route: '/'                    Route: '/pdf_00024'               Route: '/home/admin=@'
   (Intentionally Empty,         (Visitor PDF Viewer &             (Administrator Login &
    Zero UI, Zero Expose)         Location Gate)                    Protected Dashboard)
                                           |                                  |
                                 1. Location Prompt                   Firebase Auth Token
                                 2. High-Accuracy Coordinates                 |
                                           v                                  v
                      +------------------------------------------+------------+------------+
                      |               Node.js Express Backend API Perimeter               |
                      |   - Helmet Security Headers      - Sliding-Window Rate Limiter     |
                      |   - CORS Origin Validation       - Session Validation Middleware   |
                      +--------------------+---------------------+------------+------------+
                                           |                                  |
                                           v                                  v
                               POST /api/access/request             GET /api/admin/*
                               - Validate -90..90, -180..180        - Verify Firebase ID Token
                               - Check IP Blocklist                 - Enforce ADMIN_UIDS
                               - Issue 32-byte Session Token                  |
                               - Store SHA-256 Hash Only                      |
                                           |                                  |
                                           v                                  |
                                GET /api/pdf (Bearer Token)                   |
                                - Verify Token Hash & Expiry                  |
                                - Stream server/assets/pdf_00024.pdf          |
                                - Support HTTP 206 Byte Ranges                |
                                           |                                  |
                                           +-----------------+----------------+
                                                             |
                                                             v
                                            +----------------------------------+
                                            |       Firebase Admin SDK         |
                                            |   (Cloud IAM / Datastore User)   |
                                            +----------------+-----------------+
                                                             |
                                                             v
                                            +----------------------------------+
                                            |      Google Cloud Firestore      |
                                            |  - access_logs                   |
                                            |  - viewer_sessions               |
                                            |  - document_stats                |
                                            |  - ip_blocks                     |
                                            +----------------------------------+
```

---

## 2. Complete Folder Structure

```
secure-pdf-viewer/
├── package.json               # Root scripts & unified dependencies
├── package-lock.json          # Root lockfile
├── .gitignore                 # Excludes .env, secrets, build artifacts
├── README.md                  # Complete documentation and setup manual
├── firestore.rules            # Hardened zero-trust Firestore security rules
├── firestore.indexes.json     # Firestore compound query indexes
├── server.ts                  # Unified dev & production full-stack runner
│
├── client/
│   ├── package.json           # Client dependencies
│   ├── index.html             # Client HTML entry point
│   ├── vite.config.js         # Vite config with /api reverse proxy
│   ├── .env.example           # Client public environment template
│   └── src/
│       ├── main.jsx           # React DOM root entry
│       ├── App.jsx            # React Router (/ , /pdf_00024 , /home/admin=@)
│       ├── App.css            # Styles & anti-selection rules
│       ├── firebase.js        # Client Firebase Auth initialization
│       ├── api.js             # API client functions (visitor & admin)
│       ├── routes/
│       │   ├── RootPage.jsx   # Exact empty page (zero UI)
│       │   ├── PdfPage.jsx    # Visitor location gate & PDF viewer
│       │   └── AdminPage.jsx  # Admin audit dashboard & controls
│       ├── components/
│       │   ├── LocationGate.jsx       # Minimal permission gate
│       │   ├── PdfViewer.jsx          # Controlled PDF.js canvas viewer
│       │   ├── AccessDenied.jsx       # Minimal denial notice with retry
│       │   ├── AdminLogin.jsx         # Admin login component
│       │   └── ProtectedAdminRoute.jsx# Auth wrapper with UID gating
│       ├── services/
│       │   └── locationService.js     # Geolocation API wrapper
│       └── utils/
│           ├── security.js            # Screenshot deterrence listeners
│           └── session.js             # In-memory session manager
│
└── server/
    ├── package.json           # Backend dependencies
    ├── server.js              # Express app with Helmet, CORS & routes
    ├── firebase.js            # Firebase Admin SDK initialization
    ├── .env.example           # Server environment template
    ├── middleware/
    │   ├── requireAdmin.js           # Firebase ID token & ADMIN_UIDS check
    │   ├── requireViewerSession.js   # PDF stream token verification
    │   └── rateLimit.js              # In-memory sliding-window limiter
    ├── routes/
    │   ├── access.js          # POST /api/access/request & /heartbeat
    │   ├── pdf.js             # GET /api/pdf (authenticated range stream)
    │   ├── events.js          # POST /api/events (allowlisted event logs)
    │   └── admin.js           # Protected /api/admin/* endpoints
    ├── services/
    │   ├── accessService.js   # Coordinate validation & access policy
    │   ├── sessionService.js  # Token generation, SHA-256 hash & heartbeats
    │   ├── eventService.js    # Authoritative logging & aggregate stats
    │   └── pdfService.js      # Range streaming & path verification
    └── assets/
        ├── .gitkeep
        └── pdf_00024.pdf      # Confidential protected document
```

---

## 3. Exact Route Specifications

| Route | Purpose | Behavior |
|-------|---------|----------|
| `/` | Root website path | **Intentionally blank.** Renders an empty dark page with no UI, no marketing, no navbar, and no redirect. |
| `/pdf_00024` | Visitor PDF Viewer | Shows minimal location permission gate first. Requests location only on user click. Renders PDF.js viewer once verified. |
| `/home/admin=@` | Administrator Dashboard | Protected route requiring Firebase Authentication and server-side verification against `ADMIN_UIDS`. Shows audit telemetry, session revoking, and IP blocks. |
| `*` | Any undefined route | Renders empty not-found state without exposing the document. |

---

## 4. The PDF File Location

The document is read strictly from:
```
server/assets/pdf_00024.pdf
```
- It is **never** placed in `client/public` or bundled into Vite.
- It is **never** accessible via a public static file link.
- Every request to `/api/pdf` requires an active, unexpired session token issued after location validation.

---

## 5. Step-by-Step Setup in Windows PowerShell

### Step 1: Clone and Open Project
Open **Windows PowerShell** and navigate to the project directory:
```powershell
cd secure-pdf-viewer
```

### Step 2: Install Dependencies
Install all workspace dependencies:
```powershell
npm install
```

### Step 3: Configure Server Environment
Create `server/.env` (and `.env` at root):
```powershell
Copy-Item server/.env.example server/.env
Copy-Item server/.env.example .env
```

Edit `server/.env`:
```env
PORT=3000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000

# Firebase Admin SDK Credentials
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-firebase-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# Authorized Administrator UIDs (comma-separated)
ADMIN_UIDS=yourAdminFirebaseUid123

# Security Settings
SESSION_SECONDS=120
MAX_SESSION_SECONDS=600
IP_BLOCK_MODE=forever
LOCATION_REQUIRED=true
TRUST_PROXY=false
LOG_RETENTION_DAYS=30
```

### Step 4: Configure Client Environment
Create `client/.env`:
```powershell
Copy-Item client/.env.example client/.env
```

Edit `client/.env` with your public Firebase web configuration:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-firebase-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_APP_ID=1:123456789:web:...
VITE_API_BASE_URL=/api
```
*(Never put service-account private keys into `client/.env`).*

---

## 6. Firebase Setup & IAM Permissions

1. **Create Firebase Project:** In [console.firebase.google.com](https://console.firebase.google.com/), create a project.
2. **Enable Authentication:** Navigate to **Build > Authentication**, enable **Email/Password** or **Google**. Copy your admin account's **UID** into `ADMIN_UIDS` in `server/.env`.
3. **Create Firestore Database:** Navigate to **Build > Firestore Database**, click **Create database**, select a region, and choose production mode.
4. **Generate Service Account Key:**
   - In Firebase Console, go to **Project settings > Service accounts**.
   - Click **Generate new private key** and download the JSON.
   - Copy `project_id`, `client_email`, and `private_key` into `server/.env`.
5. **IAM Role Configuration:**
   - In [console.cloud.google.com/iam-admin/iam](https://console.cloud.google.com/iam-admin/iam), verify that the service account has the **Cloud Datastore User** (`roles/datastore.user`) role.
   - **Never** assign Owner/Editor or set client security rules to public to bypass errors.

---

## 7. Single Command to Run

Launch both backend and frontend together with one command:
```powershell
npm run dev
```
Open your browser at:
```
http://localhost:3000/pdf_00024
```

---

## 8. Verification & Test Plan

1. **Test Root Route:** Open `http://localhost:3000/`. The page is completely blank.
2. **Test Location Gate:** Open `http://localhost:3000/pdf_00024`. The "Secure Document" gate appears.
3. **Test Denied Location:** Click "Allow location and continue" and click "Block" in the browser dialog. The PDF remains completely hidden and displays "Location permission is required to view this document."
4. **Test Approved Location:** Click "Allow" or "Verify with Authorized Coordinates (Test Mode)". The backend approves access, issues a 120s session token, and PDF.js renders `server/assets/pdf_00024.pdf`.
5. **Test Session Expiration:** Wait for the session countdown to reach `00:00`. The document is instantly purged from memory.
6. **Test Admin Dashboard:** Open `http://localhost:3000/home/admin=@`. Sign in with your configured admin account. View aggregate metrics, real-time audit logs, inspect session timelines, and revoke active sessions.

---

## 9. Security Deterrence & Limitations

- **Context Menu & Copying:** Suppressed via `onContextMenu={(e) => e.preventDefault()}` and `select-none`.
- **Keyboard Shortcuts:** Intercepts `Ctrl+P`, `Cmd+P`, `Ctrl+S`, `Cmd+S`, and `PrintScreen`.
- **Watermark:** Rendered dynamically with the active session ID across canvas pages.
- **Fundamental Limitations:** Browser JavaScript cannot prevent operating-system level screen capture (e.g., Windows Snipping Tool, GPU screen recording, external cameras). True capture prevention requires managed OS hardware with DRM or MDM.

---

## 10. Troubleshooting

### `7 PERMISSION_DENIED: Missing or insufficient permissions`
1. Go to [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam).
2. Locate the service account email matching `FIREBASE_CLIENT_EMAIL`.
3. Ensure it has the **Cloud Datastore User** (`roles/datastore.user`) role.
4. Verify that Firestore is created in the exact same project ID as specified in `FIREBASE_PROJECT_ID`.
5. Ensure `FIREBASE_PRIVATE_KEY` has proper escaped newlines (`\n`) enclosed in quotes.

### `PDF file not found`
Place your actual PDF file at `server/assets/pdf_00024.pdf`.

### `Direct navigation to /pdf_00024 returns 404`
Ensure `server.ts` has SPA fallback routing: `app.use(vite.middlewares)` in development and `res.sendFile('dist/index.html')` in production.
