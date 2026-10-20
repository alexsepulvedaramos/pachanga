import { Component, computed, inject } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { DecisionPanel } from '../../ui/decision-panel';
import { clubColor } from '../../ui/club-colors';
import { Id, Match, Phase } from '../../domain/types';
import { knockoutFormat, QUARTER_SEEDS, winnerOf } from '../../domain/knockout';

interface Slot {
  label: string;
  rows: { name: string; color: string; score: string; won: boolean }[] | null;
  placeholder: string;
  live: boolean;
}

@Component({
  selector: 'app-bracket-page',
  imports: [DecisionPanel],
  template: `
    @if (session.tournament(); as t) {
      <h1 class="heading text-4xl">Cuadro</h1>
      <div class="mt-5"><app-decision-panel /></div>

      <div class="mt-6 grid gap-6" [class]="columns().length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'">
        @for (column of columns(); track column.title) {
          <section>
            <h2 class="eyebrow text-cyan">{{ column.title }}</h2>
            <div class="mt-2 space-y-3">
              @for (slot of column.slots; track slot.label) {
                <article class="cut bg-pitch" [class.ring-2]="slot.live" [class.ring-flare]="slot.live">
                  <p class="eyebrow border-b border-line px-3 py-1.5 text-[0.65rem] text-mist">
                    {{ slot.label }}
                    @if (slot.live) {
                      <span class="ml-1 animate-pulse-live text-flare">· En juego</span>
                    }
                  </p>
                  @if (slot.rows; as rows) {
                    @for (row of rows; track $index) {
                      <div class="flex items-center gap-2 px-3 py-2" [class.text-mist]="!row.won && rows[0].score !== ''">
                        <span class="h-5 w-1" [style.background]="row.color"></span>
                        <span class="flex-1 truncate font-display text-lg font-extrabold uppercase italic" [class.text-volt]="row.won">{{ row.name }}</span>
                        <span class="heading text-2xl tabular-nums">{{ row.score }}</span>
                      </div>
                    }
                  } @else {
                    <p class="px-3 py-4 font-display text-base font-bold uppercase text-mist">{{ slot.placeholder }}</p>
                  }
                </article>
              }
            </div>
          </section>
        }
      </div>
    }
  `,
})
export class BracketPage {
  protected readonly session = inject(TournamentSession);

  protected readonly columns = computed(() => {
    const t = this.session.tournament();
    if (!t) return [];
    const teams = t.clubs.length;
    const format = knockoutFormat(teams);
    const ranking = t.groupRanking;
    const byPhase = (phase: Phase) => t.matches.filter((m) => m.phase === phase);
    const seedName = (position: number) =>
      ranking ? this.session.teamName(ranking[position - 1]) : `${position}º liguilla`;

    const slot = (label: string, match: Match | undefined, placeholder: string): Slot => ({
      label,
      placeholder,
      live: match?.status === 'live',
      rows: match ? this.rows(match) : null,
    });

    const finals = (finalPlaceholder: string) => [
      slot('Final', byPhase('final')[0], finalPlaceholder),
      ...(format.thirdPlace ? [slot('3er puesto', byPhase('third')[0], 'Perdedores de semis')] : []),
    ];

    if (format.firstRound === 'quarter') {
      const quarters = QUARTER_SEEDS.map(([a, b], i) =>
        slot(`Cuartos ${i + 1}`, byPhase('quarter')[i], `${seedName(a)} vs ${seedName(b)}`),
      );
      const semis = [0, 1].map((i) =>
        slot(`Semifinal ${i + 1}`, byPhase('semi')[i], `Ganadores de cuartos ${2 * i + 1} y ${2 * i + 2}`),
      );
      return [
        { title: 'Cuartos', slots: quarters },
        { title: 'Semifinales', slots: semis },
        { title: 'Final', slots: finals('Ganadores de semis') },
      ];
    }

    if (teams === 3) {
      return [
        { title: 'Semifinal', slots: [slot('Semifinal', byPhase('semi')[0], `${seedName(2)} vs ${seedName(3)}`)] },
        { title: 'Final', slots: finals(`${seedName(1)} vs ganador de la semifinal`) },
      ];
    }

    if (format.firstRound === 'semi') {
      const pairs = [[1, 4], [2, 3]];
      const semis = pairs.map(([a, b], i) =>
        slot(`Semifinal ${i + 1}`, byPhase('semi')[i], `${seedName(a)} vs ${seedName(b)}`),
      );
      return [
        { title: 'Semifinales', slots: semis },
        { title: 'Final', slots: finals('Ganadores de semis') },
      ];
    }

    const playoffCount = format.playoff.length / 2;
    const playoffPlaceholder =
      playoffCount === 1
        ? `${seedName(format.playoff[0])} vs ${seedName(format.playoff[1])}`
        : `${format.playoff.map(seedName).join(' · ')}`;
    const playoff = Array.from({ length: playoffCount }, (_, i) =>
      slot(`Repesca ${playoffCount > 1 ? i + 1 : ''}`.trim(), byPhase('playoff')[i], playoffPlaceholder),
    );

    const direct = Array.from({ length: format.direct }, (_, i) => seedName(i + 1));
    const semis = [0, 1].map((i) =>
      slot(`Semifinal ${i + 1}`, byPhase('semi')[i], i === 0 ? `${direct[0]} elige rival` : `${direct[1] ?? '—'} y el resto`),
    );

    return [
      { title: 'Repesca', slots: playoff },
      { title: 'Semifinales', slots: semis },
      { title: 'Final', slots: finals('Ganadores de semis') },
    ];
  });

  private rows(m: Match): Slot['rows'] {
    const t = this.session.tournament()!;
    const winner = winnerOf(m);
    const score = (teamId: Id) => {
      if (m.status !== 'done') return '';
      const goals = teamId === m.homeId ? m.homeGoals : m.awayGoals;
      const pens = teamId === m.homeId ? m.homePens : m.awayPens;
      return pens != null ? `${goals} (${pens})` : `${goals}`;
    };
    return [m.homeId, m.awayId].map((teamId) => {
      const club = this.session.teamName(teamId);
      return { name: club, color: clubColor(t.clubs, club), score: score(teamId), won: winner === teamId };
    });
  }
}
