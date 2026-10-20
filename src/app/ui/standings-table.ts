import { Component, computed, inject, input } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { clubColor } from './club-colors';
import { knockoutFormat } from '../domain/knockout';
import { standings } from '../domain/tournament';

type Zone = 'direct' | 'playoff' | 'out';

const ZONE_STYLES: Record<Zone, string> = {
  direct: 'border-volt',
  playoff: 'border-cyan',
  out: 'border-flare',
};

@Component({
  selector: 'app-standings-table',
  template: `
    <div class="overflow-x-auto">
      <table class="w-full min-w-[22rem] border-collapse font-display" [class]="big() ? 'text-2xl' : 'text-base'">
        <thead>
          <tr class="eyebrow text-mist">
            <th class="w-10 py-2 text-left font-bold">#</th>
            <th class="py-2 text-left font-bold">Equipo</th>
            <th class="w-10 text-center font-bold">PJ</th>
            @if (!big()) {
              <th class="hidden w-10 text-center font-bold sm:table-cell">G</th>
              <th class="hidden w-10 text-center font-bold sm:table-cell">E</th>
              <th class="hidden w-10 text-center font-bold sm:table-cell">P</th>
              <th class="hidden w-14 text-center font-bold sm:table-cell">Goles</th>
            }
            <th class="w-12 text-center font-bold">DG</th>
            <th class="w-12 text-right font-bold">Pts</th>
            @if (!big()) {
              <th class="hidden w-28 pl-4 text-left font-bold md:table-cell">Forma</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.teamId; let i = $index) {
            <tr class="border-l-4 bg-pitch [&>td]:border-b-4 [&>td]:border-ink" [class]="zoneStyles[row.zone]">
              <td class="py-2.5 pl-3 font-extrabold italic">{{ i + 1 }}</td>
              <td class="py-2.5">
                <div class="flex items-center gap-2.5">
                  <span class="h-6 w-1" [style.background]="row.color"></span>
                  <div class="min-w-0">
                    <p class="truncate font-extrabold uppercase italic leading-tight">{{ row.club }}</p>
                    @if (!big()) {
                      <p class="truncate font-sans text-xs text-mist">{{ row.members }}</p>
                    }
                  </div>
                </div>
              </td>
              <td class="text-center text-mist">{{ row.played }}</td>
              @if (!big()) {
                <td class="hidden text-center sm:table-cell">{{ row.won }}</td>
                <td class="hidden text-center sm:table-cell">{{ row.drawn }}</td>
                <td class="hidden text-center sm:table-cell">{{ row.lost }}</td>
                <td class="hidden text-center text-mist sm:table-cell">{{ row.goalsFor }}:{{ row.goalsAgainst }}</td>
              }
              <td class="text-center" [class.text-volt]="row.goalDifference > 0" [class.text-flare]="row.goalDifference < 0">
                {{ row.goalDifference > 0 ? '+' : '' }}{{ row.goalDifference }}
              </td>
              <td class="pr-3 text-right font-extrabold italic" [class]="big() ? 'text-3xl' : 'text-xl'">{{ row.points }}</td>
              @if (!big()) {
                <td class="hidden pl-4 md:table-cell">
                  <span class="flex gap-1">
                    @for (r of row.form.slice(-5); track $index) {
                      <span
                        class="grid size-5 place-items-center text-[0.65rem] font-extrabold text-ink"
                        [class]="r === 'W' ? 'bg-volt' : r === 'D' ? 'bg-mist' : 'bg-flare'"
                        >{{ r === 'W' ? 'G' : r === 'D' ? 'E' : 'P' }}</span
                      >
                    }
                  </span>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (!big()) {
      <ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-mist">
        <li class="flex items-center gap-1.5"><span class="size-2.5 bg-volt"></span>Directo a semis</li>
        <li class="flex items-center gap-1.5"><span class="size-2.5 bg-cyan"></span>Repesca</li>
        @if (hasOut()) {
          <li class="flex items-center gap-1.5"><span class="size-2.5 bg-flare"></span>Eliminado</li>
        }
      </ul>
    }
  `,
})
export class StandingsTable {
  private readonly session = inject(TournamentSession);
  readonly big = input(false);
  protected readonly zoneStyles = ZONE_STYLES;

  protected readonly rows = computed(() => {
    const t = this.session.tournament();
    if (!t || t.teams.length === 0) return [];
    const format = knockoutFormat(t.teams.length);
    const table = t.groupRanking
      ? t.groupRanking.map((id) => standings(t).find((r) => r.teamId === id)!)
      : standings(t);
    return table.map((row, i) => {
      const position = i + 1;
      const zone: Zone =
        position <= format.direct ? 'direct' : format.playoff.includes(position) ? 'playoff' : 'out';
      const team = t.teams.find((x) => x.id === row.teamId)!;
      return {
        ...row,
        zone,
        club: team.club,
        color: clubColor(t.clubs, team.club),
        members: this.session.memberNames(team.id).join(' + '),
      };
    });
  });

  protected readonly hasOut = computed(() => this.rows().some((r) => r.zone === 'out'));
}
