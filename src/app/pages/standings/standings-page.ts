import { Component, computed, inject } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { StandingsTable } from '../../ui/standings-table';
import { TIEBREAKER_LABELS } from '../../domain/standings';

@Component({
  selector: 'app-standings-page',
  imports: [StandingsTable],
  template: `
    @if (session.tournament(); as t) {
      @if (t.teams.length) {
        <div class="flex items-end justify-between">
          <h1 class="heading text-4xl">Clasificación</h1>
          @if (t.groupRanking) {
            <span class="tag bg-line text-mist">Final</span>
          }
        </div>
        <div class="mt-5"><app-standings-table /></div>
        <p class="mt-6 text-xs text-mist">
          Victoria 3 · Empate 1 · Derrota 0. Desempates: {{ tiebreakers() }}.
        </p>
      } @else {
        <p class="heading text-center text-3xl text-mist">La tabla aparece tras la ruleta</p>
      }
    }
  `,
})
export class StandingsPage {
  protected readonly session = inject(TournamentSession);
  protected readonly tiebreakers = computed(() =>
    (this.session.tournament()?.config.tiebreakers ?? []).map((c) => TIEBREAKER_LABELS[c]).join(' → '),
  );
}
