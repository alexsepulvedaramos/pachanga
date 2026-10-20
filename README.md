# Pachanga

Tournament manager for 2v2 football video game nights — live at [pachanga-fc.vercel.app](https://pachanga-fc.vercel.app). One console,
friends, and a phone in everyone's pocket.

The admin runs the night from their phone — pairs drawn with a prize wheel, results entered as
matches finish — while everybody else follows the live table, the bracket and what's next on
their own phones or on the TV.

## Features

- **Pairs draw with a wheel.** Every club appears twice; the second time a club comes out, a pair
  is formed. With an odd number of players one club comes out once and its owner plays solo.
  Pairs can also be assigned by hand.
- **6 to 16 players.** The format adapts to the number of pairs:

  | Pairs | Players | Group stage | Knockout |
  | --- | --- | --- | --- |
  | 3 | 6 | Home and away | 1st straight to the final, 2nd vs 3rd for the other place |
  | 4 | 7–8 | Home and away | Semis 1st–4th and 2nd–3rd, third place, final |
  | 5 | 9–10 | Single round-robin | Top 3 to the semis, 4th vs 5th playoff |
  | 6–7 | 11–14 | Single round-robin | Top 2 to the semis, 3rd–6th playoff |
  | 8 | 15–16 | Single round-robin, 4-minute halves | Quarters 1–8, 4–5, 2–7, 3–6, semis, third place, final |
- **Group stage on a single console.** Round-robin ordered so no team plays two matches in a row
  (whenever the number of teams allows it) and everybody stays within one match of each other.
- **Live standings** with tiebreakers chosen and ordered when the tournament is set up
  (goal difference, goals for, head-to-head, wins, drawing of lots…).
- **Playoff and bracket as the house rules want them.** With 5–7 pairs, top two go straight to
  the semis, 3rd–6th play a playoff where the 3rd picks their opponent and the 4th picks the order; the group winner
  picks their semi-final opponent. Extra time and penalties in knockout matches.
- **Solo player support.** Before each of their matches the solo player gets a partner drawn from
  whoever isn't playing; for the knockout stage they draw a fixed partner from eliminated players.
  Injuries mid-tournament turn the partner into a solo player automatically.
- **Red cards and injuries** of in-game footballers, picked from the club's real squad: they are
  shown as unavailable in that club's next match (the final is exempt) and in the push notification.
- **Balanced club picker.** Pick a target rating and get clubs from the big five leagues as close
  to it as possible, or browse them: each club shows its estimated rating, attack/midfield/defence,
  stars and best starting XI on a pitch. Ratings are labelled with the game edition they belong to.
- **Optional goal scorers** and a top scorers table.
- **Your matches.** Each phone can say who is holding it: that player's matches are highlighted and
  a panel says whether it's their turn, how many matches until theirs and roughly at what time.
- **Push notifications.** Players can ask to be told when it's their turn, when they're up next,
  when they have to pick an opponent and who won. A database trigger calls a Supabase Edge
  Function on every change; it reuses the app's own domain code (bundled with esbuild) to work out
  who to notify and records what it sent so nothing is repeated.
- **Share to the group chat.** The tournament link goes to WhatsApp, the phone's share sheet or the
  clipboard: offered right after creating the tournament, from the code in the header, and with the
  standings as text.
- **TV mode** with the current match, standings and upcoming fixtures in big type.
- **Installable** as a PWA (manifest, maskable icons, service worker), with an install banner that
  uses the browser prompt on Android/desktop and explains Add to Home Screen on iOS.
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

## Club ratings

EA publishes player ratings but not team ratings or default lineups. `scripts/update-club-ratings.ts`
reads the public feed behind [ea.com/games/ea-sports-fc/ratings](https://www.ea.com/games/ea-sports-fc/ratings)
for every club in the big five leagues, finds each club's best XI across 4-3-3, 4-2-3-1, 4-4-2 and
3-5-2, and averages it, which is how the game rates a team from its starting XI. The result is a
static file per game edition in `public/data/clubs/`, with an index of the editions available.

- Estimates can differ by a point or two from the game, where each club uses its real coach's
  formation and lineup. The star rating is an approximation calibrated against published stars.
- The feed is undocumented and has no edition parameter: it serves whatever EA considers current
  (FC 26 when this was built). The script refuses to overwrite an edition when most ratings jump at
  once, which is what a switch to the next game would look like; run it with the new id
  (`node scripts/update-club-ratings.ts fc27`) to add that edition alongside the old one.
- `.github/workflows/club-ratings.yml` refreshes the file daily and commits only when it changes.
  The app never calls EA directly, so it keeps working with the last good data if the feed changes.

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
  without commits; the daily club ratings commits usually prevent that, and either can be
  re-enabled from the Actions tab.
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
