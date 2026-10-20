import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { Stepper } from '../../ui/stepper';
import { ClubSquads } from '../../data/club-squads';
import { Goal, Id, Incident, Match } from '../../domain/types';
import { lineup, recordResult } from '../../domain/tournament';
import { ToastService } from '../../ui/toast.service';

/** Lower case without accents, for searching names. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

@Component({
  selector: 'app-result-form',
  imports: [Stepper],
  template: `
    @let m = match();
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div class="flex justify-center"><app-stepper [(value)]="home" [label]="'goles ' + session.teamName(m.homeId)" /></div>
      <span class="heading text-3xl text-mist">–</span>
      <div class="flex justify-center"><app-stepper [(value)]="away" [label]="'goles ' + session.teamName(m.awayId)" /></div>
    </div>

    @if (knockout()) {
      <label class="mt-4 flex items-center justify-center gap-2 text-sm text-mist">
        <input type="checkbox" class="size-5 accent-volt" [checked]="extraTime() || level()" [disabled]="level()" (change)="extraTime.set($any($event.target).checked)" />
        Hubo prórroga (el marcador incluye sus goles)
      </label>
      @if (level()) {
        <div class="mt-4 border-t border-line pt-4">
          <p class="eyebrow text-center text-flare">Penaltis</p>
          <div class="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div class="flex justify-center"><app-stepper [(value)]="homePens" label="penaltis local" /></div>
            <span class="heading text-3xl text-mist">–</span>
            <div class="flex justify-center"><app-stepper [(value)]="awayPens" label="penaltis visitante" /></div>
          </div>
        </div>
      }
    }

    @if (trackScorers()) {
      <div class="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        @for (side of sides(); track side.teamId) {
          <div>
            <p class="eyebrow text-mist">Goles · {{ session.teamName(side.teamId) }}</p>
            <ul class="mt-2 space-y-1.5">
              @for (pid of side.players; track pid) {
                <li class="flex items-center gap-2">
                  <button
                    type="button"
                    class="slant-sm flex-1 bg-raised px-3 py-2 text-left text-sm font-medium hover:bg-line"
                    (click)="addScorer(side.teamId, pid)"
                  >
                    ⚽ {{ session.personName(pid) }}
                  </button>
                  @if (count(side.teamId, pid); as n) {
                    <button type="button" class="tag bg-volt text-ink" (click)="removeScorer(side.teamId, pid)" [attr.aria-label]="'Quitar gol de ' + session.personName(pid)">
                      {{ n }} ✕
                    </button>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </div>
    }

    <details class="mt-5 border-t border-line pt-4" [open]="incidents().length > 0">
      <summary class="eyebrow cursor-pointer text-mist">Expulsiones y lesiones</summary>
      <p class="mt-1 text-xs text-mist">
        Futbolistas del juego que han visto roja o se han lesionado. No podrán jugar el siguiente partido de su club (salvo la final).
      </p>
      <div class="mt-3 grid gap-4 sm:grid-cols-2">
        @for (side of incidentSides(); track side.teamId) {
          <div>
            <p class="font-display text-sm font-bold uppercase">{{ side.club }}</p>
            <ul class="mt-1 space-y-1">
              @for (x of side.incidents; track x.player) {
                <li class="flex items-center gap-2 bg-pitch px-2 py-1.5 text-sm">
                  <span class="tag" [class]="x.kind === 'redCard' ? 'bg-flare text-ink' : 'bg-gold text-ink'">
                    {{ x.kind === 'redCard' ? 'Roja' : 'Lesión' }}
                  </span>
                  <span class="flex-1 truncate">{{ x.player }}</span>
                  <button type="button" class="px-1 text-mist hover:text-flare" [attr.aria-label]="'Quitar ' + x.player" (click)="removeIncident(x)">✕</button>
                </li>
              }
            </ul>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <input
                class="field min-w-0 flex-1 py-1.5 text-sm"
                autocomplete="off"
                role="combobox"
                [attr.aria-expanded]="openFor() === side.teamId"
                [placeholder]="side.squad ? 'Busca un jugador' : 'Nombre del jugador'"
                [attr.aria-label]="'Jugador de ' + side.club"
                [value]="queries()[side.teamId] ?? ''"
                (input)="setQuery(side.teamId, $any($event.target).value)"
                (focus)="openFor.set(side.teamId)"
                (blur)="closeSoon(side.teamId)"
                (keydown.enter)="$event.preventDefault()"
              />
              <button type="button" class="tag bg-flare px-2 text-ink" (click)="addIncident(side.teamId, 'redCard')">+ Roja</button>
              <button type="button" class="tag bg-gold px-2 text-ink" (click)="addIncident(side.teamId, 'injury')">+ Lesión</button>
              @if (openFor() === side.teamId && side.squad) {
                @let options = suggestions(side.teamId, side.squad.players);
                @if (options.length) {
                  <ul class="max-h-56 w-full basis-full overflow-y-auto border border-line bg-raised" role="listbox">
                    @for (p of options; track p.name) {
                      <li role="option" [attr.aria-selected]="false">
                        <button
                          type="button"
                          class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-line"
                          (pointerdown)="$event.preventDefault(); choose(side.teamId, p.name)"
                          (click)="choose(side.teamId, p.name)"
                        >
                          <span class="flex-1 truncate font-medium">{{ p.name }}</span>
                          <span class="font-display text-xs font-bold text-mist">{{ p.position }} · {{ p.overall }}</span>
                        </button>
                      </li>
                    }
                  </ul>
                }
              }
            </div>
            @if (!side.squad) {
              <p class="mt-1 text-xs text-mist">No tenemos la plantilla de este club: escribe el nombre a mano.</p>
            }
          </div>
        }
      </div>
    </details>

    <div class="mt-6 flex justify-center gap-3">
      <button type="button" class="btn-secondary" (click)="cancelled.emit()">Cancelar</button>
      <button type="button" class="btn-primary px-10" [disabled]="session.saving()" (click)="save()">Guardar resultado</button>
    </div>
  `,
})
export class ResultForm implements OnInit {
  protected readonly session = inject(TournamentSession);
  private readonly squads = inject(ClubSquads);
  private readonly toast = inject(ToastService);

  readonly match = input.required<Match>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly home = signal(0);
  protected readonly away = signal(0);
  protected readonly extraTime = signal(false);
  protected readonly homePens = signal(0);
  protected readonly awayPens = signal(0);
  protected readonly goals = signal<Goal[]>([]);
  protected readonly incidents = signal<Incident[]>([]);

  protected readonly knockout = computed(() => this.match().phase !== 'group');
  protected readonly level = computed(() => this.knockout() && this.home() === this.away());
  protected readonly trackScorers = computed(() => !!this.session.tournament()?.config.trackScorers);

  protected readonly sides = computed(() => {
    const t = this.session.tournament()!;
    const m = this.match();
    return [
      { teamId: m.homeId, players: lineup(t, m, m.homeId), goals: this.home() },
      { teamId: m.awayId, players: lineup(t, m, m.awayId), goals: this.away() },
    ];
  });

  ngOnInit(): void {
    void this.squads.load();
    const m = this.match();
    if (m.status === 'done') {
      this.home.set(m.homeGoals ?? 0);
      this.away.set(m.awayGoals ?? 0);
      this.extraTime.set(!!m.extraTime);
      this.homePens.set(m.homePens ?? 0);
      this.awayPens.set(m.awayPens ?? 0);
      this.goals.set(m.goals ?? []);
      this.incidents.set((m.incidents ?? []).filter((x) => typeof x.player === 'string'));
    }
  }

  /** Each club in the match with its incidents and, when we know it, its real squad. */
  protected readonly incidentSides = computed(() => {
    const m = this.match();
    return [m.homeId, m.awayId].map((teamId) => {
      const club = this.session.teamName(teamId);
      return {
        teamId,
        club,
        squad: this.squads.squadFor(club),
        incidents: this.incidents().filter((x) => x.teamId === teamId),
      };
    });
  });

  /** What has been typed in each club's player search, by team id. */
  protected readonly queries = signal<Record<Id, string>>({});
  /** Team whose player suggestions are showing. */
  protected readonly openFor = signal<Id | null>(null);

  protected setQuery(teamId: Id, value: string): void {
    this.queries.update((q) => ({ ...q, [teamId]: value }));
    this.openFor.set(teamId);
  }

  /** Squad players matching the search, ignoring case and accents; the whole squad when empty. */
  protected suggestions<T extends { name: string }>(teamId: Id, players: readonly T[]): T[] {
    const query = fold(this.queries()[teamId] ?? '');
    return players.filter((p) => fold(p.name).includes(query)).slice(0, 30);
  }

  protected choose(teamId: Id, name: string): void {
    this.queries.update((q) => ({ ...q, [teamId]: name }));
    this.openFor.set(null);
  }

  /** Lets a tap on a suggestion land before the list closes. */
  protected closeSoon(teamId: Id): void {
    setTimeout(() => {
      if (this.openFor() === teamId) this.openFor.set(null);
    }, 150);
  }

  protected addIncident(teamId: Id, kind: Incident['kind']): void {
    const player = (this.queries()[teamId] ?? '').trim();
    if (!player) {
      this.openFor.set(teamId);
      return;
    }
    this.incidents.update((list) => [
      ...list.filter((x) => !(x.teamId === teamId && x.player === player)),
      { teamId, player, kind },
    ]);
    this.queries.update((q) => ({ ...q, [teamId]: '' }));
    this.openFor.set(null);
  }

  protected removeIncident(incident: Incident): void {
    this.incidents.update((list) => list.filter((x) => x !== incident));
  }

  protected assigned(teamId: Id): number {
    return this.goals().filter((g) => g.teamId === teamId).length;
  }

  protected count(teamId: Id, scorerId: Id): number {
    return this.goals().filter((g) => g.teamId === teamId && g.scorerId === scorerId).length;
  }

  /** Adding a scorer beyond the current score also adds the goal to the score. */
  protected addScorer(teamId: Id, scorerId: Id): void {
    const score = teamId === this.match().homeId ? this.home : this.away;
    if (this.assigned(teamId) >= score()) score.set(score() + 1);
    this.goals.update((list) => [...list, { teamId, scorerId }]);
  }

  protected removeScorer(teamId: Id, scorerId: Id): void {
    this.goals.update((list) => {
      const index = list.findIndex((g) => g.teamId === teamId && g.scorerId === scorerId);
      return list.filter((_, i) => i !== index);
    });
  }

  protected async save(): Promise<void> {
    const m = this.match();
    // Drop scorers beyond the score if goals were lowered after assigning them.
    const trimmed = [m.homeId, m.awayId].flatMap((teamId) =>
      this.goals()
        .filter((g) => g.teamId === teamId)
        .slice(0, teamId === m.homeId ? this.home() : this.away()),
    );
    const result = {
      homeGoals: this.home(),
      awayGoals: this.away(),
      extraTime: this.extraTime(),
      homePens: this.level() ? this.homePens() : null,
      awayPens: this.level() ? this.awayPens() : null,
      goals: trimmed,
      incidents: this.incidents(),
    };
    // Check the result first so a mistake keeps the form open. Saving updates the match at once,
    // which can remove this form from the page, so the parent is told before that happens.
    try {
      recordResult(this.session.tournament()!, m.id, result);
    } catch (error) {
      this.toast.error(error);
      return;
    }
    this.saved.emit();
    await this.session.apply((t) => recordResult(t, m.id, result));
  }
}
