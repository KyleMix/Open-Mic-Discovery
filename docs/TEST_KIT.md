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

## Getting in

Profile tab, **Testing tools**. The button only appears for admins, and every
function behind it is refused server side for anyone else, so a non-admin who
guesses the route gets nothing.

## What each scenario builds

| Scenario                      | What lands                                                                           | What it is for                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| A mic of mine, starting soon  | One listing you own starting in 90 minutes, 6 performers already on the list         | Night-of roster, reorder, on deck, realtime, mark performed      |
| A lottery waiting to be drawn | Your lottery mic in 3 hours, 9 names for 5 slots, nothing drawn                      | The draw, who gets in, who waitlists, the pushes that follow     |
| A week of other people's mics | 6 listings over 7 days: every discipline, free and paid, 1 km out to 40 km           | Discovery filters, sorting, the map, distances, method labels    |
| A listing to claim            | One unclaimed mic near you, plus a pending claim from somebody else                  | Claiming with a verification note, and the admin claim queue     |
| Three freshness states        | Listings confirmed 2 days ago, 30 days ago, and never                                | The last-confirmed badge in green, amber, and gray, side by side |
| A full moderation queue       | A held profile, a held listing, an abuse report, a data-quality flag                 | The queue: approve, reject, resolve, dismiss                     |
| Me, on three lists            | Signs you up for three mics (confirmed, waitlisted, requested) and follows all three | The performer side: signup cards, favorites, day-of reminders    |

Scenarios stack. Run all seven and you have a populated city.

Every mic is placed relative to **your** home area and scheduled relative to
**your** device timezone, so "starting in 90 minutes" means 90 minutes from
now wherever you are.

## The other tools

- **The time machine.** Move the next test night to 5, 15, 30, 60, or 180
  minutes from now. This is how you watch a signup window close, the night-of
  view open, and day-of reminders fire without waiting for the calendar. The
  local date is recomputed in the series timezone, so nothing goes naive.
- **Add performers.** Puts test performers on any night, including a real
  listing of your own. Useful for loading up a mic you actually run.
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
bash scripts/db/verify-local.sh   # migrations, seed, and 266 pgTAP assertions
```
