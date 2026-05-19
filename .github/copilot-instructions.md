# HPE Networking Device Onboarder — Copilot Instructions

## What this app does
A mobile-first progressive web app for field technicians to onboard HPE Aruba networking devices (APs, switches, gateways) into **HPE GreenLake** and provision them in **Aruba Central**. The user scans device barcodes (serial number + MAC address), walks through a guided workflow to assign subscriptions, locations, sites, and hostnames, then the app handles all the API calls automatically.

There are two modes:
- **Single device mode** — scan one device, step through each provisioning screen
- **Batch mode** — scan multiple devices into a queue first, then provision them all together with shared settings per device group

Live at: **https://onboard.wifi-guys.com/**  
Repo: **https://github.com/WifiGuyWill/Aruba-Onboarder**  
Deployed via: Cloudflare Pages (`--branch production` for production, `--branch main` for preview only)

---

## Architecture — critical to understand

**Single file app.** Everything — React components, API layer, styles — lives in `index.html`. There is no build step, no npm, no bundler. React and Babel run in the browser via CDN. Tailwind is loaded via CDN script tag.

```
index.html        ← entire application (4000+ lines)
functions/
  proxy.js        ← Cloudflare Pages Function: proxies all API calls to avoid CORS
.github/
  copilot-instructions.md
```

**In-browser Babel** means JSX is transpiled at runtime. All code is in a single `<script type="text/babel">` block.

**No state management library.** React `useState` + `useCallback` + `useRef` only. Settings persisted to `localStorage` under key `aruba_cfg2`.

**All API calls go through `/proxy`** (the Cloudflare Pages Function in `functions/proxy.js`). Direct browser-to-API calls would be blocked by CORS. The proxy is a simple pass-through — it does not log or store anything.

---

## Key constants and utilities

```javascript
const GL_BASE = 'https://global.api.greenlake.hpe.com';
const TOKEN_URL = 'https://sso.common.cloud.hpe.com/as/token.oauth2';
const unifiedTokenUrl = workspaceId =>
  `https://global.api.greenlake.hpe.com/authorization/v2/oauth2/${workspaceId}/token`;
```

**`proxyCall({ url, method, token, body })`** — all API traffic goes here. Returns a raw `Response` object (not parsed JSON). Callers must check `res.ok` and call `res.json()` or `res.text()` themselves.

**`parseApiError(raw)`** — detects HTML error pages (CloudFront 403s etc.) returned instead of JSON and converts them to readable messages. Always use this when surfacing error text to users.

**`parseBarcode(raw)`** — parses barcode strings into `{ serial, mac }`. Handles multiple vendor formats.

**`fetchToken(clientId, clientSecret, label, tokenUrl, useBasicAuth)`** — fetches an OAuth2 client_credentials token. The unified endpoint (workspace-scoped) requires `useBasicAuth: true`.

**`pollAsync(operationUrl, token)`** — polls an async operation URL until complete (used after GL device add/patch operations that return 202 + Location header).

---

## Authentication flow

Users provide:
- **GreenLake Client ID + Client Secret** — generated in GreenLake → API Gateway → Client Credentials
- **Workspace ID** — found in GreenLake → Manage → Workspace Details

The **unified token endpoint** (workspace-scoped) generates a single token that works for both GreenLake APIs and Aruba Central (New Central). This token is cached in `glTokenRef` with expiry tracking and auto-refreshed on every `enterScreen()` call.

Token never expires from the user's perspective — Client ID/Secret don't expire, and the app auto-renews the access token silently.

**Credential validation** happens when the user taps Save in Settings (non-demo mode):
1. Fetch a token → validates Client ID + Secret
2. `GET /devices/v1/devices?limit=1` → validates Workspace ID + permissions
3. Shows inline pass/fail on the Settings screen before navigating away

---

## API layer — `liveApi` vs `demoApi`

```javascript
const api = settings.demoMode ? demoApi : liveApi;
```

`liveApi` contains all real API functions. `demoApi` mirrors the same interface with simulated responses and artificial delays — no real network calls. The rest of the app only ever calls `api.*` and never cares which one it's using.

### Key `liveApi` functions
| Function | What it does |
|---|---|
| `glAddDevice` | POST to add device to GL; if conflict/exists, falls back to GET lookup and returns `foundExisting: true` |
| `glLookupDevice` | GET device by serial — returns current subscription, application, location, contact |
| `glListSubscriptions` | List available subscriptions filtered by device type |
| `glListApplications` | List available applications (Aruba Central instances) |
| `glListLocations` | List GL locations |
| `glListUsers` | List workspace users (for contact assignment) |
| `glPatchSubscription` | PATCH to assign subscription to device |
| `glPatchApplication` | PATCH to assign application to device |
| `glPatchLocation` | PATCH to assign location to device |
| `centralGetDeviceSiteId` | GET device's current site assignment from Central |
| `centralAssignSite` | POST to assign device to a site in Central |
| `centralSetFunction` | POST to set device persona (AP, switch, gateway) |
| `centralSetHostname` | POST/PATCH device hostname in Central |

---

## Single device screen flow

```
boot → welcome (first run only)
     → settings (if no credentials)
     → scan → tags → location → contact → adding_gl → [device_type] →
       subscription → application → site → function → hostname → review → success
```

`enterScreen(next)` handles every transition — it refreshes the GL token and updates `liveSettings` before rendering the next screen. `summary` state object accumulates all selections throughout the flow.

**Existing device handling** — `glAddDevice` detects conflicts and returns `{ ...device, foundExisting: true }`. All selection screens accept `initialKey` / `initialId` props and pre-select the currently assigned value. The ReviewScreen skips PATCH calls where the selection is unchanged from the current assignment.

---

## Batch mode screen flow

```
scan (BatchScanScreen — home screen) →
  batch_tags → batch_location → batch_contact → batch_adding_gl →
  [per device-type group loop: batch_subscription → batch_function] →
  batch_application → batch_site → batch_hostname → batch_review →
  batch_provisioning → batch_success
```

In batch mode, the scan screen IS the home screen (no progress bar shown). Devices are grouped by type (AP / Switch / Gateway) for subscription and function assignment. `batchGroups` and `batchGroupIdx` state track which group is being configured.

When `settings.batchMode` is true, the main App renders `BatchScanScreen` directly at the `scan` screen instead of `ScanScreen`.

---

## Settings stored in localStorage (`aruba_cfg2`)

```javascript
{
  glClientId, glClientSecret, workspaceId,  // GreenLake credentials
  centralCluster,                            // e.g. 'eu1', 'us1' etc — maps to Central API URL
  demoMode,    // boolean — bypass all API calls
  scanConfirm, // boolean — show 4s confirmation overlay after each scan (default: true)
  batchMode,   // boolean — batch scan home screen instead of single device
}
```

---

## Camera / barcode scanning

Uses **html5-qrcode v2.3.8** (`Html5Qrcode` class, div id `qr-reader-div`).

**Critical quirk:** The library sets inline `style` attributes (height, width) directly on the video element that override CSS `max-height` constraints. CSS rules target `#qr-reader-div` (not `#qr-reader` — that's the wrong ID). The `BarcodeScanner` component wrapper has `h-full overflow-hidden` so the parent container controls the visible height and clips the library's oversized video.

The scan confirmation overlay (`SCAN_CONFIRM_MS = 4000ms`) requires the same value to be decoded N consecutive times before accepting — prevents false positives from partial barcode reads.

---

## UI patterns

- **Dark theme** throughout (`#111827` background)
- **Tailwind CDN** — utility classes only, no config file
- Reusable primitives: `Btn`, `Card`, `Toggle`, `TextInput`, `SelectInput`, `ErrorBanner`
- `step-enter` CSS class adds slide-in animation on screen transitions
- Scroll-to-top `useEffect([screen])` — sticky header would cover content otherwise
- `100dvh` (dynamic viewport height) used instead of `100vh` for iOS Safari compatibility
- `whitespace-nowrap` required on badge/pill elements to prevent wrapping on small screens

---

## Deployment

```bash
# Deploy to production
npx wrangler pages deploy . --project-name aruba-onboarder --branch production

# Deploy preview only (does NOT update production URL)
npx wrangler pages deploy . --project-name aruba-onboarder --branch main
```

Build tag in HTML comment on line 2 (`build:YYYYMMDD[letter]`) — increment the letter on each deploy within a day for cache-busting.

---

## Open feature backlog (GitHub Issues)

| Issue | Feature | Notes |
|---|---|---|
| [#4](https://github.com/WifiGuyWill/Aruba-Onboarder/issues/4) | Provisioning Profiles / Presets | Save named combos of subscription + application + site + function; apply in one tap. Store in localStorage. |
| [#5](https://github.com/WifiGuyWill/Aruba-Onboarder/issues/5) | Device Lookup / Status Check | After scan, if device exists offer a read-only status view pulling data from both GL and Central APIs (site, persona, connectivity, firmware, client count). |
| [#6](https://github.com/WifiGuyWill/Aruba-Onboarder/issues/6) | Partial Failure Recovery | If provisioning fails mid-flow, show which steps succeeded vs failed and allow retry of failed steps only. |
| [#8](https://github.com/WifiGuyWill/Aruba-Onboarder/issues/8) | Configurable Workflow Steps | Per-step toggles in Settings to hide unused screens (e.g. Tags, Contact) from the workflow entirely. |

---

## Known gotchas and decisions

- **`liveSettings` vs `settings`** — `liveSettings` is rebuilt on every token refresh and can lose non-credential fields. Route/conditional logic must key off `settings.*` (canonical React state), not `liveSettings.*`.
- **Async GL operations** — many GL API calls (device add, subscription PATCH, location PATCH) return `202 Accepted` + a `Location` header pointing to an async operation. Must poll that URL until complete.
- **Central hostname API** — requires the device to already be in New Central with a site assigned. Uses POST if no hostname exists, PATCH if one does. Scoped to the Central account via `_scopeId`.
- **Subscription `_subKey`** — the subscription identifier used for pre-population comes from a custom `_subKey` field extracted from the device response, not from a standard field name.
- **GL device type mapping** — `GL_DEVICE_TYPE_MAP` maps GL API type strings to internal types (`AP`, `SWITCH`, `GATEWAY`, `UXI`). UXI devices skip the Central steps entirely.
- **Cloudflare Analytics** — beacon token `a286dbfa6161402e86906611bf9e9782` is in the `<head>`. Do not remove.
- **Mobile-first priority** — all UI decisions favour iOS Safari on iPhone. Test camera and layout changes on real mobile hardware.
