# Changelog

All notable changes to the HPE Aruba Device Onboarder are documented here.

---

## [Unreleased]

---

## [2026-06-04] — Scanner Confirmation Default Off

### Changed

- **Scan Confirmation default: enabled → disabled** — the green flash, ✓ checkmark, and duplicate-scan guard make the confirmation overlay redundant for most users. Toggle remains in Settings for those who prefer it.
- **Options badge** — "No confirm" chip removed (off is now the default). Badge only appears for non-default states: "Confirm on" when explicitly re-enabled, "Batch" when batch mode is active.

---

## [2026-06-04] — Scanner UX Improvements

### Added

- **Audio feedback** — short 1800Hz beep via Web Audio API fires on every successful scan (iOS + Android)
- **Haptic feedback** — `navigator.vibrate(50)` pulse on successful scan (Android)
- **Success animation** — green flash + ✓ checkmark overlaid on the scan box for 600ms
- **On-screen guidance** — "Hold 6–12 inches away · steady · good lighting" shown below the camera window
- **Reads Required setting** — new 1 / 2 / 3 selector in Settings → Scan Options (default 2) replacing the hardcoded confirm threshold; persisted to localStorage; applies to both single-scan and batch mode

### Changed

- `patchSize`: `medium` → `small` for finer detail sampling on dense 1D barcodes
- ROI area top/bottom: `40%` → `45%` — tighter match to the green box overlay
- Torch button moved to top-right to clear guidance text area
- README: tech stack updated from `Html5Qrcode` to `Quagga2`; Device Status / Check Status flow documented

### Internal

- Closes issue #14
- Build: `20260604b`

---

## [2026-06-04] — Barcode Scanner Overhaul

### Changed

- **Replaced `html5-qrcode` with `@ericblade/quagga2`** — Quagga2 is purpose-built for 1D barcodes (Code 128 / Code 39) and resolves field reports of needing to hold the device ~1 inch from the label to get a reliable scan. Normal working distance (6–12 inches) now works reliably.

### Added

- **Region of interest (ROI)** — decode area locked to the green box overlay (`area: 40% top/bottom, 5% left/right`). Adjacent barcodes on Aruba labels no longer accidentally trigger.
- **Torch/flashlight toggle** (`💡`) — appears bottom-right of the camera view on devices that support it. Useful in server rooms and low-light environments.
- **Duplicate scan guard** — once a MAC is captured the scanner ignores further MAC scans until the serial is read, and vice versa. Implemented via ref (not state) to avoid stale closure issues. Resets after each device pair in batch mode.

### Fixed

- **1920×1080 camera resolution** requested at startup — more pixels per barcode at normal distance
- **Camera window height** reduced to 200px so the confirmation UI is visible without scrolling
- **Confirm threshold** reduced 3 → 2 consecutive reads for faster acceptance
- **Decode rate** increased 20 → 30 fps for more attempts per second

### Internal

- Closes issue #12
- Build: `20260604`

---

## [2026-06-03] — Active Alerts on Device Status Screen

### Added

- **Alerts card on Device Status screen** — displays active alerts from Aruba Central when a device is online
  - Severity colour-coded: Critical (red), Major (orange), Minor (yellow), Warning (indigo)
  - Header escalates to red if any Critical alert is present; green ✅ when no active alerts
  - Shows alert name, summary text, category, and timestamp
- **Cleared & Deferred alerts — lazy load** — "View cleared & deferred alerts" button below the active alerts card fetches history on demand
  - Cleared and Deferred fetched in parallel, merged, and sorted by date descending
  - Status label (Cleared/Deferred) and `cleared_reason` shown when present
  - Client-side filtered by device name matched against Central alert summary text
- **Demo mode support** — `EXIST*` serials return 2 sample active alerts + 1 cleared alert

### Fixed

- **400 error on all alert calls** — Central API requires lowercase sort direction (`severity asc` not `ASC`)
- **Alerts endpoint** — `network-notifications/v1/alerts` is only available on `internal.api.central.arubanetworks.com`; cluster-specific URLs (e.g. `de1`, `gb1`) return empty results for this endpoint
- **Cleared alerts returning incomplete results** — removed `deviceType` filter from Cleared/Deferred calls; Central returns a subset when device type is applied to historical alerts
- **History showing all site alerts** — added client-side filtering by `deviceName` (from `stats.name`) matched against the alert `summary` field
- **Wrong timestamp field name** — fixed `createdAt` → `created_at` to match actual API response shape
- **Alerts fetched before device name available** — moved alerts fetch to after `centralGetDeviceStats` resolves so `stats.name` is available for accurate device matching

### Internal

- New `centralGetDeviceAlerts({ deviceType, siteId, centralToken, centralUrl, status })` API method
- New `AlertsCard` React component — self-contained with its own lazy-load state for history
- URL encoding uses `encodeURIComponent` (RFC 3986 `%20`) rather than `URLSearchParams` (`+`) for OData filter compatibility
- Build: `20260603`

---

## [2026-05-21] — Device Status Lookup & Internal Cluster Fixes

### Added

- **Device Found / Device Status flow** — after scanning a device that already exists in GreenLake, the app now offers two paths:
  - **View Status** — full live stats screen for the device (AP, Switch, or Gateway)
  - **Update Device** — re-enter the provisioning flow to update subscriptions, site, function, etc.
- **Device-type-specific status screens** — AP, Switch, and Gateway each have a tailored stats layout showing relevant radio, port, CPU/memory, and uptime data
- **Gateway normalizer** (`normalizeNetMonGateway`) — maps internal cluster network-monitoring API response fields to the standard shape used by the stats UI
- **Switch normalizer** (`normalizeNetMonSwitch`) — same normalization for switch devices on the internal cluster
- **AP internal cluster normalizer** (`normalizeNetMonAp`) — NRM fallback for APs on internal Central clusters
- **Back button** on the Device Found screen
- **GreenLake Assignments section** on `DeviceStatusScreen` — shows resolved names for Subscription, Application, Location, and Device Function
- **Device Found screen** now resolves and displays the current Subscription tier name, Application name, Site name, and Location name (all fetched by ID, not shown as raw UUIDs)

### Fixed

- **Hostname update 400 error on internal/new Central clusters** — internal Central uses a YANG model where hostname must be nested inside a `profile` container. `centralSetHostname` now sends `{ profile: [{ name: profileName, hostname }] }` first, with fallback to the flat `{ hostname }` body for standard Central clusters. Profile names: Switch → `sys-system-info-profile`, others → `default_sys_info`
- **GreenLake location showing as raw UUID** — fixed for AP, Switch, and Gateway. Both `DeviceFoundScreen` and `DeviceStatusScreen` now resolve the location ID to a human-readable name via `GET /locations/v1/locations/{id}`
- **Device function not resolving on preview / internal cluster** — `centralGetDeviceSiteId` was calling the NRM config endpoint (`/network-config/v1alpha1/devices`) which returns `persona: "None"` for most devices. Switched to the network-monitoring devices endpoint (`/network-monitoring/v1alpha1/devices`) which reliably returns human-readable persona labels (e.g. "Campus Access Point", "Mobility Gateway")
- **`persona: "None"` sentinel** — added explicit handling to treat the literal string "None" / "NONE" as null rather than passing it downstream
- **`DEVICE_FUNCTION_LABEL_TO_PERSONA` mapping expanded** — added entries for human-readable labels returned by the monitoring devices endpoint (e.g. "campus access point" → `CAMPUS_AP`, "mobility gateway" → `MOBILITY_GW`)
- **Subscription tier name not resolving on DeviceStatusScreen** — fixed to fetch tier display name from the subscriptions API
- **Client count field mapping** — corrected for internal cluster NRM response shape
- **`ipv4`, `siteName`, `mac`, `deployment` field mapping** — corrected for internal cluster NRM response shape differences
- **GreenLake existence check** — moved to fire immediately after serial scan for faster flow

### Internal

- All Central API traffic for device lookup and stats uses the network-monitoring endpoint (`/network-monitoring/v1` or `/network-monitoring/v1alpha1`) with per-device-type normalizers to handle field name differences between standard and internal clusters
- `centralGetDeviceSiteId` now returns both `siteId` and `persona` from a single monitoring devices call
- Build: `20260521m`

---

## [2026-05-14] — Onboarding Flow Foundation

### Added

- Initial onboarding flow: scan → GreenLake register → subscription → application → site → function → tags → location → review & confirm
- Demo mode — simulates full flow without real API calls
- Settings screen for GreenLake Client ID / Secret / Workspace ID and Aruba Central URL/token
- Cloudflare Pages proxy function to handle CORS for all HPE API calls
- QR / barcode scanner with multi-scan confirmation and auto-detection of serial vs MAC by format
- Review & Confirm screen before any API changes are applied

---

*Built by [@WifiGuyWill](https://github.com/wifiguywill) — not affiliated with HPE or Aruba*
