import { Component, computed, inject, input } from '@angular/core';
import { TournamentSession } from '../data/tournament-session';
import { clubColor } from './club-colors';
import { ClubCrest } from './club-crest';
import { knockoutFormat } from '../domain/knockout';
import { standings } from '../domain/tournament';

type Zone = 'direct' | 'playoff' | 'out';

const ZONE_STYLES: Record<Zone, string> = {
  direct: 'border-l-volt',
  playoff: 'border-l-cyan',
  out: 'border-l-flare',
};

@Component({
  selector: 'app-standings-table',
  imports: [ClubCrest],
  template: `
    <!-- On phones the table scrolls sideways; position and team stay pinned on the left. -->
    <div class="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table class="w-full border-collapse font-display" [class]="big() ? 'text-2xl' : 'min-w-[34rem] text-base'">
        <thead>
          <tr class="eyebrow text-mist">
            <th class="sticky left-0 z-10 w-10 bg-ink py-2 pl-4 text-left font-bold">#</th>
            <th class="sticky left-10 z-10 bg-ink py-2 text-left font-bold">Equipo</th>
            <th class="w-10 text-center font-bold" title="Partidos jugados">PJ</th>
            @if (!big()) {
              <th class="w-9 text-center font-bold" title="Ganados">G</th>
              <th class="w-9 text-center font-bold" title="Empatados">E</th>
              <th class="w-9 text-center font-bold" title="Perdidos">P</th>
            }
            <th class="w-10 text-center font-bold" title="Goles a favor">GF</th>
            <th class="w-10 text-center font-bold" title="Goles en contra">GC</th>
            <th class="w-12 text-center font-bold" title="Diferencia de goles">DG</th>
            <th class="w-12 pr-3 text-right font-bold">Pts</th>
            @if (!big()) {
              <th class="hidden w-28 pl-4 text-left font-bold md:table-cell">Forma</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.teamId; let i = $index) {
            <tr class="[&>td]:border-b-4 [&>td]:border-ink [&>td]:bg-pitch">
              <td class="sticky left-0 z-10 w-10 border-l-4 py-2.5 pl-3 font-extrabold italic" [class]="zoneStyles[row.zone]">{{ i + 1 }}</td>
              <td class="sticky left-10 z-10 py-2.5 pr-3 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.6)]">
                <div class="flex items-center gap-2.5">
                  <app-club-crest [club]="row.club" [color]="row.color" [size]="big() ? '2.5rem' : '1.75rem'" />
                  <div class="min-w-0 max-w-[9rem] sm:max-w-none">
                    <p class="truncate font-extrabold uppercase italic leading-tight">{{ row.club }}</p>
                    @if (!big()) {
                      <p class="truncate font-sans text-xs text-mist">{{ row.members }}</p>
                    }
                  </div>
                </div>
              </td>
              <td class="text-center text-mist">{{ row.played }}</td>
              @if (!big()) {
                <td class="text-center">{{ row.won }}</td>
                <td class="text-center">{{ row.drawn }}</td>
                <td class="text-center">{{ row.lost }}</td>
              }
              <td class="text-center">{{ row.goalsFor }}</td>
              <td class="text-center text-mist">{{ row.goalsAgainst }}</td>
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
        @if (format(); as f) {
          @if (f.direct > 0) {
            <li class="flex items-center gap-1.5"><span class="size-2.5 bg-volt"></span>{{ f.directLabel }}</li>
          }
          <li class="flex items-center gap-1.5"><span class="size-2.5 bg-cyan"></span>{{ f.playoffLabel }}</li>
        }
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

  protected readonly format = computed(() => {
    const teams = this.session.tournament()?.teams.length ?? 0;
    return teams ? knockoutFormat(teams) : null;
  });

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
