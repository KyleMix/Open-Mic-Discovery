# Store Listing Copy and Submission Checklist

## Identity

- Name: Open Mic Explorer
- iOS subtitle (30 chars max): Find a mic. Get on the list.
- Bundle id / package: com.openmicexplorer.app
- Category, and it differs per store because the taxonomies differ:
  - **Apple: Entertainment (primary), Music (secondary).** Apple has no
    Events category and no Comedy category for apps, so Entertainment is
    where live-event discovery lands (Eventbrite sits there too).
    Music is the only discipline-specific option available and it covers a
    real third of the product.
  - **Google Play: Events.** Play does have a dedicated Events category,
    and it fits better than Entertainment on both accuracy and visibility:
    the app is about scheduled, recurring, real-world events you attend or
    perform at, and Events is a far smaller pond than Entertainment, which
    is where every streaming service lives.
  - **Do not pick Social Networking or Social.** It is tempting because
    there are profiles, user content, and signup lists, but it is
    inaccurate (no feed, no follower graph, no direct messages, all
    deliberately out of v1) and it invites extra review scrutiny for no
    benefit. Guideline 1.2 obligations apply because of the user generated
    content, not because of the category, and those are already met.
- Monetization: none. No in-app purchases, no subscriptions, no ads.
- Age rating: do not enter a tier from memory. Answer both questionnaires from the evidence list in `SUBMISSION_CHECKLIST.md` (UGC yes, mild profanity yes, unrestricted web access yes, no purchases, no ads, no tracking) and record whatever tier each store returns. The in-app age gate is 18, enforced server side, and is the stricter control either way.

## Short description (Play, 80 chars)

Find open mics for music, comedy, and poetry near you, and get on the list.

## Full description

Open Mic Explorer puts every open mic near you on one map: music, comedy, and poetry, together for the first time.

FIND A MIC
See what is happening tonight on a map built for scanning at a glance. Filter by discipline, day, distance, cost, signup method, and start time. Every listing shows when it was last confirmed by the person who runs it, so you know before you drive across town.

GET ON THE LIST
Sign up for a slot without leaving the app. First-come lists confirm you instantly; lottery mics draw in the open. Watch your slot number update in real time and get a push the moment your status changes.

RUN YOUR MIC
Producers list a mic in two minutes with a plain-language schedule builder, confirm accuracy with one tap, cancel a night with a reason performers actually see, and manage the signup list live from the side of the stage.

BUILT FOR THE SCENE
One account covers both sides of the mic: perform on Tuesday, host on Wednesday. Dark interface that will not light up the room. Listings stay readable offline.

Everything is free. Finding mics, getting on the list, listing your own night, running the signup list, and seeing how your nights are going: all of it, for everyone.

## Keywords (iOS, 100 chars)

open mic,comedy,poetry,music,standup,songwriter,spoken word,signup,gig,show

## Screenshot shot list (per device size)

1. Map view, Seattle, clustered discipline markers visible. Caption: Every mic in town, one map.
2. List view with freshness badges. Caption: Know it is still running before you go.
3. Listing detail with signup card open. Caption: From found to on the list in two taps.
4. Producer night screen mid-lottery draw. Caption: Run the night from the side of the stage.
5. Recurrence builder with preview text. Caption: List your mic in plain English.
6. Filters row with poetry selected. Caption: Poetry, comedy, and music are all first class.

Required sizes: iPhone 6.9" and 6.5"; Play phone plus 7" and 10" tablet. Dark background frames, one caption line each, real seeded data.

## Submission prerequisites (owner actions)

1. Apple Developer Program and Play Console accounts; app records created with the identifiers above.
2. Hosted Supabase project: apply migrations (`supabase db push`), deploy `push-sender`, create production demo accounts, replace seed credentials in REVIEW_NOTES.
3. EAS project (`eas init`), secrets set: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SENTRY_DSN.
4. Google Maps API key for Android in app.json (android.config.googleMaps.apiKey).
5. Sign in with Apple (Services ID) and Google OAuth credentials configured in Supabase Auth.
6. Final art: app icon, adaptive icon set, splash (prompts ready in docs/ASSET_PROMPTS.md).
7. Host the privacy policy (`docs/privacy/PRIVACY_POLICY.md`) and the account deletion page (`docs/store/ACCOUNT_DELETION_PAGE.md`) at public URLs; paste them into App Store Connect (Privacy Policy URL) and the Play Console (Store listing, Data safety, and Data deletion).
8. Stand up the support inbox and finalize the address (`src/lib/support.ts`, DECISIONS_NEEDED item 11); it appears in the app, both store listings, and the deletion page.
9. `eas build --profile production`, TestFlight + Play internal testing pass, then `eas submit`.

The full owner runbook lives in `docs/store/SUBMISSION_CHECKLIST.md`.
