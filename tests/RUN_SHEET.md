# NOVA Dashboard — Manual Test Run Sheet

A checklist for manually testing the user interface.

## Automated coverage

Most rows below now have an automated Playwright equivalent in `src/vue/tests`
(`pnpm run test:user-interface` from `src/vue`), organized into one spec file per section (e.g. section
4 → `tool-lifecycle.spec.js`). Rows already marked `(TODO)` here remain manual-only, mirrored
in the suite as `test.fixme(...)` with a note on why. If you're updating a row below, check
whether the matching spec needs a matching update.

Two gaps the suite surfaced while being written, worth fixing in the app itself rather than
in a test: `MONITORING_URL` (7.6/7.7) is a real Django setting that's never included in any
API response, so the "View Monitoring Details" button can't currently appear regardless of
configuration; and the status banner (7.4) doesn't actually hide itself when the monitoring
endpoint is unreachable - it stays visible with a grey "Unable to check {alias} status."
message, unlike this sheet's current wording.

## Disclosure of Generative AI

I have recently been given access to a Claude Code subscription and am testing its ability to close a major blind spot of this codebase: automated user interface testing. I used Sonnet 5 to generate the initial list and have manually reviewed the contents below.

## TODOs

Some items in the below sheet are reasonable things to test but impossible or impractical currently. I've added a TODO flag next to their IDs.

---

## 1. Login / Logout / Session

| ID | Steps | Expected Result |
|---|---|---|
| 1.1 | Load the dashboard while logged out | Header shows a "Login" button; no Preferences icon, account menu, or Active Tools badge visible |
| 1.2 | Click "Login" from the home page | Redirected to Galaxy/NDIP OAuth login; after success, redirected back to the dashboard home page |
| 1.3 | Click "Login" from a category page | After login, redirected back to the same category page (not home) |
| 1.4 | While logged in, open the account icon menu | Shows "Logged in as {your email}" and a "Logout via {Galaxy alias}" link |
| 1.5 | Click "Logout" | Redirected to Galaxy user page to logout |
| 1.6 | Log in as User A, then in the same browser switch the underlying Galaxy session to User B (e.g. via another tab/logout+login) and return to an open dashboard tab | Dashboard detects the user-ID mismatch and force-reloads rather than continuing to show stale User A state |

## 2. Home Page

| ID | Steps | Expected Result |
|---|---|---|
| 2.1 | Load home page | Grid of category cards shown, one per technique/instrument category (generic-tools category excluded); each shows name + description |
| 2.2 | Click a category card | Navigates to `/{category-key}` (Category page) |
| 2.3 | Leave home page open for >2s | Background job monitor polling begins silently (visible via network tab in developer console) |

## 3. Category Page

| ID | Steps | Expected Result |
|---|---|---|
| 3.1 | Navigate to a real category (e.g. `/spectroscopy`) | Tool list rendered under "{Category} Tools" heading with launch buttons |
| 3.2 | Visit a category with no tools configured | Shows "Stay tuned, we will be adding technique-specific tools here soon!" instead of an empty list |
| 3.3 | Visit a category that has prototype tools | Separate "Prototype Tools" section shown below the main tool list |
| 3.4 | Navigate to an invalid/garbage category slug, e.g. `/not-a-real-category` | Immediately redirected to the 404 Not Found view |

## 4. Tool Launch / Stop Lifecycle (`ToolListItem`)

| ID | Steps | Expected Result |
|---|---|---|
| 4.1 | View a tool row while logged out | Disabled button reading "Sign in to run apps" |
| 4.2 | View a tool row immediately after login, before first monitor poll completes | Disabled button reading "Checking login status" |
| 4.3 | Click "Start" on a tool with no active job | Button replaced by spinner + status text (submitting/launching) |
| 4.4 | Let a tool launch take >10s without a URL | A "taking longer than usual" warning icon/tooltip appears, mentioning the system status banner and that the compute node may be updating the tool's Docker image |
| 4.5 | Wait for tool to become ready | "Open" button appears (and "Stop" button alongside it) |
| 4.6 | Click "Open" | Tool URL opens in a new tab |
| 4.7 | With "Automatically Open Tools in a New Tab" preference **enabled**, launch a tool | Tool auto-opens in a new tab once ready, without clicking "Open" |
| 4.8 | Click "Stop" on a running/ready tool | Job transitions through stopping state, then row returns to launchable ("Start") state |
| 4.9 | Close a tool using the exit button within the tool and come back to the dashboard | A 5-second auto-dismissing snackbar reads "{tool} finished running." |
| 4.10 (TODO) | Force a tool launch error | Red error banner shows the tool's reported error (stderr snippet, capped ~500 chars) |
| 4.11 (TODO) | Click the clipboard/copy icon on a tool row | Auto-launch link copied to clipboard; tooltip changes to "Auto-launch link copied!" for ~2 seconds then reverts |
| 4.12 (TODO) | On a tool that has a `documentation` link configured | Documentation icon button visible; click opens the doc link in a new tab |
| 4.13 | On a tool with no documentation link configured | Documentation icon button is not rendered |

## 5. Auto-Launch Deep Links (`/launch/:tool`)

| ID | Steps | Expected Result |
|---|---|---|
| 5.1 | Visit `/launch/{tool}` while logged out | Message "You must log in before your tool can be launched." plus a Login button (no header Login button shown on this route) |
| 5.2 | Log in from that Login button | Redirected back to the same `/launch/{tool}` URL after auth, and launch proceeds |
| 5.3 | Visit `/launch/{tool}` while logged in, tool has no existing running job, no query params | Job monitor checks for an existing job; none found, so a new job launches automatically (only once — verify no duplicate launch) |
| 5.4 | Visit `/launch/{tool}` while a job for that tool is already running, no query params | Existing running job is detected and reused rather than launching a duplicate |
| 5.5 | Visit `/launch/{tool}?param=value` (a datafile-triggered/parameterized tool) | A **new** job/history entry launches immediately, even if another instance of the tool is already running |
| 5.6 | While waiting for the launch to complete on `/launch/:tool` | `ToolStatus` progress spinner + status text shown |
| 5.7 (TODO) | Force a launch error on the `/launch/:tool` route | Static error banner shown, either job-specific error or generic "please use 'Report Issue'" message |
| 5.8 | Let the tool become ready via `/launch/:tool` | Browser is hard-redirected (`location.replace`) to the tool URL |
| 5.9 | **Regression:** After the hard redirect in 5.8, click the browser Back button | Should **not** return to the `/launch/:tool` URL (history entry was replaced, not pushed) |
| 5.10 | Visit `/launch/{unknown-tool-id}` (an ID that doesn't match any known tool) | Redirected to 404 Not Found |
| 5.11 | Copy an auto-launch link from a tool row (test 4.13) and open it in a new private/incognito window | Correct login flow → launch flow occurs end-to-end |

## 6. Active Tools Panel & Externally-Launched Tools

| ID | Steps | Expected Result |
|---|---|---|
| 6.1 | With at least one running tool, check the header "Active Tools" icon | Badge shows the running-tool count |
| 6.2 | With zero running tools | Active Tools icon/badge is not shown |
| 6.3 | Click the Active Tools icon | Menu lists each running/launched tool using the same row layout as the category tool list |
| 6.4 | Start a tool from inside another running tool (i.e. externally, not via the dashboard UI), then check Active Tools panel | The externally-launched job appears, labeled "Launched outside of dashboard."; Open and Stop buttons both work on it |
| 6.5 | Launch a datafile-triggered tool with parameters (see 5.5), then check Active Tools panel | Row subtitle shows "Autolaunched with parameters: {key: value, ...}" |

## 7. System Status Banner (Compute / Instrument Mount Alerts)

| ID | Steps | Expected Result |
|---|---|---|
| 7.1 | Load any page under normal conditions (no active alerts) | Green/success banner: "All {Galaxy alias} systems are operating normally." |
| 7.2 | Induce/simulate a `warning`-severity alert on one Prometheus service | Banner turns orange/warning: "Some {Galaxy alias} systems are experiencing degraded performance. Hover for details." |
| 7.3 | Induce/simulate a `critical`-severity alert | Banner turns red/error: "Some {Galaxy alias} systems are experiencing outages. Hover for details." |
| 7.4 | Make the monitoring endpoint itself unreachable | Banner is hidden entirely (grey/"unavailable" state suppresses the banner, per code) — confirm no banner is shown and no console errors break the page |
| 7.5 | Hover over the status banner | Card opens showing "{Galaxy alias} System Status" title, a `ServiceStatus` list for: Infrastructure, Instrument Data, ONCat, Compute Resources, Live Data, Documentation |
| 7.6 | With `MONITORING_URL` configured, hover the banner | "View Monitoring Details" button is present and links out correctly |
| 7.7 | With `MONITORING_URL` not configured, hover the banner | "View Monitoring Details" button is absent |
| 7.8 | Expand "Compute Resources" group in the hover card | Shows per-compute-node breakdown with a count like "(3 of 4 up)" |
| 7.9 | Expand "Instrument Data" group | Shows per-compute-node breakdown of instrument mount status (e.g. HFIR-CG1D, SNS-CORELLI, SNS-VULCAN, etc.) with an "(N of M up)" count |
| 7.10 | **Regression:** With the hover card open, wait through a 5s poll cycle while an alert's status changes (e.g. a node flips from down to up) | Per-node/sub-list counts and icons update live without needing to close/reopen the card *(previously reported reactivity bug — verify carefully, tracked in branch `66-system-status-sublists-aren-t-fully-reactive`)* |
| 7.11 | Trigger a slow tool launch (>10s, see 4.4) while a status alert is firing | Warning tooltip on the tool row explicitly references checking the status banner |

## 8. System Notification Banner (Admin Message)

| ID | Steps | Expected Result |
|---|---|---|
| 8.1 | Log in as a non-admin user | No notification bell icon in header (desktop); banner still shows if an admin has enabled one |
| 8.2 | Log in as an admin user | Notification bell icon visible in header |
| 8.3 | Open the bell menu, enter a message, enable the "Display?" switch, click Save | POST succeeds; banner with that message becomes visible to all users (including other sessions, within ~60s poll interval) |
| 8.4 | Disable the "Display?" switch and Save | Banner disappears for all users within ~60s |

## 9. Report Issue Form

| ID | Steps | Expected Result |
|---|---|---|
| 9.1 | Open "Report Issue" while logged out | Static message shown: email us at {support email}; no form fields |
| 9.2 | Open "Report Issue" while logged in | Form shown: Email (pre-filled, disabled), Topic (autocomplete), Description (textarea, 500-char counter) |
| 9.3 | Leave Topic or Description empty | Submit button remains disabled |
| 9.4 | Open the Topic dropdown | Options include every real category/tool name plus a "General Issues" subheader group with "Login Issue", "Problem Starting Tools", "Other" |
| 9.5 | Fill all fields validly and Submit | Submit button shows a progress spinner during submission (~1s+ delay) |
| 9.6 | Successful submission (200 response) | Success message: "Issue was opened successfully... you may view your opened issue at {issueUrl}" with a working link; form resets |
| 9.7 | Simulate a failed submission (non-200 response) | Generic failure message: "Something went wrong while submitting your issue. Please try again."; form resets to defaults |
| 9.8 | Type a description longer than 500 characters | Input is capped / counter reflects limit |

## 10. Preferences Panel

| ID | Steps | Expected Result |
|---|---|---|
| 10.1 | Open Preferences while logged in | Single switch: "Automatically Open Tools in a New Tab After Launch", with a caption about allowing popups |
| 10.2 | Toggle the switch on, then reload the page | Setting persists (stored in `localStorage`, key `autoopen`) |
| 10.3 | Confirm the Preferences icon is not visible when logged out | Icon absent from header |

## 11. Header / Menus — Desktop vs Mobile

| ID | Steps | Expected Result |
|---|---|---|
| 11.1 | View header at a wide viewport (`mdAndUp`) | Full desktop app bar shown with individual icons (logo, notification bell if admin, Galaxy link, Citation, Active Tools, Report Issue, Help, Login/Preferences/Account) |
| 11.2 | Resize/view at a narrow (mobile) viewport | Collapses into a single hamburger menu with the same items grouped and divided; notification bell (admin) is absent from the mobile menu entirely |
| 11.3 | Click the logo | Navigates to Home from any page |
| 11.4 | Click the Galaxy/NDIP icon link | Opens the external Galaxy instance in a new tab; tooltip shows the Galaxy alias |
| 11.5 | Open "Citing {Galaxy}/{NOVA}" panel | Static citation text and DOI links shown |
| 11.6 | Open Help panel | Shows dashboard version + changelog link, NOVA description, doc/tutorial/admin-guide links, acknowledgement statement |

## 12. Generic Tools Drawer

| ID | Steps | Expected Result |
|---|---|---|
| 12.1 | When `generic-tools` category (or prototype tools) has entries | Floating "Tools" FAB is visible on all pages |
| 12.2 | When no generic/prototype tools exist | FAB is not rendered |
| 12.3 | Click the FAB | Right-side drawer opens with "General Tools" and "Prototype Tools" sections, using the same tool-row behavior as Category page (Start/Open/Stop, copy link, docs) |

## 13. 404 / Not Found

| ID | Steps | Expected Result |
|---|---|---|
| 13.1 | Visit an arbitrary unmatched path, e.g. `/this/does/not/exist` | NotFoundView shown: "The content you requested could not be found." + Home button |

## 14. Cross-Cutting Concerns

| ID | Steps | Expected Result |
|---|---|---|
| 14.1 (TODO) | Simulate a Galaxy 500/502 error during any `api/galaxy/*` call | User-facing error banner or graceful degradation — no blank/broken page, no unhandled console exceptions |
| 14.2 (TODO) | Simulate a non-JSON (e.g. raw HTML/500) response from an API endpoint | Frontend handles the malformed response without crashing (e.g. Report Issue's 400 response has no JSON body — verify graceful failure per 9.7) |
| 14.3 | Resize the browser window across the `mdAndUp` breakpoint while a menu is open | No layout breakage or duplicated controls |
| 14.4 | Full keyboard-only navigation through header controls and a tool row's action buttons | All interactive controls are reachable and operable via keyboard (Tab/Enter/Space) |
