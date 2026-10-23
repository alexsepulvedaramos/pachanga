import {
  Goal,
  HalfMinutes,
  Id,
  Incident,
  KnockoutChoices,
  Match,
  Participant,
  Team,
  Tournament,
  TournamentConfig,
} from './types';
import { Rng, pick, shuffle } from './rng';
import { buildGroupSchedule } from './schedule';
import { computeStandings, DEFAULT_TIEBREAKERS, StandingRow } from './standings';
import {
  groupMatchCount,
  KnockoutDecision,
  knockoutFormat,
  knockoutPhases,
  MAX_TEAMS,
  MIN_TEAMS,
  nextKnockoutMatches,
  pendingDecision,
  teamAlive,
  winnerOf,
} from './knockout';
import { groupStake, knockoutStake, lowestBy, Stake } from './stand-in';

export const MIN_PARTICIPANTS = MIN_TEAMS * 2;
export const MAX_PARTICIPANTS = MAX_TEAMS * 2;

export const DEFAULT_CONFIG: Omit<TournamentConfig, 'seed'> = {
  tiebreakers: DEFAULT_TIEBREAKERS,
  trackScorers: false,
  halfMinutes: { group: 5, playoff: 5, quarter: 5, semi: 6, third: 6, final: 7 },
  changeoverMinutes: 3,
};

/** Default minutes per half: with 8 teams the longer group stage is played at 4-minute halves. */
export function defaultHalfMinutes(teamCount: number): HalfMinutes {
  return { ...DEFAULT_CONFIG.halfMinutes, group: teamCount >= 8 ? 4 : 5 };
}

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
    name: input.name.trim() || 'Pachanga',
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
    knockoutFormat(teams.length).legs,
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

/** Who plays for a team in a given match: active members plus the knockout partner or stand-in. */
export function lineup(t: Tournament, m: Match, teamId: Id): Id[] {
  const members = activeMembers(t, teamId);
  const partner = team(t, teamId).knockoutPartnerId;
  const standIn = m.standIns?.[teamId];
  if (members.length === 1 && isLateKnockout(m) && partner) return [...members, partner];
  if (members.length === 1 && standIn) return [...members, standIn];
  return members;
}

const isLateKnockout = (m: Match) => m.phase === 'semi' || m.phase === 'third' || m.phase === 'final';

/**
 * Footballers each club can't pick in this match: those sent off or injured in that club's
 * previous match. The final is exempt.
 */
export function unavailableFor(t: Tournament, m: Match): Incident[] {
  if (m.phase === 'final') return [];
  const index = t.matches.findIndex((x) => x.id === m.id);
  const result: Incident[] = [];
  for (const teamId of [m.homeId, m.awayId]) {
    for (let i = index - 1; i >= 0; i--) {
      const prev = t.matches[i];
      if (prev.homeId !== teamId && prev.awayId !== teamId) continue;
      // Ignores incidents saved in an older format (by person rather than footballer).
      result.push(...(prev.incidents ?? []).filter((x) => x.teamId === teamId && typeof x.player === 'string'));
      break;
    }
  }
  return result;
}

/** Whether a participant plays in a match: as a member, fixed knockout partner or stand-in. */
export function playsIn(t: Tournament, m: Match, participantId: Id): boolean {
  return [m.homeId, m.awayId].some((teamId) => lineup(t, m, teamId).includes(participantId));
}

export type MyTurn =
  | { kind: 'now'; match: Match }
  | { kind: 'later'; match: Match; matchesBefore: number; minutes: number }
  | { kind: 'waiting' }
  | { kind: 'done' };

/**
 * Where a participant stands: playing now, playing later (and after how many matches), waiting for
 * knockout matches that don't exist yet, or with nothing left to play.
 */
export function myTurn(t: Tournament, participantId: Id): MyTurn {
  const pending = t.matches.filter((m) => m.status !== 'done');
  const index = pending.findIndex((m) => playsIn(t, m, participantId));
  if (index === 0 || pending[index]?.status === 'live') return { kind: 'now', match: pending[index] };
  if (index > 0) {
    const before = pending.slice(0, index);
    const minutes = before.reduce((sum, m) => sum + matchMinutes(t, m.phase), 0);
    return { kind: 'later', match: pending[index], matchesBefore: index, minutes };
  }
  return t.stage === 'finished' || !teamStillIn(t, participantId) ? { kind: 'done' } : { kind: 'waiting' };
}

/** False once every team the participant plays for is out (or they withdrew). */
function teamStillIn(t: Tournament, participantId: Id): boolean {
  const p = t.participants.find((x) => x.id === participantId);
  if (!p || p.disqualified || t.stage === 'finished') return false;
  if (t.stage !== 'knockout' || !t.groupRanking) return true;
  return t.teams
    .filter((x) => x.memberIds.includes(participantId) || x.knockoutPartnerId === participantId)
    .some((x) => teamAlive(t.groupRanking!, t.matches, x.id));
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
  // Tournaments started before the stand-in was drawn in every match kept a fixed partner.
  const hasKnockoutPartner = !!team(t, teamId).knockoutPartnerId;
  return !(hasKnockoutPartner && (m.phase === 'semi' || m.phase === 'third' || m.phase === 'final'));
}

/**
 * A partner among the participants not playing this match, so that whoever has the least to gain
 * or lose from it comes first. Each criterion only separates those tied on the one before, and a
 * lone candidate is always taken: the draw never fails while someone is free.
 * 1. The stake of their team in the match: none, far from it, or involved.
 * 2. Times they have been a stand-in so far.
 * 3. They didn't just play the match before.
 * 4. They don't play the match right after.
 * 5. Matches played so far, stand-in ones included.
 * 6. Times they have partnered this team.
 * Then luck. A redraw never brings back someone already discarded for this match, if anyone else is free.
 */
function drawStandIn(t: Tournament, m: Match, teamId: Id, rng: Rng): Id {
  const busy = new Set([
    ...lineup(t, m, m.homeId),
    ...lineup(t, m, m.awayId),
    ...Object.values(m.standIns ?? {}),
  ]);
  const free = t.participants.filter((p) => !p.disqualified && !busy.has(p.id));
  if (free.length === 0) throw new TournamentError('No hay nadie libre para hacer pareja.');
  const discarded = new Set(m.redrawn?.[teamId] ?? []);
  const candidates = free.filter((p) => !discarded.has(p.id));

  const index = t.matches.findIndex((x) => x.id === m.id);
  const before = t.matches[index - 1];
  const after = t.matches[index + 1];
  const stake = (id: Id): Stake => {
    const own = teamOf(t, id).id;
    if (m.phase === 'group') return groupStake(own, m, teamIds(t), groupMatches(t));
    return t.groupRanking ? knockoutStake(own, m, t.groupRanking, t.matches) : 2;
  };
  const invited = (id: Id) => t.matches.filter((x) => Object.values(x.standIns ?? {}).includes(id)).length;
  const played = (id: Id) => t.matches.filter((x) => x.status === 'done' && playsIn(t, x, id)).length;
  const withTeam = (id: Id) => t.matches.filter((x) => x.standIns?.[teamId] === id).length;
  const key = (p: Participant) => [
    stake(p.id),
    invited(p.id),
    before && playsIn(t, before, p.id) ? 1 : 0,
    after && playsIn(t, after, p.id) ? 1 : 0,
    played(p.id),
    withTeam(p.id),
  ];
  return pick(lowestBy(candidates.length ? candidates : free, key), rng).id;
}

const teamIds = (t: Tournament) => t.teams.map((x) => x.id);

export function redrawStandIn(t: Tournament, matchId: Id, teamId: Id, rng: Rng): Tournament {
  const m = match(t, matchId);
  if (m.status === 'done') throw new TournamentError('Ese partido ya está terminado.');
  const rest = { ...m.standIns };
  const previous = rest[teamId];
  delete rest[teamId];
  const redrawn = previous ? { ...m.redrawn, [teamId]: [...(m.redrawn?.[teamId] ?? []), previous] } : m.redrawn;
  const cleared: Match = { ...m, standIns: rest, ...(redrawn ? { redrawn } : {}) };
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
    reportedBy: undefined,
  };
  const next = replaceMatch(t, updated);
  return sync({ ...next, liveMatchId: t.liveMatchId === matchId ? undefined : t.liveMatchId });
}

/**
 * A player of the match that's up starts it from their phone (drawing any stand-in), so the
 * night doesn't wait on the admin.
 */
export function playerStartMatch(t: Tournament, participantId: Id, matchId: Id, rng: Rng): Tournament {
  const m = match(t, matchId);
  if (m.status === 'live') return t;
  if (t.matches.some((x) => x.status === 'live')) throw new TournamentError('Ya hay un partido en juego.');
  if (nextMatch(t)?.id !== matchId) throw new TournamentError('Ese partido aún no toca.');
  if (!playsIn(t, m, participantId)) {
    throw new TournamentError('Solo pueden empezarlo los que juegan el partido.');
  }
  return startMatch(t, matchId, rng);
}

/**
 * A player of the match enters its result from their phone. Only while it is being played, and
 * only once: a result already in is the admin's to correct.
 */
export function reportResult(t: Tournament, participantId: Id, matchId: Id, result: MatchResult): Tournament {
  const m = match(t, matchId);
  if (m.status === 'done') {
    throw new TournamentError('Ese partido ya tiene resultado. Si está mal, que lo corrija el admin.');
  }
  if (m.status !== 'live') throw new TournamentError('El partido aún no ha empezado.');
  if (!playsIn(t, m, participantId)) {
    throw new TournamentError('Solo pueden meter el resultado los que juegan el partido.');
  }
  const next = recordResult(t, matchId, result);
  return replaceMatch(next, { ...match(next, matchId), reportedBy: participantId });
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
  for (const incident of r.incidents ?? []) {
    if (incident.teamId !== m.homeId && incident.teamId !== m.awayId) {
      throw new TournamentError('La sanción tiene que ser de uno de los dos equipos del partido.');
    }
    if (!incident.player?.trim()) throw new TournamentError('Falta el nombre del jugador sancionado.');
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
    quarter: ['semi', 'third', 'final'],
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

// ---------------------------------------------------------------------------------------------
// Editing pairs after the draw
// ---------------------------------------------------------------------------------------------

function assertTeamsEditable(t: Tournament): void {
  if (t.stage === 'setup' || t.stage === 'draw') throw new TournamentError('Las parejas aún no están hechas.');
  if (t.stage === 'finished') throw new TournamentError('El torneo ya ha terminado.');
  if (t.matches.some((m) => m.status === 'live')) {
    throw new TournamentError('Espera a que termine el partido en juego.');
  }
}

function teamOf(t: Tournament, participantId: Id): Team {
  const found = t.teams.find((x) => x.memberIds.includes(participantId));
  if (!found) throw new TournamentError(`${participant(t, participantId).name} no está en ninguna pareja.`);
  return found;
}

/** Fixed knockout partners only make sense for teams whose members haven't changed. */
function withMembers(team: Team, memberIds: Id[]): Team {
  const next: Team = { ...team, memberIds };
  delete next.knockoutPartnerId;
  return next;
}

/** Two participants of different teams swap places. */
export function swapMembers(t: Tournament, a: Id, b: Id): Tournament {
  assertTeamsEditable(t);
  const teamA = teamOf(t, a);
  const teamB = teamOf(t, b);
  if (teamA.id === teamB.id) return t;
  if (participant(t, a).disqualified || participant(t, b).disqualified) {
    throw new TournamentError('No se puede mover a alguien que se ha dado de baja.');
  }
  const swap = (ids: Id[]) => ids.map((id) => (id === a ? b : id === b ? a : id));
  const teams = t.teams.map((x) =>
    x.id === teamA.id || x.id === teamB.id ? withMembers(x, swap(x.memberIds)) : x,
  );
  return { ...t, teams };
}

/** Moves a participant from a pair into a team with a free place (a solo player's). */
export function moveMember(t: Tournament, participantId: Id, teamId: Id): Tournament {
  assertTeamsEditable(t);
  const from = teamOf(t, participantId);
  const to = team(t, teamId);
  if (from.id === to.id) return t;
  if (participant(t, participantId).disqualified) {
    throw new TournamentError('No se puede mover a alguien que se ha dado de baja.');
  }
  if (activeMembers(t, to.id).length >= 2) throw new TournamentError(`${to.club} ya tiene pareja completa.`);
  if (activeMembers(t, from.id).length < 2) {
    throw new TournamentError(`${from.club} se quedaría sin jugadores.`);
  }
  const teams = t.teams.map((x) =>
    x.id === from.id
      ? withMembers(x, x.memberIds.filter((id) => id !== participantId))
      : x.id === to.id
        ? withMembers(x, [...x.memberIds, participantId])
        : x,
  );
  return { ...t, teams };
}

/** Changes the club a team plays with. */
export function renameClub(t: Tournament, teamId: Id, club: string): Tournament {
  assertTeamsEditable(t);
  const name = club.trim();
  const current = team(t, teamId);
  if (!name) throw new TournamentError('Escribe el nombre del equipo.');
  if (t.teams.some((x) => x.id !== teamId && x.club.toLowerCase() === name.toLowerCase())) {
    throw new TournamentError(`${name} ya está en el torneo.`);
  }
  return {
    ...t,
    clubs: t.clubs.map((c) => (c === current.club ? name : c)),
    teams: t.teams.map((x) => (x.id === teamId ? { ...x, club: name } : x)),
  };
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

/** The players who make a team's knockout choices: its active members and any knockout partner. */
export function choosers(t: Tournament, teamId: Id): Id[] {
  const partner = team(t, teamId).knockoutPartnerId;
  return [...activeMembers(t, teamId), ...(partner ? [partner] : [])];
}

/** A player of the team whose turn it is makes the pending knockout choice from their phone. */
export function playerMakeChoice(t: Tournament, participantId: Id, choice: Partial<KnockoutChoices>): Tournament {
  const decision = currentDecision(t);
  if (!decision) throw new TournamentError('No hay ninguna elección pendiente.');
  if (!choosers(t, decision.chooserId).includes(participantId)) {
    throw new TournamentError('Esta elección le toca a otro equipo.');
  }
  return makeChoice(t, choice);
}

/**
 * Moves the tournament forward after any change: closes the group stage, creates the knockout
 * matches that are ready.
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
    next = { ...next, matches: [...next.matches, ...created] };
  }

  const final = next.matches.find((m) => m.phase === 'final');
  const third = next.matches.find((m) => m.phase === 'third');
  const thirdDone = third ? !!winnerOf(third) : !knockoutFormat(next.teams.length).thirdPlace;
  if (final && winnerOf(final) && thirdDone) next = { ...next, stage: 'finished' };
  return next;
}

/** The members of the team that won the final: a stand-in who played it is not a champion. */
export function champions(t: Tournament): Id[] | null {
  const final = t.matches.find((m) => m.phase === 'final');
  const winner = final && winnerOf(final);
  if (!final || !winner) return null;
  return lineup(t, final, winner).filter((id) => team(t, winner).memberIds.includes(id));
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

export function halfMinutesOf(t: Tournament, phase: Match['phase']): number {
  const minutes = t.config.halfMinutes;
  return phase === 'quarter' ? (minutes.quarter ?? minutes.playoff) : minutes[phase];
}

export function matchMinutes(t: Tournament, phase: Match['phase']): number {
  return halfMinutesOf(t, phase) * 2 + t.config.changeoverMinutes;
}

/** Every match the tournament will have, group and knockout, by phase. */
export function allMatchPhases(teamCount: number): Match['phase'][] {
  return [...Array<Match['phase']>(groupMatchCount(teamCount)).fill('group'), ...knockoutPhases(teamCount)];
}

/** Matches still to be played, including knockout ones not created yet. */
export function remainingMatchPhases(t: Tournament): Match['phase'][] {
  const pending = t.matches.filter((m) => m.status !== 'done').map((m) => m.phase);
  if (t.stage === 'finished') return pending;
  const created = new Map<Match['phase'], number>();
  for (const m of t.matches) created.set(m.phase, (created.get(m.phase) ?? 0) + 1);
  for (const phase of allMatchPhases(t.clubs.length)) {
    const count = created.get(phase) ?? 0;
    if (count > 0) created.set(phase, count - 1);
    else pending.push(phase);
  }
  return pending;
}

export function totalMatchCount(teamCount: number): number {
  return allMatchPhases(teamCount).length;
}

export function estimatedRemainingMinutes(t: Tournament): number {
  return remainingMatchPhases(t).reduce((sum, phase) => sum + matchMinutes(t, phase), 0);
}

function assertStage(t: Tournament, stage: Tournament['stage']): void {
  if (t.stage !== stage) throw new TournamentError('Esa acción no toca en esta fase del torneo.');
}
