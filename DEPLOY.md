# Aruba Onboarder — Deployment Guide

## Project Structure

```
aruba-onboarder/
├── index.html          ← React app (single file, all UI)
├── functions/
│   └── proxy.js        ← Cloudflare Pages Function (API proxy)
└── DEPLOY.md
```

## How It Works

The browser never calls HPE APIs directly. All API calls go to `/proxy` on the same Cloudflare domain (no CORS). The Pages Function makes the upstream request server-side and returns the result.

```
Browser → /proxy (Cloudflare Pages Function) → HPE GreenLake / Aruba Central
```

---

## 1. Create a Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages**
2. Choose **"Upload assets"** (direct upload, no Git required)
3. Upload the entire `aruba-onboarder/` folder
4. Cloudflare will auto-detect `functions/proxy.js` and deploy it as a Pages Function at `/proxy`

Alternatively, deploy via the Wrangler CLI:
```bash
npx wrangler pages deploy . --project-name aruba-onboarder --branch production
```
> The `--branch production` flag is required to create a Production deployment (not a Preview). Without it, deploys show as Preview and the custom domain won't update.

---

## 2. Generate HPE API Credentials

1. Log in to [HPE GreenLake](https://common.cloud.hpe.com)
2. Go to **Manage** → **API Gateway** → **Client Credentials**
3. Click **Create Credentials**
4. Give them a name (e.g. `aruba-onboarder`)
5. Copy the **Client ID** and **Client Secret** — you only see the secret once

The credentials inherit the permissions of the user who created them. Ensure that user has device management and Central access.

---

## 3. Configure the App

On first launch, the app will prompt for settings:

| Field | Value |
|-------|-------|
| Client ID | From GreenLake API Gateway |
| Client Secret | From GreenLake API Gateway |
| Cluster / Region | Select the Aruba Central cluster your account is on |

Credentials are stored in `localStorage` (client-side only — never sent anywhere except the `/proxy` endpoint on your own Cloudflare domain). The access token is held in memory only and never persisted.

---

## 4. Onboarding Flow

```
Scan barcode → Device Type → Tags (optional) → Location (optional)
  → Add to GreenLake → Assign Subscription → Assign Application
  → Assign Site (Central) → Assign Function (Central) → Done
```

**Async steps** (GreenLake): Add device, assign subscription, assign application all return `202 Accepted`. The app polls until the operation completes (up to ~30s each). A spinner is shown during polling.

---

## 5. Demo Mode

Toggle **Demo Mode** in Settings to test the full UI flow without any real API calls. All API responses are simulated with realistic data and short delays.

---

## Notes

- The proxy only allows traffic to `sso.common.cloud.hpe.com`, `global.api.greenlake.hpe.com`, and `*.api.central.arubanetworks.com` — all other domains are blocked with a 403.
- China cluster (`cn1.api.central.arubanetworks.com.cn`) is on a separate TLD — if you deploy to China, you may need a separate Cloudflare account/zone in that region.
- Rate limits: GreenLake enforces 25 req/min (POST), 20 req/min (PATCH), 90 req/min (async polling). The app processes one device at a time so this should never be hit.
