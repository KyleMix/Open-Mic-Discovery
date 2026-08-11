# SDK Privacy Manifest Audit

Audit date: 2026-08-11 (pre-submission docs reconciliation), against the
exact installed versions in package-lock.json, with every bundled
`PrivacyInfo.xcprivacy` re-read rather than carried forward. Previous
audit: 2026-07-29. Re-run this audit whenever a native dependency changes:
`find node_modules -name PrivacyInfo.xcprivacy`.

Changes since the 2026-07-29 audit:

- `react-native-purchases` (RevenueCat) is GONE. The in-app purchase layer
  was removed; the package is absent from package.json and node_modules.
  The app sells nothing and no purchase data is collected. Do not declare
  purchase history in either store form.
- `expo-device` was removed. It was the package that motivated the
  SystemBootTime 35F9.1 declaration; see the app-level section below.
- Added since last audit (all verified below): `expo-media-library`,
  `react-native-view-shot`, `expo-clipboard`, `expo-haptics`,
  `expo-network`, `expo-sharing`, `expo-updates`.
- `expo-file-system` is no longer a direct dependency (zero imports in
  app code) but still ships: it is a dependency of the `expo` package
  itself and is autolinked, so its manifest declarations still apply.
- Version drift recorded: react-native 0.86.2, reanimated 4.5.1 with
  worklets 0.10.1 (lockstep pair moved together, per ARCHITECTURE.md).

Context: Apple requires a privacy manifest from SDKs on its commonly-used
list and from any binary that calls required-reason APIs. Xcode aggregates
every bundled `PrivacyInfo.xcprivacy` (app target plus pods) into the
archive's combined privacy report. The app-level manifest is declared in
`app.json` under `ios.privacyManifests` (see the bottom section) and Expo
prebuild writes it into the iOS project.

## Native-bearing dependencies

Direct dependencies plus every transitive package that ships iOS native
code. "Manifest" means a PrivacyInfo.xcprivacy bundled at the installed
version. Reason codes: CA92.1 (UserDefaults, app-scoped storage), C617.1
(file timestamps inside the app container), 0A2A.1/3B52.1 (file timestamps,
declared by the SDK for its own use), 85F4.1/E174.1 (disk space, checking
available space before writes).

| Package                                   | Version | Manifest present                                                                                                           | Data types declared                                | Required-reason APIs                                   |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| react-native                              | 0.86.2  | Yes (core + RCT-Folly, boost, glog, cxxreact, timing)                                                                      | None                                               | FileTimestamp C617.1, UserDefaults CA92.1              |
| expo (expo-modules-core 57.0.8)           | 57.0.9  | Covered by per-module manifests below                                                                                      | None                                               | None beyond modules below                              |
| expo-application (via expo-notifications) | 57.0.2  | Yes                                                                                                                        | None                                               | FileTimestamp C617.1                                   |
| expo-constants                            | 57.0.8  | Yes                                                                                                                        | None                                               | UserDefaults CA92.1                                    |
| expo-file-system (transitive via expo)    | 57.0.2  | Yes                                                                                                                        | None                                               | FileTimestamp 0A2A.1, 3B52.1; DiskSpace 85F4.1, E174.1 |
| expo-media-library                        | 57.0.3  | Yes                                                                                                                        | None                                               | FileTimestamp 0A2A.1                                   |
| expo-notifications                        | 57.0.8  | Yes                                                                                                                        | None                                               | UserDefaults CA92.1                                    |
| expo-system-ui                            | 57.0.2  | Yes                                                                                                                        | None                                               | UserDefaults CA92.1                                    |
| @react-native-async-storage/async-storage | 2.2.0   | Yes                                                                                                                        | None                                               | FileTimestamp C617.1                                   |
| react-native-maps                         | 1.27.2  | Yes (plus a GoogleMapsPrivacy bundle used only by the Google provider on iOS, which this app does not enable)              | Precise location (app functionality, not tracking) | FileTimestamp C617.1                                   |
| react-native-view-shot                    | 5.1.0   | Yes (declares nothing: no data types, no required-reason APIs)                                                             | None                                               | None                                                   |
| @sentry/react-native                      | 7.11.0  | Yes, via the pinned sentry-cocoa 8.58.0 pod (ships its own manifest; crash data only, sendDefaultPii is off in our config) | Crash data                                         | FileTimestamp, UserDefaults (declared by sentry-cocoa) |
| expo-age-range                            | 57.0.2  | No manifest; none required (wraps the platform age range APIs, no required-reason API use, stores nothing)                 | None                                               | None                                                   |
| expo-apple-authentication                 | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-asset (transitive via expo)          | 57.0.8  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-calendar                             | 57.0.1  | No manifest; none required (system calendar access is permission-gated, not manifest-listed; write-only in this app)       | None                                               | None                                                   |
| expo-clipboard                            | 57.0.1  | No manifest; none required (system clipboard, user-initiated copy only)                                                    | None                                               | None                                                   |
| expo-font                                 | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-glass-effect (via expo-router)       | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-haptics                              | 57.0.1  | No manifest; none required (UI feedback only)                                                                              | None                                               | None                                                   |
| expo-image / expo-image-loader            | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-image-picker                         | 57.0.7  | No manifest; none required (photo access is permission-gated)                                                              | None                                               | None                                                   |
| expo-keep-awake                           | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-linking                              | 57.0.4  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-location                             | 57.0.7  | No manifest; none required (location is permission-gated; collection declared at app level)                                | None                                               | None                                                   |
| expo-network                              | 57.0.1  | No manifest; none required (reachability state only, nothing stored)                                                       | None                                               | None                                                   |
| expo-router                               | 57.0.9  | No manifest; none required (JS routing)                                                                                    | None                                               | None                                                   |
| expo-sharing                              | 57.0.8  | No manifest; none required (hands content to the system share sheet)                                                       | None                                               | None                                                   |
| expo-splash-screen                        | 57.0.5  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-status-bar                           | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-symbols (via expo-router)            | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-updates                              | 57.0.13 | No manifest bundled at this version; its update-store file access falls under the app-level FileTimestamp and DiskSpace declarations and the expo-file-system manifest                                                     | None                                               | None declared                                          |
| expo-web-browser                          | 57.0.2  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| react-native-gesture-handler              | 2.32.0  | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| react-native-reanimated                   | 4.5.1   | No manifest; none required (UI only; no required-reason API use at 4.5.1)                                                  | None                                               | None                                                   |
| react-native-worklets                     | 0.10.1  | No manifest; none required (paired with reanimated 4.5.1, lockstep rule respected)                                         | None                                               | None                                                   |
| react-native-safe-area-context            | 5.7.0   | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| react-native-screens                      | 4.26.2  | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| react-native-svg                          | 15.15.4 | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| @react-native-masked-view/masked-view (via expo-router) | 0.3.2 | No manifest; none required (UI only)                                                                        | None                                               | None                                                   |
| @expo/ui (via expo-router)                | 57.0.8  | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |

Removed since the 2026-07-29 audit, listed so their old declarations are
not copied into a store form by habit: `react-native-purchases` (purchase
history: no longer collected, never declare it), `expo-device`
(SystemBootTime 35F9.1).

Not shipped in release binaries, out of scope: jest-expo,
expo-modules-autolinking, @expo/log-box, expo-build-properties (config
plugin only, no native code). Pure-JS dependencies (@supabase/supabase-js,
@tanstack/*, zustand, supercluster, tz-lookup, base64-arraybuffer,
@expo/vector-icons and the Google Fonts packages, react-native-web) ship
no native code and are out of scope.

Conclusion: every package that needs a manifest bundles one at the pinned
version. No version bumps are required for manifest reasons; the
reanimated 4.5.1 + worklets 0.10.1 lockstep pair stays untouched.

## App-level manifest (`app.json`, `ios.privacyManifests`)

The app-level manifest declares what the app itself collects (matching
`docs/privacy/APPLE_PRIVACY.md` and the Play answers) and the union of
required-reason API categories used by app code and its statically linked
Expo modules:

- Tracking: false, no tracking domains.
- Collected data types (all app functionality, none used for tracking):
  email address, name (display name and handle), user ID (account id),
  precise location (linked, foreground only), coarse location (home area,
  user-entered), other user content (bios, listings, signups), crash data
  (not linked; sendDefaultPii is off), device ID (push token), other data
  types (birth year).
- There is deliberately NO purchase-history data type: the purchase SDK
  was removed and nothing in the app touches payments.
- Accessed API types: UserDefaults CA92.1, FileTimestamp C617.1,
  DiskSpace E174.1, SystemBootTime 35F9.1.
- Note on SystemBootTime 35F9.1: the package that motivated it
  (expo-device) has been removed. The declaration is retained for now
  because over-declaring a reason code carries no rejection risk while
  under-declaring does. At archive time, if Xcode's aggregated privacy
  report shows no boot-time access, the category can be dropped from
  `app.json` in a later release.

Xcode's aggregated privacy report at archive time is the final check:
Product, Archive, Generate Privacy Report. It must list no data type absent
from this document.
