// Rebuilds the club ratings of one game edition from EA's public ratings feed (big five leagues).
//
//   node scripts/update-club-ratings.ts            -> fc26 (what the feed serves today)
//   node scripts/update-club-ratings.ts fc27       -> a new edition, once the feed serves it
//
// The feed is the one behind ea.com/games/ea-sports-fc/ratings. It is undocumented and has no way
// to ask for a given edition: it serves whatever EA considers current. So the script refuses to
// overwrite an edition when the download looks wrong: missing clubs, or most ratings moving at
// once, which is what EA switching the feed to the next game would look like. When that happens,
// run it again with the new edition id to start a new file instead.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  rateClub,
  type ClubRating,
  type ClubRatingsFile,
  type EditionIndexEntry,
  type RatedPlayer,
} from '../src/app/domain/club-ratings.ts';

const API = 'https://drop-api.ea.com/rating/ea-sports-fc';
const DIR = new URL('../public/data/clubs/', import.meta.url);
const LEAGUES = ['Premier League', 'LALIGA EA SPORTS', 'Serie A Enilive', 'Bundesliga', "Ligue 1 McDonald's"];
const MIN_CLUBS = 90;
const MEN = 0;

const editionId = (process.argv[2] ?? 'fc26').toLowerCase();
if (!/^fc\d{2}$/.test(editionId)) throw new Error(`Edition must look like fc26, got "${editionId}"`);
const edition = `EA SPORTS FC ${editionId.slice(2)}`;
const output = new URL(`${editionId}.json`, DIR);
const indexFile = new URL('index.json', DIR);

interface ApiTeam {
  id: number;
  label: string;
}
interface ApiPlayer {
  overallRating: number;
  firstName: string;
  lastName: string;
  commonName: string | null;
  position: { shortLabel: string };
  gender: { id: number };
}

async function get<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'popper-cup club ratings' } });
    if (res.ok) return (await res.json()) as T;
    if (attempt === 3) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const filters = await get<{ teamGroups: { label: string; teams: ApiTeam[] }[] }>(`${API}/filters`);
const teams = filters.teamGroups
  .filter((g) => LEAGUES.includes(g.label))
  .flatMap((g) => g.teams.map((team) => ({ ...team, league: g.label })));

const clubs: ClubRating[] = [];
for (const team of teams) {
  const data = await get<{ items: ApiPlayer[] }>(`${API}?locale=en&limit=100&offset=0&team=${team.id}`);
  const squad: RatedPlayer[] = data.items
    .filter((p) => p.gender?.id === MEN)
    .map((p) => ({
      name: p.commonName || `${p.firstName} ${p.lastName}`.trim(),
      position: p.position.shortLabel,
      overall: p.overallRating,
    }));
  const club = rateClub(team.id, team.label, team.league, squad);
  if (club) clubs.push(club);
  await new Promise((r) => setTimeout(r, 150));
}
clubs.sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));

if (clubs.length < MIN_CLUBS) {
  throw new Error(`Only ${clubs.length} clubs rated (expected at least ${MIN_CLUBS}); keeping the old file.`);
}

const previous: ClubRatingsFile | null = existsSync(output)
  ? (JSON.parse(readFileSync(output, 'utf8')) as ClubRatingsFile)
  : null;

if (previous) {
  const before = new Map(previous.clubs.map((c) => [c.id, c.overall]));
  const compared = clubs.filter((c) => before.has(c.id));
  const jumped = compared.filter((c) => Math.abs(c.overall - before.get(c.id)!) >= 3);
  if (compared.length > 0 && jumped.length / compared.length > 0.3) {
    throw new Error(
      `${jumped.length} of ${compared.length} clubs moved 3+ points at once. EA has probably moved ` +
        `the feed to the next game: run "node scripts/update-club-ratings.ts fcXX" for the new edition.`,
    );
  }
  if (JSON.stringify(previous.clubs) === JSON.stringify(clubs)) {
    console.log(`${edition}: no changes (${clubs.length} clubs).`);
    process.exit(0);
  }
}

const file: ClubRatingsFile = {
  edition,
  source: 'EA SPORTS FC player ratings (ea.com/games/ea-sports-fc/ratings), best 4-3-3 per club',
  updatedAt: new Date().toISOString(),
  clubs,
};
mkdirSync(DIR, { recursive: true });
writeFileSync(output, JSON.stringify(file) + '\n');

const index: EditionIndexEntry[] = existsSync(indexFile)
  ? (JSON.parse(readFileSync(indexFile, 'utf8')) as EditionIndexEntry[])
  : [];
const entry: EditionIndexEntry = { id: editionId, edition, file: `${editionId}.json`, updatedAt: file.updatedAt };
const nextIndex = [entry, ...index.filter((e) => e.id !== editionId)].sort((a, b) => b.id.localeCompare(a.id));
writeFileSync(indexFile, JSON.stringify(nextIndex, null, 2) + '\n');
console.log(`${edition}: wrote ${clubs.length} clubs.`);
