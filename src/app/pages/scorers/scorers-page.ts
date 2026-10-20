import { Component, computed, inject } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { topScorers } from '../../domain/tournament';

@Component({
  selector: 'app-scorers-page',
  template: `
    <h1 class="heading text-4xl">Goleadores</h1>
    <ol class="mt-5 space-y-1.5">
      @for (row of rows(); track row.participantId; let i = $index) {
        <li class="cut-sm flex items-center gap-4 bg-pitch px-4 py-3" [class.bg-volt]="i === 0" [class.text-ink]="i === 0">
          <span class="heading w-8 text-2xl" [class.text-mist]="i !== 0">{{ i + 1 }}</span>
          <span class="flex-1 font-display text-xl font-bold uppercase">{{ session.personName(row.participantId) }}</span>
          <span class="heading text-3xl tabular-nums">{{ row.goals }}</span>
        </li>
      } @empty {
        <li class="text-mist">Aún no hay goles apuntados.</li>
      }
    </ol>
  `,
})
export class ScorersPage {
  protected readonly session = inject(TournamentSession);
  protected readonly rows = computed(() => {
    const t = this.session.tournament();
    return t ? topScorers(t) : [];
  });
}
