import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { Wheel } from '../../ui/wheel';
import { ShareButtons } from '../../ui/share-buttons';
import { invitationText, tournamentUrl } from '../../domain/share-text';
import { ConfirmService } from '../../ui/confirm.service';
import { clubColor } from '../../ui/club-colors';
import { Tournament } from '../../domain/types';
import {
  assignClub,
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
  imports: [Wheel, ShareButtons],
  template: `
    @if (session.tournament(); as t) {
      @if (t.stage === 'draw') {
        @if (session.isAdmin() && t.draw.picks.length === 0) {
          <section class="cut mb-8 border-l-4 border-[#25d366] bg-pitch p-4 sm:p-5">
            <p class="eyebrow text-[#25d366]">Antes de girar</p>
            <p class="heading mt-1 text-2xl">Pasa el torneo al grupo</p>
            <p class="mt-1 text-sm text-mist">
              Con el enlace cada uno sigue el sorteo en directo, dice quién es y recibe un aviso cuando le toca.
            </p>
            <div class="mt-3"><app-share-buttons [text]="invitation(t)" [url]="link(t)" [title]="t.name" /></div>
          </section>
        }
        <div class="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <section>
            @if (session.isAdmin()) {
              <div class="mb-6 flex justify-center gap-1" role="tablist" aria-label="Cómo formar parejas">
                <button type="button" role="tab" class="tag px-4 py-1.5 text-sm" [attr.aria-selected]="mode() === 'wheel'"
                  [class]="mode() === 'wheel' ? 'bg-volt text-ink' : 'bg-line text-mist'" (click)="mode.set('wheel')">Ruleta</button>
                <button type="button" role="tab" class="tag px-4 py-1.5 text-sm" [attr.aria-selected]="mode() === 'manual'"
                  [class]="mode() === 'manual' ? 'bg-volt text-ink' : 'bg-line text-mist'" (click)="mode.set('manual')">A dedo</button>
              </div>
            }

            @if (mode() === 'manual' && session.isAdmin()) {
              <ul class="space-y-1.5">
                @for (row of manualRows(); track row.id) {
                  <li class="cut-sm flex items-center gap-3 bg-pitch py-2 pl-0 pr-3">
                    <span class="h-10 w-1.5" [style.background]="row.club ? color(t, row.club) : 'transparent'"></span>
                    <span class="flex-1 font-medium">{{ row.name }}</span>
                    <select
                      class="field w-44 py-1.5 font-display font-bold uppercase"
                      [attr.aria-label]="'Equipo de ' + row.name"
                      [value]="row.club ?? ''"
                      (change)="assign(row.id, $any($event.target).value)"
                    >
                      <option value="">— Sin equipo —</option>
                      @for (club of t.clubs; track club) {
                        <option [value]="club" [disabled]="isFull(club) && row.club !== club" [selected]="row.club === club">
                          {{ club }} {{ slotsLabel(club, row.club) }}
                        </option>
                      }
                    </select>
                  </li>
                }
              </ul>
              @if (!spinner()) {
                <div class="mt-6 flex justify-center">
                  <button type="button" class="btn-primary px-10 text-xl" [disabled]="busy()" (click)="close()">Generar calendario</button>
                </div>
              }
            } @else {
            <div class="text-center">
              @if (spinner(); as s) {
                <p class="eyebrow text-mist">Entrada {{ t.draw.picks.length + 1 }} de {{ t.participants.length }}</p>
                <p class="heading mt-1 text-5xl sm:text-6xl">{{ s.name }}</p>
              } @else {
                <p class="heading text-5xl text-volt">Sorteo completo</p>
              }
            </div>

            @if (spinner()) {
              <div class="mt-6">
                <app-wheel #wheel [entries]="displayEntries()" [clubs]="t.clubs" (landed)="landed()" />
              </div>
            } @else if (solo(); as s) {
              <div class="panel mx-auto mt-6 max-w-md text-center" [style.border-top]="'4px solid ' + color(t, s.club)">
                <p class="eyebrow text-gold">Jugador suelto</p>
                <p class="heading mt-1 text-4xl">{{ s.name }} · <span [style.color]="color(t, s.club)">{{ s.club }}</span></p>
                <p class="mt-2 text-sm text-mist">
                  En cada partido se le sortea un compañero entre los que no juegan. En semis, uno fijo de
                  entre los eliminados.
                </p>
              </div>
            }

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
            <li class="cut flex flex-wrap items-center gap-x-4 bg-pitch py-3 pl-0 pr-4">
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
                <button
                  type="button"
                  class="px-2 text-xl text-mist hover:text-chalk"
                  [attr.aria-expanded]="menuFor() === team.id"
                  [attr.aria-label]="'Opciones de ' + team.club"
                  (click)="menuFor.set(menuFor() === team.id ? null : team.id)"
                >
                  ⋯
                </button>
                @if (menuFor() === team.id) {
                  <div class="mt-3 flex basis-full animate-rise flex-wrap gap-2 border-t border-line pl-6 pt-3">
                    @for (id of team.memberIds; track id) {
                      @if (!session.people().get(id)?.disqualified) {
                        <button type="button" class="tag bg-flare/15 px-3 py-1.5 text-flare hover:bg-flare hover:text-ink" (click)="menuFor.set(null); disqualify(id)">
                          Baja de {{ session.personName(id) }}
                        </button>
                      }
                    }
                  </div>
                }
              }
            </li>
          }
        </ul>
      }
    }
  `,
})
export class DrawPage {
  protected link(t: Tournament): string {
    return tournamentUrl(location.origin, t);
  }

  protected invitation(t: Tournament): string {
    return invitationText(t, this.link(t));
  }

  protected readonly session = inject(TournamentSession);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly wheel = viewChild<Wheel>('wheel');

  protected readonly busy = signal(false);
  /** Team whose withdrawal options are open. */
  protected readonly menuFor = signal<string | null>(null);
  protected readonly mode = signal<'wheel' | 'manual'>('wheel');

  protected readonly manualRows = computed(() => {
    const t = this.session.tournament();
    if (!t) return [];
    return t.draw.order.map((id) => ({
      id,
      name: this.session.personName(id),
      club: t.draw.picks.find((p) => p.participantId === id)?.club ?? null,
    }));
  });
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

  /** With an odd number of players, whoever ended up alone on a club once the draw is over. */
  protected readonly solo = computed(() => {
    const t = this.session.tournament();
    if (!t || nextToSpin(t)) return null;
    const lone = [...drawnPairs(t)].find(([, ids]) => ids.length === 1);
    return lone ? { club: lone[0], name: this.session.personName(lone[1][0]) } : null;
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

  private taken(club: string): number {
    return this.session.tournament()?.draw.picks.filter((p) => p.club === club).length ?? 0;
  }

  protected isFull(club: string): boolean {
    return this.taken(club) >= 2;
  }

  protected slotsLabel(club: string, current: string | null): string {
    if (current === club) return '';
    const free = 2 - this.taken(club);
    return free <= 0 ? '(completo)' : `(${free} libre${free > 1 ? 's' : ''})`;
  }

  protected async assign(participantId: string, club: string): Promise<void> {
    this.reveal.set(null);
    await this.session.apply((t) => assignClub(t, participantId, club || null));
  }

  /** Injury or expulsion: the partner becomes a solo player and gets a drawn partner per match. */
  protected async disqualify(participantId: string): Promise<void> {
    const name = this.session.personName(participantId);
    const ok = await this.confirm.ask({
      title: `Baja de ${name}`,
      message: 'No podrá volver a jugar en este torneo. Su pareja jugará con un invitado sorteado.',
      confirmLabel: 'Dar de baja',
      danger: true,
    });
    if (!ok) return;
    await this.session.apply((t) => disqualify(t, participantId));
  }

  protected async close(): Promise<void> {
    this.busy.set(true);
    const ok = await this.session.apply((t, rng) => finishDraw(t, rng));
    this.busy.set(false);
    if (ok) void this.router.navigate(['/t', this.session.tournament()!.id, 'partidos']);
  }
}
