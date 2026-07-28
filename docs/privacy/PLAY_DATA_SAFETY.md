# Google Play Data Safety Form Answers

Source of truth for the Play Console Data safety section.

## Data collection and security

- Data is encrypted in transit: yes (TLS to Supabase).
- Users can request deletion: yes, in-app (Settings -> Delete account), immediate.
- Independent security review: no.

## Data types collected

| Type                             | Collected                   | Shared | Optional | Purpose                                       |
| -------------------------------- | --------------------------- | ------ | -------- | --------------------------------------------- |
| Email address                    | Yes                         | No     | No       | Account management                            |
| Name (display name)              | Yes                         | No     | No       | App functionality (public profile)            |
| Approximate location             | Yes (foreground, on demand) | No     | Yes      | App functionality (nearby search); not stored |
| Precise location                 | Yes (foreground, on demand) | No     | Yes      | App functionality (nearby search); not stored |
| User-generated content           | Yes                         | No     | Yes      | App functionality (listings, bios, signups)   |
| Date of birth (year)             | Yes                         | No     | No       | Age gating                                    |
| Device or other IDs (push token) | Yes                         | No     | Yes      | Notifications                                 |

No data sold. No data shared with third parties. No advertising or analytics SDKs beyond crash reporting (Sentry: crash data, not linked to identity, added before ship).
