# SDK Privacy Manifest Audit

Audit date: 2026-07-29 (compliance audit Phase 2.1), against the exact
installed versions in package-lock.json. Re-run this audit whenever a native
dependency changes: `find node_modules -name PrivacyInfo.xcprivacy`.

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
available space before writes), 35F9.1 (system boot time for relative
timing).

| Package                                   | Version | Manifest present                                                                                                           | Data types declared                                | Required-reason APIs                                   |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| react-native                              | 0.86.0  | Yes (core + RCT-Folly, boost, glog, cxxreact, timing)                                                                      | None                                               | FileTimestamp C617.1, UserDefaults CA92.1              |
| expo (expo-modules-core 57.0.7)           | 57.0.8  | Covered by per-module manifests below                                                                                      | None                                               | None beyond modules below                              |
| expo-application                          | 57.0.2  | Yes                                                                                                                        | None                                               | FileTimestamp C617.1                                   |
| expo-constants                            | 57.0.7  | Yes                                                                                                                        | None                                               | UserDefaults CA92.1                                    |
| expo-device                               | 57.0.1  | Yes                                                                                                                        | None                                               | SystemBootTime 35F9.1                                  |
| expo-file-system (removed 2026-08-10: zero imports; dependency dropped) | -       | -                                                                                                                          | None                                               | FileTimestamp 0A2A.1, 3B52.1; DiskSpace 85F4.1, E174.1 |
| expo-notifications                        | 57.0.7  | Yes                                                                                                                        | None                                               | UserDefaults CA92.1                                    |
| expo-system-ui                            | 57.0.1  | Yes                                                                                                                        | None                                               | UserDefaults CA92.1                                    |
| @react-native-async-storage/async-storage | 2.2.0   | Yes                                                                                                                        | None                                               | FileTimestamp C617.1                                   |
| react-native-maps                         | 1.27.2  | Yes                                                                                                                        | Precise location (app functionality, not tracking) | FileTimestamp C617.1                                   |
| @sentry/react-native                      | 7.11.0  | Yes, via the pinned sentry-cocoa 8.58.0 pod (ships its own manifest; crash data only, sendDefaultPii is off in our config) | Crash data                                         | FileTimestamp, UserDefaults (declared by sentry-cocoa) |
| react-native-purchases                    | 10.4.4  | Yes, via PurchasesHybridCommon 18.22.2 / purchases-ios 5.x pod (ships its own manifest)                                    | Purchase history (app functionality)               | UserDefaults CA92.1 (declared by purchases-ios)        |
| expo-age-range                            | 57.0.2  | No manifest; none required (wraps the platform age range APIs, no required-reason API use, stores nothing)                 | None                                               | None                                                   |
| expo-apple-authentication                 | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-asset                                | 57.0.7  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-calendar                             | 57.0.1  | No manifest; none required (system calendar access is permission-gated, not manifest-listed)                               | None                                               | None                                                   |
| expo-font                                 | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-glass-effect                         | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-image / expo-image-loader            | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-image-picker                         | 57.0.6  | No manifest; none required (photo access is permission-gated)                                                              | None                                               | None                                                   |
| expo-keep-awake                           | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-linking                              | 57.0.4  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-location                             | 57.0.6  | No manifest; none required (location is permission-gated; collection declared at app level)                                | None                                               | None                                                   |
| expo-router                               | 57.0.8  | No manifest; none required (JS routing)                                                                                    | None                                               | None                                                   |
| expo-splash-screen                        | 57.0.5  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-status-bar                           | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-symbols                              | 57.0.1  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| expo-web-browser                          | 57.0.2  | No manifest; none required                                                                                                 | None                                               | None                                                   |
| react-native-gesture-handler              | 2.32.0  | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| react-native-reanimated                   | 4.5.0   | No manifest; none required (UI only; no required-reason API use at 4.5.0)                                                  | None                                               | None                                                   |
| react-native-worklets                     | 0.10.0  | No manifest; none required (paired with reanimated 4.5.0, lockstep rule respected; no bump needed)                         | None                                               | None                                                   |
| react-native-safe-area-context            | 5.7.0   | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| react-native-screens                      | 4.26.2  | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| react-native-svg                          | 15.15.4 | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| @react-native-masked-view/masked-view     | 0.3.2   | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |
| @expo/ui                                  | 57.0.7  | No manifest; none required (UI only)                                                                                       | None                                               | None                                                   |

Not shipped in release binaries, out of scope: jest-expo,
expo-modules-autolinking, @expo/log-box, expo-build-properties (config
plugin only, no native code).

Conclusion: every package that needs a manifest bundles one at the pinned
version. No version bumps were required, so the reanimated 4.5.0 +
worklets 0.10.0 lockstep rule is untouched.

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
- Accessed API types: UserDefaults CA92.1, FileTimestamp C617.1,
  DiskSpace E174.1, SystemBootTime 35F9.1.

Xcode's aggregated privacy report at archive time is the final check:
Product, Archive, Generate Privacy Report. It must list no data type absent
from this document.
