import { Component, computed, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { LeagueRecap as Recap, leagueRecap, LeagueZone } from '../../domain/league-recap';
import { Id, Match } from '../../domain/types';
import { ClubCrest } from '../../ui/club-crest';
import { CountUp } from '../../ui/count-up';
import { LeagueRecapViewer } from './league-recap-viewer';
import { Icon } from '../../ui/icon';

type Slide = 'table' | 'numbers' | 'next';
const SLIDES: Slide[] = ['table', 'numbers', 'next'];
const SLIDE_MS: Record<Slide, number> = { table: 10000, numbers: 9000, next: 8000 };

const ZONE_COLOR: Record<LeagueZone, string> = { direct: 'bg-volt', playoff: 'bg-cyan', out: 'bg-flare' };

/**
 * The break when the group stage ends, story-style and short: the final table revealed from the
 * bottom up with where each team goes, the stage in numbers and what comes next. Every screen
 * plays it at its own pace; tap to move on, or close it.
 */
@Component({
  selector: 'app-league-recap',
  imports: [ClubCrest, CountUp, Icon],
  host: {
    '(document:keydown.arrowright)': 'next()',
    '(document:keydown.space)': '$event.preventDefault(); next()',
    '(document:keydown.arrowleft)': 'previous()',
    '(document:keydown.escape)': 'viewer.close()',
  },
  template: `
    @if (recap(); as r) {
      <div
        class="fixed inset-0 z-[60] select-none overflow-hidden bg-ink"
        role="dialog"
        aria-modal="true"
        aria-label="Resumen de la liguilla"
        (click)="tap($event)"
      >
        <div class="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div class="flex gap-1">
            @for (s of slides; track s) {
              <div class="h-[max(0.25rem,0.5vmin)] flex-1 overflow-hidden bg-chalk/25">
                @if ($index < index() || ($index === index() && finished())) {
                  <div class="h-full bg-chalk"></div>
                } @else if ($index === index()) {
                  <div class="h-full origin-left animate-story bg-chalk" [style.animation-duration.ms]="durations[s]" (animationend)="next()"></div>
                }
              </div>
            }
          </div>
          <div class="mt-3 flex items-center justify-between gap-3">
            <p class="eyebrow gala-label truncate text-chalk/80">{{ session.tournament()?.name }} · Fin de la liguilla</p>
            <button type="button" class="px-2 text-[max(1.5rem,5vmin)] text-chalk/80 hover:text-chalk" aria-label="Cerrar el resumen" (click)="$event.stopPropagation(); viewer.close()">
              <app-icon name="close" />
            </button>
          </div>
        </div>

        @for (k of keys(); track k) {
          <section class="absolute inset-0 flex flex-col items-center justify-center px-[5vmin] pb-[max(6rem,17vmin)] pt-[max(6rem,14vmin)]" aria-live="polite">
            @switch (slide()) {
              @case ('table') {
                <div class="absolute inset-0 -z-10 bg-[linear-gradient(115deg,var(--color-pitch)_0_40%,var(--color-ink)_40%_100%)]"></div>
                <p class="eyebrow gala-label animate-rise text-cyan">Se cierra la liguilla</p>
                <h2 class="heading gala-heading mt-2 animate-slam [animation-delay:150ms]">Clasificación final</h2>
                <div class="mt-[2vmin] flex w-full max-w-[min(100%,130vmin)] animate-rise items-center gap-3 pr-[2vmin] text-mist [animation-delay:400ms]" aria-hidden="true">
                  <span class="eyebrow flex-1"></span>
                  <span class="eyebrow gala-small w-[max(1.75rem,5vmin)] text-center">DG</span>
                  <span class="eyebrow gala-small w-[max(2.5rem,7vmin)] text-right">Pts</span>
                </div>
                <ol class="mt-1.5 w-full max-w-[min(100%,130vmin)] space-y-[0.8vmin]">
                  @for (row of r.table; track row.teamId; let i = $index) {
                    <li
                      class="flex animate-rise items-center gap-[1.5vmin] bg-pitch py-[0.6vmin] pl-0 pr-[2vmin]"
                      [class.ring-2]="i === 0"
                      [class.ring-volt]="i === 0"
                      [style.animation-delay.ms]="revealDelay(i, r.table.length)"
                    >
                      <span class="w-[max(0.375rem,0.8vmin)] self-stretch" [class]="zoneColor[row.zone]"></span>
                      <span class="heading gala-row w-[1.5em] text-center tabular-nums" [class.text-volt]="i === 0">{{ i + 1 }}</span>
                      <app-club-crest [club]="session.teamName(row.teamId)" size="max(1.6rem,4.6vmin)" />
                      <span class="heading gala-row min-w-0 flex-1 truncate">{{ session.teamName(row.teamId) }}</span>
                      <span class="gala-small w-[max(1.75rem,5vmin)] text-center tabular-nums text-mist">{{ signed(row.goalDifference) }}</span>
                      <span class="heading gala-row w-[max(2.5rem,7vmin)] text-right tabular-nums">{{ row.points }}</span>
                    </li>
                  }
                </ol>
                <div class="mt-5 flex animate-rise flex-wrap justify-center gap-x-5 gap-y-2" [style.animation-delay.ms]="revealDelay(-1, r.table.length)">
                  @for (zone of zonesIn(r); track zone) {
                    <span class="eyebrow gala-small flex items-center gap-2 text-mist"><span class="inline-block size-[max(0.625rem,1.6vmin)]" [class]="zoneColor[zone]"></span>{{ r.zoneLabels[zone] }}</span>
                  }
                </div>
              }

              @case ('numbers') {
                <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_30%,#18d6ff22,var(--color-ink)_65%)]"></div>
                <p class="eyebrow gala-label animate-rise text-cyan">La liguilla en números</p>
                <div class="mt-[2.5vmin] grid w-full max-w-[min(100%,130vmin)] grid-cols-2 gap-[2vmin] text-center">
                  <div class="cut animate-pop bg-volt p-[2vmin] text-ink [animation-delay:300ms]">
                    <p class="heading gala-stat tabular-nums"><app-count-up [value]="r.matches" [delay]="300" /></p>
                    <p class="eyebrow gala-label">Partidos</p>
                  </div>
                  <div class="cut animate-pop bg-cyan p-[2vmin] text-ink [animation-delay:600ms]">
                    <p class="heading gala-stat tabular-nums"><app-count-up [value]="r.goals" [delay]="600" /></p>
                    <p class="eyebrow gala-label">Goles</p>
                  </div>
                </div>
                <dl class="mt-[2.5vmin] w-full max-w-[min(100%,130vmin)] space-y-[1vmin]">
                  <div class="animate-rise bg-pitch px-[2vmin] py-[1.2vmin] [animation-delay:1300ms]">
                    <dt class="eyebrow gala-small text-volt">Mejor ataque</dt>
                    <dd class="heading gala-row mt-0.5 truncate">{{ session.teamName(r.bestAttack.teamId) }} <span class="text-mist">· {{ r.bestAttack.goalsFor }} goles</span></dd>
                  </div>
                  <div class="animate-rise bg-pitch px-[2vmin] py-[1.2vmin] [animation-delay:2000ms]">
                    <dt class="eyebrow gala-small text-cyan">Mejor defensa</dt>
                    <dd class="heading gala-row mt-0.5 truncate">{{ session.teamName(r.bestDefence.teamId) }} <span class="text-mist">· {{ r.bestDefence.goalsAgainst }} en contra</span></dd>
                  </div>
                  @if (r.biggestWin; as m) {
                    <div class="animate-rise bg-pitch px-[2vmin] py-[1.2vmin] [animation-delay:2700ms]">
                      <dt class="eyebrow gala-small text-flare">Mayor goleada</dt>
                      <dd class="heading gala-row mt-0.5 truncate">{{ score(m) }}</dd>
                    </div>
                  }
                  @if (r.topScorers; as s) {
                    <div class="animate-rise bg-pitch px-[2vmin] py-[1.2vmin] [animation-delay:3400ms]">
                      <dt class="eyebrow gala-small text-gold">Pichichi</dt>
                      <dd class="heading gala-row mt-0.5 truncate">{{ names(s.participantIds) }} <span class="text-mist">· {{ s.goals }} {{ s.goals === 1 ? 'gol' : 'goles' }}</span></dd>
                    </div>
                  }
                </dl>
              }

              @case ('next') {
                <div class="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_40%,#ffc83d22,var(--color-ink)_65%)]"></div>
                <p class="eyebrow gala-label animate-rise text-gold">Empieza lo bueno</p>
                @if (r.decision; as d) {
                  <app-club-crest class="mt-5 animate-pop [animation-delay:300ms]" [club]="session.teamName(d.chooserId)" size="clamp(4rem, min(20vw, 20vh), 24rem)" />
                  <h2 class="heading gala-title mt-4 animate-slam text-center [animation-delay:600ms]">{{ session.teamName(d.chooserId) }}</h2>
                  <p class="gala-subtitle mt-3 animate-rise text-center font-display font-bold uppercase text-gold [animation-delay:1100ms]">
                    {{ decisionText(d.kind) }}
                  </p>
                } @else {
                  <h2 class="heading gala-heading mt-2 animate-slam [animation-delay:150ms]">Así quedan los cruces</h2>
                  <ol class="mt-[2.5vmin] w-full max-w-[min(100%,130vmin)] space-y-[1vmin]">
                    @for (m of r.nextMatches; track m.id; let i = $index) {
                      <li class="flex animate-rise items-center gap-[1.5vmin] bg-pitch px-[2vmin] py-[1.5vmin]" [style.animation-delay.ms]="500 + i * 400">
                        <span class="heading gala-row min-w-0 flex-1 truncate text-right">{{ session.teamName(m.homeId) }}</span>
                        <span class="heading gala-row text-mist">vs</span>
                        <span class="heading gala-row min-w-0 flex-1 truncate">{{ session.teamName(m.awayId) }}</span>
                      </li>
                    }
                  </ol>
                }
                @if (directTeams(r).length) {
                  <p class="gala-text mt-[2.5vmin] animate-rise text-center text-mist [animation-delay:1800ms]">
                    {{ r.zoneLabels.direct }}: <span class="font-semibold text-chalk">{{ teamNames(directTeams(r)) }}</span>
                  </p>
                }
              }
            }
          </section>
        }

        <div class="absolute inset-x-0 bottom-0 z-20 flex justify-center gap-[1.5vmin] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom),3vmin)]">
          @if (finished()) {
            <button type="button" class="btn-secondary !px-[1.4em] !py-[0.6em] !text-[max(1rem,3.2vmin)]" (click)="$event.stopPropagation(); restart()">Volver a verlo</button>
            <button type="button" class="btn-primary !px-[1.4em] !py-[0.6em] !text-[max(1rem,3.2vmin)]" (click)="$event.stopPropagation(); viewer.close()">A por las eliminatorias</button>
          } @else {
            <p class="eyebrow gala-label text-chalk/50">Toca para avanzar</p>
          }
        </div>
      </div>
    }
  `,
})
export class LeagueRecap implements OnInit, OnDestroy {
  protected readonly session = inject(TournamentSession);
  protected readonly viewer = inject(LeagueRecapViewer);
  protected readonly slides = SLIDES;
  protected readonly durations = SLIDE_MS;
  protected readonly zoneColor = ZONE_COLOR;
  /** Close after the last slide instead of waiting for a tap, for screens nobody touches. */
  readonly autoClose = input(false);

  protected readonly recap = computed(() => {
    const t = this.session.tournament();
    return t ? leagueRecap(t) : null;
  });
  protected readonly index = signal(0);
  protected readonly finished = signal(false);
  protected readonly slide = computed(() => SLIDES[this.index()]);
  /** The current slide in a one-item list tracked by itself, so each one animates in afresh. */
  protected readonly keys = computed(() => [this.index()]);

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  protected tap(event: MouseEvent): void {
    if (event.clientX < innerWidth / 3) this.previous();
    else this.next();
  }

  protected next(): void {
    if (this.index() < SLIDES.length - 1) this.index.update((i) => i + 1);
    else if (this.autoClose()) this.viewer.close();
    else this.finished.set(true);
  }

  protected previous(): void {
    this.finished.set(false);
    this.index.update((i) => Math.max(0, i - 1));
  }

  protected restart(): void {
    this.finished.set(false);
    this.index.set(0);
  }

  /** Rows come in from last to first, the leader last; -1 is the legend, after them all. */
  protected revealDelay(i: number, rows: number): number {
    const step = 450;
    return i < 0 ? 600 + rows * step : 600 + (rows - 1 - i) * step;
  }

  protected zonesIn(r: Recap): LeagueZone[] {
    return (['direct', 'playoff', 'out'] as const).filter((z) => r.table.some((row) => row.zone === z));
  }

  protected directTeams(r: Recap): Id[] {
    return r.table.filter((row) => row.zone === 'direct').map((row) => row.teamId);
  }

  protected decisionText(kind: NonNullable<Recap['decision']>['kind']): string {
    switch (kind) {
      case 'playoffOpponent':
        return 'elige rival para la repesca';
      case 'semiOpponent':
        return 'elige rival para semis';
      default:
        return 'decide si juega primero o segundo';
    }
  }

  protected signed(n: number): string {
    return n > 0 ? `+${n}` : String(n);
  }

  protected names(ids: Id[]): string {
    return ids.map((id) => this.session.personName(id)).join(' + ');
  }

  protected teamNames(ids: Id[]): string {
    return ids.map((id) => this.session.teamName(id)).join(', ');
  }

  protected score(m: Match): string {
    return `${this.session.teamName(m.homeId)} ${m.homeGoals}–${m.awayGoals} ${this.session.teamName(m.awayId)}`;
  }
}
