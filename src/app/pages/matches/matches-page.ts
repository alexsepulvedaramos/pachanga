import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ToastService } from '../../ui/toast.service';
import { RouterLink } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { MatchCard } from '../../ui/match-card';
import { DecisionPanel } from '../../ui/decision-panel';
import { ResultForm } from './result-form';
import { Id, Match, Phase } from '../../domain/types';
import { PHASE_LABELS, winnerOf } from '../../domain/knockout';
import {
  champions,
  estimatedRemainingMinutes,
  isSolo,
  nextMatch,
  redrawStandIn,
  reopenMatch,
  startMatch,
  totalMatchCount,
} from '../../domain/tournament';
import { formatClock, formatDuration } from '../../ui/format';

@Component({
  selector: 'app-matches-page',
  imports: [MatchCard, DecisionPanel, ResultForm, RouterLink],
  template: `
    @if (session.tournament(); as t) {
      @if (t.stage === 'draw') {
        <div class="panel mx-auto max-w-md text-center">
          <p class="heading text-3xl">Primero, la ruleta</p>
          <p class="mt-2 text-mist">El calendario se genera cuando todos tengan pareja.</p>
          <a routerLink="../ruleta" class="btn-primary mt-5">Ir a la ruleta</a>
        </div>
      } @else {
        <!-- Progress -->
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="eyebrow text-mist">Partidos</p>
            <p class="heading text-4xl">
              {{ doneCount() }}<span class="text-mist">/{{ total() }}</span>
            </p>
          </div>
          @if (t.stage !== 'finished') {
            <div class="text-right">
              <p class="eyebrow text-mist">Fin estimado</p>
              <p class="heading text-4xl text-cyan">{{ eta() }}</p>
              <p class="text-xs text-mist">quedan {{ remaining() }}</p>
            </div>
          }
        </div>
        <div class="mt-3 h-1.5 bg-line">
          <div class="h-full bg-volt transition-[width] duration-500" [style.width.%]="(doneCount() / total()) * 100"></div>
        </div>

        @if (t.stage === 'finished') {
          <section class="cut mt-6 animate-rise bg-volt p-6 text-ink">
            <p class="eyebrow">Campeones</p>
            <p class="heading mt-1 text-6xl">{{ championClub() }}</p>
            <p class="mt-1 font-display text-2xl font-bold uppercase">{{ championNames() }}</p>
          </section>
        }

        <div class="mt-6"><app-decision-panel /></div>

        <!-- Current match -->
        @if (current(); as m) {
          <section class="cut mt-6 bg-pitch p-5 sm:p-7" [class.ring-2]="m.status === 'live'" [class.ring-flare]="m.status === 'live'">
            <div class="mb-5 flex items-center justify-between">
              <p class="eyebrow text-cyan">
                {{ phaseLabel(m) }} · {{ m.halfMinutes }} min/parte
              </p>
              @if (m.status === 'live') {
                <span class="tag animate-pulse-live bg-flare text-ink">En juego</span>
              } @else {
                <span class="tag bg-line text-mist">Siguiente</span>
              }
            </div>
            <app-match-card [match]="m" />

            @if (session.isAdmin()) {
              @if (m.status === 'live') {
                @if (editing() === m.id) {
                  <div class="mt-6 border-t border-line pt-6">
                    <app-result-form [match]="m" (saved)="editing.set(null)" (cancelled)="editing.set(null)" />
                  </div>
                } @else {
                  <div class="mt-6 flex flex-wrap justify-center gap-3">
                    <button type="button" class="btn-primary px-10 text-lg" (click)="editing.set(m.id)">Meter resultado</button>
                    @for (teamId of soloTeams(m); track teamId) {
                      <button type="button" class="btn-secondary" (click)="redraw(m.id, teamId)">
                        Otro invitado para {{ session.teamName(teamId) }}
                      </button>
                    }
                  </div>
                }
              } @else {
                <div class="mt-6 flex justify-center">
                  <button type="button" class="btn-primary px-10 text-lg" [disabled]="session.saving()" (click)="start(m.id)">
                    Empezar partido
                  </button>
                </div>
                @if (soloTeams(m).length) {
                  <p class="mt-3 text-center text-sm text-mist">Al empezar se sortea el invitado del jugador suelto.</p>
                }
              }
            }
          </section>
        }

        <!-- Fixture -->
        @for (group of fixture(); track group.phase) {
          <section class="mt-8">
            <h2 class="eyebrow text-mist">{{ group.label }}</h2>
            <ol class="mt-2 divide-y divide-line/60">
              @for (row of group.rows; track row.match.id) {
                <li>
                  @if (editing() === row.match.id) {
                    <div class="bg-pitch p-4">
                      <app-result-form [match]="row.match" (saved)="editing.set(null)" (cancelled)="editing.set(null)" />
                    </div>
                  } @else {
                    <div class="grid grid-cols-[2rem_1fr_auto_1fr_2rem] items-center gap-2 py-2.5" [class.text-mist]="row.match.status === 'pending'">
                      <span class="font-display text-sm font-bold text-mist">{{ row.number }}</span>
                      <span class="truncate text-right font-display text-lg font-bold uppercase" [class.text-volt]="row.winner === row.match.homeId">{{ session.teamName(row.match.homeId) }}</span>
                      <span class="heading min-w-16 bg-pitch px-2 py-0.5 text-center text-xl tabular-nums" [class.text-flare]="row.match.status === 'live'">
                        @if (row.match.status === 'done') {
                          {{ row.match.homeGoals }}–{{ row.match.awayGoals }}
                        } @else if (row.match.status === 'live') {
                          •
                        } @else {
                          –
                        }
                      </span>
                      <span class="truncate font-display text-lg font-bold uppercase" [class.text-volt]="row.winner === row.match.awayId">{{ session.teamName(row.match.awayId) }}</span>
                      @if (session.isAdmin() && row.match.status === 'done') {
                        <button type="button" class="text-mist hover:text-chalk" [attr.aria-label]="'Corregir partido ' + row.number" (click)="correct(row.match)">✎</button>
                      }
                    </div>
                  }
                </li>
              }
            </ol>
          </section>
        }
      }
    }
  `,
})
export class MatchesPage {
  protected readonly session = inject(TournamentSession);
  protected readonly editing = signal<Id | null>(null);
  private readonly now = signal(Date.now());

  private readonly toast = inject(ToastService);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly current = computed(() => {
    const t = this.session.tournament();
    if (!t) return null;
    const m = t.matches.find((x) => x.status === 'live') ?? nextMatch(t);
    return m ? { ...m, halfMinutes: t.config.halfMinutes[m.phase] } : null;
  });

  protected readonly doneCount = computed(
    () => this.session.tournament()?.matches.filter((m) => m.status === 'done').length ?? 0,
  );
  protected readonly total = computed(() => totalMatchCount(this.session.tournament()?.teams.length ?? 6));

  protected readonly remaining = computed(() => {
    const t = this.session.tournament();
    return t ? formatDuration(estimatedRemainingMinutes(t)) : '';
  });

  protected readonly eta = computed(() => {
    const t = this.session.tournament();
    if (!t) return '';
    return formatClock(new Date(this.now() + estimatedRemainingMinutes(t) * 60_000));
  });

  protected readonly fixture = computed(() => {
    const t = this.session.tournament();
    if (!t) return [];
    const order: Phase[] = ['group', 'playoff', 'semi', 'third', 'final'];
    let number = 0;
    const numbered = t.matches.map((match) => ({ match, number: ++number, winner: this.winner(match) }));
    return order
      .map((phase) => ({
        phase,
        label: phase === 'group' ? 'Liguilla' : PHASE_LABELS[phase],
        rows: numbered.filter((r) => r.match.phase === phase),
      }))
      .filter((g) => g.rows.length > 0);
  });

  protected readonly championClub = computed(() => {
    const t = this.session.tournament();
    const final = t?.matches.find((m) => m.phase === 'final');
    const winner = final ? this.winner(final) : null;
    return winner ? this.session.teamName(winner) : '';
  });

  protected readonly championNames = computed(() => {
    const t = this.session.tournament();
    const ids = t ? champions(t) : null;
    return ids ? ids.map((id) => this.session.personName(id)).join(' + ') : '';
  });

  protected phaseLabel(m: Match): string {
    if (m.phase === 'group') return `Liguilla · Jornada ${m.round}`;
    if (m.phase === 'playoff' || m.phase === 'semi') return `${PHASE_LABELS[m.phase]} ${m.id.slice(-1)}`;
    return PHASE_LABELS[m.phase];
  }

  protected soloTeams(m: Match): Id[] {
    const t = this.session.tournament()!;
    return [m.homeId, m.awayId].filter((id) => isSolo(t, id) && !!m.standIns?.[id]);
  }

  private winner(m: Match): Id | null {
    return m.phase === 'group' && m.homeGoals === m.awayGoals ? null : winnerOf(m);
  }

  protected async start(matchId: Id): Promise<void> {
    await this.session.apply((t, rng) => startMatch(t, matchId, rng));
  }

  protected async redraw(matchId: Id, teamId: Id): Promise<void> {
    await this.session.apply((t, rng) => redrawStandIn(t, matchId, teamId, rng));
  }

  /** Opens the result form for a finished match if nothing depends on it yet. */
  protected correct(m: Match): void {
    try {
      reopenMatch(this.session.tournament()!, m.id);
      this.editing.set(m.id);
    } catch (error) {
      this.toast.error(error);
    }
  }
}
