import { Injectable } from '@angular/core';
import { BallonDorVote, Tournament } from '../domain/types';
import { ballonDorState, validateVote, votingOpen } from '../domain/ballon-dor';
import { MatchResult, reportResult } from '../domain/tournament';
import {
  ConflictError,
  hashPin,
  NameTakenError,
  StoredTournament,
  TournamentRepository,
  VoteTakenError,
  VotingClosedError,
  WrongPinError,
} from './tournament-repository';

interface LocalRecord extends StoredTournament {
  pinHash: string;
  /** Secret Ballon d'Or ballots, with the token of the phone that cast each. */
  ballots?: (BallonDorVote & { token: string })[];
  /** Which phone holds each name taken. */
  claims?: { participantId: string; token: string }[];
}

const PREFIX = 'pachanga:tournament:';
const key = (id: string) => `${PREFIX}${id}`;

/** The claims once `token` takes a name, letting go of any other it had, like the server does. */
function takeName(record: LocalRecord, participantId: string, token: string): LocalRecord['claims'] & {} {
  if (!record.tournament.participants.some((p) => p.id === participantId)) {
    throw new Error('Ese nombre no está en el torneo.');
  }
  const claims = record.claims ?? [];
  const owner = claims.find((c) => c.participantId === participantId);
  if (owner && owner.token !== token) throw new NameTakenError();
  return [...claims.filter((c) => c.token !== token), { participantId, token }];
}

/** Same as the server: the public state lists the names taken, not by whom. */
function withClaims(record: LocalRecord, claims: LocalRecord['claims'] & {}): LocalRecord {
  const claimed = claims.map((c) => c.participantId).sort();
  return { ...record, claims, tournament: { ...record.tournament, claimed }, version: record.version + 1 };
}

/** Same as the server: the public state shows who voted, and every ballot once closed. */
function withBallots(record: LocalRecord, ballots: LocalRecord['ballots'] & {}, close: boolean): LocalRecord {
  const votes = ballots.map(({ voterId, picks }) => ({ voterId, picks }));
  const tournament = { ...record.tournament, ballonDor: ballonDorState(record.tournament, votes, close) };
  return { ...record, tournament, ballots, version: record.version + 1 };
}

/**
 * Browser-only storage, used for the demo and when no backend is configured. Kept in session
 * storage: it lives as long as the tab, so a demo disappears when you leave.
 */
@Injectable()
export class LocalTournamentRepository extends TournamentRepository {
  async create(tournament: Tournament, pin: string): Promise<StoredTournament> {
    const record: LocalRecord = { tournament, version: 1, pinHash: await hashPin(tournament.id, pin) };
    this.write(record);
    return { tournament, version: 1 };
  }

  async load(id: string): Promise<StoredTournament | null> {
    const record = this.read(id);
    return record ? { tournament: record.tournament, version: record.version } : null;
  }

  async save(tournament: Tournament, pin: string, expectedVersion: number): Promise<StoredTournament> {
    const record = this.read(tournament.id);
    if (!record) throw new ConflictError();
    if (record.pinHash !== (await hashPin(tournament.id, pin))) throw new WrongPinError();
    if (record.version !== expectedVersion) throw new ConflictError();
    const next: LocalRecord = { ...record, tournament, version: record.version + 1 };
    this.write(next);
    return { tournament, version: next.version };
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    const record = this.read(id);
    return !!record && record.pinHash === (await hashPin(id, pin));
  }

  async delete(id: string): Promise<void> {
    try {
      sessionStorage.removeItem(key(id));
    } catch {
      /* nothing stored */
    }
  }

  async claim(id: string, participantId: string, token: string): Promise<void> {
    const record = this.read(id);
    if (!record) throw new ConflictError();
    this.write(withClaims(record, takeName(record, participantId, token)));
  }

  async release(id: string, participantId: string, token: string, dropVote: boolean): Promise<void> {
    const record = this.read(id);
    const claims = record?.claims ?? [];
    if (!record || !claims.some((c) => c.participantId === participantId && c.token === token)) return;
    let next = withClaims(record, claims.filter((c) => c.participantId !== participantId));
    if (dropVote && votingOpen(next.tournament)) {
      const ballots = (next.ballots ?? []).filter((b) => !(b.voterId === participantId && b.token === token));
      next = withBallots(next, ballots, false);
    }
    this.write(next);
  }

  async adminRelease(id: string, pin: string, participantId: string): Promise<void> {
    const record = this.read(id);
    if (!record || !(await this.verifyPin(id, pin))) throw new WrongPinError();
    this.write(withClaims(record, (record.claims ?? []).filter((c) => c.participantId !== participantId)));
  }

  async reportResult(id: string, participantId: string, token: string, matchId: string, result: MatchResult): Promise<void> {
    const record = this.read(id);
    if (!record) throw new ConflictError();
    if (!(record.claims ?? []).some((c) => c.participantId === participantId && c.token === token)) {
      throw new Error('Ese nombre no es de este móvil.');
    }
    const tournament = reportResult(record.tournament, participantId, matchId, result);
    this.write({ ...record, tournament, version: record.version + 1 });
  }

  async castVote(id: string, voterId: string, picks: string[], token: string): Promise<void> {
    const record = this.read(id);
    if (!record || !votingOpen(record.tournament)) throw new VotingClosedError();
    validateVote(record.tournament, voterId, picks);
    const claimed = withClaims(record, takeName(record, voterId, token));
    const ballots = claimed.ballots ?? [];
    const previous = ballots.find((b) => b.voterId === voterId);
    if (previous && previous.token !== token) throw new VoteTakenError();
    const next = previous
      ? ballots.map((b) => (b === previous ? { ...b, picks } : b))
      : [...ballots, { voterId, picks, token }];
    this.write(withBallots(claimed, next, false));
  }

  async closeVoting(id: string, pin: string): Promise<void> {
    const record = await this.adminRecord(id, pin);
    this.write(withBallots(record, record.ballots ?? [], true));
  }

  async resetVote(id: string, pin: string, voterId: string): Promise<void> {
    const record = await this.adminRecord(id, pin);
    this.write(withBallots(record, (record.ballots ?? []).filter((b) => b.voterId !== voterId), false));
  }

  private async adminRecord(id: string, pin: string): Promise<LocalRecord> {
    const record = this.read(id);
    if (!record || !(await this.verifyPin(id, pin))) throw new WrongPinError();
    if (!votingOpen(record.tournament)) throw new VotingClosedError();
    return record;
  }

  /** Removes every tournament kept in this tab (used to keep a single demo at a time). */
  clear(): void {
    try {
      for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    } catch {
      /* nothing stored */
    }
  }

  watch(): () => void {
    // Session storage belongs to one tab, so there is nobody else to hear from.
    return () => undefined;
  }

  async subscribePush(): Promise<void> {
    throw new Error('Los avisos solo funcionan en torneos online, no en la demo.');
  }

  async unsubscribePush(): Promise<void> {
    /* nothing was registered */
  }

  private read(id: string): LocalRecord | null {
    try {
      const raw = sessionStorage.getItem(key(id));
      return raw ? (JSON.parse(raw) as LocalRecord) : null;
    } catch {
      return null;
    }
  }

  private write(record: LocalRecord): void {
    sessionStorage.setItem(key(record.tournament.id), JSON.stringify(record));
  }
}
