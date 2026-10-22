import { Component, computed, input, OnInit, output, signal } from '@angular/core';
import { ClubCrest } from '../../ui/club-crest';
import {
  ClubRating,
  ClubRatingsFile,
  EditionIndexEntry,
  Line,
  suggestClubs,
} from '../../domain/club-ratings';

const LINES: { line: Line; label: string }[] = [
  { line: 'att', label: 'Delantera' },
  { line: 'mid', label: 'Medio' },
  { line: 'def', label: 'Defensa' },
  { line: 'gk', label: 'Portería' },
];

/** Browse clubs by rating, open one to see its best XI, and pick as many as there are pairs. */
@Component({
  selector: 'app-club-picker',
  imports: [ClubCrest],
  template: `
    <div class="cut mt-3 animate-rise border-t-4 border-cyan bg-pitch p-4">
      @if (error()) {
        <p class="text-flare">{{ error() }}</p>
      } @else if (!data()) {
        <p class="heading animate-pulse-live text-xl text-mist">Cargando equipos…</p>
      } @else {
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <span class="eyebrow text-mist">Medias de</span>
          @if (editions().length > 1) {
            <select
              class="field w-auto py-1 font-display font-bold uppercase"
              aria-label="Edición del juego"
              [value]="editionId()"
              (change)="loadEdition($any($event.target).value)"
            >
              @for (e of editions(); track e.id) {
                <option [value]="e.id" [selected]="e.id === editionId()">{{ e.edition }}</option>
              }
            </select>
          } @else {
            <span class="tag bg-gold text-ink">{{ data()!.edition }}</span>
          }
          <span class="text-xs text-mist">Si jugáis a otra edición, las medias no coincidirán.</span>
        </div>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <label class="min-w-56 flex-1">
            <span class="eyebrow text-mist">Media objetivo</span>
            <span class="mt-1 flex items-center gap-3">
              <input
                type="range"
                min="70"
                max="87"
                step="1"
                class="flex-1 accent-volt"
                [value]="target()"
                (input)="target.set($any($event.target).valueAsNumber)"
                aria-label="Media objetivo"
              />
              <span class="heading w-12 text-right text-4xl text-volt">{{ target() }}</span>
            </span>
          </label>
          <button type="button" class="btn-secondary" (click)="suggest()">Sugerir {{ count() }}</button>
        </div>

        <ul class="mt-4 space-y-1.5">
          @for (club of list(); track club.id) {
            @let picked = isPicked(club);
            <li class="bg-raised" [class.ring-2]="picked" [class.ring-inset]="picked" [class.ring-volt]="picked">
              <div class="flex items-center gap-3 py-2 pl-2 pr-3">
                <button
                  type="button"
                  class="grid size-9 shrink-0 place-items-center font-display text-lg font-extrabold"
                  [class]="picked ? 'bg-volt text-ink' : 'bg-line text-mist hover:text-chalk'"
                  [disabled]="!picked && full()"
                  [attr.aria-pressed]="picked"
                  [attr.aria-label]="(picked ? 'Quitar ' : 'Elegir ') + club.name"
                  (click)="toggle(club)"
                >
                  {{ picked ? '✓' : '+' }}
                </button>
                <app-club-crest [club]="club.name" size="2.25rem" />
                <button type="button" class="min-w-0 flex-1 text-left" (click)="expand(club)" [attr.aria-expanded]="expanded() === club.id">
                  <span class="block truncate font-display text-lg font-extrabold uppercase italic leading-tight">{{ club.name }}</span>
                  <span class="block truncate text-xs text-mist">{{ club.league }} · <span class="text-gold">{{ stars(club.stars) }}</span></span>
                </button>
                <span class="hidden font-display text-sm font-bold text-mist sm:block">
                  ATA {{ club.attack }} · MED {{ club.midfield }} · DEF {{ club.defence }}
                </span>
                <span class="heading w-10 text-right text-3xl">{{ club.overall }}</span>
              </div>

              @if (expanded() === club.id) {
                <div class="border-t border-line px-3 pb-3 pt-2">
                  <p class="font-display text-sm font-bold text-mist">
                    <span class="text-chalk">{{ club.formation }}</span>
                    <span class="sm:hidden"> · ATA {{ club.attack }} · MED {{ club.midfield }} · DEF {{ club.defence }}</span>
                  </p>
                  <div class="mt-2 space-y-1.5 bg-[repeating-linear-gradient(0deg,#123018_0_28px,#153a1d_28px_56px)] p-3">
                    @for (row of lineupRows(club); track row.label) {
                      <div class="flex justify-center gap-1.5">
                        @for (p of row.players; track p.name) {
                          <div class="min-w-0 flex-1 basis-0 bg-ink/80 px-1.5 py-1 text-center sm:max-w-28">
                            <p class="heading text-lg leading-none text-volt">{{ p.overall }}</p>
                            <p class="truncate text-[0.7rem] leading-tight">{{ p.name }}</p>
                            <p class="font-display text-[0.6rem] font-bold text-mist">{{ p.position }}</p>
                          </div>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
            </li>
          }
        </ul>

        <p class="mt-3 text-xs text-mist">
          Medias estimadas con el mejor 4-3-3 de cada club a partir de las valoraciones oficiales de
          {{ data()!.edition }} (5 grandes ligas). Pueden variar un punto o dos respecto al juego.
          Actualizado {{ updated() }}.
        </p>

        <div class="sticky bottom-16 z-10 -mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 bg-pitch px-4 py-2">
          <p class="font-display text-sm font-bold uppercase">
            <span [class.text-volt]="full()">{{ selected().length }}/{{ count() }}</span> elegidos
            @if (selected().length > 1) {
              <span class="text-mist"> · diferencia {{ spread() }}</span>
            }
          </p>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary" (click)="cancelled.emit()">Cerrar</button>
            <button type="button" class="btn-primary" [disabled]="!full()" (click)="use()">Usar estos</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ClubPicker implements OnInit {
  /** How many clubs the tournament needs. */
  readonly count = input.required<number>();
  readonly picked = output<string[]>();
  readonly cancelled = output<void>();

  protected readonly editions = signal<EditionIndexEntry[]>([]);
  protected readonly editionId = signal<string | null>(null);
  protected readonly data = signal<ClubRatingsFile | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly target = signal(82);
  protected readonly selected = signal<ClubRating[]>([]);
  protected readonly expanded = signal<number | null>(null);

  protected readonly full = computed(() => this.selected().length >= this.count());
  protected readonly spread = computed(() => {
    const ratings = this.selected().map((c) => c.overall);
    return Math.max(...ratings) - Math.min(...ratings);
  });
  protected readonly updated = computed(() => {
    const at = this.data()?.updatedAt;
    return at ? new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '';
  });

  /** Clubs near the target first; picked clubs always stay visible. */
  protected readonly list = computed(() => {
    const clubs = this.data()?.clubs ?? [];
    const target = this.target();
    const picked = new Set(this.selected().map((c) => c.id));
    return clubs
      .filter((c) => picked.has(c.id) || Math.abs(c.overall - target) <= 3)
      .sort(
        (a, b) =>
          Math.abs(a.overall - target) - Math.abs(b.overall - target) || b.overall - a.overall,
      )
      .slice(0, 40);
  });

  async ngOnInit(): Promise<void> {
    try {
      const index = await this.fetchJson<EditionIndexEntry[]>('data/clubs/index.json');
      this.editions.set(index);
      if (index.length) await this.loadEdition(index[0].id);
    } catch {
      this.error.set('No se han podido cargar los equipos. Revisa la conexión.');
    }
  }

  protected async loadEdition(id: string): Promise<void> {
    const entry = this.editions().find((e) => e.id === id);
    if (!entry) return;
    this.editionId.set(id);
    this.selected.set([]);
    this.expanded.set(null);
    this.data.set(null);
    try {
      this.data.set(await this.fetchJson<ClubRatingsFile>(`data/clubs/${entry.file}`));
    } catch {
      this.error.set('No se han podido cargar los equipos. Revisa la conexión.');
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return (await res.json()) as T;
  }

  protected isPicked(club: ClubRating): boolean {
    return this.selected().some((c) => c.id === club.id);
  }

  protected toggle(club: ClubRating): void {
    this.selected.update((list) =>
      this.isPicked(club)
        ? list.filter((c) => c.id !== club.id)
        : list.length < this.count()
          ? [...list, club]
          : list,
    );
  }

  protected expand(club: ClubRating): void {
    this.expanded.update((id) => (id === club.id ? null : club.id));
  }

  protected suggest(): void {
    const clubs = this.data()?.clubs ?? [];
    this.selected.set(suggestClubs(clubs, this.count(), this.target()));
  }

  protected use(): void {
    this.picked.emit(this.selected().map((c) => c.name));
  }

  /** Lines from attack to goal, each ordered left to right as on a pitch. */
  protected lineupRows(club: ClubRating) {
    const side = (position: string) => (/^L/.test(position) ? 0 : /^R/.test(position) ? 2 : 1);
    return LINES.map(({ line, label }) => ({
      label,
      players: club.lineup
        .filter((p) => p.line === line)
        .sort((a, b) => side(a.position) - side(b.position)),
    }));
  }

  protected stars(value: number): string {
    return '★'.repeat(Math.floor(value)) + (value % 1 ? '½' : '');
  }
}
