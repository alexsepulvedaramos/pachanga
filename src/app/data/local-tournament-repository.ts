import { Injectable } from '@angular/core';
import { BallonDorVote, Tournament } from '../domain/types';
import { ballonDorState, validateVote, votingOpen } from '../domain/ballon-dor';
import {
  ConflictError,
  hashPin,
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
}

const PREFIX = 'pachanga:tournament:';
const key = (id: string) => `${PREFIX}${id}`;

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

  async castVote(id: string, voterId: string, picks: string[], token: string): Promise<void> {
    const record = this.read(id);
    if (!record || !votingOpen(record.tournament)) throw new VotingClosedError();
    validateVote(record.tournament, voterId, picks);
    const ballots = record.ballots ?? [];
    const previous = ballots.find((b) => b.voterId === voterId);
    if (previous && previous.token !== token) throw new VoteTakenError();
    const next = previous
      ? ballots.map((b) => (b === previous ? { ...b, picks } : b))
      : [...ballots, { voterId, picks, token }];
    this.publish(record, next, false);
  }

  async closeVoting(id: string, pin: string): Promise<void> {
    const record = await this.adminRecord(id, pin);
    this.publish(record, record.ballots ?? [], true);
  }

  async resetVote(id: string, pin: string, voterId: string): Promise<void> {
    const record = await this.adminRecord(id, pin);
    this.publish(record, (record.ballots ?? []).filter((b) => b.voterId !== voterId), false);
  }

  private async adminRecord(id: string, pin: string): Promise<LocalRecord> {
    const record = this.read(id);
    if (!record || !(await this.verifyPin(id, pin))) throw new WrongPinError();
    if (!votingOpen(record.tournament)) throw new VotingClosedError();
    return record;
  }

  /** Same as the server: the public state shows who voted, and every ballot once closed. */
  private publish(record: LocalRecord, ballots: LocalRecord['ballots'] & {}, close: boolean): void {
    const votes = ballots.map(({ voterId, picks }) => ({ voterId, picks }));
    const tournament = { ...record.tournament, ballonDor: ballonDorState(record.tournament, votes, close) };
    this.write({ ...record, tournament, ballots, version: record.version + 1 });
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
