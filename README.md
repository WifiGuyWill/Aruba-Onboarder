# HPE Networking — Aruba Device Onboarder

A mobile-friendly web app for onboarding HPE Aruba network devices into GreenLake and provisioning them in Aruba Central — all in a guided, step-by-step flow.

**Live at:** [onboard.wifi-guys.com](https://onboard.wifi-guys.com)

---

## What It Does

Scan a device's serial number and MAC barcodes, then follow the guided steps to:

1. Register the device in HPE GreenLake
2. Assign a subscription
3. Assign to an application (Aruba Central or UXI)
4. Configure site and function in Aruba Central
5. Apply tags and location
6. Review and confirm — the app handles all API calls

Supports new devices and existing devices already in GreenLake.

---

## Tech Stack

| Layer | Details |
|---|---|
| Frontend | Single-file React app (`index.html`) with JSX transpiled in-browser by Babel |
| Styling | Tailwind CSS (CDN) |
| Hosting | Cloudflare Pages |
| Proxy | Cloudflare Pages Function (`/functions/proxy.js`) — handles CORS for HPE API calls |
| Auth | HPE GreenLake OAuth2 (unified token for both GreenLake and Aruba Central) |
| Scanning | `Html5Qrcode` — multi-scan confirmation, auto-detects S/N vs MAC by prefix and format |

There is no build step. The entire app is one HTML file — edit and deploy.

---

## Getting Started

### What You'll Need

- HPE GreenLake **Client ID** and **Client Secret**
  - Generate in GreenLake → API Gateway → Client Credentials
- HPE GreenLake **Workspace ID**
  - Found in GreenLake → Manage → Workspace Details

### First Launch

On first open the app shows a welcome screen, then takes you to **Settings** to enter your credentials. Once saved, you're ready to scan.

---

## Privacy & Security

- Credentials are stored in **browser local storage only** — never sent to or stored on any server
- API calls are routed through a lightweight Cloudflare proxy for browser compatibility (CORS) — nothing is logged or stored server-side
- All provisioning changes are shown on a **Review & Confirm** screen before any API calls are made

---

## Deploying

The app is deployed via [Cloudflare Pages](https://pages.cloudflare.com). To deploy your own instance:

```bash
npm install
npx wrangler pages deploy . --project-name your-project-name
```

See `DEPLOY.md` for full deployment notes.

---

## Demo Mode

Enable **Demo Mode** in Settings to simulate the full onboarding flow without making any real API calls. Useful for testing and walkthroughs.

---

## Disclaimer

This is an independent tool — not affiliated with, endorsed by, or supported by HPE, Aruba, Aruba Central, or HPE GreenLake.

Built by [@WifiGuyWill](https://github.com/wifiguywill)
