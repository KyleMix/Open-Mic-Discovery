# Apple Privacy Manifest and Nutrition Label Source

Source of truth for App Store Connect privacy questions and the
PrivacyInfo.xcprivacy generated at build time (Expo writes required-reason
API entries for its own modules; app-level declarations below).

## Data collected and linked to identity

| Data                                             | Purpose                           | Notes                                                                      |
| ------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------- |
| Email address                                    | App functionality (account)       | Sign-in only; never shown to other users                                   |
| Name (display name, handle)                      | App functionality                 | Public profile content                                                     |
| Coarse location (home city, optional)            | App functionality                 | User-entered text, not GPS                                                 |
| Precise location (foreground, on demand)         | App functionality                 | Used transiently for "near me"; never stored server side, never background |
| User content (bio, listings, signups, favorites) | App functionality                 |                                                                            |
| Year of birth                                    | App functionality (age gate)      | Never public                                                               |
| Device push token                                | App functionality (notifications) | Deleted with the account                                                   |

## Not collected

Browsing history, purchase history (StoreKit handles subscriptions), contacts, photos, health, financial info, search history outside the app, identifiers for tracking.

## Tracking

None. No data is used to track users across apps or websites. No third-party advertising SDKs.

## Deletion

Full in-app deletion (Settings -> Delete account) removes sign-in and personal data immediately; anonymized event-history records are retained (see docs/COMPLIANCE.md).
