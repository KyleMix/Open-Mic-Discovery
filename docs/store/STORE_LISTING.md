# Store Listing Copy and Submission Checklist

## Identity

- Name: Open Mic Explorer
- iOS subtitle (30 chars max): Find a mic. Get on the list.
- Bundle id / package: com.openmicexplorer.app
- Category: Entertainment (primary), Music (secondary)
- Age rating: 17+ (Apple: infrequent/mild mature themes, user generated content; Play: rate honestly through the questionnaire, UGC yes)

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

Discovering and performing are free, forever. Producer Pro unlocks list management and analytics for the people running the night.

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
3. EAS project (`eas init`), secrets set: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_REVENUECAT_IOS_KEY, EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.
4. RevenueCat project with `producer_pro` entitlement and a monthly product in both stores; verify the buy, reinstall, restore cycle in TestFlight/internal testing.
5. Google Maps API key for Android in app.json (android.config.googleMaps.apiKey).
6. Sign in with Apple (Services ID) and Google OAuth credentials configured in Supabase Auth.
7. Final art: app icon, adaptive icon set, splash (prompts ready in docs/ASSET_PROMPTS.md).
8. `eas build --profile production`, TestFlight + Play internal testing pass, then `eas submit`.
