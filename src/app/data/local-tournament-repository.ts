import { Injectable } from '@angular/core';
import { Tournament } from '../domain/types';
import {
  ConflictError,
  hashPin,
  StoredTournament,
  TournamentRepository,
  WrongPinError,
} from './tournament-repository';

interface LocalRecord extends StoredTournament {
  pinHash: string;
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
