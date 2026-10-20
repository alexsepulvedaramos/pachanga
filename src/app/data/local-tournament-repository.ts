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

const key = (id: string) => `pachanga:tournament:${id}`;

/** Browser-only storage: used for the demo and when no backend is configured. */
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

  watch(id: string, onChange: (stored: StoredTournament) => void): () => void {
    const listener = (event: StorageEvent) => {
      if (event.key !== key(id) || !event.newValue) return;
      const record = JSON.parse(event.newValue) as LocalRecord;
      onChange({ tournament: record.tournament, version: record.version });
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  private read(id: string): LocalRecord | null {
    try {
      const raw = localStorage.getItem(key(id));
      return raw ? (JSON.parse(raw) as LocalRecord) : null;
    } catch {
      return null;
    }
  }

  private write(record: LocalRecord): void {
    localStorage.setItem(key(record.tournament.id), JSON.stringify(record));
  }
}
