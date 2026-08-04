# Google Play Data Safety Form Answers

Source of truth for the Play Console Data safety section.

## Data collection and security

- Data is encrypted in transit: yes (TLS to Supabase).
- Users can request deletion: yes, in-app (Settings -> Delete account), immediate.
- Independent security review: no.

## Data types collected

| Type                             | Collected                   | Shared | Optional | Purpose                                                                                                                                                                  |
| -------------------------------- | --------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email address                    | Yes                         | No     | No       | Account management. A producer's optional contact address is displayed publicly with listings                                                                            |
| Name (display name)              | Yes                         | No     | No       | App functionality (public profile)                                                                                                                                       |
| Approximate location             | Yes (home area at signup)   | No     | No       | App functionality (centers discovery, opt-in nearby alerts). User-entered city/state or ZIP geocoded on device; stored privately, never public, deleted with the account |
| Precise location                 | Yes (foreground, on demand) | No     | Yes      | App functionality (nearby search); not stored                                                                                                                            |
| User-generated content           | Yes                         | No     | Yes      | App functionality (listings, bios, signups)                                                                                                                              |
| Date of birth (year)             | Yes                         | No     | No       | Age gating                                                                                                                                                               |
| Device or other IDs (push token) | Yes                         | No     | Yes      | Notifications                                                                                                                                                            |
| Purchase history (Producer Pro)  | Yes (subscribers only)      | No     | Yes      | App functionality; RevenueCat processes subscription status and an app user id as a service provider                                                                     |

No data sold. No data shared with third parties for their own use; RevenueCat (subscriptions) and Sentry (crash reports, not linked to identity) act as service providers only. No advertising or analytics SDKs.
