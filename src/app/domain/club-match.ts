// Matches the club names people type ("Man City", "Barça", "Inter") to the names in EA's data
// ("Manchester City", "FC Barcelona", "Lombardia FC").

/** Everyday names → EA SPORTS FC names, including clubs the game ships under another name. */
const ALIASES: Record<string, string> = {
  'man city': 'Manchester City',
  city: 'Manchester City',
  'man utd': 'Man Utd',
  'man united': 'Man Utd',
  'manchester united': 'Man Utd',
  united: 'Man Utd',
  barca: 'FC Barcelona',
  barcelona: 'FC Barcelona',
  madrid: 'Real Madrid',
  atletico: 'Atlético de Madrid',
  'atletico madrid': 'Atlético de Madrid',
  atleti: 'Atlético de Madrid',
  bayern: 'FC Bayern München',
  'bayern munich': 'FC Bayern München',
  'bayern munchen': 'FC Bayern München',
  psg: 'Paris SG',
  'paris saint germain': 'Paris SG',
  inter: 'Lombardia FC',
  'inter milan': 'Lombardia FC',
  internazionale: 'Lombardia FC',
  milan: 'Milano FC',
  'ac milan': 'Milano FC',
  atalanta: 'Bergamo Calcio',
  roma: 'AS Roma',
  napoli: 'SSC Napoli',
  lazio: 'SS Lazio',
  juve: 'Juventus',
  tottenham: 'Spurs',
  'tottenham hotspur': 'Spurs',
  newcastle: 'Newcastle Utd',
  'newcastle united': 'Newcastle Utd',
  villa: 'Aston Villa',
  dortmund: 'Borussia Dortmund',
  bvb: 'Borussia Dortmund',
  leverkusen: 'Leverkusen',
  'bayer leverkusen': 'Leverkusen',
  marseille: 'OM',
  'olympique de marseille': 'OM',
  forest: "Nott'm Forest",
  'nottingham forest': "Nott'm Forest",
  betis: 'Real Betis',
  sociedad: 'Real Sociedad',
  athletic: 'Athletic Club',
  'athletic bilbao': 'Athletic Club',
};

export function normalizeClub(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\b(fc|cf|sc|ac|afc|club|de|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The best match for `query` among `names`: same name ignoring accents and "FC"-like words,
 * then a known alias, then a name that contains the query (or the other way round) as whole words.
 */
export function findClub(names: readonly string[], query: string): string | null {
  const q = normalizeClub(query);
  if (!q) return null;
  const byNorm = new Map(names.map((n) => [normalizeClub(n), n]));
  if (byNorm.has(q)) return byNorm.get(q)!;

  const alias = ALIASES[q] ?? ALIASES[query.trim().toLowerCase()];
  if (alias && names.includes(alias)) return alias;

  const words = (s: string) => ` ${s} `;
  const contains = names.filter((n) => {
    const norm = normalizeClub(n);
    return words(norm).includes(words(q)) || words(q).includes(words(norm));
  });
  return contains.length === 1 ? contains[0] : null;
}
