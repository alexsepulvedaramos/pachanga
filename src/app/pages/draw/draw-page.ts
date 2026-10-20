import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { Wheel } from '../../ui/wheel';
import { clubColor } from '../../ui/club-colors';
import { Tournament } from '../../domain/types';
import {
  disqualify,
  drawnPairs,
  finishDraw,
  nextToSpin,
  setEntranceOrder,
  shuffleEntranceOrder,
  spin,
  undoSpin,
  wheelEntries,
} from '../../domain/tournament';

interface Reveal {
  name: string;
  club: string;
  partner: string | null;
}

@Component({
  selector: 'app-draw-page',
  imports: [Wheel],
  template: `
    @if (session.tournament(); as t) {
      @if (t.stage === 'draw') {
        <div class="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <section>
            <div class="text-center">
              @if (spinner(); as s) {
                <p class="eyebrow text-mist">Entrada {{ t.draw.picks.length + 1 }} de {{ t.participants.length }}</p>
                <p class="heading mt-1 text-5xl sm:text-6xl">{{ s.name }}</p>
              } @else {
                <p class="heading text-5xl text-volt">Sorteo completo</p>
              }
            </div>

            <div class="mt-6">
              <app-wheel #wheel [entries]="displayEntries()" [clubs]="t.clubs" (landed)="landed()" />
            </div>

            @if (session.isAdmin()) {
              <div class="mt-6 flex flex-wrap justify-center gap-3">
                @if (spinner()) {
                  <button type="button" class="btn-primary px-10 text-xl" [disabled]="busy()" (click)="spinWheel()">
                    Girar ruleta
                  </button>
                }
                @if (t.draw.picks.length > 0) {
                  <button type="button" class="btn-secondary" [disabled]="busy()" (click)="undo()">Deshacer</button>
                }
                @if (!spinner()) {
                  <button type="button" class="btn-primary px-10 text-xl" [disabled]="busy()" (click)="close()">
                    Generar calendario
                  </button>
                }
              </div>
            }

            @if (reveal(); as r) {
              <div class="panel mx-auto mt-6 max-w-md animate-rise text-center" [style.border-top]="'4px solid ' + color(t, r.club)">
                <p class="eyebrow text-mist">{{ r.name }} juega con</p>
                <p class="heading mt-1 text-4xl" [style.color]="color(t, r.club)">{{ r.club }}</p>
                @if (r.partner) {
                  <p class="mt-2 font-display text-lg font-bold uppercase">
                    Pareja formada: <span class="text-volt">{{ r.partner }} + {{ r.name }}</span>
                  </p>
                }
              </div>
            }
          </section>

          <aside class="space-y-6">
            @if (t.draw.picks.length === 0) {
              <div>
                <div class="flex items-center justify-between">
                  <h2 class="eyebrow text-cyan">Orden de entradas</h2>
                  @if (session.isAdmin()) {
                    <button type="button" class="tag bg-line text-mist hover:text-chalk" (click)="shuffleOrder()">Aleatorio</button>
                  }
                </div>
                <ol class="mt-2 space-y-1">
                  @for (id of t.draw.order; track id; let i = $index, first = $first, last = $last) {
                    <li class="flex items-center gap-2 bg-pitch py-1.5 pl-3 pr-1">
                      <span class="heading w-6 text-xl text-mist">{{ i + 1 }}</span>
                      <span class="flex-1 font-medium">{{ session.personName(id) }}</span>
                      @if (session.isAdmin()) {
                        <button type="button" class="px-2 text-mist hover:text-chalk disabled:opacity-20" [disabled]="first" (click)="move(i, -1)" aria-label="Subir">▲</button>
                        <button type="button" class="px-2 text-mist hover:text-chalk disabled:opacity-20" [disabled]="last" (click)="move(i, 1)" aria-label="Bajar">▼</button>
                      }
                    </li>
                  }
                </ol>
              </div>
            }

            <div>
              <h2 class="eyebrow text-cyan">Parejas</h2>
              <ul class="mt-2 space-y-1.5">
                @for (pair of pairs(); track pair.club) {
                  <li class="cut-sm flex items-center gap-3 bg-pitch py-2 pl-0 pr-3">
                    <span class="h-10 w-1.5" [style.background]="color(t, pair.club)"></span>
                    <span class="w-28 font-display text-base font-extrabold uppercase italic">{{ pair.club }}</span>
                    <span class="flex-1 text-sm">
                      @for (name of pair.names; track name; let last = $last) {
                        <span class="font-medium">{{ name }}</span>@if (!last) {<span class="text-mist"> + </span>}
                      } @empty {
                        <span class="text-mist">—</span>
                      }
                    </span>
                  </li>
                }
              </ul>
            </div>
          </aside>
        </div>
      } @else {
        <h1 class="heading text-4xl">Parejas</h1>
        <ul class="mt-6 grid gap-3 sm:grid-cols-2">
          @for (team of t.teams; track team.id) {
            <li class="cut flex items-center gap-4 bg-pitch py-3 pl-0 pr-4">
              <span class="h-14 w-2" [style.background]="color(t, team.club)"></span>
              <div class="min-w-0 flex-1">
                <p class="heading text-2xl">{{ team.club }}</p>
                <p class="text-sm text-mist">
                  @for (id of team.memberIds; track id; let last = $last) {
                    <span [class.line-through]="session.people().get(id)?.disqualified">{{ session.personName(id) }}</span>
                    @if (!last) {<span> + </span>}
                  }
                  @if (team.memberIds.length === 1) {
                    <span class="tag ml-1 bg-gold text-ink">Suelto</span>
                  }
                  @if (team.knockoutPartnerId) {
                    <span class="text-chalk"> · eliminatorias con {{ session.personName(team.knockoutPartnerId) }}</span>
                  }
                </p>
              </div>
              @if (session.isAdmin() && t.stage !== 'finished') {
                <details class="relative">
                  <summary class="cursor-pointer list-none px-2 text-mist hover:text-chalk" aria-label="Opciones">⋯</summary>
                  <div class="absolute right-0 z-10 mt-1 w-48 bg-raised p-1">
                    @for (id of team.memberIds; track id) {
                      @if (!session.people().get(id)?.disqualified) {
                        <button type="button" class="block w-full px-3 py-2 text-left text-sm hover:bg-line" (click)="disqualify(id)">
                          Baja de {{ session.personName(id) }}
                        </button>
                      }
                    }
                  </div>
                </details>
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class DrawPage {
  protected readonly session = inject(TournamentSession);
  private readonly router = inject(Router);
  private readonly wheel = viewChild<Wheel>('wheel');

  protected readonly busy = signal(false);
  protected readonly reveal = signal<Reveal | null>(null);
  private pending: Tournament | null = null;

  protected readonly spinner = computed(() => {
    const t = this.session.tournament();
    return t ? nextToSpin(t) : null;
  });

  /** Remaining entries, interleaved so the two slots of a club are never side by side. */
  protected readonly displayEntries = computed(() => {
    const t = this.session.tournament();
    if (!t) return [];
    const remaining = wheelEntries(t);
    const count = (club: string) => remaining.filter((c) => c === club).length;
    return [...t.clubs.filter((c) => count(c) >= 1), ...t.clubs.filter((c) => count(c) >= 2)];
  });

  protected readonly pairs = computed(() => {
    const t = this.session.tournament();
    if (!t) return [];
    return [...drawnPairs(t)].map(([club, ids]) => ({
      club,
      names: ids.map((id) => this.session.personName(id)),
    }));
  });

  protected color(t: Tournament, club: string): string {
    return clubColor(t.clubs, club);
  }

  protected spinWheel(): void {
    const t = this.session.tournament();
    if (!t || this.busy()) return;
    const result = spin(t, Math.random);
    this.pending = result.tournament;
    this.busy.set(true);
    this.reveal.set(null);
    this.wheel()?.spinTo(result.club);
  }

  protected async landed(): Promise<void> {
    const next = this.pending;
    this.pending = null;
    if (!next) return;
    const ok = await this.session.apply(() => next);
    this.busy.set(false);
    if (!ok) return;
    const last = next.draw.picks[next.draw.picks.length - 1];
    const partner = next.draw.picks.find((p) => p.club === last.club && p.participantId !== last.participantId);
    this.reveal.set({
      name: this.session.personName(last.participantId),
      club: last.club,
      partner: partner ? this.session.personName(partner.participantId) : null,
    });
  }

  protected async undo(): Promise<void> {
    this.reveal.set(null);
    await this.session.apply((t) => undoSpin(t));
  }

  protected async shuffleOrder(): Promise<void> {
    await this.session.apply((t, rng) => shuffleEntranceOrder(t, rng));
  }

  protected async move(index: number, delta: number): Promise<void> {
    await this.session.apply((t) => {
      const order = [...t.draw.order];
      [order[index], order[index + delta]] = [order[index + delta], order[index]];
      return setEntranceOrder(t, order);
    });
  }

  /** Injury or expulsion: the partner becomes a solo player and gets a drawn partner per match. */
  protected async disqualify(participantId: string): Promise<void> {
    const name = this.session.personName(participantId);
    if (!confirm(`¿Dar de baja a ${name}? Su pareja jugará con un invitado sorteado.`)) return;
    await this.session.apply((t) => disqualify(t, participantId));
  }

  protected async close(): Promise<void> {
    this.busy.set(true);
    const ok = await this.session.apply((t, rng) => finishDraw(t, rng));
    this.busy.set(false);
    if (ok) void this.router.navigate(['/t', this.session.tournament()!.id, 'partidos']);
  }
}
