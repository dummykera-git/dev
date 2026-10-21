# CM Filings — Client + Admin Compliance Workspace

A Vite + React + TypeScript app prepared from the partial ZIP, using Firebase Authentication/Firestore/Storage, Lucide React icons throughout, and a Google Gemini / Google Sans-inspired responsive interface. No Hercules runtime or dependencies are used.

## Run locally

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and add your Firebase web-app config values.
3. In Firebase Console, enable **Authentication → Google** and add your local/deployed domains under Authorized domains.
4. Run `npm install`, then `npm run dev`.
5. For a production build, run `npm run build`.

## Deploy to GitHub Pages

For simplest SPA routing, deploy to Firebase Hosting (recommended) or configure GitHub Pages with a SPA fallback. For GitHub Pages, set Vite `base` to your repository path and add a 404 fallback. Firebase Hosting supports rewrites to `/index.html` directly.

## Firebase setup / security

- Register a Firebase Web App and populate `.env` from `.env.example`. Never commit `.env` to GitHub.
- Set the admin UID in `firestore.rules` and `storage.rules` to the actual Firebase Authentication UID. Do not assign admin based only on a client-editable Firestore field.
- Publish rules from Firebase Console or Firebase CLI. Test rules with the Firebase Rules Playground / Emulator before using real client tax data.
- Create an admin's `users/{uid}` document with `role: "admin"` using a trusted admin process or console. The app reads this role to display admin navigation; Firestore rules independently enforce authorization.
- Client profiles live in `users/{uid}`; admin directory reads from `clients`; compliance rows from `filings`; document metadata from `documents`; requests from `requests`; payment metadata from `payments`.
- For client-specific filing/document/request reads, records must contain `clientId` equal to the client's Firebase Auth UID. Do not store passwords, card details, Aadhaar copies, or unnecessary sensitive information in app fields.
- Upload controls and AI assistant are UI scaffolds until Storage upload metadata workflows and a secure server-side AI endpoint are connected. Do not put an AI API key in frontend code.

## Notes about the imported partial code

The original ZIP referenced missing routes, layout, providers and hooks, so this package replaces the broken entry point with a complete standalone app shell while retaining the compliance dashboard direction and its existing deadline sample data. Demo sample rows are local placeholders until Firebase data is available. Admin writes use Firestore only when the signed-in user is authorized by the rules.
