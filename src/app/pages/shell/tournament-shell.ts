import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { Brand } from '../../ui/brand';
import { ToastService } from '../../ui/toast.service';
import { StageBadge } from '../../ui/stage-badge';
import { ShareButtons } from '../../ui/share-buttons';
import { invitationText, tournamentUrl } from '../../domain/share-text';
import { Gala } from '../gala/gala';
import { GalaViewer } from '../gala/gala-viewer';
import { IdentityGate } from '../../ui/identity-gate';

@Component({
  selector: 'app-tournament-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, StageBadge, ShareButtons, Gala, IdentityGate],
  providers: [TournamentSession, GalaViewer],
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
        <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-3">
          <a routerLink="/" aria-label="Inicio"><app-brand size="sm" /></a>
          <div class="min-w-0 flex-1">
            <p class="truncate font-display text-sm font-bold uppercase text-mist">{{ t.name }}</p>
          </div>
          <button
            type="button"
            class="tag bg-line font-display tracking-[0.2em] text-chalk hover:bg-raised"
            title="Invitar"
            [attr.aria-expanded]="sharing()"
            (click)="sharing.set(!sharing())"
          >
            {{ t.id }}
          </button>
          <a
            [routerLink]="['/t', t.id, 'tv']"
            class="tag hidden bg-line text-mist hover:text-chalk sm:inline-block"
            >Modo TV</a
          >
          <button
            type="button"
            class="tag"
            [class]="session.isAdmin() ? 'bg-volt text-ink' : 'bg-line text-mist hover:text-chalk'"
            (click)="session.isAdmin() ? session.lock() : unlocking.set(!unlocking())"
          >
            {{ session.isAdmin() ? 'Admin' : 'Solo ver' }}
          </button>
        </div>

        @if (sharing()) {
          <div class="mx-auto max-w-5xl animate-rise px-4 pt-3">
            <p class="text-sm text-mist">Invita al grupo: con el enlace cada uno ve los partidos y cuándo le toca.</p>
            <div class="mt-2"><app-share-buttons [text]="invitation()" [url]="link()" [title]="t.name" /></div>
          </div>
        }

        @if (unlocking() && !session.isAdmin()) {
          <form
            class="mx-auto flex max-w-5xl animate-rise items-center gap-2 px-4 pt-3"
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

        <nav class="no-scrollbar mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-0 pt-3" aria-label="Secciones">
          @for (tab of tabs(); track tab.path) {
            <a
              [routerLink]="tab.path"
              routerLinkActive="!border-volt !text-chalk"
              class="shrink-0 border-b-[3px] border-transparent px-3 pb-2 font-display text-base font-bold uppercase italic tracking-wide text-mist hover:text-chalk"
            >
              {{ tab.label }}
            </a>
          }
          <span class="ml-auto hidden self-center pb-2 sm:inline"><app-stage-badge [stage]="t.stage" /></span>
        </nav>
      </header>

      <main class="mx-auto max-w-5xl px-4 pb-24 pt-5">
        <router-outlet />
      </main>

      @if (gala.mode()) {
        <app-gala />
      }
    }
  `,
})
export class TournamentShell {
  protected readonly session = inject(TournamentSession);
  protected readonly gala = inject(GalaViewer);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly unlocking = signal(false);
  protected readonly sharing = signal(false);
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
    const tabs = [
      { path: 'ruleta', label: t.stage === 'draw' ? 'Ruleta' : 'Parejas' },
      { path: 'partidos', label: 'Partidos' },
      { path: 'tabla', label: 'Tabla' },
      { path: 'cuadro', label: 'Cuadro' },
    ];
    if (t.config.trackScorers) tabs.push({ path: 'goleadores', label: 'Goleadores' });
    return tabs;
  });

  constructor() {
    effect(() => void this.session.open(this.id().toUpperCase()));
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
