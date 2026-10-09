# Changelog

All notable changes to the HPE Aruba Device Onboarder are documented here.

---

## [2026-10-08] — Configuration Group Reminder

Onboarding leaves a device in Classic Central's `default` group, where New Central does not own its configuration. The app can't fix that automatically (see below), so it now says so explicitly instead of implying the device is fully provisioned.

### Added

- **`ClassicGroupNote`** on both the single-device and batch success screens: the device is onboarded, but it must be moved into a Classic Central group with **New Central Config enabled** before New Central manages its configuration. Phrased for one or many devices, and noted as a temporary requirement.

### Notes

Automating this step was investigated and **deliberately not implemented** — it isn't possible from this app today. Measured, not assumed:

| Attempt | Result |
| --- | --- |
| `GET /network-config/v1/device-groups` (New Central) | **200** — and usefully, only returns groups that already have New Central Config enabled |
| `POST /network-config/v1/device-groups-add-devices` | **400** `API_ACCESS_RESTRICTED_IN_HYBRID_CLUSTER` |
| Same, `v1alpha1`, real `desScopeId`, on the Central host and GreenLake base | Identical |
| Classic `configuration/v{1,3}/groups`, `configuration/v1/devices/move` on the New Central host | **404 Route Not Found** — not served there |
| GreenLake token against the Classic gateway (`*-apigw.central.arubanetworks.com`) | **401 `invalid_token`** |

The read side works and needs nothing from Classic. The write is blocked on hybrid tenants, and the Classic endpoints that would work live on a separate gateway requiring separate credentials — HPE documents that ["tokens for Central will not work with Classic Central, and vice versa"](https://developer.arubanetworks.com/new-central/docs/generating-and-managing-access-tokens). HPE's own [device-onboarding workflow](https://developer.arubanetworks.com/new-central/docs/onboarding) reflects this, requiring a second `--classic_credentials` file for exactly this step.

Requiring Classic credentials was rejected as a deliberate product decision: the app exists so operators don't have to use Classic Central. When `device-groups-add-devices` is permitted on hybrid tenants, this becomes an in-app step and `ClassicGroupNote` can be deleted.

### Internal

- Build: `20261008f`
- The proxy allowlist was temporarily broadened to the Classic gateway family during this investigation and has been **reverted**. `functions/proxy.js` again allows only `.api.central.arubanetworks.com`, `cn1.api.central.arubanetworks.com.cn`, and the GreenLake/SSO hosts. No code path calls Classic, so the wider allowlist was unnecessary attack surface.

---

Some device barcodes encode the MAC without separators. GreenLake requires the colon form and rejects anything else, so those devices failed to add.

### Fixed

- **MAC addresses are normalised to `AA:BB:CC:DD:EE:FF` everywhere.** `normaliseMac` now strips any separator rather than only colons and hyphens, and validates that exactly 12 hex digits remain — returning `null` instead of a malformed string when they don't. Accepted inputs include bare hex (`000B86B86418`), colons, hyphens, Cisco dotted-quad (`000b.86b8.6418`), spaces, mixed separators and any case.
- **Manual entry no longer bypasses normalisation.** Both the single-device scan screen and the batch manual-entry field previously applied `.toUpperCase()` and nothing else, so a MAC typed without colons was sent verbatim and rejected. Both now format as you type, inserting colons automatically and ignoring separators you supply yourself.
- **Barcode parser hardened.** The combined `SN:…;MAC:…` and `serial=… mac=…` patterns only matched 17-character colon-separated MACs, so a combined barcode using bare hex parsed the serial but silently dropped the MAC. All branches now route through `normaliseMac`, and Cisco dotted-quad is recognised.
- **`glAddDevice` normalises defensively** before sending, so no code path can submit a malformed MAC. An unparseable value is dropped with a warning rather than failing the add, since the field is optional.

### Changed

- The MAC field shows a live `n/12 hex characters` hint while incomplete, and **Continue** is disabled until the MAC is valid — previously any non-empty value was accepted and failed later at the API.
- Batch queue-add is blocked while a partially-typed MAC is present. An empty MAC is still fine; it's optional there.

### Internal

- Build: `20261008e`
- Covered by 24 cases: every accepted format, rejection of short/long/non-hex input, progressive typing with and without user-supplied colons, backspace across a colon boundary, and the 12-digit overflow cap.

---

## [2026-10-08] — Remove Classic Central Fallback from Site Assignment (Important)

Site assignment fell back to a **Classic** Central endpoint when the New Central scope API failed. Classic and New Central are separate management planes, and a device written to the wrong one appears in New Central flagged as "configured in Classic".

> **Correction (2026-10-08).** This entry originally stated that the Classic fallback *did* silently provision devices into Classic, and attributed an observed "configured in Classic" incident to it. That was wrong. Classic routes are not served on the New Central API host (`*.api.central.arubanetworks.com`) — they return `404 Route Not Found` — so the fallback could not have succeeded on the affected cluster. Removing it was still correct, for the reasons below, but it was dead code rather than the cause. The likely actual cause was the device sitting in the Classic `default` group with no New-Central-enabled group assigned.

### Fixed

- **Removed the Classic `POST /configuration/v{1,2}/devices/move` fallback** from `centralAssignSite`. On the New Central API host this path 404s, so in practice it added latency and noise rather than writing anything. It was removed because the *shape* of the fallback is unsafe: it was written to treat a Classic success as a site assignment, so on any host that does serve Classic routes it would report success while writing to the wrong management plane. Site assignment is now New Central only, and soft-fails cleanly.
- **All remaining Classic endpoints removed.** A full audit of every path in the app found Classic reads still in place beyond the write above:
  - `centralGetSites` — `/configuration/v2/sites`, `/configuration/v1/sites`, `/monitoring/v2/sites`, `/platform/v1/sites`
  - `centralGetDeviceStats` — `/monitoring/v{1,2}/aps`, `/switches`, `/gateways` (six paths)

  These only returned data from the Classic plane, so on a New Central workspace they were either empty or misleading — and the site ones could only ever offer sites that fail to assign.
- **Fallback order corrected.** The Classic site endpoints were listed *before* the New Central `v1alpha1` one, so any cluster where v1 paging failed would prefer Classic sites over New Central — yielding Classic site IDs that the New Central assign API cannot resolve.

### Notes

- **A numeric-ID check does not make a Classic fallback safe.** The removed code was gated on `/^\d+$/`, on the assumption that only Classic site IDs are numeric. New Central scope IDs are numeric too, so the guard passed for New Central sites as well.
- Every call to the Central host is now under `network-config`, `network-monitoring`, or `network-notifications`. Verified by inventorying every path in the file with comments stripped.
- The `siteSource === 'classic'` guard in `centralAssignSite` is now unreachable and kept deliberately, as defence in depth if a Classic read path is ever reintroduced.

### Internal

- Build: `20261008d`

---

## [2026-10-08] — Hostname on Newly-Added Devices

Setting a hostname during onboarding only worked for devices already known to Central. Now that site assignment is live, a new device becomes provisioned *during* the run — so the hostname step can succeed on first pass.

### Fixed

- **Scope ID is now resolved at write time, not screen-load time.** The hostname write needs the device's config scope ID, which Central only issues once the device is provisioned — which now happens during the run, at the site/function steps. We were reading that ID when the Hostname *screen* loaded, before any of it had happened, so it was always null for new devices and the step always skipped. It is now re-resolved immediately before the write, with backoff (5 attempts, 5s apart) to let provisioning settle.
- **Persona preferred from the live device record.** When the scope ID is re-resolved, the device's own `deviceFunction` comes back with it and is used in preference to the earlier guess.
- **Batch flow no longer short-circuits.** It had its own pre-check that threw if the scope ID was missing, bypassing the retry entirely. Removed — both flows now go through the same path.
- **Hostname failures surface their real reason.** The single-device flow replaced every hostname error with a fixed "assign manually" string, discarding the actual cause. Same bug class as the device-add message below.

### Changed

- A device that genuinely isn't ready in time now reports *why* and what to do, and is marked `softFail` so it shows as **skipped** rather than a failed run. Everything else in the run has already succeeded at that point.
- **Both hostname warning banners removed** — single-device and batch. Each described the old limitation, and the batch one had become actively false ("Devices just added will be skipped"). The failure path now explains itself in context, so a permanent upfront warning for a rare case was just noise.

### Notes

- New `centralResolveDeviceScope` helper (documented `device-inventory` lookup, undocumented config-devices fallback) is shared rather than duplicated.
- Provisioning timing is tenant-dependent. The backoff window is deliberately short so the UI doesn't stall; a device that needs longer still degrades to a clean skip.

---

## [2026-10-08] — Clearer Device-Add Failures

### Fixed

- **GreenLake's actual failure reason is no longer discarded.** When an async device-add failed, we caught the error, fell through to a lookup (correct — the usual cause is the device already existing), and then, if that found nothing, threw a generic "device not found" that overwrote the real explanation. GreenLake's own message is now surfaced verbatim, e.g. `Device(s) with serial number: XXXX is blocked or invalid.`, matching what the GreenLake UI shows. `errorCode` is preserved on the error.
- **Multi-line errors render as multiple lines.** `ErrorBanner` had no whitespace handling, so any `\n` collapsed into a space. This was already affecting provisioning, where site/function/hostname soft-fail messages are joined with newlines and were running together.

### Changed

- "Blocked or invalid" gets a follow-up hint noting the usual cause is the device being claimed in another workspace. Worded as a likelihood — GreenLake does not confirm which of the two it is.

---

## [2026-10-08] — GreenLake Endpoint Audit

Audited every GreenLake endpoint the app calls against the live OpenAPI specs and per-service deprecation tables. One migration was needed; the rest stay as-is, in one case deliberately.

### Fixed

- **`service-managers/{id}` moved off a past-EOL endpoint** — `GET /service-catalog/v1beta1/service-managers/{id}` was deprecated with an **end-of-life of 2025-06-30**, over 15 months ago. Both call sites (application-name lookup in `glGetApplications`, and the device status screen) now go through a shared `_glFetchServiceManagerName` helper that tries stable `/v1/` first, then the `resourceUri` returned by the API, then the legacy `v1beta1` path.

### Unchanged — deliberately

- **`PATCH /devices/v2beta1/devices` stays on v2beta1.** This looked like the obvious thing to "fix", and fixing it would have broken the app. `v2beta1` is not a beta draft of a stable `v1` — it is a strict superset added later. The v1 `PatchDevicesRequest` schema accepts only `subscription`, `application`, `region`, and `tenantPlatformCustomerId`; it has **no `tags`, `contact`, or `location` properties at all**. Routing our write path to v1 would silently drop tags, contact, and location assignment. Neither tier is marked deprecated, and v2beta1 is the one actively receiving new capability.
- **`GET /service-catalog/v1beta1/my-services` stays on v1beta1** — no v1 equivalent exists. It belongs to a newer beta surface added in mid-2025 that has never been promoted.
- `devices/v1` reads + add, `locations/v1`, `subscriptions/v1`, `identity/v1`, and `service-catalog/v1/per-region-service-managers` were all confirmed current.

### Notes

- Version numbers on this platform do not sort by recency. `v2beta1` is newer and more capable than `v1`; the deprecated device tier is `v1beta1`. Check the schema, not the version string.
- Everything here is from published specs, not live calls. The `v1beta1` service-manager fallback is retained precisely because we could not confirm whether that path still answers.

---

## [2026-10-08] — Hostname Flow Rewrite (Documented Shapes)

Our hostname-setting sequence relied on an undocumented endpoint and a call shape that matched no published spec. Both are now aligned with HPE's documentation and their own reference implementation ([aruba/central-python-workflows](https://github.com/aruba/central-python-workflows) `rename-hostnames`, and the [pycentral v2 SDK](https://github.com/aruba/pycentral)).

### Changed

- **Scope-ID lookup moved to a documented endpoint** — `GET /network-monitoring/v1/device-inventory?filter=serialNumber eq '<SERIAL>'` ([ref](https://developer.arubanetworks.com/new-central/reference/getdeviceinventoryv1)) replaces the undocumented `GET /network-config/v1alpha1/devices?serial=`. The old call **ignored the serial filter entirely** and returned every device in the workspace for client-side matching; the new one filters server-side. The old path is kept as a fallback.
- **Persona now resolved from the device record** rather than guessed from device type. `device-inventory` returns `deviceFunction`, which is mapped through `DEVICE_FUNCTION_LABEL_TO_PERSONA`. Sending the wrong persona makes Central return 200 while silently writing to the wrong config layer, so this matters.
- **Hostname read/write use the documented named-profile resource** — `GET|PATCH|POST /network-config/v1alpha1/system-info/sys-system-info-profile` with hyphenated `object-type=LOCAL&scope-id=<id>&device-function=<persona>`. The previous collection-level call (no `{name}` segment, underscored `object_type`, `persona`) is retained as a fallback since the documented shape is spec-confirmed but not yet live-tested.
- **Persona map extended** with the aliases HPE's SDK uses: `Micro Branch AP`, `Branch GW`, `Hybrid NAC`.

### Fixed

- **Orphaned comment block** — the `centralSetHostname` documentation had drifted ~240 lines away from the function and was sitting above `centralGetDeviceStats`, describing an API that function doesn't call. Moved back and corrected.

### Notes

- `scope-id` is the **device's own** scope ID, not the site's. `items[].id` in the inventory response is the serial number, *not* the scope ID — only `scopeId` is.
- `object-type` defaults to `SHARED` when omitted, which would write a reusable library object instead of a per-device override. `LOCAL` is always sent explicitly.
- Preconditions for a hostname write: the device must be **provisioned** and have a **persona assigned**. It does not need to be online.
- `network-config` remains on `v1alpha1` deliberately — HPE's own SDK still pins that family to alpha (`"configuration": {"value": "network-config", "latest": "v1alpha1"}`), while `network-monitoring` has moved to `v1`.

### Internal

- Build: `20261008a`

---

## [2026-10-08] — New Central v1 API Migration

HPE promoted several New Central `v1alpha1` endpoints to `v1`. The alpha Sites API carries an explicit `Sunset: 30 June 2026` header. Every endpoint that has a v1 is now tried first, with alpha kept as a fallback for older clusters.

### Changed

- **Sites** — `GET /network-config/v1/sites` is now tried first ([ref](https://developer.arubanetworks.com/new-central-config/reference/getsitesv1)). v1 caps `limit` at 100 and requires `offset`, so the call is now **paged**; the old `limit=500` alpha call silently truncated workspaces with more than 100 sites.
- **Device lookup** — `GET /network-monitoring/v1/devices` first ([ref](https://developer.arubanetworks.com/new-central/reference/getdevicesv1)). v1 renamed `persona` → `deviceFunction` (both are now read) and uses cursor pagination, so the lookup follows `next` for up to 10 pages instead of only ever seeing the first page.
- **Device detail** — `GET /network-monitoring/v1/{aps,switches,gateways}/{serial}` first in `centralGetSystemInfo`. (`centralGetDeviceStats` already preferred v1.)
- **GreenLake NRM fallback** — also tries the v1 sites path before alpha, and now tags results with `_source` consistently.

### Not changed — no v1 exists

Verified against each spec's own `info.version`, which still reads `v1alpha1` despite v1-sounding operationIds:

- `POST /network-config/v1alpha1/persona-assignment/{persona}` — device function
- `GET|POST|PATCH /network-config/v1alpha1/system-info` — hostname

Both now carry a code comment recording this, so they don't get "upgraded" to `/v1` on sight.

### Known gaps

- `GET /network-config/v1alpha1/devices?serial=` (scope-ID lookup, used by the hostname flow) has **no reference page in HPE's published docs** at all. It works today; it is undocumented.
- Our `system-info` write call (`persona=`, `object_type=`, no `{name}` path segment) does not match the currently published spec (`object-type`, `device-function`, `POST /system-info/{name}`). It works against live clusters, so it is left alone and flagged in comments.

### Internal

- Build: `20261008a`

---

## [2026-10-08] — Live Site Assignment

Site assignment was a placeholder: the dropdown recorded your choice but no API call was ever made, and the step always reported "skipped". The New Central scope-management API is now available, so the app actually assigns the site.

### Added

- **Real site assignment** — `POST /network-config/v1/site-add-devices` with `{ desScopeId, devices: [serial] }` ([API reference](https://developer.arubanetworks.com/new-central-config/reference/adddevicestositesmv1)). Falls back to `v1alpha1`, then to the GreenLake NRM base URL for sites discovered via the NRM fallback, then to the Classic Central `devices/move` API for numeric site IDs.
- **Unchanged-site detection** — re-provisioning a device that's already on the selected site skips the call, matching the existing subscription/application behaviour.
- **200-with-failure handling** — some clusters return HTTP 200 with a failure envelope (`status: "FAILED"`); that is now detected and surfaced instead of being reported as success.

### Changed

- **Site step is live in Review & Confirm** — shows loading → success/skipped instead of being hardcoded to "skipped", and runs before Function and Hostname (both of which expect a site).
- **"Coming soon" banner removed** from the Assign Site screen.
- **Clearer soft-fail messages** — distinguishes 403 (hybrid Classic/New account, unsupported) from 404 (site or endpoint not found) and other errors.

### Notes

- The API is only supported on **standalone New Central and Central On-Prem** accounts. Hybrid workspaces — those still showing the Classic Central toggle — return 403; the app soft-fails, continues provisioning, and tells the user to assign the site manually.
- Batch provisioning picks up the same change (it already called `centralAssignSite`; it now reaches a working endpoint).

### Internal

- Build: `20261008a`

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
- **On-screen guidance** — "Hold 4-6 inches away · steady · good lighting" shown below the camera window
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
