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
  the semis, 3rd–6th play a playoff where the 3rd picks their opponent (the 5th or the 6th, never the 4th) and the 5th picks which tie goes first; the group winner
  picks their semi-final opponent (never the 2nd) and the 3rd semi-finalist picks which semi goes first. Extra time and penalties in knockout matches.
- **Solo player support.** Before each of their matches the solo player gets a partner drawn from
  whoever isn't playing, favouring those with the least riding on the match (see below), final
  included: nobody plays extra matches as a fixed partner, and a stand-in who plays the final is
  not a champion. Injuries mid-tournament turn the partner into a solo player automatically.
- **Red cards and injuries** of in-game footballers, picked from the club's real squad: they are
  shown as unavailable in that club's next match (the final is exempt) and in the push notification.
- **Balanced club picker.** Pick a target rating and get clubs from the big five leagues as close
  to it as possible, or browse them: each club shows its estimated rating, attack/midfield/defence,
  stars and best starting XI on a pitch. Ratings are labelled with the game edition they belong to.
- **Players start their match and enter its result too.** Any player of the match that's up can
  start it, and while it's being played any of its players can enter the result, from the phone
  holding their name; a Supabase Edge Function checks that phone's token and
  applies it with the app's own rules (bundled like the notifications). The match then shows who
  entered it, and the admin can still correct it.
- **Optional goal scorers** and a top scorers table.
- **Ballon d'Or** (optional): when the final ends every player votes a podium (3, 2 and 1 points,
  never themselves) from their phone. Ballots stay secret in their own table; the vote closes when
  everybody has voted or the admin closes it. A ballot is cast by the phone holding that name, and
  the admin can delete one.
- **Format and rules.** Once the tournament is on, an info button in the header opens a sheet that
  explains in plain words the format that was set up: matches, minutes per half, tiebreakers, who
  chooses what in the knockout, solo players, injuries and the Ballon d'Or.
- **Moment to choose.** When a team has to pick its knockout rival (or whether its match goes
  first), every screen shows it full screen: the TV and the other phones wait with that team while
  its players choose from their own phones (the admin can choose for them), then every screen
  reveals the pick. It also works from the panel on the matches page.
- **Group stage recap.** When the last group match is entered, every screen shows a short
  story-style break: the final table revealed from the bottom up with where each team goes, the
  stage in numbers (best attack and defence, biggest win, top scorer) and the knockout ties or the
  choice that comes first. The TV plays it through on its own; it can be seen again from the
  fixtures.
- **Closing gala**, full screen and story-style: how the night went, the champions, the Golden Boot
  and the Ballon d'Or from third to first, with a drumroll before each name. The admin starts it
  and moves through it from their phone while every phone and the TV follow along; anyone can
  replay it afterwards, and share the whole night as one story-sized picture (numbers, champions,
  Golden Boot and Ballon d'Or podium) through the phone's share sheet.
- **Your matches.** Opening a tournament asks who you are; each name belongs to one phone (tied to
  a random token kept on it), so nobody can take someone else's name, and anyone else follows as
  a guest. A name picked by mistake is let go from that phone (deleting the Ballon d'Or ballot cast
  under it, if wanted) or freed by the admin. That player's matches are highlighted and a panel
  says whether it's their turn, how many matches until theirs and roughly at what time.
- **Push notifications.** Players can ask to be told when it's their turn, when they're up next,
  when they have to pick an opponent and who won. A database trigger calls a Supabase Edge
  Function on every change; it reuses the app's own domain code (bundled with esbuild) to work out
  who to notify and records what it sent so nothing is repeated.
- **Rematch.** A finished tournament sets up the next one with the same players, clubs and rules.
- **Share to the group chat.** The tournament link goes to WhatsApp, the phone's share sheet or the
  clipboard: offered right after creating the tournament, from the code in the header, and with the
  standings as text.
- **TV mode** with the current match, standings and upcoming fixtures in big type. It scales to
  the screen, so a laptop or tablet next to the console works as a scoreboard while the TV is busy
  with the game, keeps that screen awake, and shows a QR code to open the tournament on a phone.
- **Tidy fixture list.** Played matches fold away while the tournament goes on, all but the latest
  result, with a button to show them.
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
The same run keeps a copy of every club's crest in `public/data/clubs/crests/` (named by EA's
team id, listed in `crests.json`, about 2.6 MB for the 96 clubs), so tournaments never depend on
EA's servers. A club typed by hand or outside the big five gets a shield in its colour with its
initials.

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

- **Ballon d'Or ties:** more first places, then more second places, then more goals, then how far
  their team got, then the drawing of lots.
- **Solo player in the knockout:** a stand-in is drawn for every match, as in the group stage,
  rather than one fixed partner from the eliminated players: that partner would play extra
  matches and could be champion after losing. Tournaments already under way keep the fixed
  partner they were given.
- **Champions:** only the members of the winning team, so a stand-in who played the final is not
  listed as champion.
- **Who can be a stand-in:** a stand-in's own team could gain from the match going one way, so the
  draw looks at the stake of each free player's team and only then at fairness and tiredness.
  Each criterion only separates those tied on the previous one, and the draw never fails while
  someone is free. In order: (1) stake: none, far, involved; (2) fewest times a stand-in; (3) didn't
  just play the match before; (4) doesn't play the one right after; (5) fewest matches played;
  (6) fewest times with this team; then luck.
  - *Group stage:* a team has no stake when the points it and the two teams in the match can still
    reach leave it strictly above or below both, so no result can change its place (a match only
    moves those two teams' points). It is far when it's more than a win (3 points) from both.
  - *Knockout:* eliminated teams have no stake, nor does anyone in the third-place match or the
    final. Every team still in cares about a playoff or a semi-final; in the quarter-finals only
    the other half of the bracket is far.
  - *Redraws:* the admin's "another stand-in" never brings back someone already discarded for that
    match (unless nobody else is free) and the match card shows who was discarded.
  - *Kept out by the admin:* a list on the matches page (only with a solo player) lets the admin
    take someone out of the stand-in draw, for instance if they're not fit to play, and put them
    back. They still play for their own team. It applies to the draws that follow, and also to
    matches started from a phone.
- **One privilege each in the playoff and the semis:** the best-ranked picks the rival, the second can't be picked
  (it plays whoever is left), the third sets which tie goes first and the fourth gets nothing.
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
out. To sync between devices, create a Supabase project, run the files in
`supabase/migrations/` in order and fill in the URL and publishable key in
`src/app/config.ts`.

```bash
npm test        # unit tests (also rebuilds the notification bundle)
npm run e2e     # whole flows in a phone-sized Chromium: names, a match, the vote, the gala, a rematch
```
