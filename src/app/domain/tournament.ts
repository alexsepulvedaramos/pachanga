import {
  Goal,
  Id,
  Incident,
  KnockoutChoices,
  Match,
  Participant,
  Team,
  Tournament,
  TournamentConfig,
} from './types';
import { Rng, pick, seededRng, shuffle } from './rng';
import { buildGroupSchedule } from './schedule';
import { computeStandings, DEFAULT_TIEBREAKERS, StandingRow } from './standings';
import {
  KnockoutDecision,
  MAX_TEAMS,
  MIN_TEAMS,
  nextKnockoutMatches,
  pendingDecision,
  semiFinalists,
  winnerOf,
} from './knockout';

export const MIN_PARTICIPANTS = MIN_TEAMS * 2;
export const MAX_PARTICIPANTS = MAX_TEAMS * 2;

export const DEFAULT_CONFIG: Omit<TournamentConfig, 'seed'> = {
  tiebreakers: DEFAULT_TIEBREAKERS,
  trackScorers: false,
  halfMinutes: { group: 5, playoff: 5, semi: 6, third: 6, final: 7 },
  changeoverMinutes: 3,
};

export class TournamentError extends Error {}

export function teamCountFor(participantCount: number): number {
  return Math.ceil(participantCount / 2);
}

export interface NewTournament {
  id: Id;
  name: string;
  participantNames: string[];
  clubs: string[];
  config: TournamentConfig;
  now?: Date;
}

export function createTournament(input: NewTournament): Tournament {
  const names = input.participantNames.map((n) => n.trim()).filter(Boolean);
  const clubs = input.clubs.map((c) => c.trim()).filter(Boolean);
  if (names.length < MIN_PARTICIPANTS || names.length > MAX_PARTICIPANTS) {
    throw new TournamentError(
      `Hacen falta entre ${MIN_PARTICIPANTS} y ${MAX_PARTICIPANTS} participantes.`,
    );
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw new TournamentError('Hay nombres de participantes repetidos.');
  }
  if (clubs.length !== teamCountFor(names.length)) {
    throw new TournamentError(`Hacen falta ${teamCountFor(names.length)} equipos.`);
  }
  if (new Set(clubs.map((c) => c.toLowerCase())).size !== clubs.length) {
    throw new TournamentError('Hay equipos repetidos.');
  }
  if (input.config.tiebreakers.length === 0) {
    throw new TournamentError('Elige al menos un criterio de desempate.');
  }

  const participants: Participant[] = names.map((name, i) => ({ id: `p${i + 1}`, name }));
  return {
    id: input.id,
    name: input.name.trim() || 'P0PPER CUP',
    createdAt: (input.now ?? new Date()).toISOString(),
    stage: 'draw',
    config: input.config,
    participants,
    clubs,
    draw: { order: participants.map((p) => p.id), picks: [] },
    teams: [],
    matches: [],
    knockout: {},
  };
}

// ---------------------------------------------------------------------------------------------
// Draw (ruleta)
// ---------------------------------------------------------------------------------------------

/** Wheel entries still in play: every club twice, minus the ones already drawn. */
export function wheelEntries(t: Tournament): string[] {
  const remaining = t.clubs.flatMap((club) => [club, club]);
  for (const { club } of t.draw.picks) remaining.splice(remaining.indexOf(club), 1);
  return remaining;
}

/** First participant in entrance order who has no club yet. */
export function nextToSpin(t: Tournament): Participant | null {
  const assigned = new Set(t.draw.picks.map((p) => p.participantId));
  const id = t.draw.order.find((x) => !assigned.has(x));
  return id ? participant(t, id) : null;
}

/** Puts a participant on a club by hand (or takes them off it with `null`), instead of the wheel. */
export function assignClub(t: Tournament, participantId: Id, club: string | null): Tournament {
  assertStage(t, 'draw');
  participant(t, participantId);
  const picks = t.draw.picks.filter((p) => p.participantId !== participantId);
  if (club !== null) {
    if (!t.clubs.includes(club)) throw new TournamentError(`Equipo desconocido: ${club}`);
    if (picks.filter((p) => p.club === club).length >= 2) {
      throw new TournamentError(`${club} ya tiene pareja completa.`);
    }
    picks.push({ participantId, club });
  }
  return { ...t, draw: { ...t.draw, picks } };
}

export function setEntranceOrder(t: Tournament, order: Id[]): Tournament {
  assertStage(t, 'draw');
  if (t.draw.picks.length > 0) throw new TournamentError('La ruleta ya ha empezado.');
  const ids = new Set(t.participants.map((p) => p.id));
  if (order.length !== ids.size || !order.every((id) => ids.has(id))) {
    throw new TournamentError('El orden de entradas no es válido.');
  }
  return { ...t, draw: { ...t.draw, order: [...order] } };
}

export function shuffleEntranceOrder(t: Tournament, rng: Rng): Tournament {
  return setEntranceOrder(t, shuffle(t.participants.map((p) => p.id), rng));
}

/** The next participant in the entrance order spins the wheel. Returns the club drawn. */
export function spin(t: Tournament, rng: Rng): { tournament: Tournament; club: string } {
  assertStage(t, 'draw');
  const spinner = nextToSpin(t);
  if (!spinner) throw new TournamentError('Ya han girado todos.');
  const club = pick(wheelEntries(t), rng);
  const picks = [...t.draw.picks, { participantId: spinner.id, club }];
  return { tournament: { ...t, draw: { ...t.draw, picks } }, club };
}

export function undoSpin(t: Tournament): Tournament {
  assertStage(t, 'draw');
  return { ...t, draw: { ...t.draw, picks: t.draw.picks.slice(0, -1) } };
}

/** Pairs formed so far by the wheel, keyed by club. */
export function drawnPairs(t: Tournament): Map<string, Id[]> {
  const pairs = new Map<string, Id[]>(t.clubs.map((club) => [club, []]));
  for (const { participantId, club } of t.draw.picks) pairs.get(club)!.push(participantId);
  return pairs;
}

/** Closes the draw: builds the teams and the group schedule. */
export function finishDraw(t: Tournament, rng: Rng): Tournament {
  assertStage(t, 'draw');
  if (t.draw.picks.length !== t.participants.length) {
    throw new TournamentError('Faltan participantes por girar la ruleta.');
  }
  const teams: Team[] = [...drawnPairs(t)].map(([club, memberIds], i) => ({
    id: `t${i + 1}`,
    club,
    memberIds,
  }));
  const matches = buildGroupSchedule(
    teams.map((team) => team.id),
    rng,
  );
  return { ...t, stage: 'groups', teams, matches };
}

// ---------------------------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------------------------

export function participant(t: Tournament, id: Id): Participant {
  const found = t.participants.find((p) => p.id === id);
  if (!found) throw new TournamentError(`Participante desconocido: ${id}`);
  return found;
}

export function team(t: Tournament, id: Id): Team {
  const found = t.teams.find((x) => x.id === id);
  if (!found) throw new TournamentError(`Equipo desconocido: ${id}`);
  return found;
}

export function match(t: Tournament, id: Id): Match {
  const found = t.matches.find((m) => m.id === id);
  if (!found) throw new TournamentError(`Partido desconocido: ${id}`);
  return found;
}

export function activeMembers(t: Tournament, teamId: Id): Id[] {
  return team(t, teamId).memberIds.filter((id) => !participant(t, id).disqualified);
}

export function isSolo(t: Tournament, teamId: Id): boolean {
  return activeMembers(t, teamId).length === 1;
}

/** Who plays for a team in a given match, leaving out anyone suspended for it. */
export function lineup(t: Tournament, m: Match, teamId: Id): Id[] {
  const suspended = new Set(suspendedFor(t, m));
  return fullLineup(t, m, teamId).filter((id) => !suspended.has(id));
}

/** Active members plus the knockout partner or the stand-in, ignoring suspensions. */
function fullLineup(t: Tournament, m: Match, teamId: Id): Id[] {
  const members = activeMembers(t, teamId);
  const partner = team(t, teamId).knockoutPartnerId;
  const standIn = m.standIns?.[teamId];
  if (members.length === 1 && isLateKnockout(m) && partner) return [...members, partner];
  if (members.length === 1 && standIn) return [...members, standIn];
  return members;
}

const isLateKnockout = (m: Match) => m.phase === 'semi' || m.phase === 'third' || m.phase === 'final';

/** Players who play for this team as members or as its fixed knockout partner (not stand-ins). */
function regulars(t: Tournament, m: Match, teamId: Id): Id[] {
  const partner = team(t, teamId).knockoutPartnerId;
  const members = activeMembers(t, teamId);
  return partner && isLateKnockout(m) && members.length === 1 ? [...members, partner] : members;
}

/**
 * Players who cannot play this match: anyone with a red card or an injury in a previous match
 * misses the next match of their own team. The final is exempt.
 */
export function suspendedFor(t: Tournament, m: Match): Id[] {
  if (m.phase === 'final') return [];
  const index = t.matches.findIndex((x) => x.id === m.id);
  const result: Id[] = [];
  for (const id of [...regulars(t, m, m.homeId), ...regulars(t, m, m.awayId)]) {
    // The most recent earlier match this player played for their own team.
    for (let i = index - 1; i >= 0; i--) {
      const prev = t.matches[i];
      const plays = [prev.homeId, prev.awayId].some((teamId) => regulars(t, prev, teamId).includes(id));
      const hadIncident = prev.incidents?.some((x) => x.participantId === id);
      if (hadIncident) {
        result.push(id);
        break;
      }
      if (plays) break;
    }
  }
  return result;
}

export function nextMatch(t: Tournament): Match | null {
  return t.matches.find((m) => m.status !== 'done') ?? null;
}

/** Marks a match as being played and draws a partner for any solo team that needs one. */
export function startMatch(t: Tournament, matchId: Id, rng: Rng): Tournament {
  const m = match(t, matchId);
  if (m.status === 'done') throw new TournamentError('Ese partido ya está terminado.');
  const standIns: Record<Id, Id> = { ...m.standIns };
  for (const teamId of [m.homeId, m.awayId]) {
    if (!needsStandIn(t, m, teamId) || standIns[teamId]) continue;
    standIns[teamId] = drawStandIn(t, m, teamId, rng);
  }
  const updated: Match = {
    ...m,
    status: 'live',
    ...(Object.keys(standIns).length ? { standIns } : {}),
  };
  return {
    ...t,
    liveMatchId: matchId,
    matches: t.matches.map((x) =>
      x.id === matchId ? updated : x.status === 'live' ? { ...x, status: 'pending' } : x,
    ),
  };
}

function needsStandIn(t: Tournament, m: Match, teamId: Id): boolean {
  if (!isSolo(t, teamId)) return false;
  const hasKnockoutPartner = !!team(t, teamId).knockoutPartnerId;
  return !(hasKnockoutPartner && (m.phase === 'semi' || m.phase === 'third' || m.phase === 'final'));
}

/**
 * A random partner among the participants not playing this match, preferring those who have
 * partnered this team the fewest times so far.
 */
function drawStandIn(t: Tournament, m: Match, teamId: Id, rng: Rng): Id {
  const busy = new Set([
    ...fullLineup(t, m, m.homeId),
    ...fullLineup(t, m, m.awayId),
    ...Object.values(m.standIns ?? {}),
    ...suspendedFor(t, m),
  ]);
  const candidates = t.participants.filter((p) => !p.disqualified && !busy.has(p.id));
  if (candidates.length === 0) throw new TournamentError('No hay nadie libre para hacer pareja.');
  const timesUsed = (id: Id) => t.matches.filter((x) => x.standIns?.[teamId] === id).length;
  const fewest = Math.min(...candidates.map((p) => timesUsed(p.id)));
  return pick(
    candidates.filter((p) => timesUsed(p.id) === fewest),
    rng,
  ).id;
}

export function redrawStandIn(t: Tournament, matchId: Id, teamId: Id, rng: Rng): Tournament {
  const m = match(t, matchId);
  if (m.status === 'done') throw new TournamentError('Ese partido ya está terminado.');
  const rest = { ...m.standIns };
  delete rest[teamId];
  const cleared = { ...m, standIns: rest };
  const standIn = drawStandIn(t, cleared, teamId, rng);
  return replaceMatch(t, { ...cleared, standIns: { ...rest, [teamId]: standIn } });
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  extraTime?: boolean;
  homePens?: number | null;
  awayPens?: number | null;
  goals?: Goal[];
  incidents?: Incident[];
}

export function recordResult(t: Tournament, matchId: Id, result: MatchResult): Tournament {
  const m = match(t, matchId);
  validateResult(t, m, result);
  assertEditable(t, m);

  const knockout = m.phase !== 'group';
  const level = result.homeGoals === result.awayGoals;
  const updated: Match = {
    ...m,
    status: 'done',
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    extraTime: knockout ? !!result.extraTime || level : undefined,
    homePens: knockout && level ? result.homePens : null,
    awayPens: knockout && level ? result.awayPens : null,
    goals: t.config.trackScorers ? (result.goals ?? []) : undefined,
    incidents: result.incidents?.length ? result.incidents : undefined,
  };
  const next = replaceMatch(t, updated);
  return sync({ ...next, liveMatchId: t.liveMatchId === matchId ? undefined : t.liveMatchId });
}

function validateResult(t: Tournament, m: Match, r: MatchResult): void {
  const goals = [r.homeGoals, r.awayGoals];
  if (!goals.every((g) => Number.isInteger(g) && g >= 0 && g < 100)) {
    throw new TournamentError('El marcador no es válido.');
  }
  if (m.phase !== 'group' && r.homeGoals === r.awayGoals) {
    const pens = [r.homePens, r.awayPens];
    if (!pens.every((p) => Number.isInteger(p) && p! >= 0) || r.homePens === r.awayPens) {
      throw new TournamentError('En eliminatoria, un empate necesita ganador en los penaltis.');
    }
  }
  if (r.goals) {
    for (const [teamId, total] of [
      [m.homeId, r.homeGoals],
      [m.awayId, r.awayGoals],
    ] as const) {
      if (r.goals.filter((g) => g.teamId === teamId).length > total) {
        throw new TournamentError('Hay más goleadores que goles.');
      }
    }
  }
  if (r.incidents?.length) {
    const playing = new Set([...lineup(t, m, m.homeId), ...lineup(t, m, m.awayId)]);
    if (!r.incidents.every((x) => playing.has(x.participantId))) {
      throw new TournamentError('Solo se pueden sancionar jugadores de este partido.');
    }
  }
}

/** A result can be changed only while nothing that depends on it has been created yet. */
function assertEditable(t: Tournament, m: Match): void {
  if (m.status !== 'done') return;
  if (m.phase === 'group' && t.stage !== 'groups') {
    throw new TournamentError('La liguilla ya está cerrada.');
  }
  const later: Record<Match['phase'], Match['phase'][]> = {
    group: [],
    playoff: ['semi', 'third', 'final'],
    semi: ['third', 'final'],
    third: [],
    final: [],
  };
  if (t.matches.some((x) => later[m.phase].includes(x.phase))) {
    throw new TournamentError('Ya se ha jugado la siguiente ronda con este resultado.');
  }
}

/** Reopens a finished match so it can be corrected. */
export function reopenMatch(t: Tournament, matchId: Id): Tournament {
  const m = match(t, matchId);
  assertEditable(t, m);
  return replaceMatch(t, { ...m, status: 'pending' });
}

export function disqualify(t: Tournament, participantId: Id): Tournament {
  const p = participant(t, participantId);
  const participants = t.participants.map((x) => (x.id === p.id ? { ...x, disqualified: true } : x));
  return { ...t, participants };
}

function replaceMatch(t: Tournament, updated: Match): Tournament {
  return { ...t, matches: t.matches.map((m) => (m.id === updated.id ? updated : m)) };
}

// ---------------------------------------------------------------------------------------------
// Standings and knockout
// ---------------------------------------------------------------------------------------------

export function groupMatches(t: Tournament): Match[] {
  return t.matches.filter((m) => m.phase === 'group');
}

export function standings(t: Tournament): StandingRow[] {
  return computeStandings(
    t.teams.map((x) => x.id),
    groupMatches(t),
    t.config.tiebreakers,
    t.config.seed,
  );
}

export function currentDecision(t: Tournament): KnockoutDecision | null {
  if (t.stage !== 'knockout' || !t.groupRanking) return null;
  return pendingDecision(t.groupRanking, t.knockout, t.matches);
}

export function makeChoice(t: Tournament, choice: Partial<KnockoutChoices>): Tournament {
  const decision = currentDecision(t);
  if (!decision) throw new TournamentError('No hay ninguna elección pendiente.');
  const allowed: Record<KnockoutDecision['kind'], keyof KnockoutChoices> = {
    playoffOpponent: 'playoffOpponentId',
    playoffOrder: 'playoffChooserFirst',
    semiOpponent: 'semiOpponentId',
    semiOrder: 'semiChooserFirst',
  };
  const key = allowed[decision.kind];
  const value = choice[key];
  if (value === undefined) throw new TournamentError('Esa elección no toca ahora.');
  if (
    (decision.kind === 'playoffOpponent' || decision.kind === 'semiOpponent') &&
    !decision.options.includes(value as Id)
  ) {
    throw new TournamentError('Ese rival no se puede elegir.');
  }
  return sync({ ...t, knockout: { ...t.knockout, [key]: value } });
}

/**
 * Moves the tournament forward after any change: closes the group stage, creates the knockout
 * matches that are ready and draws the fixed knockout partner of a solo team.
 */
export function sync(t: Tournament): Tournament {
  let next = t;
  const groups = groupMatches(next);
  if (next.stage === 'groups' && groups.length > 0 && groups.every((m) => m.status === 'done')) {
    next = { ...next, stage: 'knockout', groupRanking: standings(next).map((r) => r.teamId) };
  }
  if (next.stage !== 'knockout' || !next.groupRanking) return next;

  for (;;) {
    const created = nextKnockoutMatches(next.groupRanking!, next.knockout, next.matches);
    if (created.length === 0) break;
    if (created[0].phase === 'semi') next = drawKnockoutPartners(next);
    next = { ...next, matches: [...next.matches, ...created] };
  }

  const final = next.matches.find((m) => m.phase === 'final');
  const third = next.matches.find((m) => m.phase === 'third');
  if (final && third && winnerOf(final) && winnerOf(third)) next = { ...next, stage: 'finished' };
  return next;
}

/** Solo teams that reach the semi-finals draw a fixed partner among eliminated players. */
function drawKnockoutPartners(t: Tournament): Tournament {
  const semis = semiFinalists(t.groupRanking!, t.matches) ?? [];
  const eliminatedTeams = t.teams.filter((x) => !semis.includes(x.id));
  const pool = eliminatedTeams.flatMap((x) => activeMembers(t, x.id));
  const rng = seededRng(t.config.seed ^ 0x5eed);
  const taken = new Set<Id>();
  const teams = t.teams.map((x) => {
    if (!semis.includes(x.id) || !isSolo(t, x.id) || x.knockoutPartnerId) return x;
    const free = pool.filter((id) => !taken.has(id));
    if (free.length === 0) return x;
    const partnerId = pick(free, rng);
    taken.add(partnerId);
    return { ...x, knockoutPartnerId: partnerId };
  });
  return { ...t, teams };
}

export function champions(t: Tournament): Id[] | null {
  const final = t.matches.find((m) => m.phase === 'final');
  const winner = final && winnerOf(final);
  if (!final || !winner) return null;
  return lineup(t, final, winner);
}

// ---------------------------------------------------------------------------------------------
// Scorers and timing
// ---------------------------------------------------------------------------------------------

export function topScorers(t: Tournament): { participantId: Id; goals: number }[] {
  const counts = new Map<Id, number>();
  for (const m of t.matches) {
    for (const g of m.goals ?? []) {
      if (g.scorerId) counts.set(g.scorerId, (counts.get(g.scorerId) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([participantId, goals]) => ({ participantId, goals }))
    .sort((a, b) => b.goals - a.goals);
}

export function matchMinutes(t: Tournament, phase: Match['phase']): number {
  return t.config.halfMinutes[phase] * 2 + t.config.changeoverMinutes;
}

/** Matches still to be played, including knockout ones not created yet. */
export function remainingMatchPhases(t: Tournament): Match['phase'][] {
  const pending = t.matches.filter((m) => m.status !== 'done').map((m) => m.phase);
  if (t.stage === 'draw' || t.stage === 'setup') {
    const teams = t.clubs.length;
    pending.push(...Array<Match['phase']>((teams * (teams - 1)) / 2).fill('group'));
  }
  const created = new Set(t.matches.map((m) => m.phase));
  if (t.stage !== 'finished') {
    const playoffs = t.clubs.length === 5 ? 1 : 2;
    if (!created.has('playoff')) pending.push(...Array<Match['phase']>(playoffs).fill('playoff'));
    if (!created.has('semi')) pending.push('semi', 'semi');
    if (!created.has('third')) pending.push('third');
    if (!created.has('final')) pending.push('final');
  }
  return pending;
}

export function totalMatchCount(teamCount: number): number {
  const group = (teamCount * (teamCount - 1)) / 2;
  return group + (teamCount === 5 ? 1 : 2) + 4;
}

export function estimatedRemainingMinutes(t: Tournament): number {
  return remainingMatchPhases(t).reduce((sum, phase) => sum + matchMinutes(t, phase), 0);
}

function assertStage(t: Tournament, stage: Tournament['stage']): void {
  if (t.stage !== stage) throw new TournamentError('Esa acción no toca en esta fase del torneo.');
}
