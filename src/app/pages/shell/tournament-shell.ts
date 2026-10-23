import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { Brand } from '../../ui/brand';
import { ToastService } from '../../ui/toast.service';
import { StageBadge, stageLabel } from '../../ui/stage-badge';
import { ShareButtons } from '../../ui/share-buttons';
import { invitationText, tournamentUrl } from '../../domain/share-text';
import { DEMO_PREFIX } from '../../data/tournament-repository';
import { Gala } from '../gala/gala';
import { Icon } from '../../ui/icon';
import { FormatInfo } from './format-info';
import { PlayerNames } from './player-names';
import { GalaViewer } from '../gala/gala-viewer';
import { LeagueRecap } from '../league/league-recap';
import { LeagueRecapViewer } from '../league/league-recap-viewer';
import { ChoiceMoment } from '../choice/choice-moment';
import { ChoiceMomentViewer } from '../choice/choice-moment-viewer';
import { IdentityGate } from '../../ui/identity-gate';

/** Outline icons for the phone tab bar, drawn on a 24×24 grid. */
const ICONS = {
  wheel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4',
  pairs: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.8.8 3 2.7 3 5.6',
  matches: 'M4 6h16v14H4ZM4 10h16M9 3v4M15 3v4',
  table: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  bracket: 'M3 5h5v5H3M3 14h5v5H3M8 7.5h3v9H8M11 12h4M15 9h6v6h-6Z',
  scorers: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 8l3 2.2-1.1 3.6h-3.8L9 10.2Z',
};

@Component({
  selector: 'app-tournament-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, StageBadge, ShareButtons, Gala, LeagueRecap, ChoiceMoment, IdentityGate, FormatInfo, PlayerNames, Icon],
  providers: [TournamentSession, GalaViewer, LeagueRecapViewer, ChoiceMomentViewer],
  template: `
    @if (session.loading()) {
      <div class="grid min-h-dvh place-items-center">
        <span class="heading animate-pulse-live text-3xl text-mist">Cargando…</span>
      </div>
    } @else if (session.loadError(); as error) {
      <main class="mx-auto max-w-md px-4 py-20 text-center">
        <p class="heading text-4xl text-flare">Fuera de juego</p>
        <p class="mt-3 text-mist">{{ error }}</p>
        <a routerLink="/" class="btn-secondary mt-8">Volver</a>
      </main>
    } @else if (session.needsIdentity()) {
      <app-identity-gate />
    } @else if (session.tournament(); as t) {
      <header class="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
        <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:pb-0">
          <a routerLink="/" aria-label="Inicio" class="shrink-0"><app-brand size="sm" [compact]="true" /></a>
          <div class="min-w-0 flex-1">
            <p class="truncate font-display text-lg font-extrabold uppercase italic leading-tight sm:text-base sm:font-bold sm:not-italic sm:text-mist">
              {{ t.name }}
            </p>
            <p class="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-mist sm:hidden">{{ stageLabel() }}</p>
          </div>
          <a
            [routerLink]="['/t', t.id, 'tv']"
            class="tag hidden bg-line text-mist hover:text-chalk sm:inline-block"
            >Modo TV</a
          >
          @if (t.stage !== 'setup') {
            <button
              type="button"
              class="grid size-10 shrink-0 place-items-center bg-line text-mist hover:text-chalk sm:size-auto sm:px-3 sm:py-1"
              aria-label="Formato y reglas"
              (click)="info.set(true)"
            >
              <app-icon name="info" size="1.25rem" />
            </button>
          }
          @if (session.isAdmin()) {
            <button
              type="button"
              class="grid size-10 shrink-0 place-items-center bg-line text-mist hover:text-chalk sm:size-auto sm:px-3 sm:py-1"
              aria-label="Cambiar nombres"
              (click)="names.set(true)"
            >
              <app-icon name="pencil" size="1.25rem" />
            </button>
          }
          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center bg-line text-chalk hover:bg-raised sm:size-auto sm:px-3 sm:py-1"
            [attr.aria-label]="'Invitar al torneo ' + t.id"
            [attr.aria-expanded]="sharing()"
            (click)="sharing.set(!sharing())"
          >
            <svg viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2 sm:hidden" aria-hidden="true">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
            </svg>
            <span class="hidden font-display text-xs font-bold uppercase tracking-[0.2em] sm:inline">{{ t.id }}</span>
          </button>
          <button
            type="button"
            class="grid size-10 shrink-0 place-items-center sm:size-auto sm:px-3 sm:py-1"
            [class]="session.isAdmin() ? 'bg-volt text-ink' : 'bg-line text-mist hover:text-chalk'"
            [attr.aria-label]="session.isAdmin() ? 'Admin: salir del modo admin' : 'Entrar como admin'"
            (click)="session.isAdmin() ? session.lock() : unlocking.set(!unlocking())"
          >
            <svg viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2 sm:hidden" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="1" />
              <path [attr.d]="session.isAdmin() ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'" />
            </svg>
            <span class="hidden font-display text-xs font-bold uppercase tracking-wider sm:inline">{{ session.isAdmin() ? 'Admin' : 'Solo ver' }}</span>
          </button>
        </div>

        @if (sharing()) {
          <div class="mx-auto max-w-5xl animate-rise px-4 pb-3 sm:pt-3">
            <p class="text-sm text-mist">
              Código <span class="font-display text-lg font-bold tracking-[0.2em] text-chalk">{{ t.id }}</span> · con el enlace cada uno ve los partidos y cuándo le toca.
            </p>
            @if (isDemo()) {
              <p class="mt-1 text-sm text-flare">Es una demo: solo existe en este navegador, así que el enlace no abre nada en otro móvil.</p>
            }
            <div class="mt-2 flex flex-wrap gap-2">
              <app-share-buttons [text]="invitation()" [url]="link()" [title]="t.name" />
              <a [routerLink]="['/t', t.id, 'tv']" class="btn-secondary sm:hidden">Modo TV</a>
            </div>
          </div>
        }

        @if (unlocking() && !session.isAdmin()) {
          <form
            class="mx-auto flex max-w-5xl animate-rise items-center gap-2 px-4 pb-3 sm:pt-3"
            (submit)="$event.preventDefault(); unlock(pinInput)"
          >
            <input
              #pinInput
              class="field max-w-40 font-display text-xl tracking-[0.4em]"
              type="password"
              inputmode="numeric"
              placeholder="PIN"
              aria-label="PIN de admin"
            />
            <button type="submit" class="btn-primary">Desbloquear</button>
          </form>
        }

        <!-- Wider screens: tabs under the header. -->
        <nav class="no-scrollbar mx-auto hidden max-w-5xl gap-1 overflow-x-auto px-4 pt-3 sm:flex" aria-label="Secciones">
          @for (tab of tabs(); track tab.path) {
            <a
              [routerLink]="tab.path"
              routerLinkActive="!border-volt !text-chalk"
              class="shrink-0 border-b-[3px] border-transparent px-3 pb-2 font-display text-base font-bold uppercase italic tracking-wide text-mist hover:text-chalk"
            >
              {{ tab.label }}
            </a>
          }
          <span class="ml-auto self-center pb-2"><app-stage-badge [stage]="t.stage" /></span>
        </nav>
      </header>

      <!-- Phones: tabs at the bottom, within reach of the thumb. -->
      <nav
        class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        aria-label="Secciones"
      >
        <div class="flex">
          @for (tab of tabs(); track tab.path) {
            <a
              [routerLink]="tab.path"
              routerLinkActive="!text-volt [&>span:first-child]:!bg-volt/15"
              class="flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-2 pt-1.5 text-mist"
            >
              <span class="grid h-7 w-12 place-items-center rounded-full">
                <svg viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2" aria-hidden="true">
                  <path [attr.d]="icons[tab.icon]" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="truncate font-display text-[0.7rem] font-bold uppercase tracking-wide">{{ tab.label }}</span>
            </a>
          }
        </div>
      </nav>

      <main class="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:pb-24">
        <router-outlet />
      </main>

      @if (names() && session.isAdmin()) {
        <app-player-names (closed)="names.set(false)" />
      }
      @if (info()) {
        <app-format-info (closed)="info.set(false)" />
      }

      @if (gala.mode()) {
        <app-gala />
      } @else if (leagueRecap.open()) {
        <app-league-recap />
      } @else if (choice.open()) {
        <app-choice-moment />
      }
    }
  `,
})
export class TournamentShell {
  protected readonly session = inject(TournamentSession);
  protected readonly gala = inject(GalaViewer);
  protected readonly leagueRecap = inject(LeagueRecapViewer);
  protected readonly choice = inject(ChoiceMomentViewer);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly unlocking = signal(false);
  protected readonly sharing = signal(false);
  protected readonly info = signal(false);
  protected readonly names = signal(false);
  /** Demos live in this browser only: a link to one opens nothing elsewhere. */
  protected readonly isDemo = computed(() => !!this.session.tournament()?.id.startsWith(DEMO_PREFIX));
  protected readonly link = computed(() => {
    const t = this.session.tournament();
    return t ? tournamentUrl(location.origin, t) : '';
  });
  protected readonly invitation = computed(() => {
    const t = this.session.tournament();
    return t ? invitationText(t, this.link()) : '';
  });

  protected readonly tabs = computed(() => {
    const t = this.session.tournament();
    if (!t) return [];
    const tabs: { path: string; label: string; icon: keyof typeof ICONS }[] = [
      t.stage === 'draw'
        ? { path: 'ruleta', label: 'Ruleta', icon: 'wheel' }
        : { path: 'ruleta', label: 'Parejas', icon: 'pairs' },
      { path: 'partidos', label: 'Partidos', icon: 'matches' },
      { path: 'tabla', label: 'Tabla', icon: 'table' },
      { path: 'cuadro', label: 'Cuadro', icon: 'bracket' },
    ];
    if (t.config.trackScorers) tabs.push({ path: 'goleadores', label: 'Goleadores', icon: 'scorers' });
    return tabs;
  });

  protected readonly icons = ICONS;
  protected readonly stageLabel = computed(() => {
    const t = this.session.tournament();
    return t ? stageLabel(t.stage) : '';
  });

  constructor() {
    effect(() => void this.session.open(this.id().toUpperCase()));
    // Anything else fixed at the bottom (the install banner) sits above the phone tab bar.
    document.documentElement.classList.add('has-bottom-nav');
    inject(DestroyRef).onDestroy(() => document.documentElement.classList.remove('has-bottom-nav'));
  }

  protected async unlock(input: HTMLInputElement): Promise<void> {
    try {
      if (await this.session.unlock(input.value)) {
        this.unlocking.set(false);
        input.value = '';
        this.toast.info('Modo admin activado.');
      } else {
        this.toast.error('PIN incorrecto.');
      }
    } catch (error) {
      this.toast.error(error);
    }
  }

}
