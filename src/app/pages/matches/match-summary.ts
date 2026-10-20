import { Component, computed, inject, input } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { Id, Match } from '../../domain/types';
import { lineup } from '../../domain/tournament';

/** What happened in a finished match: who played, who scored, penalties and incidents. */
@Component({
  selector: 'app-match-summary',
  template: `
    <div class="mb-2 animate-rise border-l-4 border-line bg-pitch px-4 py-3 text-sm">
      @if (extra(); as e) {
        <p class="eyebrow mb-2 text-cyan">{{ e }}</p>
      }
      <div class="grid grid-cols-2 gap-4">
        @for (side of sides(); track side.teamId; let right = $last) {
          <div [class.text-right]="right">
            <p class="font-display font-bold uppercase">{{ side.club }}</p>
            <p class="text-xs text-mist">{{ side.players }}</p>
            @if (side.scorers.length) {
              <ul class="mt-2 space-y-0.5">
                @for (s of side.scorers; track s.name) {
                  <li>⚽ {{ s.name }}@if (s.goals > 1) {<span class="text-mist"> ×{{ s.goals }}</span>}</li>
                }
              </ul>
            }
            @if (side.incidents.length) {
              <ul class="mt-2 space-y-1">
                @for (x of side.incidents; track x.player) {
                  <li class="flex items-center gap-1.5" [class.justify-end]="right">
                    <span class="tag" [class]="x.kind === 'redCard' ? 'bg-flare text-ink' : 'bg-gold text-ink'">
                      {{ x.kind === 'redCard' ? 'Roja' : 'Lesión' }}
                    </span>
                    {{ x.player }}
                  </li>
                }
              </ul>
            }
          </div>
        }
      </div>
      @if (empty()) {
        <p class="mt-2 text-xs text-mist">Sin goleadores ni sanciones apuntados.</p>
      }
    </div>
  `,
})
export class MatchSummary {
  private readonly session = inject(TournamentSession);
  readonly match = input.required<Match>();

  protected readonly sides = computed(() => {
    const t = this.session.tournament()!;
    const m = this.match();
    return [m.homeId, m.awayId].map((teamId: Id) => {
      const counts = new Map<string, number>();
      for (const g of m.goals ?? []) {
        if (g.teamId !== teamId) continue;
        const name = g.scorerId ? this.session.personName(g.scorerId) : 'En propia';
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return {
        teamId,
        club: this.session.teamName(teamId),
        players: lineup(t, m, teamId).map((id) => this.session.personName(id)).join(' + '),
        scorers: [...counts].map(([name, goals]) => ({ name, goals })),
        incidents: (m.incidents ?? []).filter((x) => x.teamId === teamId && typeof x.player === 'string'),
      };
    });
  });

  protected readonly extra = computed(() => {
    const m = this.match();
    if (m.homePens != null && m.awayPens != null) return `Penaltis ${m.homePens}–${m.awayPens}`;
    return m.extraTime ? 'Con prórroga' : '';
  });

  protected readonly empty = computed(() =>
    this.sides().every((s) => s.scorers.length === 0 && s.incidents.length === 0),
  );
}
