import { Component, computed, inject } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { ChoiceMomentViewer } from '../pages/choice/choice-moment-viewer';

/**
 * The pending knockout choice (opponent or match order), made here by that team's players or the
 * admin, or opened full screen as the moment to choose.
 */
@Component({
  selector: 'app-decision-panel',
  template: `
    @if (viewer.decision(); as d) {
      <section class="cut animate-rise border-l-4 border-gold bg-pitch p-5">
        <p class="eyebrow text-gold">{{ title() }}</p>
        <p class="heading mt-1 text-3xl">
          {{ session.teamName(d.chooserId) }}
          <span class="text-mist">{{ question() }}</span>
        </p>
        <p class="mt-1 text-sm text-mist">{{ session.memberNames(d.chooserId).join(' + ') }}</p>

        @if (session.isAdmin() || viewer.mine()) {
          <div class="mt-4 flex flex-wrap gap-2">
            @if (d.kind === 'playoffOpponent' || d.kind === 'semiOpponent') {
              @for (option of d.options; track option) {
                <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="viewer.choose(option)">
                  {{ session.teamName(option) }}
                </button>
              }
            } @else {
              <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="viewer.choose(true)">Jugar primero</button>
              <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="viewer.choose(false)">Jugar segundo</button>
            }
          </div>
        } @else {
          <p class="mt-3 font-display font-bold uppercase text-mist">Esperando su elección…</p>
        }
        <button type="button" class="eyebrow mt-4 text-gold hover:text-chalk" (click)="viewer.show()">Ver en pantalla completa</button>
      </section>
    }
  `,
})
export class DecisionPanel {
  protected readonly session = inject(TournamentSession);
  protected readonly viewer = inject(ChoiceMomentViewer);

  protected readonly title = computed(() => {
    const kind = this.viewer.decision()?.kind;
    return kind === 'playoffOpponent' || kind === 'playoffOrder' ? 'Repesca' : 'Semifinales';
  });

  protected readonly question = computed(() => {
    const kind = this.viewer.decision()?.kind;
    return kind === 'playoffOpponent' || kind === 'semiOpponent'
      ? 'elige rival'
      : '¿juega primero o segundo?';
  });
}
