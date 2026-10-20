# P0PPER CUP

Tournament manager for 2v2 football video game nights: one console, a living room full of
friends, and a phone in everyone's pocket.

The admin runs the night from their phone — pairs drawn with a prize wheel, results entered as
matches finish — while everybody else follows the live table, the bracket and what's next on
their own phones or on the TV.

## Features

- **Pairs draw with a wheel.** Every club appears twice; the second time a club comes out, a pair
  is formed. With an odd number of players one club comes out once and its owner plays solo.
  Pairs can also be assigned by hand.
- **Group stage on a single console.** Round-robin ordered so no team plays two matches in a row
  and everybody stays within one match of each other.
- **Live standings** with tiebreakers chosen and ordered when the tournament is set up
  (goal difference, goals for, head-to-head, wins, drawing of lots…).
- **Playoff and bracket as the house rules want them.** Top two go straight to the semis, 3rd–6th
  play a playoff where the 3rd picks their opponent and the 4th picks the order; the group winner
  picks their semi-final opponent. Extra time and penalties in knockout matches.
- **Solo player support.** Before each of their matches the solo player gets a partner drawn from
  whoever isn't playing; for the knockout stage they draw a fixed partner from eliminated players.
  Injuries mid-tournament turn the partner into a solo player automatically.
- **Red cards and injuries.** A player marked in a result misses their team's next match (the
  final is exempt); the next match shows who is out.
- **Optional goal scorers** and a top scorers table.
- **TV mode** with the current match, standings and upcoming fixtures in big type.
- **Estimated finish time** from minutes per half and changeover time per phase.
- **Realtime sync** across devices, with a catch-up refresh when a phone wakes up or reconnects.
  Anyone with the code can watch; only the admin PIN can write, and five wrong PINs lock the
  tournament for ten minutes.
- **Demo mode** that runs entirely in the browser.

## Stack

- **Angular 22** — standalone components, signals, zoneless change detection, lazy routes.
- **Tailwind CSS 4** with a custom design system (tokens in `src/styles.css`): condensed italic
  display type, clipped corners and slanted buttons.
- **Supabase** — Postgres + Realtime. No custom backend: the tournament is a JSON document read
  through RLS and written only through `security definer` functions that check a bcrypt-hashed PIN
  and an expected version (optimistic concurrency).
- **Vitest** for unit and component tests. Deployed on **Vercel**.

## Architecture

```
src/app/
  domain/      Pure TypeScript tournament engine: scheduling, standings, knockout, draws.
               No Angular, fully deterministic with a seeded RNG, covered by tests.
  data/        Repository abstraction with a browser (localStorage) and a Supabase
               implementation, plus the per-tournament session (signals + optimistic saves).
  pages/       Routed screens: setup, wheel, matches, table, bracket, scorers, TV.
  ui/          Shared presentational components (wheel, match card, standings table…).
supabase/
  migrations/  Schema, row level security and RPCs.
```

Every change is a pure function `(tournament) => tournament` from `domain/tournament.ts`. The
session applies it optimistically, saves it with the version it was based on, and rolls back or
reloads if the save is rejected. Other devices receive the new document through Realtime.

## House rules worth knowing

Where the rulebook leaves room for interpretation, the app does this:

- **Solo player in the playoff:** nobody is eliminated yet, so they get a drawn stand-in per match,
  as in the group stage. The fixed partner from the eliminated players is drawn for the semis.
- **Group winner's pick:** the 1st can choose any of the other semi-finalists, the 2nd included.
- **A withdrawal while someone already plays solo:** both play as solo players with drawn
  stand-ins rather than merging into one team.
- **Suspended player:** their partner plays the match alone; a solo player who is suspended is
  replaced by the drawn stand-in only.

## Operations

- **CI** (`.github/workflows/ci.yml`) runs the tests and a production build on every push.
- **Keep-alive** (`.github/workflows/keep-alive.yml`) reads one row every three days so the free
  Supabase project never pauses for inactivity. GitHub disables scheduled workflows after 60 days
  without commits; re-enable it from the Actions tab if that happens.
- **Deploys** happen on Vercel on every push to `main`.

## Running locally

```bash
npm install
npm start
```

Without backend settings the app stores tournaments in the browser, which is enough to try it
out. To sync between devices, create a Supabase project, run
`supabase/migrations/0001_init.sql` and fill in the URL and publishable key in
`src/app/config.ts`.

```bash
npm test
```
