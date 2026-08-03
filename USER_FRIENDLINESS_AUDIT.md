# User-Friendliness Audit: Open Mic Explorer

Date: 2026-08-03. Scope: full `src/` tree, supporting migrations, and theme tokens, read against 13 established usability criteria. This is an evaluation only; no code was changed. Evidence cites `file:line` as of commit `efae232`.

Method: three parallel code-reading passes (status/language/control/consistency, errors/recognition/onboarding/trust, accessibility/performance/ergonomics) plus a manual trace of the three core loops for tap counts. Contrast ratios computed with the WCAG 2.x relative-luminance formula from the actual hex values in `src/theme/tokens.ts`.

---

## 1. Scorecard

| # | Category | Score |
|---|----------|-------|
| 1 | Visibility of system status | Partial |
| 2 | Match to the real world | Pass |
| 3 | User control and freedom | Partial |
| 4 | Consistency | Partial |
| 5 | Error prevention and recovery | Partial |
| 6 | Recognition over recall | Partial |
| 7 | Efficiency for repeat users | Pass |
| 8 | Minimalist, scannable design | Pass |
| 9 | Onboarding and time-to-value | Partial |
| 10 | Accessibility (WCAG 2.2 AA) | Partial (does not meet AA today) |
| 11 | Performance and perceived speed | Partial |
| 12 | Mobile ergonomics | Partial |
| 13 | Trust signals | Partial |

## 2. Overall grade and the three biggest gaps

**Overall grade: B-.** The foundations are unusually strong for a v1: every screen handles loading/empty/error/success, plain-language copy is centralized and genuinely good, impossible states are blocked at three layers (UI, query, RLS), and the freshness system has real server-side teeth. What holds the app back is a consistent last-mile pattern: the right primitive exists but is not applied everywhere it matters (STATUS_LABELS exists but the roster renders raw enums; minTouchTarget=44 exists but the producer form uses 36; the verified flag exists in schema but no screen renders it).

The three biggest gaps:

1. **Legibility and accessibility in the exact environment the app is designed for.** The app is dark-first "for dim rooms," yet `textDisabled` (#63636E) fails AA contrast everywhere it is used (3.03:1 on cards), including the stale/unconfirmed tier of the freshness badge, which the codebase itself calls "the product" (`src/features/discovery/freshness.ts:3-6,19,34`). There is zero dynamic type handling, zero screen-reader announcement of the realtime moments the app is built around (lottery draw, on-deck), and the live night-of roster has the smallest touch targets in the app.
2. **Raw database errors and submit-only validation.** 60+ call sites `throw new Error(error.message)` and screens render it verbatim; only 5 error codes are mapped to plain language. No form validates before submit. This directly fails the "zero raw errors reach users" bar (`src/features/producer/queries.ts:52` et al., `src/features/auth/validation.ts` used only inside submit handlers).
3. **The trust surface is half-built.** Freshness is excellent, but `producer_profiles.verified` and claimed-vs-community status are never rendered on any screen (`grep verified src/` hits only generated types), and there is no support contact anywhere in the app: the one mention of "contact support" is dead copy with no link (`src/app/producer/[id].tsx:120-123`).

---

## 3. Evidence per criterion

### 3.1 Visibility of system status: Partial

**Loading states: effectively complete.** A shared `LoadingView` (spinner + plain-language label, `src/components/ui.tsx:38-45`) covers every screen-level read: discovery (`src/app/(tabs)/index.tsx:193`), search (`:271`), favorites, My Mics, profile, mic detail, roster, analytics, admin, paywall, EULA, reset-link exchange. The shared `Button` has a first-class `busy` prop that disables, swaps in a spinner, and sets `accessibilityState.busy` (`ui.tsx:72-97`), and it is wired to nearly every mutation, including per-row scoping on the dashboard confirm (`src/app/(tabs)/producer.tsx:137`). Search avoids spinner flicker with `keepPreviousData` (`src/features/discovery/queries.ts:33`). The lottery draw shows a visible name-shuffle animation plus a "Drawing..." label (`src/app/producer/night/[occurrenceId].tsx:140-142,195-199`).

Weak spots:
- Favorite stars have no busy or optimistic state anywhere: the star is disabled and visually frozen for the whole round trip, then flips only after a refetch (`src/app/mic/[id].tsx:447-460`, `src/features/discovery/components/mic-card.tsx:126-142`, `src/features/favorites/queries.ts:80-123`).
- Notification toggles do not move until the server refetch lands; `ToggleRow` has no busy or disabled prop at all (`src/app/notification-prefs.tsx:59-66`, `src/components/ui.tsx:99-125`).
- Roster icon actions (on deck, move, performed, no-show) have no busy, disabled, or pressed feedback (`src/app/producer/night/[occurrenceId].tsx:221-251,387-408`).

**Success confirmation: inconsistent.** Explicit confirmations exist for claim, flag, report, sign-up email, and password reset (`src/app/mic/[id].tsx:365-373,515-520`, `src/features/safety/components/report-modal.tsx:68-89`). But the core loops confirm only implicitly: signing up re-renders the card to "On the list" (adequate), while "Confirm this listing is accurate" (the core producer loop) only flips the freshness chip with no acknowledgment (`src/features/producer/queries.ts:55`), withdraw shows nothing, profile save just navigates back (`src/app/edit-profile.tsx:133`), and account deletion drops the user to sign-in with no farewell (`src/app/settings.tsx:115`). There is no toast system and zero uses of `Alert` in the codebase.

**Orientation: good with two bugs.** Tabs are labeled and tinted (`src/app/(tabs)/_layout.tsx:15-16`, color-only distinction); the discovery screen names its center ("Near Ballard, Seattle" with a "Back to home area" reset, `src/app/(tabs)/index.tsx:50-54,163-172`). Bugs: the night screen computes a descriptive header ("Mic title · Fri, Mar 7") but applies it only in the free-tier branch; Pro producers see a hardcoded "The list" (`src/app/producer/night/[occurrenceId].tsx:56-60,92,175`). The manage screen title is the bare word "Manage" and does not name the mic (`src/app/producer/[id].tsx:107`).

**Pass looks like:** optimistic or busy states on stars and toggles, a lightweight confirmation for confirm-accurate and withdraw, the night header bug fixed, and screen titles that name their subject.

### 3.2 Match to the real world: Pass

The language work is the strongest part of the app. One shared map translates every enum: `lottery` is "Name draw", `first_come` is "Walk-in list", `reserved_slot` is "Book ahead", `host_booked` is "Invite only", consumed across discovery, detail, filters, and the producer form (`src/features/discovery/components/mic-card.tsx:14-27`). Detail screens add scene-voice explainers ("The list fills in signup order. Sign up early, show up, you are on.", `src/app/mic/[id].tsx:34-40`). Statuses are humanized with what-happens-next hints (`src/features/signups/components/signup-card.tsx:22-37`). RRULEs render as "Every Tuesday, 8:00 PM" with a null fallback of "Schedule varies" (`src/features/discovery/recurrence.ts`), distances read in miles despite km storage (`src/features/discovery/distance.ts:12-21`), costs read "Free" or "$5", and venue-local times carry a note when the zone differs from the device (`src/app/mic/[id].tsx:186-188`). Information order on the detail screen is when, then how to sign up, then cost facts, then where (`src/app/mic/[id].tsx:140-291`). No ISO timestamps reach any screen.

Exceptions that keep this from being flawless:
- No relative dates for performers. A mic starting in four hours reads "Fri, Mar 7", not "Tonight, 8 PM" (`mic-card.tsx:29-39`); "Tonight" phrasing exists only on filter chips, empty states, and the producer dashboard (`src/app/(tabs)/producer.tsx:139-141`).
- Raw enums leak on the producer roster ("no_show", "first_come" verbatim, `src/app/producer/night/[occurrenceId].tsx:108,217`) and the admin queue ("profile: sexual_content", `src/app/admin.tsx:72-74,130-132`), even though the label maps already exist.
- The signup-opens date formats device-local while the rest of the detail screen is venue-local (`signup-card.tsx:167-171`).
- Product-name drift: "Open Mic Finder" in copy and app.json vs "Open Mic Discovery" as the project name.

### 3.3 User control and freedom: Partial

**Destructive actions are well confirmed.** Withdraw uses a two-step inline confirm that states the cost ("Withdrawing gives up your spot (Slot 3). Re-signing up later puts you at the end of the list.", `signup-card.tsx:127-159`). Cancel-a-night, pause, re-draw, no-show, and account deletion (type DELETE to confirm) all have deliberate confirmation sheets with honest copy (`src/app/producer/[id].tsx:302-325,382-435`, `night/[occurrenceId].tsx:322-345`, `src/app/settings.tsx:87-121`). One true undo exists: cancelled nights show a "Restore" button (`producer/[id].tsx:261-272`). Blocking is reversible from Settings.

Gaps:
- **No form preserves a draft or warns before discard, anywhere.** The ~20-field series form is dropped silently by the header back button on create and by the "Close editor" toggle on edit (`src/features/producer/components/series-form.tsx:132-174`, `src/app/producer/new.tsx:46-53`, `producer/[id].tsx:154-158`). Android hardware back wipes a typed-out claim or flag (`src/app/mic/[id].tsx:354-362,493-499`). No `beforeRemove` guard or draft persistence exists in the codebase.
- Unfavoriting is a single tap with no confirm and no undo (`src/app/(tabs)/favorites.tsx:94-104`).
- Irreversibles with no UI: marking performed/no-show removes all buttons from the row with no way back (`night/[occurrenceId].tsx:219-238`); `useRemoveWalkIn` exists but no screen calls it (`src/features/signups/queries.ts:272-284`); listings can be paused but never deleted or archived despite `deleted_at` in the schema; posters can be replaced but not removed; handles are set once at onboarding and are not editable; roles can be turned on but never off.

**Pass looks like:** an unsaved-changes guard on the series form and modals, undo on unfavorite (or a snackbar undo), an "undo mark" on roster rows, walk-in removal wired up, and a delete/archive path for listings.

### 3.4 Consistency: Partial

**One idiom at the primitive level.** `Pressable` is used exclusively (zero Touchable*), all colors and spacing come from tokens (`src/theme/tokens.ts`), and the 7 shared primitives in `src/components/ui.tsx` carry accessibility roles by default.

**But no shared Card, Chip, Modal, or SectionTitle exists**, and each is reimplemented per file:
- 14 distinct card-style declarations across 13 files, split between radius 12 and radius 14 with no rule (`mic/[id].tsx:617-624`, `mic-card.tsx:153-160`, `favorites.tsx:122-130`, `producer.tsx:246-253`, `signup-card.tsx:222-229`, and 9 more).
- 4 chip implementations with different geometry: filter-bar and filter-sheet are near-verbatim copies of each other (radius 22, height 44), while the producer form's chips are radius 18 at **36px height, below the app's own `minTouchTarget = 44`** (`series-form.tsx:635-646`), and profile has a fourth flavor.
- 6 hand-rolled copies of the same bottom-sheet modal; only the filter sheet supports backdrop dismiss (`filter-sheet.tsx:78-83` vs the other five).
- 8 copies of the same section-title style; 2 byte-identical radio-row style blocks (`mic/[id].tsx:709-724` and `report-modal.tsx:173-188`).
- Pressed-state feedback applied to some Pressables and absent from all chips, icon buttons, and reason rows.

**Platform conventions: mostly respected.** Expo Router gives real URLs so browser back works; no hover-dependent interactions exist; modals all set `onRequestClose` so Android back works. But the only `<Link>` in the app (sign-in's "Create an account" / "Forgot your password?") is styled as plain body text with no underline or accent (`src/app/(auth)/sign-in.tsx:80-85`), while other tappable text is underlined. Dark mode is hardcoded with no system-preference respect.

### 3.5 Error prevention and recovery: Partial

**Inline validation before submit: absent.** `grep onBlur|onEndEditing src/` returns zero matches. `validation.ts` is pure and inline-capable by design but every consumer calls it only inside the submit handler: sign-up (`src/app/(auth)/sign-up.tsx:20-26`), onboarding fires all five validators at once on submit so a new user can see five errors simultaneously (`onboarding.tsx:47-59`), and the long series form shows one error at a time in a single slot at the bottom, far from the offending field (`series-form.tsx:197-238,611`). Sign-in has no field validation at all. Positive prevention does exist: the password rule is stated up front, handles are lowercased as typed, and the recurrence builder shows a live plain-English preview (`series-form.tsx:191,457`).

**Raw errors reach users: widespread.** The dominant pattern is `throw new Error(error.message)` (60+ sites across `discovery/queries.ts`, `signups/queries.ts`, `producer/queries.ts`, `favorites/queries.ts`, `safety/queries.ts`) rendered verbatim by ~25 screens via the `error instanceof Error ? error.message : fallback` idiom, where the raw DB string always wins. Only 5 mappings to plain language exist (e.g. `42501` becomes "Signups are not open for this night.", `23505` becomes "You are already on this list.", `signups/queries.ts:105-111`). There is no central error-translation layer (`src/lib/supabase.ts` is a bare client). Recovery affordances are consistently good: every load error pairs `ErrorText` with a "Try again" refetch button, and OAuth-sheet cancellation is deliberately not shown as an error (`sign-in.tsx:25-29`).

**Empty states: designed, near-universal.** 20+ inventoried; almost all guide the next action: discovery ("Nothing on tonight ... Try a bigger distance or clear the filters. Know a mic we are missing? Add it from the My Mics tab." + Clear-filters button, `index.tsx:200-214`), search offers "Show mics near {query}", favorites/producer/profile guests get sign-in CTAs with reasons. Weak ones: mic-not-found is a dead end (`mic/[id].tsx:74-78`), and a brand-new performer's "My nights" section silently renders nothing rather than telling them signups will appear there (`profile.tsx:162-164`).

**Impossible states: prevented at three layers.** UI (the signup card refuses to render for cancelled/host-booked nights, `signup-card.tsx:68-70`), query (only future occurrences fetched, `discovery/queries.ts:56`), and RLS (the insert policy enforces the scheduled status, the signup window, blocks, and role, `supabase/migrations/20260728000900_signups.sql:63-81`). Double signup is blocked by a DB unique constraint mapped to friendly copy. Window logic mirrors the DB policy and is unit-tested at the boundary (`src/features/signups/window.test.ts:38-45`). Minor gaps: no pgTAP test for the duplicate-signup rejection or the closing edge, and the join button's only double-tap guard is `busy`.

### 3.6 Recognition over recall: Partial

**Known info is reused well.** Home area (captured once, geocoded on device, never shown publicly) centers discovery with an on-screen label and reset (`index.tsx:36-54,163-172`); the performer's own disciplines seed the filter chips exactly once and never override a manual choice (`src/stores/filters.ts:85-90`); nearby-alert setup reuses the home area instead of re-prompting for location (`notification-prefs.tsx:68-92`); the venue pin infers its own timezone (`series-form.tsx:176-187`); performers never re-type their name to sign up (the roster joins it server-side); and terminology is centralized so vocabulary never drifts.

**Filters persist across sessions** via zustand persist + AsyncStorage (radius, disciplines, methods, free-only, time-of-day, view), with day picks and the Tonight bound deliberately session-only because "yesterday's tonight would silently mean the wrong day" (`filters.ts:69-76,111-123`). Active filters remain visible as chips with a count badge on "More filters".

**Missing:** recently-viewed or frequently-attended mics do not exist in any form (grep confirms), so returning users must search or favorite manually; search text does not survive the session.

### 3.7 Efficiency for repeat users: Pass

Tap counts, measured from app launch (Discover is the default tab, list view is the default, centered on home area, sorted soonest-then-nearest with the performer's disciplines pre-selected):

| Loop | Taps | Target | Verdict |
|------|------|--------|---------|
| Performer finds tonight's mics | **1** (the "Tonight" chip; 0 taps already shows soonest-first near home) | ≤2 | Pass |
| Performer signs up for a slot | **2** (mic card, then "Sign me up") | ≤3 | Pass |
| Producer marks a cancellation | **4** (My Mics tab, series card, "Cancel" on the night row, "Cancel this night" confirm) | ≤3 | Miss by one; the 4th tap is a justified destructive confirm |
| Producer confirms listing accurate | 2 (My Mics tab, "Confirm accurate" on the card) | n/a | Excellent |
| Producer opens tonight's roster | 2 (My Mics tab, "Open tonight's list") | n/a | Excellent |

**Defaults are smart:** location pre-filled from home area, sort is soonest-upcoming, disciplines pre-seeded, list view default with map one tap away, venue timezone from the pin, signup-opens preserved on edit.

**Keyboard navigation on desktop web: absent.** No focus styling, no tabIndex management, nothing beyond react-native-web's default ring (grep for focus/outline/tabIndex returns only Ionicons name false-positives). The web target is real (static output, web map fallback), so this is a genuine gap for power users, though secondary to the mobile product.

### 3.8 Minimalist, scannable design: Pass

Mic cards carry exactly the decision set: accent bar + discipline glyphs, title, star, venue + neighborhood + distance, recurrence + concrete next date, then method · cost · freshness (`mic-card.tsx:72-104`). Details live one tap deeper. Filters are two plain rows plus an "All filters" sheet with one labeled question per section. No feature bloat: no social feed, no joke bank, primary screens each do one job.

Hierarchy issues that keep this from being a strong pass:
- On the detail screen with a poster, the signup CTA sits one to one-and-a-half screens down (260px poster + title + freshness + full schedule card before `SignupCard` at `mic/[id].tsx:212-221`).
- On the night-of roster, the slot position number (the single most important glanceable fact in a dark bar) is 16px, dimmer than the name, in a fixed 22px column (`night/[occurrenceId].tsx:449-454`); a performer's own slot is buried mid-sentence (`signup-card.tsx:113-118`).

### 3.9 Onboarding and time-to-value: Partial

**Value before account: yes.** Guests browse all four tabs and open listings; the auth gate explicitly whitelists `(tabs)` and `mic` (`src/app/_layout.tsx:73-81`), sign-in offers "Browse mics without an account" (though it is the last, least prominent element on the screen, `sign-in.tsx:87-92`), and every gated action prompts sign-in in place with a stated reason ("Claiming a mic needs an account so we can hand you the keys."). Guest friction: without a home area, discovery centers on Seattle with a warning note.

**Signup is front-loaded, not progressive.** Reaching the app requires: email + password, the EULA accept, then one onboarding screen demanding roles, handle, display name, home area (DB-enforced), and birth year: 8 required inputs with no "skip for now" on anything (`onboarding.tsx:28-181`, `supabase/migrations/20260728001400_home_area.sql:25-28`). Handle, display name, and birth year are not needed to browse and could be deferred to first signup. Every ask is at least justified in-line ("We use this only to show mics near you. It is never shown on your profile or to anyone else."), and roles are not a lock-in (both can be enabled later with one tap).

**First-run: no forced tutorial, orientation via design.** No coach marks or tours exist; explainers, status hints, and instructive empty states do the orienting. Permission asks are exemplary: push permission at first signup (not launch), location only on a deliberate tap with an in-context explanation (`signups/queries.ts:114-119`, `index.tsx:104-107`).

### 3.10 Accessibility (WCAG 2.2 AA): Partial (does not meet AA today)

**Contrast: tested, but the test misses the failures.** `tokens.test.ts` asserts text and secondary text against `bg` (both pass: 17.9 and 8.3) and accents at 3:1. Not tested and failing at 4.5:1:

| Pair | Ratio |
|------|-------|
| `textDisabled` #63636E on `bg` | 3.31 |
| `textDisabled` on `bgElevated` (cards) | 3.03 |
| `textDisabled` on `bgPressed` | 2.66 |
| `border` on `bg` / `bgElevated` (non-text, 3:1 bar) | 1.47 / 1.34 |

`textDisabled` is used as meaningful 13px text in 8 places, worst of all the **stale and never-confirmed freshness tiers** (`freshness.ts:19,34`): the tier that most needs reading is the least legible. Also: fact labels on the detail card, inactive tab labels, paywall fine print, placeholders, and cancelled-night dates. Disabled buttons at `opacity: 0.4` drop labels to ~3.5:1 (exempt under 1.4.3, but hostile in a dim room).

**Color alone: mostly avoided.** Discipline accents are always paired with glyphs and text labels; active chips change border and background, not just hue. The freshness glyph is the same image for all tiers with only hue differing, but the text label carries the meaning. Map markers, however, are labeled just "Open mic" for every pin, dropping title, venue, and discipline for screen-reader users (`mic-map.tsx:112`).

**Labels/roles: unusually good for RN.** All shared primitives carry roles (`Button`, `ToggleRow` as switch, `Title` as header, `ErrorText` as alert); nearly every Pressable is labeled, decorative glyphs are hidden from the tree (`glyph.tsx:55-56`). Gaps: reason radios lack labels and a radiogroup container, favorites nests a Pressable inside a Pressable, and `LoadingView`'s label sits on a non-accessible View.

**Touch targets:** token honored in most places (44 to 56px), violated where stakes are highest: roster icon actions 40px wide with 4px gaps, six in a row (`night/[occurrenceId].tsx:485-490`); producer-form chips 36px (`series-form.tsx:643`); profile link chips 36px; map pins 36px. The card star is 24px but rescued by the app's only `hitSlop`.

**Dynamic type: zero handling** (no allowFontScaling/maxFontSizeMultiplier anywhere), with fixed-width containers guaranteed to clip under scaling (22px slot column, 90px date column).

**Announcements: zero.** No `AccessibilityInfo.announceForAccessibility` or live regions, while the app's signature moments (draw result, waitlist promotion, on-deck) arrive via realtime specifically "while the performer is staring at this screen" (`signups/queries.ts:30-31`) and are announced to nobody. Web focus states: none beyond RNW defaults.

**Pass looks like:** a compliant replacement for `textDisabled` in text roles, contrast tests covering elevated surfaces, announcements for realtime status changes, `maxFontSizeMultiplier` policy plus flexible containers, 44px minimums on the night screen and producer form, and per-mic map marker labels.

### 3.11 Performance and perceived speed: Partial

**Good bones.** TanStack Query with `staleTime` 60s / `gcTime` 24h and full offline persistence to AsyncStorage ("performers check this app in parking lots with one bar of signal", `_layout.tsx:134-147`); 300ms search debounce with `keepPreviousData`; supercluster-backed map markers, memoized; one shared favorites query for all cards instead of per-row lookups; explicit image dimensions everywhere, so no layout shift.

**Estimated feel:** initial load is spinner-then-content with a visible system-font flash (fonts loaded without awaiting, `_layout.tsx:141-142`; expo-splash-screen is a dependency but never used); search feels instant thanks to debounce + kept results; navigation is stock stack transitions.

**Gaps:**
- **No optimistic UI anywhere**: zero `onMutate`/`setQueryData` in the codebase. The favorite star freezes for the full round trip; roster reorder waits for the server before rows move; every mutation is invalidate-and-refetch, and a star tap refetches the entire two-step favorites query.
- No pagination: discovery is a hard 100-row cap and search 50, the client never passes `p_limit`, and nothing says "showing 100" (`supabase/migrations/20260803000600_discovery_ranking.sql:17,113`, `filters.ts:176-192`).
- The roster and admin queue are unvirtualized ScrollView + map, and `useRoster` fetches with no limit at all (`signups/queries.ts:146-157`).
- `react-native-maps` + supercluster are statically imported into the first screen's bundle even though list view is the default (`index.tsx:14`); the only dynamic import in the app is expo-notifications.
- No pull-to-refresh anywhere; images have no placeholder/transition/cachePolicy; no `onError` fallback for a broken avatar URL.

### 3.12 Mobile ergonomics: Partial

**Right instincts:** bottom tab bar; dark-first by explicit design for dim rooms; zero swipe-only or hover-only interactions: every action has a visible button (unfavorite is a button, reorder is chevrons, all modals have explicit close plus `onRequestClose`).

**Gaps for the one-handed-in-a-bar test:**
- The signup CTA is not thumb-anchored: it is inline in the scroll, below a 260px poster and the full schedule card; no sticky footer exists (`mic/[id].tsx:140-221`).
- **`KeyboardAvoidingView` is used nowhere.** Auth screens put inputs in a non-scrollable `<View>` so the keyboard can cover the submit button on small phones; worse, the claim/flag/report inputs live in bottom-anchored modal sheets (`justifyContent: 'flex-end'`) with a keyboard and no inset handling, the highest-risk combination in the app; the walk-in name field sits mid-ScrollView on the live night screen (`sign-in.tsx`, `mic/[id].tsx:394-401,548-553`, `night/[occurrenceId].tsx:258-278`).
- Checking the list order at a glance: slot numbers are 16px, secondary-colored, and dimmer than names (`night/[occurrenceId].tsx:449-454`); roster statuses are raw enums at 13px; the roster's six 40px-wide icon targets with 4px gaps invite mis-taps from a thumb holding a drink.
- Top-anchored discovery controls put the map/list toggle and locate button in the hardest-reach corner on large phones (`index.tsx:126-159`).
- The filter sheet's grabber bar looks draggable but is decorative; there is no pan handler.

### 3.13 Trust signals: Partial

**Freshness: the model implementation.** Four tiers with honest relative labels ("Confirmed 3 days ago" / "Not yet confirmed"), thresholds at 14/45 days, boundary-tested, displayed on every listing surface and inside card accessibility labels. It has server-side teeth: ranking sorts by freshness tier, paused listings leave the feed, confirm nudges fire at 30/60 days, 90 days of silence auto-pauses, and a confirmed "this mic is dead" flag pauses the listing (`freshness.ts`, `supabase/migrations/20260803000500_trust_loop.sql`, `..._discovery_ranking.sql`). Cancellations render honestly in red with their notes.

**Verified vs unverified: schema-only.** `producer_profiles.verified` (server-granted, trigger-pinned) and the claimed/unclaimed distinction exist in the DB, and 14 of 20 seeded mics are community-entered, but no screen renders any of it: no "host-managed" vs "community-listed" badge, no host identity on claimed listings. The only inference available is the presence of a "Do you run this mic? Claim it" link (`mic/[id].tsx:303`). (Also self-identified in `docs/UX_REVIEW.md:167`.)

**Report problems: strong. Reach a human: absent.** Three escalation paths sit on every listing (data flag with 7 concrete reasons, claim with human review, abuse report with a stated 24-hour SLA and block-in-flow). But there is no support link, email, help screen, or contact form anywhere: grep for support/contact/mailto returns only the dead phrase "or contact support" with no affordance (`producer/[id].tsx:120-123`), and Settings has no Help/About/Terms section and no way to re-read the EULA after accepting.

---

## 4. Missing features (what user-friendly apps in this space have that this app lacks)

Sorted by impact, highest first:

1. **Relative dates for performers**: "Tonight, 8 PM" / "Tomorrow" on cards, search, favorites, and detail. The producer dashboard already computes this; performers never see it.
2. **A toast/snackbar system with undo**: silent successes and undo-less unfavorite both trace to its absence; one primitive fixes both.
3. **Sticky signup CTA** on the mic detail screen (the "I am on the list" wedge is below the fold whenever a poster exists).
4. **Support/help contact**: even a single mailto/settings row; today a user with a billing, moderation, or account issue has literally no path.
5. **Verified/host-run vs community-listed badges** on listings (schema is ready; UI absent).
6. **Draft preservation or discard warnings** on the 20-field series form and typed-out modals.
7. **Pull-to-refresh** on discovery, favorites, and the roster (standard expectation; absent app-wide).
8. **Recently viewed / suggested mics**: returning users must re-search or rely on favorites.
9. **Share a mic** (share sheet with a deep link); word-of-mouth is the growth loop for open mics and there is no share affordance.
10. **Drag-to-reorder on the roster** (currently chevron-only; known Reanimated constraint documented in ARCHITECTURE.md, but the gap remains real for hosts).
11. **Offline/stale-data indicator**: cached content renders identically to fresh content despite 24h persistence.
12. **Delete or archive a listing** (soft-delete schema exists; only pause is exposed).
13. **"Showing 100 results" indicator or pagination** past the silent discovery cap.
14. **Skeleton loading** for card lists (spinner-only today).
15. **Light theme / system preference respect** (deliberate dark-first, but no choice).
16. **Calendar/day-strip browsing** (browse by "Thursday" exists only as a filter chip).

## 5. Top 10 recommended changes, ranked by impact-to-effort

Formatted for a fix-implementation run. Each item is independent unless noted. House rules apply to all: TypeScript strict, no em dashes in user-facing copy, tests alongside the change, `npm run typecheck && npm run lint && npm test` green.

### 1. Humanize roster and admin enums (trivial effort, high impact)
- **Files:** `src/app/producer/night/[occurrenceId].tsx:108,217`, `src/app/admin.tsx:72-74,130-132`
- **Change:** replace raw `{row.status}` with the existing `STATUS_LABELS` map (`src/features/signups/components/signup-card.tsx:22-29`); in admin, reuse the existing `FLAG_REASONS`/report reason label maps (`src/app/mic/[id].tsx:42-50`, `report-modal.tsx:15-24`) instead of raw `target_type`/`reason` values. Export the maps from a shared module if needed to avoid a screen-to-screen import.
- **Done when:** no enum value with an underscore renders on any screen; snapshot/unit test asserts roster rows render "Marked no-show" not "no_show".

### 2. Fix the failing contrast pairs (low effort, high impact)
- **Files:** `src/theme/tokens.ts`, `src/theme/tokens.test.ts`, `src/features/discovery/freshness.ts:19,34`
- **Change:** introduce a `textFaint` (or lighten `textDisabled`) with ≥4.5:1 on `bgElevated` (e.g. #8E8E9A ≈ 4.6:1) and use it for every place `textDisabled` is meaningful text: freshness stale/unknown tiers, fact labels (`mic/[id].tsx:661-664`), inactive tab tint, paywall fine print, placeholders, cancelled dates. Keep true-disabled controls on the old token. Extend `tokens.test.ts` to assert text tokens against `bgElevated` and `bgPressed`, not just `bg`.
- **Done when:** tokens test covers all text-on-surface pairs at 4.5:1 and passes; stale freshness labels are legible.

### 3. Relative next-night dates (low effort, high impact)
- **Files:** `src/features/discovery/components/mic-card.tsx:29-39` (`formatNextDate`), consumers in `favorites.tsx`, `index.tsx` search rows, `mic/[id].tsx` next-night line, `profile.tsx`
- **Change:** make `formatNextDate` (and a venue-timezone-aware variant for the detail screen) return "Tonight · 8:00 PM", "Tomorrow · 8:00 PM", else the current "Fri, Mar 7" form. Compute "tonight" against the venue timezone, not the device, mirroring `formatInZone`. Unit-test the boundary at midnight and across DST.
- **Done when:** a mic occurring today reads "Tonight" on card, search, favorites, and detail; tests cover today/tomorrow/next-week and a venue-timezone mismatch.

### 4. Central error translation (medium effort, high impact)
- **Files:** new `src/lib/user-error.ts`; all `features/*/queries.ts`; screens keep rendering `error.message`
- **Change:** add `userMessage(error, fallback)` that maps known Postgres/Supabase codes (42501, 23505, 23503, PGRST116, network failure) to plain language and otherwise returns the caller's context-specific fallback, never the raw message. Replace every `throw new Error(error.message)` with `throw new Error(userMessage(error, '<action-specific fallback>'))`. Keep the existing 5 bespoke mappings. Log the raw error to Sentry before translating.
- **Done when:** grep shows zero `new Error(error.message)` in `src/features`; unit tests cover the code map and the fallback path; no user-visible string contains "violates", "constraint", or "JWT".

### 5. Sticky signup CTA on mic detail (low-medium effort, high impact)
- **Files:** `src/app/mic/[id].tsx`
- **Change:** when a signup action is available (window open, or sign-in prompt for guests), render a safe-area-inset-anchored footer bar with the primary CTA ("Sign me up" / "Put my name in the draw" / "Sign in to get on the list"); keep the full `SignupCard` in place for status detail. Hide the footer once signed up (status shows in the card) and for host-booked/cancelled nights.
- **Done when:** on a screen with a poster, the CTA is visible without scrolling; footer respects safe-area insets; no overlap with the scroll content (bottom padding increased).

### 6. Keyboard avoidance (low effort, medium-high impact)
- **Files:** `src/app/(auth)/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `src/app/mic/[id].tsx` (claim/flag modals), `src/features/safety/components/report-modal.tsx`, `src/app/settings.tsx` (DELETE field), `src/app/producer/night/[occurrenceId].tsx` (walk-in field)
- **Change:** wrap auth screens in `KeyboardAvoidingView` (behavior padding on iOS) or a scrollable `Screen` variant; wrap the bottom-sheet modal content in `KeyboardAvoidingView` so the input and submit button ride above the keyboard.
- **Done when:** on a small-viewport simulator, every text input and its submit button remain visible with the keyboard open.

### 7. Optimistic favorite toggle plus success acknowledgments (medium effort, medium-high impact)
- **Files:** `src/features/favorites/queries.ts:80-123`, `src/components/ui.tsx` (new lightweight toast/confirm primitive), `src/features/producer/queries.ts:55` (confirm-accurate), `src/app/edit-profile.tsx:133`
- **Change:** add `onMutate` optimistic cache updates (with rollback on error) for `useToggleFavorite` and targeted invalidation instead of the whole `['favorites']` key; add one shared, accessible toast (auto-dismiss, `accessibilityLiveRegion`/announce) used for "Listing confirmed", "Profile saved", "Removed from favorites" with an Undo action on unfavorite.
- **Done when:** star flips instantly and rolls back on failure; unfavorite offers Undo; confirm-accurate and profile save give visible acknowledgment; tests cover optimistic rollback.

### 8. Night-screen glanceability and target sizes (medium effort, medium-high impact)
- **Files:** `src/app/producer/night/[occurrenceId].tsx` (styles `slot:449-454`, `iconAction:485-490`, header at `:56-60,92,175`), `src/features/producer/components/series-form.tsx:643`, `src/app/(tabs)/profile.tsx:316-325`
- **Change:** render slot position at heading size (≥20px) in `palette.text` semibold with a flexible min-width; use `STATUS_LABELS` (item 1); widen `iconAction` to `minWidth: 44` with `spacing.sm` gaps (move overflow actions behind a row tap or action sheet if six no longer fit); apply the computed descriptive `headerTitle` to the Pro branch too; raise series-form chips and profile link chips to `minHeight: minTouchTarget`.
- **Done when:** slot numbers are the most prominent element of each row; all targets on the night screen and producer form are ≥44px in both dimensions; the Pro roster header names the mic and date.

### 9. Trust surface completion: badges and a human (medium effort, medium impact)
- **Files:** `src/features/discovery/components/mic-card.tsx`, `src/app/mic/[id].tsx`, `src/app/settings.tsx`, `src/features/discovery/queries.ts` (expose `owner_id`/verified through the existing views if not already selected)
- **Change:** on the detail screen (and optionally cards), render "Host-managed" when `owner_id` is set (with "Verified host" when the producer's verified flag is true) and "Community-listed" when unclaimed, adjacent to the freshness badge; add a Help section in Settings with a support contact row (mailto or URL from env), a link to re-read the terms, and replace the dead "contact support" copy in `producer/[id].tsx:120-123` with a working affordance.
- **Done when:** every listing states its stewardship; Settings contains a reachable support path; the rejected-listing note links to it.

### 10. Unsaved-changes guards on forms (medium effort, medium impact)
- **Files:** `src/features/producer/components/series-form.tsx`, `src/app/producer/new.tsx`, `src/app/producer/[id].tsx:154-158` (Close editor), `src/app/edit-profile.tsx`, claim/flag modals in `src/app/mic/[id].tsx`
- **Change:** track dirty state; on back navigation, editor close, or `onRequestClose` with non-empty input, show the existing confirm-sheet pattern ("Discard this listing? Your entries will be lost." / Keep editing). For the series create form, optionally persist a draft to the existing AsyncStorage layer keyed per user.
- **Done when:** no multi-field form can be discarded by a single accidental tap or Android back; a test simulates back-with-dirty-state and asserts the guard.

Worth scheduling next after these ten: pull-to-refresh (RefreshControl on the three FlatLists), screen-reader announcements for realtime status changes (draw result, on-deck) via `AccessibilityInfo.announceForAccessibility`, `maxFontSizeMultiplier` policy with flexible slot/date columns, lazy-loading `react-native-maps` behind the map toggle, and inline (on-blur) validation for sign-up and onboarding.
