# UI Score

Re-audited after the fix pass: see "Re-audit after fixes" at the bottom. The original Phase 3 scoring of commit `0739d0d` is preserved below unchanged.

Phase 3 of the visual and usability audit, scored strictly against the fixed benchmark. Every deduction cites the count that produced it; counts come from `ui-inventory.md` (census) and `ui-findings.md` (per-finding measurements). Re-running this audit on the unchanged codebase at commit `0739d0d` reproduces every number.

## Summary table

| Category | Max | Score |
| --- | --- | --- |
| 1. Token and consistency discipline | 20 | 11 |
| 2. Accessibility floor | 20 | 10 |
| 3. Layout integrity | 15 | 10 |
| 4. State coverage | 15 | 14 |
| 5. Navigation and platform fit | 10 | 8 |
| 6. Interaction feedback | 10 | 0 |
| 7. Copy and content | 10 | 2 |
| **Raw total** | **100** | **55** |
| **Blocker cap** | 69 | triggered |
| **Capped total** | | **55** |

Blockers triggering the cap (cap does not bind because raw 55 < 69, but it is triggered and reported as required):

1. **Three or more undersized touch targets**: 7 controls measure under 44pt (finding B-1).
2. **Destructive action with no confirmation**: 3 single-tap destructive actions (finding B-2).

Band (bands are not defined by the benchmark, so they are declared here and used consistently): 90 to 100 store-ready; 75 to 89 solid, polish remaining; 70 to 74 marginal; 69 and below blocked, fix Blockers and re-audit. **55 = Blocked.**

---

## Category 1: Token and consistency discipline (11/20)

**Hardcoded style literal rate.** 73 hardcoded / 1619 total style declarations = 4.51% (census method in `ui-inventory.md` section 4). 4.51% < 5% → **deduct 0**.

**Spacing values off the 4pt or 8pt scale.** 16 instances:

| Value | Instances | Locations |
| --- | --- | --- |
| 2 (`spacing.xxs` token, off the 4pt sub-grid) | 7 | select.tsx:325, producer/[id].tsx:811, night/[occurrenceId].tsx:679, mic/[id].tsx:1122, profile.tsx:319, series-form.tsx:922, credit-card.tsx:91 |
| 2 (hardcoded) | 2 | person-row.tsx:55, network-screen.tsx:405 |
| 9 | 1 | logo.tsx:98 (marginLeft) |
| 30·s, (28+90)·s, 18·s, 7·s, 6·s, 6·s | 6 | share-card.tsx:73, 73, 108, 118, 84, 130 |

16 is over 15 → **deduct 6**.

**Colors beyond the defined palette.** Grep across all non-test source for hex, rgb, and rgba literals outside `src/theme/tokens.ts`: 0 matches. Near-duplicates within the palette itself: none (13 palette + 4 accent + 3 brand values, minimum pairwise distinction well above perceptual delta). Count 0 → **deduct 0**.

**Distinct font size and weight combinations.** 16 static combinations (dynamic sizes, e.g. avatar initials at `size * 0.4`, excluded; including them raises the count):

1. 28 semibold (Title, screen titles, clock stats)
2. 20 semibold (section headings)
3. 20 medium (mic/[id].tsx:1088 `when`, series-form.tsx:864 sectionLabel)
4. 16 system-regular (Body, ui.tsx:212)
5. 16 medium (field labels, button labels, names)
6. 16 semibold (toast actions, person names)
7. 16 system-600 (eula.tsx:146-149)
8. 15 medium (chip labels, share pill)
9. 15 Poppins-regular (logo.tsx:93-98 header wordmark)
10. 13 system-regular (captions)
11. 13 medium (links, statuses, chip labels)
12. 13 Poppins-regular (stewardship-badge.tsx:64-66)
13. 13 system-600 (eula.tsx:151-156)
14. 14 system-regular (series-form.tsx:891-894)
15. 14 medium (mic-map.tsx:202-206)
16. 72 semibold (live clock)

16 is over 14 → **deduct 3**.

Category 1 = 20 − 0 − 6 − 0 − 3 = **11**.

## Category 2: Accessibility floor (10/20)

**Text/background pairs failing WCAG AA.** Every rendered pair computed (30 pairs, appendix of `ui-findings.md`); worst passing body pair is textFaint on bgPressed at 4.87:1. Failures: 0 → **deduct 0**. (Border non-text contrast at 1.34:1 is finding M-17; it is not a text/background pair, so this line takes no deduction by the rubric's wording.)

**Touch targets under the platform minimum.** 7 components under even the iOS 44pt floor (B-1: share pill 36, intent tabs 34, search-panel Clear 18, Open settings 26, Back to home area 18, Forgot password ~20, test-kit chip 40). 7 × 2 = 14, capped at 6 → **deduct 6**. (The additional class of 44pt controls under Android's 48dp, finding H-3, is already beyond the cap.)

**Screens that break at the largest accessibility text size.** 2: the manage-mic night rows (H-1: already compressed at 1x and 375pt, collapse further as text grows to the 1.6x cap) and the share sheet/flyer (H-4: ShareCard text is uncapped and overflows its fixed canvas at large sizes). 2 × 2 = **deduct 4**. (The global 1.6x cap, M-9, prevents full-range rendering but produces no truncation or overlap in code review, so no screen is charged for it.)

**Icon-only controls missing accessibility labels.** Audited every icon-only Pressable: card star and share, roster icon actions, toast dismiss, map markers, saved-search delete, credit report flag, search clear/locate/view toggle. All labeled. 0 → **deduct 0**.

**Information conveyed by color alone.** Freshness pairs glyph color with a text label; discipline accents pair with glyphs; cancellations pair strikethrough with a note; on-deck and timer states pair color with text; toggle dots change lightness (dark #22222B to bright #4CD97B) alongside a border change and an `accessibilityState`. 0 instances of hue-only signaling → **deduct 0**.

Category 2 = 20 − 0 − 6 − 4 − 0 − 0 = **10**.

## Category 3: Layout integrity (10/15)

**Safe area violations.** 1: bottom sheets extend to the physical bottom with 24 to 32pt of padding against a 34pt home-indicator inset and never read `useSafeAreaInsets` (M-1; worst case the select sheet footer at 24pt). Counted once as a single shared-pattern violation across the 8 affected sheets. 1 × 3 = **deduct 3**.

**Clipping, overflow, or forced horizontal scroll at 375pt.** 1: the manage-mic night action row (H-1; measured 226pt of buttons in a 295pt row leaving ~61pt for flexible content, overflowing when the fifth button appears). Horizontal ScrollViews in the filter bar are intentional chip rails, not forced scroll. 1 × 2 = **deduct 2**.

**Inputs the keyboard can cover.** 0 at default text size: all input screens use FormScreen, KeyboardShift, or `automaticallyAdjustKeyboardInsets`; reset-password's fields measure within the visible area at 1x (M-2 records the risk at large text as Unverified, which per the rubric is reported, not scored). **Deduct 0**.

Category 3 = 15 − 3 − 2 − 0 = **10**.

## Category 4: State coverage (14/15)

27 data-fetching surfaces, 4 required states each = 108 required. A loading state that deliberately renders nothing counts only when a comment declares it deliberate; a silent error is always a miss (the rubric calls silent failure a failure).

| # | Surface | Load | Empty | Error | Long | Present |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Discover feed (index.tsx) | skeleton | ZeroResults | retry | truncation | 4 |
| 2 | Favorites | ✓ | ✓ | ✓ | ✓ | 4 |
| 3 | Going | ✓ | ✓ | ✓ | ✓ | 4 |
| 4 | Network connections | ✓ | ✓ | ✓ | ✓ | 4 |
| 5 | Network people search | ✓ | ✓ | ✓ | ✓ | 4 |
| 6 | Network connection nights | ✓ | ✓ | ✓ | ✓ | 4 |
| 7 | Producer series list | ✓ | ✓ | ✓ | ✓ | 4 |
| 8 | Admin claims box (producer.tsx:72-114) | ✗ pop-in | ✓ hidden by design | ✓ | ✓ | 3 |
| 9 | Mic detail | ✓ | ✓ not-found | ✓ | ✓ | 4 |
| 10 | Mic credits (mic/[id].tsx:1196-1253) | ✓ documented | ✓ | ✗ silent | ✓ | 3 |
| 11 | Who is coming (night/[occurrenceId].tsx:528-573) | ✗ pop-in | ✓ | ✓ | ✓ | 3 |
| 12 | Profile + My nights | ✓ | ✓ | ✓ | ✓ | 4 |
| 13 | Blocked users (settings.tsx) | ✓ | ✓ | ✓ | ✓ | 4 |
| 14 | Notification prefs | ✓ | ✓ defaults | ✓ | ✓ | 4 |
| 15 | Moderation queue (admin.tsx) | ✓ | ✓ | ✓ | ✓ | 4 |
| 16 | Test kit status | ✓ | ✓ | ✓ | ✓ | 4 |
| 17 | Manage mic: detail + occurrences + attendance | ✓ | ✓ | ✓ | ✓ | 4 |
| 18 | Night roster | ✓ | ✓ | ✓ | ✓ | 4 |
| 19 | Live screen | ✓ | ✓ | ✓ | ✓ | 4 |
| 20 | Analytics | ✓ | ✓ | ✓ | ✓ | 4 |
| 21 | Credits editor + person search | ✓ | ✓ | ✓ | ✓ | 4 |
| 22 | Venue search (series-form.tsx:815-846) | ✗ | ✗ | ✗ | ✓ | 1 |
| 23 | EULA gate | ✓ | ✓ | ✓ | ✓ | 4 |
| 24 | Terms | ✓ | ✓ | ✓ | ✓ | 4 |
| 25 | Share sheet | ✓ | n/a ✓ | ✓ | caps lines | 4 |
| 26 | Auth callback | ✓ | n/a ✓ | ✓ | n/a ✓ | 4 |
| 27 | Reset password (exchange) | ✓ | n/a ✓ | ✓ | n/a ✓ | 4 |

States present = 108 − 6 = 102. Score = floor(102 / 108 × 15) = floor(14.17) = **14**.

## Category 5: Navigation and platform fit (8/10)

- Tab bar outside 3 to 5: **yes**, 6 destinations (`(tabs)/_layout.tsx:29-76`: Discover, Favorites, Going, Network, My mics, Profile) → **deduct 2**.
- Screen without a clear back or dismiss path: none; every routed screen renders a header (the ScreenHeader-in-every-branch pattern) or sits under the tab bar, and every sheet has a labeled close action plus `onRequestClose` → deduct 0. (Inconsistent backdrop-tap dismissal is finding M-3; a clear path still exists.)
- Header treatment inconsistent across more than a third of screens: no; all headers share `palette.bg`/`palette.text`, one screen (Discover) uses the brand lockup by design → deduct 0.
- System icon repurposed to a non-standard function: none; all 20 Ionicons uses match their platform meaning → deduct 0.
- Dead-end screens: none; not-found, NotYourMic, and every error state carry an exit → deduct 0.

Category 5 = 10 − 2 = **8**.

## Category 6: Interaction feedback (0/10)

- Components lacking a pressed state: 9 counted (filter-bar chips, filter-sheet chips, series-form chips, MicCard star, MicCard share, search-panel rows, mic-detail flag/claim/report rows, report-modal reason rows, roster IconActions; citations in P-3, H-2, B-1). 9 × 2 = 18, capped at 4 → **deduct 4**.
- Missing disabled state where the action can be unavailable: 0 found; Button renders 0.4 opacity when disabled or busy (`ui.tsx:260-262`) and every conditional submit uses it → deduct 0.
- Submit path with no double-tap protection: 0 found; busy props disable during flight, the join action is deduplicated across its two buttons by a shared mutation key, and the share sheet uses a synchronous ref guard → deduct 0.
- Action with no visible response inside 100ms: 0 found; PressableScale animates at 90ms for buttons and cards, and stateful chips re-render their active state on the same frame → deduct 0.
- Destructive action without confirmation: 3 (B-2: remove walk-in, remove connection, admin take-down). No cap is defined for this item. 3 × 2 = **deduct 6**.

Category 6 = 10 − 4 − 0 − 0 − 0 − 6 = **0**.

## Category 7: Copy and content (2/10)

- Action named differently in different places: 1, the producer role is "Host" in four surfaces and "Producer" in the test kit (M-12). 1 × 2 = **deduct 2** (max 4 not reached).
- Error messages naming neither the failure nor the fix: 1, "That did not work." (M-14; other fallbacks name at least the failed action). 1 × 1 = **deduct 1** (max 3 not reached).
- Empty states with no action: 2, both My nights empties on the profile (M-16). 2 × 1 = **deduct 2** (max 3 not reached).
- Sentence case applied inconsistently: yes, "My Mics" title-cased in five copy locations against the tab's "My mics" (M-13) → **deduct 2** flat.
- System vocabulary in user-facing text: 1, supabase CLI commands rendered in the test kit (M-15). 1 × 1 = **deduct 1** (max 2 not reached).

Category 7 = 10 − 2 − 1 − 2 − 2 − 1 = **2**.

---

## Result

Raw total: 11 + 10 + 10 + 14 + 8 + 0 + 2 = **55 / 100**.

Blocker cap: triggered by B-1 (seven undersized touch targets, threshold is three) and B-2 (three destructive actions without confirmation). Cap value 69; raw 55 is already below it.

**Capped total: 55. Band: Blocked (69 and below).**

What the number says to fix, in order of points recoverable: confirmations and pressed states (Category 6, 10 points), copy naming and empty-state actions (Category 7, 8 points), the seven undersized targets and two large-text breaks (Category 2, 10 points), the off-scale spacing and the two stray font sizes (Category 1, 9 points), sheet safe areas and the night-row overflow (Category 3, 5 points), the venue-search states (Category 4, 1 point at minimum granularity). The 6-tab bar costs 2 points in Category 5 but is a product decision to review, not a mechanical fix.

---

## Re-audit after fixes

Every deduction-producing item was fixed except the 6-destination tab bar, which the owner chose to keep pending a product decision. Same method, same benchmark, re-measured on the fixed tree.

| Category | Max | Before | After |
| --- | --- | --- | --- |
| 1. Token and consistency discipline | 20 | 11 | 19 |
| 2. Accessibility floor | 20 | 10 | 20 |
| 3. Layout integrity | 15 | 10 | 15 |
| 4. State coverage | 15 | 14 | 15 |
| 5. Navigation and platform fit | 10 | 8 | 8 |
| 6. Interaction feedback | 10 | 0 | 10 |
| 7. Copy and content | 10 | 2 | 10 |
| **Raw total** | **100** | **55** | **97** |
| **Blocker cap** | 69 | triggered | not triggered |
| **Capped total** | | **55** | **97** |

Band: **97 = store-ready (90 to 100)**.

Arithmetic for the two remaining deductions:

- Category 1, distinct font size and weight combinations: 12 remain after consolidation (28 semibold; 20 semibold; 16 regular, medium, semibold; 15 medium; 15 Poppins-regular logo wordmark; 13 regular, medium, semibold; 13 Poppins-regular stewardship badge; 72 semibold clock). 12 falls in the 10 to 14 bracket → deduct 1. Going under 10 would mean changing the brand wordmark's weight or removing the live clock's display size, neither of which the audit recommends.
- Category 5, tab bar: 6 destinations, unchanged by owner decision → deduct 2.

Counts behind the cleared deductions, re-measured:

- Hardcoded literal rate: 54 / 1638 = 3.30% (under 5% → 0, as before).
- Spacing values off the 4pt or 8pt scale: 0. The `xxs: 2` token was removed (its 7 usages moved to `xs: 4`), the hardcoded `gap: 2` pair and `marginLeft: 9` were tokenized, and the ShareCard canvas constants moved onto the grid (32, 28+88, 16, 8, 4).
- Colors beyond the palette: 0 (unchanged).
- Text pairs failing AA: 0 (unchanged).
- Touch targets under the platform minimum: 0. All seven undersized controls now carry `minTouchTarget` boxes, and `minTouchTarget` itself is platform-correct (44pt iOS, 48dp Android). The MicCard star/share overlap is gone: both are full-size adjacent boxes.
- Screens breaking at the largest text size: 0. The manage-mic night rows stack and wrap; the ShareCard pins its canvas text at 1x by design.
- Safe area violations: 0. Every bottom sheet pads `max(insets.bottom, previous padding)`.
- Overflow at 375pt: 0 (night rows restructured).
- State coverage: 108 / 108. Venue search gained searching, empty, and error states; the claims box and Who-is-coming gained loading states; MicCredits reports a failed fetch.
- Components lacking a pressed state: 0 of the 9 counted (chips, card overlays, list rows, icon actions, toast actions all respond).
- Destructive actions without confirmation: 0 (walk-in removal, connection removal, and moderation take-down all confirm).
- Copy: role is "Host" everywhere; the fallback error names failure and fix; both profile empties carry a "Find a mic" action; "My mics" casing matches the tab in all five locations; no CLI vocabulary remains on screen.
