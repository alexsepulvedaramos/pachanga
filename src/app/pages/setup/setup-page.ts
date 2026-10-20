import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Brand } from '../../ui/brand';
import { TournamentStore } from '../../data/tournament-store';
import { newTournamentCode } from '../../data/tournament-repository';
import { ToastService } from '../../ui/toast.service';
import { HalfMinutes, TiebreakCriterion } from '../../domain/types';
import { randomSeed } from '../../domain/rng';
import { TIEBREAKER_LABELS } from '../../domain/standings';
import { PHASE_LABELS } from '../../domain/knockout';
import {
  createTournament,
  DEFAULT_CONFIG,
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  teamCountFor,
  totalMatchCount,
} from '../../domain/tournament';
import { formatDuration } from '../../ui/format';
import { ClubPicker } from './club-picker';

const CLUB_SUGGESTIONS = [
  'Real Madrid', 'Man City', 'Bayern', 'PSG', 'Inter', 'Liverpool', 'Barça', 'Arsenal',
  'Atlético', 'Juventus', 'Milan', 'Dortmund', 'Napoli', 'Chelsea', 'Leverkusen',
];

@Component({
  selector: 'app-setup-page',
  imports: [Brand, RouterLink, ClubPicker],
  template: `
    <main class="mx-auto max-w-3xl px-4 pb-32 pt-6">
      <header class="flex items-center justify-between">
        <a routerLink="/"><app-brand size="sm" /></a>
        <span class="eyebrow text-mist">Nuevo torneo</span>
      </header>

      <h1 class="heading mt-8 text-5xl">Configura<br /><span class="text-volt">el torneo</span></h1>

      <!-- Name -->
      <section class="mt-10">
        <h2 class="eyebrow text-cyan">01 · Nombre</h2>
        <input
          class="field mt-3 font-display text-2xl font-bold uppercase"
          placeholder="La Pachanga del sábado"
          [value]="name()"
          (input)="name.set($any($event.target).value)"
          aria-label="Nombre del torneo"
        />
      </section>

      <!-- Participants -->
      <section class="mt-10">
        <div class="flex items-baseline justify-between">
          <h2 class="eyebrow text-cyan">02 · Participantes</h2>
          <span class="font-display text-sm font-bold uppercase text-mist">
            {{ players().length }} · {{ teamCount() }} parejas
            @if (players().length % 2 === 1) {
              <span class="text-gold">+ 1 suelto</span>
            }
          </span>
        </div>
        <form class="mt-3 flex gap-2" (submit)="$event.preventDefault(); addPlayer(playerInput)">
          <input
            #playerInput
            class="field"
            placeholder="Nombre y Enter"
            autocomplete="off"
            aria-label="Nombre del participante"
            (paste)="pastePlayers($event)"
          />
          <button type="submit" class="btn-secondary shrink-0">Añadir</button>
        </form>
        <ul class="mt-3 flex flex-wrap gap-2">
          @for (p of players(); track p; let i = $index) {
            <li class="slant-sm flex items-center gap-2 bg-raised py-1.5 pl-4 pr-3">
              <span class="font-display text-sm font-bold text-mist">{{ i + 1 }}</span>
              <span class="font-medium">{{ p }}</span>
              <button
                type="button"
                class="px-1 text-mist hover:text-flare"
                [attr.aria-label]="'Quitar a ' + p"
                (click)="removePlayer(i)"
              >
                ✕
              </button>
            </li>
          }
        </ul>
        <p class="mt-2 text-sm text-mist">
          Entre {{ min }} y {{ max }}. Si sois impares, al que le toque solo se le sortea compañero
          en cada partido. Puedes pegar una lista entera.
        </p>
      </section>

      <!-- Clubs -->
      <section class="mt-10">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="eyebrow text-cyan">03 · Equipos de la ruleta</h2>
          <button type="button" class="tag bg-cyan text-ink" (click)="picking.set(!picking())">
            {{ picking() ? 'Cerrar' : 'Elegir por media' }}
          </button>
        </div>
        @if (picking()) {
          <app-club-picker [count]="teamCount() || clubSlots().length" (picked)="useClubs($event)" (cancelled)="picking.set(false)" />
        }
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          @for (club of clubSlots(); track $index; let i = $index) {
            <input
              class="field font-display text-lg font-bold uppercase"
              [placeholder]="'Equipo ' + (i + 1)"
              [value]="club"
              [attr.aria-label]="'Equipo ' + (i + 1)"
              (input)="setClub(i, $any($event.target).value)"
            />
          }
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          @for (s of suggestions(); track s) {
            <button
              type="button"
              class="tag bg-line text-mist hover:bg-volt hover:text-ink"
              (click)="useSuggestion(s)"
            >
              + {{ s }}
            </button>
          }
        </div>
      </section>

      <!-- Tiebreakers -->
      <section class="mt-10">
        <h2 class="eyebrow text-cyan">04 · Desempates</h2>
        <p class="mt-1 text-sm text-mist">
          Si hay empate a puntos se aplican en este orden. Sube, baja o quita criterios.
        </p>
        <ol class="mt-3 space-y-1.5">
          @for (c of tiebreakers(); track c; let i = $index, first = $first, last = $last) {
            <li class="cut-sm flex items-center gap-3 bg-pitch py-2 pl-4 pr-2">
              <span class="heading w-6 text-2xl text-volt">{{ i + 1 }}</span>
              <span class="flex-1 font-medium">{{ labels[c] }}</span>
              <button type="button" class="px-2 py-1 text-mist hover:text-chalk disabled:opacity-20" [disabled]="first" (click)="moveTiebreaker(i, -1)" [attr.aria-label]="'Subir ' + labels[c]">▲</button>
              <button type="button" class="px-2 py-1 text-mist hover:text-chalk disabled:opacity-20" [disabled]="last" (click)="moveTiebreaker(i, 1)" [attr.aria-label]="'Bajar ' + labels[c]">▼</button>
              <button type="button" class="px-2 py-1 text-mist hover:text-flare" (click)="removeTiebreaker(c)" [attr.aria-label]="'Quitar ' + labels[c]">✕</button>
            </li>
          }
        </ol>
        @if (unusedTiebreakers().length) {
          <div class="mt-3 flex flex-wrap gap-1.5">
            @for (c of unusedTiebreakers(); track c) {
              <button type="button" class="tag bg-line text-mist hover:bg-cyan hover:text-ink" (click)="addTiebreaker(c)">
                + {{ labels[c] }}
              </button>
            }
          </div>
        }
      </section>

      <!-- Rules -->
      <section class="mt-10">
        <h2 class="eyebrow text-cyan">05 · Reglas</h2>
        <label class="panel mt-3 flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span class="block font-display text-lg font-bold uppercase">Apuntar goleadores</span>
            <span class="text-sm text-mist">Además del marcador, quién marca cada gol.</span>
          </span>
          <input
            type="checkbox"
            class="size-6 accent-volt"
            [checked]="trackScorers()"
            (change)="trackScorers.set($any($event.target).checked)"
          />
        </label>
        <div class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          @for (phase of phases; track phase) {
            <label class="block bg-pitch p-2">
              <span class="eyebrow block text-[0.65rem] text-mist">{{ phaseLabels[phase] }}</span>
              <input
                type="number"
                min="1"
                max="20"
                class="w-full bg-transparent font-display text-2xl font-bold outline-none"
                [value]="minutes()[phase]"
                (input)="setMinutes(phase, $any($event.target).valueAsNumber)"
              />
              <span class="text-xs text-mist">min/parte</span>
            </label>
          }
          <label class="block bg-pitch p-2">
            <span class="eyebrow block text-[0.65rem] text-mist">Cambios</span>
            <input
              type="number"
              min="0"
              max="20"
              class="w-full bg-transparent font-display text-2xl font-bold outline-none"
              [value]="changeover()"
              (input)="changeover.set($any($event.target).valueAsNumber || 0)"
            />
            <span class="text-xs text-mist">min/partido</span>
          </label>
        </div>
      </section>

      <!-- PIN -->
      <section class="mt-10">
        <h2 class="eyebrow text-cyan">06 · PIN de admin</h2>
        <p class="mt-1 text-sm text-mist">
          Todos pueden ver el torneo con el código; solo quien tenga el PIN mete resultados.
        </p>
        <input
          class="field mt-3 max-w-48 font-display text-2xl tracking-[0.4em]"
          type="password"
          inputmode="numeric"
          maxlength="8"
          placeholder="••••"
          aria-label="PIN de admin"
          [value]="pin()"
          (input)="pin.set($any($event.target).value)"
        />
      </section>
    </main>

    <div class="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 backdrop-blur">
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <div class="font-display text-sm font-bold uppercase leading-tight text-mist">
          @if (validTeamCount()) {
            <span class="text-chalk">{{ matchCount() }} partidos</span> · {{ duration() }}
          } @else {
            Faltan participantes
          }
        </div>
        <button type="button" class="btn-primary" [disabled]="creating()" (click)="create()">
          Ir a la ruleta
        </button>
      </div>
    </div>
  `,
})
export class SetupPage {
  private readonly store = inject(TournamentStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly min = MIN_PARTICIPANTS;
  protected readonly max = MAX_PARTICIPANTS;
  protected readonly labels = TIEBREAKER_LABELS;
  protected readonly phaseLabels = PHASE_LABELS;
  protected readonly phases: (keyof HalfMinutes)[] = ['group', 'playoff', 'semi', 'third', 'final'];

  protected readonly name = signal('');
  protected readonly players = signal<string[]>([]);
  protected readonly clubs = signal<string[]>([]);
  protected readonly tiebreakers = signal<TiebreakCriterion[]>([...DEFAULT_CONFIG.tiebreakers]);
  protected readonly trackScorers = signal(false);
  protected readonly minutes = signal<HalfMinutes>({ ...DEFAULT_CONFIG.halfMinutes });
  protected readonly changeover = signal(DEFAULT_CONFIG.changeoverMinutes);
  protected readonly pin = signal('');
  protected readonly creating = signal(false);
  protected readonly picking = signal(false);

  protected readonly teamCount = computed(() => teamCountFor(this.players().length));
  protected readonly validTeamCount = computed(() => {
    const n = this.players().length;
    return n >= MIN_PARTICIPANTS && n <= MAX_PARTICIPANTS;
  });
  protected readonly clubSlots = computed(() =>
    Array.from({ length: Math.max(this.teamCount(), 5) }, (_, i) => this.clubs()[i] ?? ''),
  );
  protected readonly suggestions = computed(() => {
    const used = new Set(this.clubs().map((c) => c.toLowerCase()));
    return CLUB_SUGGESTIONS.filter((s) => !used.has(s.toLowerCase())).slice(0, 10);
  });
  protected readonly unusedTiebreakers = computed(() =>
    (Object.keys(TIEBREAKER_LABELS) as TiebreakCriterion[]).filter(
      (c) => !this.tiebreakers().includes(c),
    ),
  );
  protected readonly matchCount = computed(() => totalMatchCount(this.teamCount()));
  protected readonly duration = computed(() => {
    const teams = this.teamCount();
    const m = this.minutes();
    const per = (half: number) => half * 2 + this.changeover();
    const groups = (teams * (teams - 1)) / 2;
    const playoffs = teams === 5 ? 1 : 2;
    const total =
      groups * per(m.group) + playoffs * per(m.playoff) + 2 * per(m.semi) + per(m.third) + per(m.final);
    return `~${formatDuration(total)}`;
  });

  protected addPlayer(input: HTMLInputElement): void {
    this.addNames([input.value]);
    input.value = '';
  }

  protected pastePlayers(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const names = text.split(/[\n,;]+/);
    if (names.length < 2) return;
    event.preventDefault();
    this.addNames(names);
  }

  private addNames(names: string[]): void {
    const existing = new Set(this.players().map((p) => p.toLowerCase()));
    const fresh: string[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name || existing.has(name.toLowerCase())) continue;
      existing.add(name.toLowerCase());
      fresh.push(name);
    }
    this.players.update((list) => [...list, ...fresh].slice(0, MAX_PARTICIPANTS));
  }

  protected removePlayer(index: number): void {
    this.players.update((list) => list.filter((_, i) => i !== index));
  }

  protected setClub(index: number, value: string): void {
    this.clubs.update((list) => {
      const next = [...list];
      next[index] = value;
      return next;
    });
  }

  protected useSuggestion(club: string): void {
    const slots = this.clubSlots();
    const empty = slots.findIndex((c) => !c.trim());
    if (empty === -1) return;
    this.setClub(empty, club);
  }

  protected useClubs(clubs: string[]): void {
    this.clubs.set(clubs);
    this.picking.set(false);
  }

  protected moveTiebreaker(index: number, delta: number): void {
    this.tiebreakers.update((list) => {
      const next = [...list];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }

  protected removeTiebreaker(c: TiebreakCriterion): void {
    this.tiebreakers.update((list) => list.filter((x) => x !== c));
  }

  protected addTiebreaker(c: TiebreakCriterion): void {
    this.tiebreakers.update((list) => [...list, c]);
  }

  protected setMinutes(phase: keyof HalfMinutes, value: number): void {
    if (!Number.isFinite(value) || value < 1) return;
    this.minutes.update((m) => ({ ...m, [phase]: value }));
  }

  protected async create(): Promise<void> {
    if (!/^\d{4,8}$/.test(this.pin())) {
      this.toast.error('El PIN tiene que tener entre 4 y 8 números.');
      return;
    }
    this.creating.set(true);
    try {
      const tournament = createTournament({
        id: newTournamentCode(),
        name: this.name(),
        participantNames: this.players(),
        clubs: this.clubs().slice(0, this.teamCount()),
        config: {
          tiebreakers: this.tiebreakers(),
          trackScorers: this.trackScorers(),
          halfMinutes: this.minutes(),
          changeoverMinutes: this.changeover(),
          seed: randomSeed(),
        },
      });
      await this.store.create(tournament, this.pin());
      void this.router.navigate(['/t', tournament.id, 'ruleta']);
    } catch (error) {
      this.toast.error(error);
    } finally {
      this.creating.set(false);
    }
  }
}
