// Temporary: checks whether EA's ratings feed exposes club crests and whether they download.
const API = 'https://drop-api.ea.com/rating/ea-sports-fc';
const LEAGUES = ['Premier League', 'LALIGA EA SPORTS', 'Serie A Enilive', 'Bundesliga', "Ligue 1 McDonald's"];
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'pachanga club ratings' } }); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const filters = await get(`${API}/filters`);
console.log('FILTER TEAM SAMPLE', JSON.stringify(filters.teamGroups.find((g) => g.label === 'Premier League').teams[0]));
const teams = filters.teamGroups.filter((g) => LEAGUES.includes(g.label)).flatMap((g) => g.teams.map((t) => ({ ...t, league: g.label })));
console.log('TEAMS', teams.length);
const first = await get(`${API}?locale=en&limit=1&team=${teams[0].id}`);
console.log('ITEM SAMPLE', JSON.stringify(first.items[0]).slice(0, 3000));
const urlsIn = (o, out = []) => { for (const [k, v] of Object.entries(o ?? {})) { if (typeof v === 'string' && /^https?:\/\//.test(v)) out.push([k, v]); else if (v && typeof v === 'object') urlsIn(v, out); } return out; };
let ok = 0, bytes = 0; const fails = []; const types = new Map(); const sizes = [];
for (const t of teams) {
  const d = await get(`${API}?locale=en&limit=1&team=${t.id}`);
  const item = d.items[0];
  const crest = item?.team?.imageUrl ?? urlsIn(item?.team)[0]?.[1];
  if (!crest) { fails.push(`${t.label}: no url`); continue; }
  const r = await fetch(crest);
  if (!r.ok) { fails.push(`${t.label}: ${r.status} ${crest}`); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  ok++; bytes += buf.length; sizes.push(buf.length);
  types.set(r.headers.get('content-type'), (types.get(r.headers.get('content-type')) ?? 0) + 1);
  if (ok <= 3) console.log('CREST', t.label, crest, buf.length, r.headers.get('content-type'), r.headers.get('access-control-allow-origin'));
  await new Promise((s) => setTimeout(s, 120));
}
sizes.sort((a, b) => a - b);
console.log('RESULT ok', ok, 'of', teams.length, 'totalKB', Math.round(bytes / 1024), 'minKB', Math.round(sizes[0] / 1024), 'maxKB', Math.round(sizes.at(-1) / 1024), 'types', JSON.stringify([...types]));
console.log('FAILS', JSON.stringify(fails));
