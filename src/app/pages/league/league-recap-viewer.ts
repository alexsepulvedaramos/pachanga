import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { Stage } from '../../domain/types';

/**
 * Whether this screen is showing the group stage recap. It opens by itself on every screen that
 * sees the group stage end, and on demand afterwards.
 */
@Injectable()
export class LeagueRecapViewer {
  private readonly session = inject(TournamentSession);
  readonly open = signal(false);
  private lastStage: Stage | null = null;

  constructor() {
    effect(() => {
      const stage = this.session.tournament()?.stage ?? null;
      if (this.lastStage === 'groups' && stage === 'knockout') untracked(() => this.open.set(true));
      this.lastStage = stage;
    });
  }

  show(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
