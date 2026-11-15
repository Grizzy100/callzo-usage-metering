# Task 2: Usage Admin Console UI

An enterprise-ready, accessible, and resilient administration console for managing customer telephony accounts and monitoring usage. Built with **React 19, Tailwind CSS, Recharts, and Vite**.

---

## 🚀 Quick Start (Docker)

To run the complete frontend console together with the provided mock API:

```bash
cd client
docker compose up
```

The submitted frontend image targets AMD64/x86-64. The provided mock API image
is ARM64-only, so AMD64/x86-64 Docker hosts must enable ARM64 emulation once:

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker run --rm --platform linux/arm64 alpine uname -m
```

The verification command should output `aarch64`. The frontend runs natively;
only the mock API uses emulation.

- **Frontend Console**: Open [http://localhost:3000](http://localhost:3000)
- **Mock API**: Accessible at [http://localhost:8001](http://localhost:8001)

Inside the Docker network, the production frontend server (`frontend-server.js`) serves static assets and reverse-proxies `/api/*` directly to `http://mock-api:8001`, ensuring seamless communication without CORS or host-resolution issues.

---

## 🏛️ State Architecture: Where State Lives & Why

The application strictly categorizes state into three tiers:

### 1. Server State
- **What**: Account records, pagination totals, usage summaries, and saved settings drafts.
- **Where**: Lives on the server (mock API).
- **Why**: The server is the canonical source of truth. Background data drifts dynamically every 30 seconds; caching it permanently on the client would create stale state anomalies.

### 2. Client State
- **What**:
  - `selectedAccountIds`: A JavaScript `Set` of selected account IDs across pages.
  - `dateRange`: The active reporting window (`from` and `to`), shared between the Summary Chart and Accounts Table.
  - Form drafts, in-progress step inputs, and field-level validation errors in `AccountSettings`.
  - UI toggles (sidebar drawer, theme preference, chart metric tabs).
- **Where**: Lifted to top-level React component state (`App.jsx` and pages).
- **Why**:
  - **Stable Selection Across Pages**: Storing `selectedAccountIds` in parent state guarantees selections remain stable when the user navigates between Page 1 and Page 2, when 30-second background polling refreshes data, and even when inspecting an account in Settings and returning.
  - **Zero-Flicker Synchronized Date Filtering**: Keeping `dateRange` in parent state allows the date-range picker on the Accounts page to update **both** the Summary Chart and the Accounts Table simultaneously without a full page reload.

### 3. URL / Query State
- **What**: Active resource routes and clean API query construction (`page`, `page_size`, `search`, `status`, `plan`, `country`, `date_from`, `date_to`, `sort_by`, `sort_dir`).
- **Where**: Constructed dynamically via `URLSearchParams` and synchronized via browser history.
- **Why**: Allows deterministic, bookmarkable API requests and browser-native back/forward handling.

---

## ✂️ What We Cut & Why

To maintain code clarity, taste, and strict compliance with the assessment guidelines:

1. **Third-Party State Managers & Routing Libraries (Redux, Zustand, React Router)**:
   - **Reason**: The specification strictly mandates: *"Stack: React + Tailwind + any chart library of your choice. Do not use any other library beyond these."*
   - Rather than bundling unauthorized npm dependencies, we used clean, native React primitives (`useState`, `useCallback`, `useMemo`, `useRef`, `AbortController`). This avoids bloat, eliminates external vulnerabilities, and keeps the code lightweight and easy to review.
2. **Heavy Component / UI Frameworks (Radix, HeadlessUI, Lucide)**:
   - **Reason**: Standardized on semantic HTML, accessible Tailwind classes, and clean SVG icons. Every component was hand-crafted to meet the design specification with zero extraneous abstractions.
3. **Optimistic Local Settings Commits**:
   - **Reason**: The mock API purposefully enforces complex server-side validation rules across steps. Applying optimistic local updates before server confirmation would mislead users if the server rejected the payload. Instead, drafts are autosaved upon step navigation with clean rollback if rejected.

---

## 🛡️ Handling Deliberate Mock API Behaviors

### 1. Random 1-in-5 HTTP 500 Errors on `/accounts/summary`
- The endpoint intentionally fails ~20% of the time to test UI resilience.
- **Handling**:
  - The failure is isolated to the `UsageChart` component.
  - An inline error state with a dedicated "Try again" button is displayed inside the chart container.
  - **The rest of the page remains 100% operational**: The accounts table, search, filters, pagination, and settings continue working without interruption.

### 2. Step 2 `billing_country` Rejection After Step 4 is Saved
- Once Step 4 exists for an account, Step 2 begins rejecting `billing_country` with `"billing_country is required"`.
- **Handling**:
  - In `AccountSettings.jsx`, the API rejection handler inspects `error.data.detail.step`.
  - When the server reports an error belonging to an earlier step, the wizard automatically sets `currentStep = errorStep`, maps the error dictionary directly to the input fields on that step, and presents a clear notification banner: *"The server rejected this step. Review the highlighted fields."*
  - **Clean Rollback**: Failed fields roll back to their last-saved draft (`savedFormRef`), ensuring unsaved invalid edits do not corrupt other steps or get the user permanently stuck.

---

## ✨ Features & Polish

- **Stable Multi-Row Selection**: Dedicated checkbox column with "Select all on page", row click toggles, indeterminate state, selection counters, and cross-page persistence.
- **Network Optimization via `AbortController`**: Rapid keystrokes or pagination clicks cancel pending in-flight requests, eliminating race conditions.
- **Seamless 30-Second Refresh**: Automatic background polling updates records in place without layout shifts, scroll jumps, or losing selection.
- **Full Keyboard Accessibility**: All controls use native `<button>`, semantic `<label htmlFor="...">`, `aria-label`, `aria-sort`, and focus indicators.
- **Responsive at 375px**: Fully tested on mobile viewports with horizontal table scroll containment, collapsible mobile drawer, and stacked filter grids.
