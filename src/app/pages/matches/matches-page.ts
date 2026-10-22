import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ToastService } from '../../ui/toast.service';
import { MyTurnPanel } from '../../ui/my-turn';
import { Router, RouterLink } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { MatchCard } from '../../ui/match-card';
import { DecisionPanel } from '../../ui/decision-panel';
import { ResultForm } from './result-form';
import { MatchSummary } from './match-summary';
import { Modal } from '../../ui/modal';
import { Id, Match, Phase } from '../../domain/types';
import { PHASE_LABELS, winnerOf } from '../../domain/knockout';
import {
  champions,
  estimatedRemainingMinutes,
  isSolo,
  nextMatch,
  playsIn,
  redrawStandIn,
  reopenMatch,
  startMatch,
  halfMinutesOf,
  totalMatchCount,
} from '../../domain/tournament';
import { formatClock, formatDuration } from '../../ui/format';
import { BallonDorPanel } from '../gala/ballon-dor-panel';
import { ClubCrest } from '../../ui/club-crest';
import { rematchDraft } from '../../domain/rematch';

@Component({
  selector: 'app-matches-page',
  imports: [MatchCard, DecisionPanel, ResultForm, MatchSummary, Modal, RouterLink, MyTurnPanel, BallonDorPanel, ClubCrest],
  template: `
    @if (session.tournament(); as t) {
      @if (t.stage === 'draw') {
        <div class="panel mx-auto max-w-md text-center">
          <p class="heading text-3xl">Primero, la ruleta</p>
          <p class="mt-2 text-mist">El calendario se genera cuando todos tengan pareja.</p>
          <a routerLink="../ruleta" class="btn-primary mt-5">Ir a la ruleta</a>
        </div>
      } @else {
        @if (t.stage !== 'finished') {
          <div class="mb-6"><app-my-turn /></div>
        }
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
          <app-ballon-dor-panel />
          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 bg-pitch px-4 py-3">
            <p class="text-sm text-mist">¿Otra? Mismos jugadores, clubs y reglas, con sorteo nuevo.</p>
            <button type="button" class="btn-secondary" (click)="rematch()">Revancha</button>
          </div>
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
                <span class="tag bg-flare text-ink"><span class="mr-1.5 inline-block size-1.5 animate-pulse-live bg-ink align-middle"></span>En juego</span>
              } @else {
                <span class="tag bg-line text-mist">Siguiente</span>
              }
            </div>
            <app-match-card [match]="m" />

            @if (session.isAdmin()) {
              @if (m.status === 'live') {
                  <div class="mt-6 flex flex-wrap justify-center gap-3">
                    <button type="button" class="btn-primary px-10 text-lg" (click)="editing.set(m.id)">Meter resultado</button>
                    @for (teamId of soloTeams(m); track teamId) {
                      <button type="button" class="btn-secondary" (click)="redraw(m.id, teamId)">
                        Otro invitado para {{ session.teamName(teamId) }}
                      </button>
                    }
                  </div>
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
            } @else if (m.status === 'live' && iPlay(m)) {
              <div class="mt-6 flex flex-col items-center gap-2">
                <button type="button" class="btn-primary px-10 text-lg" (click)="editing.set(m.id)">Meter resultado</button>
                <p class="text-center text-xs text-mist">Lo puede meter cualquiera de los que jugáis; el admin lo corrige si hace falta.</p>
              </div>
            } @else if (m.status === 'pending' && iPlay(m)) {
              <div class="mt-6 flex flex-col items-center gap-2">
                <button type="button" class="btn-primary px-10 text-lg" [disabled]="session.saving()" (click)="session.startAsPlayer(m.id)">
                  Empezar partido
                </button>
                <p class="text-center text-xs text-mist">Os toca: cualquiera de los que jugáis puede darle.</p>
              </div>
            }
          </section>
        }

        <!-- Fixture -->
        @for (group of fixture(); track group.phase) {
          <section class="mt-8">
            <div class="flex items-center justify-between gap-3">
              <h2 class="eyebrow text-mist">{{ group.label }}</h2>
              @if (group.folded) {
                <button type="button" class="eyebrow text-cyan hover:text-chalk" [attr.aria-expanded]="isOpen(group.phase)" (click)="toggleFold(group.phase)">
                  {{ isOpen(group.phase) ? 'Ocultar jugados' : 'Ver ' + group.folded + (group.folded === 1 ? ' jugado' : ' jugados') }}
                </button>
              }
            </div>
            <ol class="mt-2 divide-y divide-line/60">
              @for (row of group.rows; track row.match.id) {
                @if (!row.foldable || isOpen(group.phase)) {
                <li>
                  <div
                    class="grid grid-cols-[2rem_1fr_auto_1fr_2rem] items-center gap-2 border-l-4 py-2.5 pl-1"
                    [class]="row.mine ? 'border-volt bg-volt/10' : 'border-transparent'"
                    [class.text-mist]="row.match.status === 'pending' && !row.mine"
                    [class.cursor-pointer]="row.match.status === 'done'"
                    [attr.role]="row.match.status === 'done' ? 'button' : null"
                    [attr.tabindex]="row.match.status === 'done' ? 0 : null"
                    [attr.aria-expanded]="row.match.status === 'done' ? expanded() === row.match.id : null"
                    (click)="toggleSummary(row.match)"
                    (keydown.enter)="toggleSummary(row.match)"
                  >
                    <span class="font-display text-sm font-bold text-mist">{{ row.number }}</span>
                    <span class="flex min-w-0 items-center justify-end gap-1.5 font-display text-base font-bold uppercase sm:gap-2 sm:text-lg" [class.text-volt]="row.winner === row.match.homeId">
                      <span class="truncate">{{ session.teamName(row.match.homeId) }}</span>
                      <app-club-crest [club]="session.teamName(row.match.homeId)" size="1.2rem" />
                    </span>
                    <span class="heading min-w-16 bg-raised px-2 py-0.5 text-center text-xl tabular-nums" [class.text-flare]="row.match.status === 'live'">
                      @if (row.match.status === 'done') {
                        <span [class.text-volt]="row.winner === row.match.homeId">{{ row.match.homeGoals }}</span><span class="text-mist">–</span><span [class.text-volt]="row.winner === row.match.awayId">{{ row.match.awayGoals }}</span>
                      } @else if (row.match.status === 'live') {
                        •
                      } @else {
                        –
                      }
                    </span>
                    <span class="flex min-w-0 items-center gap-1.5 font-display text-base font-bold uppercase sm:gap-2 sm:text-lg" [class.text-volt]="row.winner === row.match.awayId">
                      <app-club-crest [club]="session.teamName(row.match.awayId)" size="1.2rem" />
                      <span class="truncate">{{ session.teamName(row.match.awayId) }}</span>
                      @if (row.match.incidents?.length) {
                        <span class="ml-1 inline-block h-3 w-2 shrink-0 bg-flare align-middle" [attr.title]="row.match.incidents!.length + ' sanción(es)'"></span>
                      }
                    </span>
                    @if (session.isAdmin() && row.match.status === 'done') {
                      <button type="button" class="text-mist hover:text-chalk" [attr.aria-label]="'Corregir partido ' + row.number" (click)="$event.stopPropagation(); correct(row.match)">✎</button>
                    }
                  </div>
                  @if (expanded() === row.match.id && row.match.status === 'done') {
                    <app-match-summary [match]="row.match" />
                  }
                </li>
                }
              }
            </ol>
          </section>
        }
      }

      @if (editingMatch(); as em) {
        <app-modal
          [eyebrow]="phaseLabel(em)"
          [heading]="session.teamName(em.homeId) + ' vs ' + session.teamName(em.awayId)"
          (closed)="editing.set(null)"
        >
          <app-result-form [match]="em" [asPlayer]="!session.isAdmin()" (saved)="editing.set(null)" (cancelled)="editing.set(null)" />
        </app-modal>
      }
    }
  `,
})
export class MatchesPage {
  protected readonly session = inject(TournamentSession);
  protected readonly editing = signal<Id | null>(null);
  /** Finished match whose summary is open. */
  protected readonly expanded = signal<Id | null>(null);
  /** Phases whose played matches are shown in full. */
  private readonly unfolded = signal<ReadonlySet<Phase>>(new Set());
  protected readonly editingMatch = computed(() => {
    const id = this.editing();
    return id ? (this.session.tournament()?.matches.find((m) => m.id === id) ?? null) : null;
  });
  private readonly now = signal(Date.now());

  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly current = computed(() => {
    const t = this.session.tournament();
    if (!t) return null;
    const m = t.matches.find((x) => x.status === 'live') ?? nextMatch(t);
    return m ? { ...m, halfMinutes: halfMinutesOf(t, m.phase) } : null;
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
    const order: Phase[] = ['group', 'playoff', 'quarter', 'semi', 'third', 'final'];
    let number = 0;
    const me = this.session.me();
    // Played matches fold away while the tournament goes on, all but the latest result.
    const latest = t.stage === 'finished' ? null : [...t.matches].reverse().find((m) => m.status === 'done');
    const numbered = t.matches.map((match) => ({
      match,
      number: ++number,
      winner: this.winner(match),
      mine: !!me && playsIn(t, match, me),
      foldable: !!latest && match.status === 'done' && match.id !== latest.id,
    }));
    return order
      .map((phase) => {
        const rows = numbered.filter((r) => r.match.phase === phase);
        return {
          phase,
          label: phase === 'group' ? 'Liguilla' : PHASE_LABELS[phase],
          rows,
          folded: rows.filter((r) => r.foldable).length,
        };
      })
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
    const t = this.session.tournament();
    const several = (t?.matches.filter((x) => x.phase === m.phase).length ?? 0) > 1;
    if (m.phase !== 'third' && m.phase !== 'final' && several) return `${PHASE_LABELS[m.phase]} ${m.id.slice(-1)}`;
    return PHASE_LABELS[m.phase];
  }

  /** Whether the person using this phone plays in a match. */
  protected iPlay(m: Match): boolean {
    const t = this.session.tournament();
    const me = this.session.me();
    return !!t && !!me && playsIn(t, m, me);
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

  protected isOpen(phase: Phase): boolean {
    return this.unfolded().has(phase);
  }

  protected toggleFold(phase: Phase): void {
    this.unfolded.update((open) => {
      const next = new Set(open);
      if (!next.delete(phase)) next.add(phase);
      return next;
    });
  }

  protected toggleSummary(m: Match): void {
    if (m.status !== 'done') return;
    this.expanded.update((id) => (id === m.id ? null : m.id));
  }

  /** A new tournament with the same people, clubs and rules, to be set up and drawn again. */
  protected rematch(): void {
    const t = this.session.tournament();
    if (t) void this.router.navigate(['/nuevo'], { state: { rematch: rematchDraft(t) } });
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
