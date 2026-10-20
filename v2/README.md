# COREBIQ Material 3 PWA Dashboard

## Included
- Responsive Gemini / Material 3-inspired dashboard with desktop sidebar, sticky header, quick actions, KPI cards, charts, activity and reminder panels.
- Responsive mobile bottom navigation and slide-in sidebar.
- Lucide icons loaded from CDN.
- Shared `style.css` and `app.js`.
- `firebase-config.js` placeholder.
- `manifest.webmanifest` and `service-worker.js`.
- One HTML page for every module, with filenames matching the requested names.

## Assets
Place your actual image files at:
- `assets/logo.png` — logo / app icon / favicon
- `assets/name.png` — wordmark used in the header and mobile header

If those files are not supplied, the layout still loads; add the image assets before publishing.

## Firebase
Open `firebase-config.js` and replace the placeholder values with your Firebase project settings. This file only stores configuration; it does not initialize authentication or connect Firestore by itself. Add Firebase SDK imports and your database logic to the relevant module pages. Keep Firestore rules restricted to authenticated authorized users; never rely on client-side UI to enforce admin access.

## Deploy / PWA
Serve over HTTPS (or localhost during development). Open `index.html` or `dashboard.html`. For a production deployment, test the service-worker cache after each version update and bump `CACHE_NAME` in `service-worker.js` when the app shell changes.

## Module pages
`dashboard.html`, `crm.html`, `accounts.html`, `employees.html`, `gst.html`, `inventory.html`, `settings.html`, `data.html`, `tools.html`, `report.html`, `notification.html`, `users.html`, `about-app.html`, `templates.html`, `biq-ai.html`, `payment-gateway.html`, `more.html`.
