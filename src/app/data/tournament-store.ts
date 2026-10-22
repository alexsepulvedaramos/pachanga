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
const pushKey = (id: string) => `pachanga:push:${id}`;
const voteTokenKey = (id: string) => `pachanga:vote-token:${id}`;
const ballotsKey = (id: string) => `pachanga:ballots:${id}`;

const isDemo = (id: string) => id.startsWith(DEMO_PREFIX);

/**
 * Routes each tournament to its storage and keeps this device's per-tournament memory (PIN, who
 * you are, recent list). Demo tournaments live only in the current tab and never show up as
 * recent.
 */
@Injectable({ providedIn: 'root' })
export class TournamentStore {
  private readonly local = inject(LocalTournamentRepository);
  private remote: Promise<TournamentRepository> | null = null;

  constructor() {
    this.dropLegacyDemos();
  }

  /** The Supabase client is loaded on first use so it stays out of the initial bundle. */
  repo(id: string): Promise<TournamentRepository> {
    if (isDemo(id) || !hasBackend()) return Promise.resolve(this.local);
    this.remote ??= import('./supabase-tournament-repository').then(
      (m) => new m.SupabaseTournamentRepository(),
    );
    return this.remote;
  }

  async create(tournament: Tournament, pin: string): Promise<StoredTournament> {
    if (isDemo(tournament.id)) this.local.clear(); // one demo at a time
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

  /** Whether this device created the tournament (it holds the admin PIN). */
  isOwner(id: string): boolean {
    return this.savedPin(id) !== null;
  }

  /** Deletes the tournament for everyone, then forgets it here. */
  async delete(id: string): Promise<void> {
    const pin = this.savedPin(id);
    if (!pin) throw new Error('Solo quien creó el torneo puede borrarlo.');
    await (await this.repo(id)).delete(id, pin);
    this.forget(id);
  }

  /** Removes a tournament from this device only: recent list, PIN and preferences. */
  forget(id: string): void {
    this.writeRecent(this.recent().filter((r) => r.id !== id));
    for (const k of [pinKey(id), meKey(id), pushKey(id), voteTokenKey(id), ballotsKey(id)]) this.storage(id)?.removeItem(k);
  }

  savedPin(id: string): string | null {
    return this.storage(id)?.getItem(pinKey(id)) ?? null;
  }

  rememberPin(id: string, pin: string): void {
    this.set(id, pinKey(id), pin);
  }

  forgetPin(id: string): void {
    this.storage(id)?.removeItem(pinKey(id));
  }

  savedIdentity(id: string): string | null {
    return this.storage(id)?.getItem(meKey(id)) ?? null;
  }

  rememberIdentity(id: string, participantId: string | null): void {
    if (participantId) this.set(id, meKey(id), participantId);
    else this.storage(id)?.removeItem(meKey(id));
  }

  /** Random secret tying the ballots cast from this phone to it, created on first use. */
  voteToken(id: string): string {
    const saved = this.storage(id)?.getItem(voteTokenKey(id));
    if (saved) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    this.set(id, voteTokenKey(id), token);
    return token;
  }

  /** Podiums voted from this phone, by voter, so they can be shown and changed. */
  savedBallots(id: string): Record<string, string[]> {
    try {
      return JSON.parse(this.storage(id)?.getItem(ballotsKey(id)) ?? '{}') as Record<string, string[]>;
    } catch {
      return {};
    }
  }

  rememberBallot(id: string, voterId: string, picks: string[]): void {
    this.set(id, ballotsKey(id), JSON.stringify({ ...this.savedBallots(id), [voterId]: picks }));
  }

  recent(): RecentTournament[] {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentTournament[];
    } catch {
      return [];
    }
  }

  private remember(entry: RecentTournament): void {
    if (isDemo(entry.id)) return;
    this.writeRecent([entry, ...this.recent().filter((r) => r.id !== entry.id)].slice(0, 8));
  }

  private writeRecent(list: RecentTournament[]): void {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      /* not critical */
    }
  }

  /** Demo data goes with the tab; everything else stays on the device. */
  private storage(id: string): Storage | null {
    try {
      return isDemo(id) ? sessionStorage : localStorage;
    } catch {
      return null;
    }
  }

  private set(id: string, key: string, value: string): void {
    try {
      this.storage(id)?.setItem(key, value);
    } catch {
      /* private mode: lasts for this visit only */
    }
  }

  /** Earlier versions kept demos in local storage and in the recent list: clear them out. */
  private dropLegacyDemos(): void {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('pachanga:') && k.includes(`:${DEMO_PREFIX}`)) localStorage.removeItem(k);
      }
      const recent = this.recent();
      if (recent.some((r) => isDemo(r.id))) this.writeRecent(recent.filter((r) => !isDemo(r.id)));
    } catch {
      /* storage unavailable */
    }
  }
}
