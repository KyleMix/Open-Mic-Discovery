# UI Inventory

Phase 1 of the visual and usability audit. Read-only census of every screen, shared component, design token, and style declaration. Companion documents: `ui-findings.md` (Phase 2) and `ui-score.md` (Phase 3).

Audit date: 2026-08-11. Audited at commit `0739d0d`.

## 1. Screens, modals, sheets, and routes

### Root and layouts

| Route / file | Job |
| --- | --- |
| `src/app/_layout.tsx` | Root layout: fonts, query persistence, theme, toast and banner providers, auth gate, error boundary. |
| `src/app/(tabs)/_layout.tsx` | Tab bar with 6 destinations: Discover, Favorites, Going, Network, My mics, Profile. (Post-audit: Network moved to a stack route under Profile; 5 destinations remain.) |
| `src/app/(auth)/_layout.tsx` | Stack for the auth funnel with per-screen titles. |
| `src/app/+native-intent.tsx` | Deep link path rewriting, no UI. |

### Tab screens

| Route / file | Job |
| --- | --- |
| `src/app/(tabs)/index.tsx` | Discover: search input, filter bar, map or list of nearby mics, zero-result recovery. |
| `src/app/(tabs)/favorites.tsx` | Saved mics as MicCards; signed-out pitch. |
| `src/app/(tabs)/going.tsx` | Upcoming nights the user committed to, soonest first. |
| `src/app/(tabs)/network.tsx` | Re-export of `features/network/network-screen.tsx`: connections, requests, people search, connection nights, privacy toggle. (Post-audit: now `src/app/network.tsx`, a stack route reached from Profile.) |
| `src/app/(tabs)/producer.tsx` | My mics: the host's listings with freshness confirm, admin claim review inset. |
| `src/app/(tabs)/profile.tsx` | Own profile: identity, roles, socials, My nights history, links to settings and admin. |

### Auth funnel

| Route / file | Job |
| --- | --- |
| `src/app/(auth)/sign-in.tsx` | Email/password plus Apple and Google sign-in. |
| `src/app/(auth)/sign-up.tsx` | Account creation, email confirmation wait state. |
| `src/app/(auth)/forgot-password.tsx` | Reset email request and sent state. |
| `src/app/(auth)/reset-password.tsx` | Landing for the emailed reset link; sets the new password. |
| `src/app/(auth)/eula.tsx` | EULA acceptance gate with scrollable terms. |
| `src/app/(auth)/onboarding.tsx` | Stage name, home area, birth year; completes profile. |

### Stack screens

| Route / file | Job |
| --- | --- |
| `src/app/mic/[id].tsx` | Listing detail: schedule, signup card, plan toggle, venue, credits, flag/claim/report; sticky signup footer. Hosts the FlagModal and ClaimModal bottom sheets. |
| `src/app/edit-profile.tsx` | Profile editor: photo, names, roles, disciplines, home area, social links, discard guard. |
| `src/app/settings.tsx` | Notifications link, legal, blocked users, support, account deletion. Hosts DeleteConfirmModal. |
| `src/app/notification-prefs.tsx` | Push permission primer and per-category toggles. |
| `src/app/privacy.tsx` | Bundled privacy policy, readable in every auth state. |
| `src/app/terms.tsx` | Read-only EULA. |
| `src/app/admin.tsx` | Moderation queue: reports, held content, listing flags. |
| `src/app/test-kit.tsx` | Admin test scenarios and tools. |
| `src/app/auth-callback.tsx` | Email confirmation code exchange. |
| `src/app/+not-found.tsx` | Unmatched route recovery. |

### Producer stack

| Route / file | Job |
| --- | --- |
| `src/app/producer/new.tsx` | Create a listing (SeriesForm), role gate, discard guard. |
| `src/app/producer/[id].tsx` | Manage one mic: confirm, edit, pause, poster, per-night actions. Hosts NightModal (cancel or edit one night) and the pause confirm sheet. |
| `src/app/producer/night/[occurrenceId].tsx` | One night's list: lottery draw, reorder, promote, walk-ins, performed and no-show marking. |
| `src/app/producer/live/[occurrenceId].tsx` | Run the show: set timer, on stage, on deck, waitlist promotion, end show. |
| `src/app/producer/analytics/[id].tsx` | Per-night signup totals for one listing. |
| `src/app/producer/credits/[id].tsx` | Host and featured artist credits, series-wide or per night. |

### Modals and sheets (component-level)

| Component | Job |
| --- | --- |
| `src/components/confirm-sheet.tsx` (`ConfirmSheet`, `DiscardPrompt`) | Shared bottom-sheet confirmation; in-sheet discard prompt. |
| `src/components/select.tsx` (`SheetShell`) | Picker sheet behind SelectField and MultiSelectField. |
| `src/features/discovery/components/filter-sheet.tsx` | Full filter sheet under the chip bar. |
| `src/features/safety/components/report-modal.tsx` | Report-and-block flow, used on listings, credits, rosters, profiles. |
| `src/features/share/components/share-sheet.tsx` | Flyer capture and share bottom sheet. |
| FlagModal, ClaimModal (in `src/app/mic/[id].tsx`) | Data-quality flag and claim submission sheets. |
| NightModal, pause confirm (in `src/app/producer/[id].tsx`) | Per-night cancel/edit; pause confirmation. |
| DeleteConfirmModal (in `src/app/settings.tsx`) | Type-DELETE account deletion confirm. |

Total: 27 routed screens (6 tab, 6 auth, 10 stack, 6 producer counting `new`), plus 8 modal/sheet surfaces.

## 2. Shared UI components and consumer counts

Consumer counts are files (non-test) importing the module.

| Component | File | Consumers |
| --- | --- | --- |
| Screen, FormScreen, KeyboardShift, Title, Body, ErrorText, LoadingView, Field, Button, ToggleRow | `src/components/ui.tsx` | 41 |
| ScreenHeader | `src/components/screen-header.tsx` | 11 |
| SignUpPrompt | `src/features/auth/components/sign-up-prompt.tsx` | 10 |
| MicCard (+ signup method labels, costLabel) | `src/features/discovery/components/mic-card.tsx` | 9 |
| Glyph (discipline, signup method, freshness, flag) | `src/components/glyph.tsx` | 8 |
| useToast / ToastProvider | `src/components/toast.tsx` | 6 |
| ConfirmSheet / DiscardPrompt | `src/components/confirm-sheet.tsx` | 5 |
| AvatarCircle | `src/features/profile/avatar-circle.tsx` | 5 |
| NotYourMic | `src/features/producer/components/not-your-mic.tsx` | 5 |
| useDiscardGuard | `src/components/discard-guard.tsx` | 3 |
| SelectField / MultiSelectField | `src/components/select.tsx` | 3 |
| Logo / LogoMark / BrandHeader | `src/components/logo.tsx` | 3 |
| SocialLinkRow | `src/components/social-links.tsx` | 3 |
| PressableScale | `src/components/pressable-scale.tsx` | 3 (plus every Button via ui.tsx) |
| ReportModal | `src/features/safety/components/report-modal.tsx` | 3 |
| ShareSheet | `src/features/share/components/share-sheet.tsx` | 2 |
| PushPrimer | `src/features/notifications/components/push-primer.tsx` | 2 |
| SeriesForm | `src/features/producer/components/series-form.tsx` | 2 |
| StewardshipBadge | `src/features/discovery/components/stewardship-badge.tsx` | 2 |
| OfflineBanner | `src/components/offline-banner.tsx` | 1 (root) |
| SanctionBanner | `src/features/safety/components/sanction-banner.tsx` | 1 (root) |
| PersonRow | `src/features/network/components/person-row.tsx` | 1 |
| CreditCard | `src/features/credits/components/credit-card.tsx` | 1 |
| SkeletonCards | `src/features/discovery/components/skeleton-card.tsx` | 1 |
| FilterBar | `src/features/discovery/components/filter-bar.tsx` | 1 |
| FilterSheet | `src/features/discovery/components/filter-sheet.tsx` | 1 |
| SearchPanel | `src/features/discovery/components/search-panel.tsx` | 1 |
| MicMap (+ `.web` variant) | `src/features/discovery/components/mic-map.tsx` | 1 |
| ShareCard | `src/features/share/components/share-card.tsx` | 1 |
| SignupCard | `src/features/signups/components/signup-card.tsx` | 1 |
| PlanToggle | `src/features/plans/components/plan-toggle.tsx` | 1 |
| PinPicker (+ `.web` variant) | `src/features/producer/components/pin-picker.tsx` | 1 |

Locally defined repeated patterns that are NOT shared (each screen re-declares its own): `sectionTitle` heading style (8 screens), `modalSheet`/`backdrop` bottom-sheet styles (6 files), chip components (FilterBar `Chip`, FilterSheet `SheetChip`, series-form inline chips, test-kit `Chip`: 4 separate implementations).

## 3. Design system

Single source: `src/theme/tokens.ts`, re-exported by `src/theme/index.ts`.

| Token group | Where it lives | Real token or literal? |
| --- | --- | --- |
| Colors | `tokens.ts` `palette` (13 entries), `brandColors` (3), `disciplineAccents` (4) | Real tokens. Zero hex/rgba literals exist outside `tokens.ts` (verified by grep; app.json mirrors 4 values by documented necessity). |
| Spacing | `tokens.ts` `spacing` xxs 2, xs 4, sm 8, md 16, lg 24, xl 32, xxl 48 | Real tokens. Note: `xxs: 2` is itself off the 4pt sub-grid. 10 spacing literals bypass the scale (see findings). |
| Radii | `tokens.ts` `radius` sm 10, md 12, lg 14, sheet 20, pill 999 | Real tokens. (Post-audit: `sheet` added and adopted by every bottom sheet; all chips unified on `pill`.) |
| Type scale | `tokens.ts` `type` title 28/34, heading 20/26, body 16/22, label 15/20, caption 13/18 | Real tokens. Two literal escapes: `fontSize: 14` in `series-form.tsx:893` and `mic-map.tsx:205`, `fontSize: 72` clock in `live/[occurrenceId].tsx:512`. |
| Fonts | `tokens.ts` `fonts` Poppins 400/500/600 | Real tokens. (Post-audit: every sized text style carries a `fontFamily`, so body and caption copy render in Poppins app-wide.) |
| Shadows / elevation | None defined | The app is flat by design: surfaces separate by `bgElevated` fill plus 1px `border`. No shadow or elevation values anywhere. Consistent. |
| Touch target | `tokens.ts` `minTouchTarget = 44` | Real token, applied widely via `minHeight`/`minWidth`. 44 meets iOS but is under Android's 48dp (see findings). |
| Dynamic type | `tokens.ts` `maxFontScale = 1.6` | Real token, applied as `maxFontSizeMultiplier` on nearly every Text (exception: ShareCard). |
| Icons | Custom glyph set `src/components/glyph.tsx` (10 semantic PNGs); Ionicons for chrome actions; FontAwesome6 brand icons for social links only | Names are tokens; sizes are per-call-site literals (14, 16, 18, 20, 22, 24, 28). |

## 4. Style declaration census

Method (deterministic; script preserved at the audit scratchpad and re-runnable): every `key: value` property inside `StyleSheet.create` calls plus inline `style={{...}}` objects, across all non-test `.tsx` files under `src/`. A declaration counts as a hardcoded literal when it is a token-relevant property (color, font size/family/weight, line height, letter spacing, radius, padding/margin/gap, fixed dimension/offset) whose value is a raw number or string not referencing `palette`/`spacing`/`radius`/`type`/`fonts`/`minTouchTarget`/`disciplineAccents`/`brandColors`. Excluded from "hardcoded" by rule: value 0, `borderWidth` (no token exists; values are 1 to 2px hairlines), flex weights, percentage strings, and structural keys (flexDirection, alignItems, position, overflow, and the like). ShareCard's `n * s` scaled canvas values are arithmetic, not plain literals, and are not caught by the census; they are counted manually in the findings where relevant.

| Count | Value |
| --- | --- |
| Total style declarations | **1619** |
| Hardcoded literals | **73** |
| Hardcoded rate | **4.51%** |

Top literal clusters (full per-file table reproducible from the script):

- Bottom-sheet corner `20` (12 declarations across 6 files)
- Touch-target dimensions `44`/`24` written as numbers instead of `minTouchTarget` (16 declarations, notably `mic/[id].tsx`, `mic-card.tsx`, `mic-map.tsx`, `report-modal.tsx`)
- Chip radii `22`/`18`/`16` (5 declarations)
- Grabber and skeleton artwork (`3`, `5`, `44`, `4`, `12`) (8 declarations)
- Poster heights `260`/`220` (3 declarations)
- Letter spacing `0.5`/`0.8`/`1` (4 declarations)
- One-off spacing `marginLeft: 9`, `gap: 2` (3 declarations)
