import { Component, computed, inject } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { currentDecision, makeChoice } from '../domain/tournament';
import { KnockoutChoices } from '../domain/types';

/** The pending knockout choice (opponent or match order) for the team that has to make it. */
@Component({
  selector: 'app-decision-panel',
  template: `
    @if (decision(); as d) {
      <section class="cut animate-rise border-l-4 border-gold bg-pitch p-5">
        <p class="eyebrow text-gold">{{ title() }}</p>
        <p class="heading mt-1 text-3xl">
          {{ session.teamName(d.chooserId) }}
          <span class="text-mist">{{ question() }}</span>
        </p>
        <p class="mt-1 text-sm text-mist">{{ session.memberNames(d.chooserId).join(' + ') }}</p>

        @if (session.isAdmin()) {
          <div class="mt-4 flex flex-wrap gap-2">
            @if (d.kind === 'playoffOpponent' || d.kind === 'semiOpponent') {
              @for (option of d.options; track option) {
                <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="pickOpponent(option)">
                  {{ session.teamName(option) }}
                </button>
              }
            } @else {
              <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="pickOrder(true)">Jugar primero</button>
              <button type="button" class="btn-secondary" [disabled]="session.saving()" (click)="pickOrder(false)">Jugar segundo</button>
            }
          </div>
        } @else {
          <p class="mt-3 font-display font-bold uppercase text-mist">Esperando su elección…</p>
        }
      </section>
    }
  `,
})
export class DecisionPanel {
  protected readonly session = inject(TournamentSession);

  protected readonly decision = computed(() => {
    const t = this.session.tournament();
    return t ? currentDecision(t) : null;
  });

  protected readonly title = computed(() => {
    const kind = this.decision()?.kind;
    return kind === 'playoffOpponent' || kind === 'playoffOrder' ? 'Repesca' : 'Semifinales';
  });

  protected readonly question = computed(() => {
    const kind = this.decision()?.kind;
    return kind === 'playoffOpponent' || kind === 'semiOpponent'
      ? 'elige rival'
      : '¿juega primero o segundo?';
  });

  protected async pickOpponent(teamId: string): Promise<void> {
    const kind = this.decision()?.kind;
    const choice: Partial<KnockoutChoices> =
      kind === 'playoffOpponent' ? { playoffOpponentId: teamId } : { semiOpponentId: teamId };
    await this.session.apply((t) => makeChoice(t, choice));
  }

  protected async pickOrder(first: boolean): Promise<void> {
    const kind = this.decision()?.kind;
    const choice: Partial<KnockoutChoices> =
      kind === 'playoffOrder' ? { playoffChooserFirst: first } : { semiChooserFirst: first };
    await this.session.apply((t) => makeChoice(t, choice));
  }
}
