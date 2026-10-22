import { teamCountFor } from './tournament';
import { Tournament, TournamentConfig } from './types';

/** Everything needed to set up a new tournament like a finished one, to play it again. */
export interface RematchDraft {
  name: string;
  playerNames: string[];
  clubs: string[];
  config: Omit<TournamentConfig, 'seed'>;
}

/**
 * Same players (minus those who left), same clubs and same rules, ready for a new draw. The name
 * counts the rematches: "Pachanga" → "Pachanga · Revancha" → "Pachanga · Revancha 2".
 */
export function rematchDraft(t: Tournament): RematchDraft {
  const playerNames = t.participants.filter((p) => !p.disqualified).map((p) => p.name);
  const { seed: _seed, ...config } = t.config;
  return {
    name: rematchName(t.name),
    playerNames,
    clubs: t.clubs.slice(0, teamCountFor(playerNames.length)),
    config,
  };
}

function rematchName(name: string): string {
  const match = /^(.*) · Revancha(?: (\d+))?$/.exec(name);
  if (!match) return `${name} · Revancha`;
  return `${match[1]} · Revancha ${Number(match[2] ?? 1) + 1}`;
}
