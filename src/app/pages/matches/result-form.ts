import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { Stepper } from '../../ui/stepper';
import { Goal, Id, Incident, Match } from '../../domain/types';
import { lineup, recordResult } from '../../domain/tournament';

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
      <p class="mt-1 text-xs text-mist">Quien se marque se pierde el siguiente partido de su equipo (salvo la final).</p>
      <div class="mt-3 grid grid-cols-2 gap-4">
        @for (side of sides(); track side.teamId) {
          <ul class="space-y-1.5">
            @for (pid of side.players; track pid) {
              <li class="flex items-center gap-1.5">
                <span class="flex-1 truncate text-sm">{{ session.personName(pid) }}</span>
                <button
                  type="button"
                  class="tag"
                  [class]="incident(pid) === 'redCard' ? 'bg-flare text-ink' : 'bg-line text-mist'"
                  [attr.aria-pressed]="incident(pid) === 'redCard'"
                  (click)="toggleIncident(pid, 'redCard')"
                >
                  Roja
                </button>
                <button
                  type="button"
                  class="tag"
                  [class]="incident(pid) === 'injury' ? 'bg-gold text-ink' : 'bg-line text-mist'"
                  [attr.aria-pressed]="incident(pid) === 'injury'"
                  (click)="toggleIncident(pid, 'injury')"
                >
                  Lesión
                </button>
              </li>
            }
          </ul>
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
    const m = this.match();
    if (m.status === 'done') {
      this.home.set(m.homeGoals ?? 0);
      this.away.set(m.awayGoals ?? 0);
      this.extraTime.set(!!m.extraTime);
      this.homePens.set(m.homePens ?? 0);
      this.awayPens.set(m.awayPens ?? 0);
      this.goals.set(m.goals ?? []);
      this.incidents.set(m.incidents ?? []);
    }
  }

  protected incident(participantId: Id): Incident['kind'] | null {
    return this.incidents().find((x) => x.participantId === participantId)?.kind ?? null;
  }

  /** One incident per player: tapping the active one clears it, the other one replaces it. */
  protected toggleIncident(participantId: Id, kind: Incident['kind']): void {
    const current = this.incident(participantId);
    this.incidents.update((list) => {
      const rest = list.filter((x) => x.participantId !== participantId);
      return current === kind ? rest : [...rest, { participantId, kind }];
    });
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
    const ok = await this.session.apply((t) =>
      recordResult(t, m.id, {
        homeGoals: this.home(),
        awayGoals: this.away(),
        extraTime: this.extraTime(),
        homePens: this.level() ? this.homePens() : null,
        awayPens: this.level() ? this.awayPens() : null,
        goals: trimmed,
        incidents: this.incidents(),
      }),
    );
    if (ok) this.saved.emit();
  }
}
