# Testing tools

Everything the owner account needs to exercise the whole app without creating
mics by hand, without inventing users, and without a production build.

Two pieces:

1. **Owner bootstrap.** Signing in with `kylewmixon@gmail.com` on any
   environment lands a full account: performer, producer, and admin, already
   approved, with the performer and producer rows present. There is no SQL
   editor step after a database reset and no step after standing up a new
   hosted project.
2. **The test kit.** Admin-only server functions that build a whole situation
   in one call, and one call that removes exactly what they built.

Both live in `supabase/migrations/20260801000100_test_kit.sql`, with the
pgTAP suite in `supabase/tests/test-kit.test.sql`.

## Keeping the database in step

The tools **are** database functions, so a database without the newest
migrations does not have them. That failure is confusing on its own terms: it
answers 404 for a tool it has never seen and 400 for a scenario name it does
not know, and neither of those says "run your migrations".

`supabase start` boots whatever database is already in the container and never
looks at `supabase/migrations`, which is why this drifted in the first place.
`npm run dev:up` now applies pending migrations as part of starting up, so it
keeps step on its own:

```bash
npm run dev:up      # start the stack, apply migrations, write .env
npm run db:migrate  # just the migrations, keeping your data
npm run db:reset    # rebuild from every migration plus the seed, data discarded
npm run dev:doctor  # reports a database that is behind, among other things
```

Testing tools also checks: the kit reports its version, the app compares it
against the version it was built for, and a database that is behind gets a
banner at the top naming the fix.

When a migration adds or changes a test kit entry point, bump
`private.test_kit_version()` and `EXPECTED_KIT_VERSION` in
`src/features/testkit/queries.ts` together.

## Getting in

Profile tab, **Testing tools**. The button only appears for admins, and every
function behind it is refused server side for anyone else, so a non-admin who
guesses the route gets nothing.

## The tests

Each one is a lane: one button that builds the situation and then puts you
inside it. Nothing asks you to set something up and then go find it, because
that is the step where a test gets abandoned. Back out of the screen it lands
on and you are in Testing tools again, ready for the next.

| Test                | What it builds                                                                                  | Where it lands   |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| Run a live show     | A night already running: 2 performed, 1 no-show, one on stage, next on deck, 2 to go, 2 waiting | Live             |
| Work tonight's list | A mic you run, starting soon, with 6 performers signed up                                       | The night's list |
| Draw a lottery      | 9 names in the hat for 5 slots, nothing drawn                                                   | The night's list |
| Browse and filter   | 6 listings over a week: every discipline, free and paid, walking distance out to a drive        | Discover         |
| Claim a listing     | An unclaimed mic near you, plus a pending claim from somebody else                              | The mic page     |
| Compare freshness   | Three listings confirmed 2 days ago, 30 days ago, and never                                     | Discover         |
| Work the queue      | A held profile, a held listing, an abuse report, a data-quality flag                            | Moderation queue |
| Be a performer      | You on three lists (confirmed, waitlisted, requested), following all three                      | Going            |

Each card says what to try once you are there, so read it before tapping.

Tests stack: run them all and you have a populated city.

Every mic is placed relative to **your** home area and scheduled relative to
**your** device timezone, so "starting in 90 minutes" means 90 minutes from
now wherever you are.

A lane that cannot reach its screen does not navigate. If a scenario returns
without the ids the destination needs (which is what a stale database does),
the screen says so instead of pushing a blank page.

## The tools

Not tests: the adjustments a test needs. Each one acts on the night you last
built and then opens it, so you can see what it did.

- **Move it (5, 15, 30, 60, 180 minutes)** then opens the mic page, so a
  signup window can be watched opening and closing without waiting for the
  calendar. The local date is recomputed in the series timezone, so nothing
  goes naive, and an ended show reopens.
- **Add 3 performers and open the list.** Works on a real listing of yours
  too, not only on test data.
- **Rewind it and run it live.** Everyone who went up goes back on the list,
  on-deck flags clear, the controls reopen, and it moves the night into the
  live window first if it is further out than an hour. Waitlisted names stay
  waitlisted: they never got on. A lottery night rewinds to drawn rather than
  confirmed, because that is the state its list fills into.
- **Your roles.** Turn performer or producer off to see the app the way
  somebody without that role sees it. Admin deliberately stays on, so you can
  always get back to this screen.
- **Test sign-ins.** Every generated account uses the password
  `openmic-test-1234` at an `@openmic.test` address. Sign in as one on a
  second device to watch a roster update live from both sides.

## Cleaning up

**Remove all test data** deletes exactly what the kit created, in dependency
order, and nothing else. Real listings survive even when test performers were
added to one of their nights: only those signups go. Verified by pgTAP, which
counts every table before and after and asserts they match.

## Turning it off

The kit has a kill switch (`test_kit_settings.enabled`). Switch it off from
the bottom of the Testing tools screen before store submission; every kit
function then refuses, admin or not. It can be switched back on from the same
screen, so it is not a one-way door.

From SQL, if you prefer:

```sql
update test_kit_settings set enabled = false;
```

## Safety notes

- `is_admin` cannot be self-granted (the profiles guard pins it), so the kit
  is reachable only by the bootstrapped owner and anyone an admin promotes.
- Generated sign-ins only ever use the reserved `@openmic.test` domain, so a
  test account can never collide with a real person's email.
- Every created row is recorded in `test_kit_objects`, which is readable by
  admins and writable by nobody: only the definer functions insert into it.
- The kit never bypasses row level security for the client. It runs as the
  definer inside the database and returns plain results.

## Adding an owner email

`private.owner_emails()` in the migration holds the allowlist. Adding an
address there promotes that account on its next sign-up. It never demotes
anyone.

## Local verification

```bash
bash scripts/db/verify-local.sh   # migrations, seed, and 283 pgTAP assertions
```
