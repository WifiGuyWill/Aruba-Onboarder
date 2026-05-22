# Changelog

All notable changes to the HPE Aruba Device Onboarder are documented here.

---

## [Unreleased]

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
