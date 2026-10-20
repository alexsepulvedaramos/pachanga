import { Injectable, inject } from '@angular/core';
import { hasBackend } from '../config';
import { Tournament } from '../domain/types';
import { LocalTournamentRepository } from './local-tournament-repository';
import { NotFoundError, StoredTournament, TournamentRepository } from './tournament-repository';

export const DEMO_PREFIX = 'DEMO';

export interface RecentTournament {
  id: string;
  name: string;
}

const RECENT_KEY = 'pachanga:recent';
const pinKey = (id: string) => `pachanga:pin:${id}`;
const meKey = (id: string) => `pachanga:me:${id}`;

/** Routes each tournament to its storage (demo tournaments never leave the browser). */
@Injectable({ providedIn: 'root' })
export class TournamentStore {
  private readonly local = inject(LocalTournamentRepository);
  private remote: Promise<TournamentRepository> | null = null;

  /** The Supabase client is loaded on first use so it stays out of the initial bundle. */
  repo(id: string): Promise<TournamentRepository> {
    if (id.startsWith(DEMO_PREFIX) || !hasBackend()) return Promise.resolve(this.local);
    this.remote ??= import('./supabase-tournament-repository').then(
      (m) => new m.SupabaseTournamentRepository(),
    );
    return this.remote;
  }

  async create(tournament: Tournament, pin: string): Promise<StoredTournament> {
    const stored = await (await this.repo(tournament.id)).create(tournament, pin);
    this.rememberPin(tournament.id, pin);
    this.remember({ id: tournament.id, name: tournament.name });
    return stored;
  }

  async load(id: string): Promise<StoredTournament> {
    const stored = await (await this.repo(id)).load(id);
    if (!stored) throw new NotFoundError();
    this.remember({ id, name: stored.tournament.name });
    return stored;
  }

  savedPin(id: string): string | null {
    try {
      return localStorage.getItem(pinKey(id));
    } catch {
      return null;
    }
  }

  rememberPin(id: string, pin: string): void {
    try {
      localStorage.setItem(pinKey(id), pin);
    } catch {
      /* private mode: the PIN lasts for this visit only */
    }
  }

  forgetPin(id: string): void {
    try {
      localStorage.removeItem(pinKey(id));
    } catch {
      /* nothing to forget */
    }
  }

  savedIdentity(id: string): string | null {
    try {
      return localStorage.getItem(meKey(id));
    } catch {
      return null;
    }
  }

  rememberIdentity(id: string, participantId: string | null): void {
    try {
      if (participantId) localStorage.setItem(meKey(id), participantId);
      else localStorage.removeItem(meKey(id));
    } catch {
      /* private mode: the choice lasts for this visit only */
    }
  }

  recent(): RecentTournament[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentTournament[];
    } catch {
      return [];
    }
  }

  private remember(entry: RecentTournament): void {
    const list = [entry, ...this.recent().filter((r) => r.id !== entry.id)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      /* not critical */
    }
  }
}
