# UI Findings

Status after the fix pass: every scored finding is fixed. The 6-destination tab bar was resolved by moving Network under the Profile tab (5 destinations remain; the request badge moved to the Profile tab icon). Fixed: B-1, B-2, H-1 through H-5, M-1, M-7, M-8, M-11 through M-16, M-18, P-3, and the eula half of M-5. Still open, unscored: M-2 (reset-password scroll), M-3 (backdrop-tap consistency), M-4 (chip radii values), the body-font half of M-5, M-6 (state padding jump), M-9 (1.6x cap policy), M-10 (reduce motion on modals), M-17 (border contrast), and the Polish list. Line numbers below refer to commit `0739d0d`, before the fixes.

Phase 2 of the visual and usability audit. Every finding cites file and line at commit `0739d0d`. Measurements are computed, not estimated; anything not measurable from code alone is marked Unverified. Companion documents: `ui-inventory.md`, `ui-score.md`.

## Count table

| Severity | Count |
| --- | --- |
| Blocker | 2 |
| High | 5 |
| Medium | 18 |
| Polish | 7 |
| Total | 32 |

Positive results worth recording, because they bound the findings below: all 30 text/background palette pairs pass WCAG AA with measured ratios (full table in the appendix); zero color literals exist outside the token file; every icon-only control audited carries an accessibility label; every routed screen has a header or tab bar exit; every data screen has loading, error, and empty branches except the four surfaces named in M-11 and H-5; destructive flows (delete account, cancel night, pause, no-show, redraw, end show, withdraw, discard) all confirm except the three named in B-2.

---

## Blockers

### B-1. Seven distinct controls are under the 44pt iOS minimum touch target

The rubric's Blocker line is three or more undersized targets. Measured from style values (height = paddingVertical x2 + lineHeight where no min is set):

1. `src/app/mic/[id].tsx:1051-1061` Share pill: `minHeight: 36`. 36pt < 44pt.
2. `src/features/share/components/share-sheet.tsx:387-393` IntentTab ("I'm performing" / "Promote this mic"): paddingVertical 8 x2 + caption lineHeight 18 = 34pt.
3. `src/features/discovery/components/search-panel.tsx:78-86` "Clear" (recent searches): bare Text pressable, no min size, no hitSlop. Caption lineHeight 18 = 18pt.
4. `src/app/(tabs)/index.tsx:270-278` "Open settings" link after location denial: paddingVertical 4 x2 + 18 = 26pt.
5. `src/app/(tabs)/index.tsx:284-294` "Back to home area": bare Text pressable, no padding = 18pt.
6. `src/app/(auth)/sign-in.tsx:66-70` "Forgot password?": bare `Link` with Text, no min size, roughly 20pt.
7. `src/app/test-kit.tsx:548` Chip: `minHeight: minTouchTarget - 4` = 40pt (admin-only screen, still a shipped control).

Why it matters: these are recovery and navigation actions (undo a location mistake, reach password reset) where a missed tap is most costly. Items 3 to 6 are one-third to one-half the minimum.

### B-2. Three destructive actions fire on a single tap with no confirmation

1. `src/app/producer/night/[occurrenceId].tsx:344-353` Remove walk-in (trash icon): `removeWalkIn.mutate(row.id)` directly. The person loses their slot position; re-adding puts them at the end of the list. Sits in the same icon row as Move up/Move down at `gap: spacing.xs` (4pt).
2. `src/features/network/network-screen.tsx:328` Remove connection: `remove.mutate` on tap. Connections are mutual-consent; undoing needs a new request and a new acceptance from the other person.
3. `src/app/admin.tsx:140-165` "Take down" in the moderation queue: one tap removes reported content, rendered directly beside the routine "Dismiss" button. No undo path exists in the UI.

Why it matters: every other destructive flow in the app confirms (delete account, cancel night, no-show, redraw, end show, withdraw). These three are the exceptions, and two of them affect another person's standing.

---

## High

### H-1. Manage-mic night rows overflow at 375pt width

`src/app/producer/[id].tsx:494-523` renders up to five content-width buttons ("Go live", "List", "This night", "Lineup", "Cancel") in a non-wrapping row (`styles.nightActions`, line 852: `flexDirection: 'row'`, no `flexWrap`) beside a `flex: 1` info column. Measured at 375pt: content width 327 (screen minus 24x2 padding), row interior 295 (minus 16x2 card padding); the four always-present buttons plus gaps consume roughly 226pt, leaving about 61pt for the date, headcount, and warning text, which wraps into a sliver. When "Go live" appears the buttons alone exceed the row and the info column collapses to zero. Why it matters: this is the host's primary management surface; on an iPhone SE the night's date becomes one to two characters per line.

### H-2. MicCard star and share overlap by 16pt of touch area

`src/features/discovery/components/mic-card.tsx:291-313`: star at `right: 16`, share at `right: 48`, each 24x24 with `hitSlop={12}` (lines 244, 276). Star touch region spans 4 to 52pt from the right edge; share spans 36 to 84pt. The 36 to 52pt band (16pt wide) belongs to both; the later sibling (share) wins the tap. Why it matters: a user aiming at the star's left half opens the share sheet instead of saving the mic, on the app's most-tapped card.

### H-3. The global touch-target token is 44, under Android's 48dp minimum

`src/theme/tokens.ts:104` sets `minTouchTarget = 44`, and roughly two dozen controls use exactly it (inputs `ui.tsx:242`, icon buttons `index.tsx:465-474`, toast actions `toast.tsx:129-134`, select rows `select.tsx:258,317`, roster icon actions `night/[occurrenceId].tsx:708-713`, map pins `mic-map.tsx:175-180`, social buttons `social-links.tsx:83-92`, reason rows `report-modal.tsx:209-216`, and more). On iOS 44pt passes; on Android every one renders at 44dp, 4dp under the 48dp Material minimum the rubric fixes. Why it matters: one constant fixes the whole class, and Android accessibility scanners flag each instance.

### H-4. The share flyer breaks at large accessibility text sizes

`src/features/share/components/share-card.tsx` Text nodes (lines 75, 93, 99, 112, 116, 124, 132) set no `maxFontSizeMultiplier`, unlike the rest of the app. React Native scales them with the system setting, so at large accessibility sizes (up to ~3.1x) the fixed-size capture canvas (`width: size, height`) overflows: the 38pt title at 3x is 114pt over three capped lines plus venue and meta exceed the 360pt base column. The captured PNG the user actually shares is what breaks. Why it matters: the person most affected never sees it; their followers do.

### H-5. Venue search has no loading, empty, or error state

`src/features/producer/components/series-form.tsx:815-846`: `venueResults.data?.map(...)` renders results or nothing. While the query runs: nothing. Zero matches: nothing. Request fails: nothing. The person typing "The Rusty Fret" cannot distinguish "still searching", "not listed, use Add it", and "your connection dropped". Compare `usePersonSearch` in `producer/credits/[id].tsx:375-379`, which handles all three. Why it matters: this is the fork where a host decides whether to create a duplicate venue.

---

## Medium

### M-1. Bottom sheets ignore the bottom safe-area inset

Every bottom sheet is a `Modal` with `justifyContent: 'flex-end'`, so the sheet reaches the physical screen bottom, and none consults `useSafeAreaInsets`. Padding under the last button: `select.tsx:287` 24pt (the multi-select "Done" footer adds `paddingTop` only, `select.tsx:340-343`), `confirm-sheet.tsx:68`, `mic/[id].tsx:1170`, `settings.tsx:214`, `report-modal.tsx:202`, `share-sheet.tsx:365`, `producer/[id].tsx:867` all 32pt. The iPhone home-indicator inset is 34pt, so the final button's touch area extends 2 to 10pt into the home-indicator gesture zone (worst: the select sheet footer at 24pt). Why it matters: taps at a button's bottom edge can trigger the system home gesture instead. Contrast: the mic detail footer does it right (`mic/[id].tsx:636` uses `Math.max(insets.bottom, spacing.md)`).

### M-2. reset-password is the only auth form without scroll or keyboard avoidance

`src/app/(auth)/reset-password.tsx:105-138` renders two password fields and the submit button inside `Screen` (a plain View, `ui.tsx:18-20`), while sign-in, sign-up, and forgot-password use `FormScreen` (KeyboardAvoidingView + ScrollView, `ui.tsx:26-41`). At 1x text on a 375x667 device the fields stay above the keyboard (computed stack of ~313pt against ~400pt visible), but there is no way to scroll, so at 1.6x text with a validation error showing, the Save button can sit under the keyboard. Marked Medium rather than Blocker because the inputs themselves stay visible at 1x; the exact large-text overlap is Unverified without a device run.

### M-3. Backdrop-tap dismissal is inconsistent across sheets

Sheets with a tappable backdrop: select (`select.tsx:63-68`), filter sheet (`filter-sheet.tsx:105-110`), share sheet (`share-sheet.tsx:55-60`). Sheets without one (backdrop is a plain View; only a button or the Android back closes them): ConfirmSheet (`confirm-sheet.tsx:18`), FlagModal and ClaimModal (`mic/[id].tsx:730, 912`), NightModal and pause confirm (`producer/[id].tsx:653, 557`), DeleteConfirmModal (`settings.tsx:138`), ReportModal (`report-modal.tsx:82`). No sheet supports swipe-down. Why it matters: the same gesture works on half the app's sheets and silently fails on the other half; on iOS the no-backdrop sheets have exactly one dismiss affordance.

### M-4. Four different corner radii across chip-shaped peers

Chips that read as the same component: filter bar and filter sheet chips `borderRadius: 22` (`filter-bar.tsx:237`, `filter-sheet.tsx:276`), test-kit chips 22 (`test-kit.tsx:545`), series-form chips 18 (`series-form.tsx:879`), profile role chips 16 (`profile.tsx:350`), the share pill `radius.pill` 999 (`mic/[id].tsx:1054`). All are hardcoded; none use the radius tokens. Why it matters: chip corners visibly differ between the filter bar and the series form, which use chips for the same discipline concept.

### M-5. Body text never renders in the brand font, and the EULA screen bolds with a different mechanism than the terms screen

`ui.tsx:212-221`: `body` and `caption` styles set no `fontFamily`, so all Body/caption copy renders in the system font while headings, labels, and buttons are Poppins. Separately, `eula.tsx:148,154` uses `fontWeight: '600'` (system bold) for terms headings while `terms.tsx:81,87` styles the identical content with `fonts.semibold` (Poppins). Why it matters: the same legal text looks different on the acceptance screen and the read-only screen, and the app's stated brand typography (tokens.ts:79-81) covers only half the text on screen.

### M-6. The left edge jumps 8pt when list screens change state

List states pad 16: `favorites.tsx:119-121`, `going.tsx:161-163`, `index.tsx:517-519`, `producer.tsx:262-264`, `network-screen.tsx:378-381`. Their empty, error, and signed-out states render inside `Screen`, which pads 24 (`ui.tsx:186`). Pull-to-refresh into an empty result, or sign in, and every aligned edge shifts by 8pt. Discover's own error/empty wrap also uses 24 (`index.tsx:524-528`) over a 16-padded list. Why it matters: content alignment is the strongest cue that two states are the same place.

### M-7. Two type sizes off the scale

`series-form.tsx:893` `chipText fontSize: 14` and `mic-map.tsx:205` `clusterCount fontSize: 14`. The scale defines 13 and 15 (`tokens.ts:88-95`); 14 belongs to neither, and the form's chips sit beside 15pt filter-bar chips on adjacent screens. (The 72pt live clock, `live/[occurrenceId].tsx:512`, is a deliberate display size and is noted, not charged.)

### M-8. Off-scale spacing values

The 4pt sub-grid is broken by: `logo.tsx:98` `marginLeft: 9`; `person-row.tsx:55` and `network-screen.tsx:405` `gap: 2` (hardcoded); the token `spacing.xxs = 2` itself (`tokens.ts:58`), used in 7 files; and the ShareCard canvas constants 30, 28, 18, 7, 6, 90 (x scale factor) at `share-card.tsx:73, 84, 104-109, 118, 130`. Full instance list in `ui-score.md`. Why it matters: individually invisible, collectively the reason near-identical rows measure differently.

### M-9. Dynamic type is capped at 1.6x

`tokens.ts:111` `maxFontScale = 1.6`, applied through `maxFontSizeMultiplier` everywhere. The full iOS accessibility range reaches roughly 3.1x; users at the largest sizes get 52% of the text size they asked for. This is a documented policy (the comment explains fixed chrome), and nothing truncates at 1.6x in code review, but the rubric's bar is the full range. Screens that do break within the allowed range are charged separately (H-1's row already collapses at 1x and worsens by 1.6x; H-4's ShareCard is uncapped and breaks beyond it).

### M-10. Reduce Motion is respected by presses but not by modals or the lottery shuffle

`pressable-scale.tsx:26-45` checks `useReducedMotion` (good, and covers every Button and card). But all 10 modal sheets use `animationType="slide"` unconditionally, tab transitions fade (`(tabs)/_layout.tsx:26`), stack screens slide (`_layout.tsx:239`), and the lottery draw runs a 120ms shuffle loop (`night/[occurrenceId].tsx:172-176`) with no reduced-motion branch. Why it matters: a user who asked the OS to reduce motion still gets the app's largest animations.

### M-11. Three surfaces with silent or missing fetch states

1. `mic/[id].tsx:1196-1210` MicCredits renders nothing on error (documented as deliberate; still a silent failure by the rubric's definition).
2. `night/[occurrenceId].tsx:543-545` WhoIsComing returns null while loading, then inserts a full box: an undeclared layout shift on the screen a host watches at showtime.
3. `producer.tsx:72-114` admin claims box has no loading branch; it pops in when data lands.

### M-12. The producer role is called "Host" everywhere except the test kit

"Host" is the user-facing word: `edit-profile.tsx:311`, `producer.tsx:117-135` ("Become a host"), `profile.tsx:111` (role chip), `new.tsx:84-100`. The test kit's role chip says "Producer" (`test-kit.tsx:364`). Admin-only surface, same account seeing both words.

### M-13. "My Mics" vs "My mics"

The tab is titled "My mics" (`(tabs)/_layout.tsx:64`). Copy pointing at it title-cases it: `index.tsx:437`, `mic/[id].tsx:742`, `edit-profile.tsx:320`, `producer/[id].tsx:126`, `features/producer/queries.ts:216-217`. Sentence case is otherwise applied consistently app-wide; this is the one systematic break.

### M-14. "That did not work." names neither the failure nor the fix

`test-kit.tsx:146,154` fallback error. Every other fallback at least names the action ("Could not cancel.", "Could not save."). Admin-only, still shipped copy.

### M-15. CLI vocabulary in user-facing copy

`test-kit.tsx:211-213`: "Run supabase db reset, or npx supabase migration up" rendered in-app. The audience is the admin/owner, but it is the only place system vocabulary reaches a screen.

### M-16. Two empty states with no action

`profile.tsx:186-196` (My nights, fully empty) and `profile.tsx:212` (nothing upcoming) direct the user to the Discover tab in prose but offer no tappable action, while the equivalent empties on Favorites (`favorites.tsx:55`) and Going (`going.tsx:63`) ship a "Find a mic" button.

### M-17. Input and card borders are below non-text contrast minimums

`palette.border` #2E2E3A measures 1.34:1 on `bgElevated` and 1.47:1 on `bg`; the input fill itself (`bgElevated` on `bg`) is 1.09:1. The rubric's non-text minimum is 3:1. Text inputs are identified by their labels and placeholder, which is why this is Medium, not higher, and it is not a text pair so it takes no Category 2 deduction; but low-vision users get almost no boundary cue for where a field starts. Affects every Field, select trigger, and card outline.

### M-18. Buttons have no horizontal padding

`ui.tsx:245-251`: `button` sets `alignItems: 'center'` and `minHeight` but no `paddingHorizontal`. Full-width buttons are fine; content-width buttons in rows (claim Approve/Reject `producer.tsx:97-109`, night actions `producer/[id].tsx:501-522`, waitlist Promote `night/[occurrenceId].tsx:421-430`) render their label flush to the button edge, so the visible pill is exactly as wide as its text. Why it matters: the tap target is the text width, and visually the buttons read as truncated.

---

## Polish

### P-1. The bottom-sheet corner radius (20) is a hardcoded value in 6 files

`confirm-sheet.tsx:64-65`, `select.tsx:283-284`, `filter-sheet.tsx:229-230`, `mic/[id].tsx:1166-1167`, `settings.tsx:210-211`, `report-modal.tsx:198-199`, `share-sheet.tsx:362-363`, `producer/[id].tsx:863-864`. Consistent everywhere, but 20 does not exist in the radius tokens (sm 10, md 12, lg 14), so the next sheet written from memory will drift.

### P-2. The sheet grabber is duplicated artwork

`select.tsx:289-296` and `filter-sheet.tsx:235-242` re-declare the same 44x5 grabber; the other 8 sheets have no grabber at all, which also makes the sheets look like two families.

### P-3. Press feedback is inconsistent across the chip family

Test-kit chips and the select trigger show a pressed background (`test-kit.tsx:551-553`, `select.tsx:261-263`); filter-bar chips, filter-sheet chips, series-form chips, and toast actions show nothing on press. Scored in Category 6.

### P-4. Skeleton and card artwork literals

`skeleton-card.tsx:51-63` line heights and radii (12, 4) and `mic-card.tsx:329-339` accent bar (4) and poster width (72) are one-off literals. Acceptable for placeholder artwork; listed for completeness.

### P-5. Three icon systems ship

Custom glyphs (semantic, tinted), Ionicons (chrome), FontAwesome6 (social brand marks only). The split is principled and each family is used consistently; noted so it stays deliberate.

### P-6. The credits screen pads 16 where sibling stack screens pad 24

`producer/credits/[id].tsx:404-409` vs the 24pt convention of `producer/[id].tsx:744-747`, `settings.tsx:178-181`, `edit-profile.tsx:504-507`.

### P-7. The toast dismiss is a text glyph

`toast.tsx:94-96` renders the character "✕" where the rest of the app uses `Ionicons name="close"` (`index.tsx:238`). Labeled and sized correctly; visual weight differs.

---

## Appendix: measured contrast ratios

Computed with WCAG 2.x relative luminance. AA thresholds: 4.5:1 body, 3:1 large text and non-text.

| Pair | Ratio | Verdict |
| --- | --- | --- |
| text #F4F4F6 on bg #0B0B0F | 17.88:1 | Pass |
| text on bgElevated #16161D | 16.39:1 | Pass |
| text on bgPressed #22222B | 14.36:1 | Pass |
| textSecondary #A8A8B3 on bg / bgElevated / bgPressed | 8.34 / 7.64 / 6.70:1 | Pass |
| textFaint #8E8E9A on bg / bgElevated / bgPressed | 6.07 / 5.56 / 4.87:1 | Pass |
| textDisabled #63636E on bgElevated | 3.03:1 | Disabled-only by documented policy; exempt from AA |
| danger #FF5D5D on bg / bgElevated / bgPressed | 6.53 / 5.98 / 5.24:1 | Pass |
| success #4CD97B on bg / bgElevated | 10.78 / 9.87:1 | Pass |
| warning #FFC94D on bg / bgElevated / bgPressed | 12.83 / 11.76 / 10.30:1 | Pass |
| brand #0FFEA7 on bg / bgElevated | 14.74 / 13.50:1 | Pass |
| button label: bg on text | 17.88:1 | Pass |
| accents music / comedy / poetry / other on bg | 7.68 / 11.43 / 7.43 / 5.76:1 | Pass |
| accents music / comedy / poetry on bgElevated | 7.04 / 10.47 / 6.81:1 | Pass |
| textSecondaryOnImage #C9C9D2 on bg-toned scrim | 11.94:1 (against solid bg; gradient floor 0.5 opacity unmeasurable statically, marked Unverified over pale posters) | Pass / Unverified |
| social brand icons instagram / youtube / spotify on bgElevated | 4.15 / 4.50 / 6.96:1 | Pass as non-text (3:1) |
| border #2E2E3A on bgElevated / bg | 1.34 / 1.47:1 | Fail non-text 3:1 (finding M-17) |

Line length and line height on running text: body 16/22 (1.375), terms 13/22 (1.69), both within the 1.3 to 1.8 comfort band; content column at 375pt is 327pt, under 75 characters at body size. No finding.

Keyboard audit: every screen with inputs uses FormScreen, KeyboardShift, or `automaticallyAdjustKeyboardInsets` except reset-password (M-2). No input measured as coverable at default text size.

Forms audit: email fields set `autoComplete`/`textContentType`/`inputMode` correctly (`sign-in.tsx:44-64`); numeric fields use numeric input modes (ZIP, birth year, cost, capacity); search uses `returnKeyType="search"` (`index.tsx:229`); validation runs on blur and clears on change, never mid-keystroke; all submit buttons carry busy/disabled states, and the two join-list buttons share a mutation key against double submission (`mic/[id].tsx:571-574`, `signup-card.tsx:89-92`), with the share sheet using a synchronous ref guard (`share-sheet.tsx:82-84, 182-196`).
