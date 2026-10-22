import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { galaLive } from '../../domain/gala';

/**
 * Whether this screen is showing the gala, and how: following the admin live, or replayed at
 * its own pace. Each gala the admin starts opens by itself, once, on every screen that has the
 * tournament open.
 */
@Injectable()
export class GalaViewer {
  private readonly session = inject(TournamentSession);
  readonly mode = signal<'live' | 'replay' | null>(null);
  /** Start time of the last live gala this screen joined. */
  private joined: string | null = null;

  constructor() {
    effect(() => {
      const t = this.session.tournament();
      const startedAt = t?.gala?.startedAt;
      if (!t || !startedAt || !galaLive(t) || startedAt === this.joined) return;
      this.joined = startedAt;
      untracked(() => this.mode.set('live'));
    });
  }

  watchLive(): void {
    this.mode.set('live');
  }

  replay(): void {
    this.mode.set('replay');
  }

  close(): void {
    this.mode.set(null);
  }
}
