import { Component, computed, inject, input } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { clubColor } from './club-colors';
import { Match } from '../domain/types';
import { winnerOf } from '../domain/knockout';
import { lineup } from '../domain/tournament';

/** Big scoreboard for one match: clubs, who plays for each side and the score. */
@Component({
  selector: 'app-match-card',
  template: `
    @let m = match();
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
      @for (side of sides(); track side.teamId; let i = $index) {
        @if (i === 1) {
          <div class="text-center">
            @if (m.status === 'done') {
              <p class="heading bg-ink px-3 py-1 tabular-nums" [class]="big() ? 'text-7xl sm:text-8xl' : 'text-5xl'">
                {{ m.homeGoals }}–{{ m.awayGoals }}
              </p>
              @if (m.homePens !== null && m.homePens !== undefined) {
                <p class="mt-1 font-display text-sm font-bold uppercase text-flare">Pen. {{ m.homePens }}–{{ m.awayPens }}</p>
              } @else if (m.extraTime) {
                <p class="mt-1 font-display text-sm font-bold uppercase text-mist">Prórroga</p>
              }
            } @else {
              <p class="heading text-mist" [class]="big() ? 'text-6xl' : 'text-4xl'">VS</p>
            }
          </div>
        }
        <div [class.text-right]="i === 1" [class.opacity-50]="side.lost">
          <span class="mb-2 block h-1.5 w-12" [class.ml-auto]="i === 1" [style.background]="side.color"></span>
          <p class="heading break-words" [class]="big() ? 'text-4xl sm:text-6xl' : 'text-2xl sm:text-3xl'">{{ side.club }}</p>
          <ul class="mt-1.5 space-y-0.5" [class]="big() ? 'text-xl' : 'text-sm'">
            @for (p of side.players; track p.id) {
              <li class="text-mist">
                {{ p.name }}
                @if (p.guest) {
                  <span class="tag ml-1 bg-gold text-[0.6rem] text-ink">Invitado</span>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class MatchCard {
  private readonly session = inject(TournamentSession);
  readonly match = input.required<Match>();
  readonly big = input(false);

  protected readonly sides = computed(() => {
    const m = this.match();
    const t = this.session.tournament()!;
    const winner = winnerOf(m);
    return [m.homeId, m.awayId].map((teamId) => {
      const team = t.teams.find((x) => x.id === teamId)!;
      const lineupIds = lineup(t, m, teamId);
      return {
        teamId,
        club: team.club,
        color: clubColor(t.clubs, team.club),
        lost: !!winner && winner !== teamId,
        players: lineupIds.map((id) => ({
          id,
          name: this.session.personName(id),
          guest: !team.memberIds.includes(id),
        })),
      };
    });
  });

}
