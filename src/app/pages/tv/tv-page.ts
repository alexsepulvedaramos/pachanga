import { Component, computed, DestroyRef, DOCUMENT, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentSession } from '../../data/tournament-session';
import { Brand } from '../../ui/brand';
import { MatchCard } from '../../ui/match-card';
import { StandingsTable } from '../../ui/standings-table';
import { DecisionPanel } from '../../ui/decision-panel';
import { PHASE_LABELS, winnerOf } from '../../domain/knockout';
import { champions, nextMatch } from '../../domain/tournament';
import { Match } from '../../domain/types';
import { votingOpen } from '../../domain/ballon-dor';
import { Gala } from '../gala/gala';
import { GalaViewer } from '../gala/gala-viewer';
import { QrCode } from '../../ui/qr-code';
import { tournamentUrl } from '../../domain/share-text';

/**
 * Big-screen view: current match, table and what comes next, updating live. Made to be left
 * alone on a TV, a laptop or a tablet next to the console: it scales to the screen, keeps it awake
 * and shows a QR to join from a phone.
 */
@Component({
  selector: 'app-tv-page',
  imports: [Brand, MatchCard, StandingsTable, DecisionPanel, RouterLink, Gala, QrCode],
  providers: [TournamentSession, GalaViewer],
  template: `
    @if (session.tournament(); as t) {
      <div class="flex min-h-dvh flex-col gap-6 p-6 lg:p-10">
        <header class="flex items-center justify-between gap-6">
          <a [routerLink]="['/t', t.id]" class="shrink-0"><app-brand size="md" /></a>
          <p class="heading min-w-0 truncate text-3xl text-mist">{{ t.name }}</p>
          <div class="flex shrink-0 items-center gap-4">
            <div class="text-right">
              <p class="eyebrow text-mist">Síguelo en el móvil</p>
              <p class="font-display text-3xl font-bold tracking-[0.3em]">{{ t.id }}</p>
            </div>
            <app-qr-code class="size-24" [value]="joinUrl()" [label]="'QR para abrir ' + t.name" />
          </div>
        </header>

        @if (t.stage === 'finished') {
          <section class="cut grid flex-1 animate-rise place-items-center bg-volt p-10 text-center text-ink">
            <div>
              <p class="eyebrow text-xl">Campeones</p>
              <p class="heading mt-3 text-[9rem] leading-none break-words">{{ championClub() }}</p>
              <p class="mt-4 font-display text-5xl font-bold uppercase">{{ championNames() }}</p>
              @if (voting()) {
                <p class="mt-10 font-display text-4xl font-bold uppercase">
                  Balón de Oro · {{ t.ballonDor?.voters?.length ?? 0 }}/{{ t.participants.length }} han votado
                </p>
              }
            </div>
          </section>
        } @else if (t.stage === 'draw') {
          <section class="grid flex-1 place-items-center text-center">
            <div>
              <p class="heading text-8xl">Sorteo</p>
              <p class="mt-4 font-display text-3xl font-bold uppercase text-mist">
                {{ t.draw.picks.length }} / {{ t.participants.length }} con equipo
              </p>
              @if (lastPick(); as p) {
                <p class="heading mt-10 animate-rise text-6xl">
                  {{ session.personName(p.participantId) }} → <span class="text-volt">{{ p.club }}</span>
                </p>
              }
            </div>
          </section>
        } @else {
          <div class="grid flex-1 content-start gap-8 lg:grid-cols-[1.4fr_1fr]">
            <section class="flex flex-col gap-6">
              <app-decision-panel />
              @if (current(); as m) {
                <div class="cut bg-pitch p-8" [class.ring-4]="m.status === 'live'" [class.ring-flare]="m.status === 'live'">
                  <div class="mb-8 flex items-center justify-between">
                    <p class="eyebrow text-xl text-cyan">{{ label(m) }}</p>
                    @if (m.status === 'live') {
                      <span class="tag animate-pulse-live bg-flare px-4 text-lg text-ink">En juego</span>
                    }
                  </div>
                  <app-match-card [match]="m" [big]="true" />
                </div>
              }
              @if (upcoming().length) {
                <div>
                  <p class="eyebrow text-lg text-mist">Después</p>
                  <ol class="mt-2 space-y-2">
                    @for (m of upcoming(); track m.id) {
                      <li class="flex items-center gap-4 bg-pitch px-5 py-3 font-display text-3xl font-extrabold uppercase italic">
                        <span class="flex-1 text-right">{{ session.teamName(m.homeId) }}</span>
                        <span class="text-mist">vs</span>
                        <span class="flex-1">{{ session.teamName(m.awayId) }}</span>
                      </li>
                    }
                  </ol>
                </div>
              }
            </section>
            <section>
              <p class="eyebrow mb-3 text-lg text-mist">Clasificación</p>
              <app-standings-table [big]="true" />
            </section>
          </div>
        }
      </div>
      @if (gala.mode()) {
        <app-gala />
      }
    } @else if (session.loadError(); as error) {
      <p class="heading p-20 text-center text-5xl text-flare">{{ error }}</p>
    }
  `,
})
export class TvPage {
  protected readonly session = inject(TournamentSession);
  protected readonly gala = inject(GalaViewer);
  readonly id = input.required<string>();

  protected readonly voting = computed(() => {
    const t = this.session.tournament();
    return !!t && votingOpen(t);
  });

  protected readonly joinUrl = computed(() => {
    const t = this.session.tournament();
    return t ? tournamentUrl(location.origin, t) : '';
  });

  constructor() {
    effect(() => void this.session.open(this.id().toUpperCase()));
    const root = inject(DOCUMENT).documentElement;
    root.classList.add('tv-screen');
    const releaseWakeLock = keepAwake();
    inject(DestroyRef).onDestroy(() => {
      root.classList.remove('tv-screen');
      releaseWakeLock();
    });
  }

  protected readonly current = computed(() => {
    const t = this.session.tournament();
    return t ? (t.matches.find((m) => m.status === 'live') ?? nextMatch(t)) : null;
  });

  protected readonly upcoming = computed(() => {
    const t = this.session.tournament();
    const current = this.current();
    if (!t || !current) return [];
    return t.matches.filter((m) => m.status === 'pending' && m.id !== current.id).slice(0, 3);
  });

  protected readonly lastPick = computed(() => {
    const picks = this.session.tournament()?.draw.picks ?? [];
    return picks[picks.length - 1] ?? null;
  });

  protected readonly championClub = computed(() => {
    const final = this.session.tournament()?.matches.find((m) => m.phase === 'final');
    const winner = final ? winnerOf(final) : null;
    return winner ? this.session.teamName(winner) : '';
  });

  protected readonly championNames = computed(() => {
    const t = this.session.tournament();
    const ids = t ? champions(t) : null;
    return ids ? ids.map((id) => this.session.personName(id)).join(' + ') : '';
  });

  protected label(m: Match): string {
    return m.phase === 'group' ? `Liguilla · Jornada ${m.round}` : PHASE_LABELS[m.phase];
  }
}

/** Keeps the screen on while the page is open, asking again whenever it comes back into view. */
function keepAwake(): () => void {
  if (!('wakeLock' in navigator)) return () => undefined;
  let lock: WakeLockSentinel | null = null;
  const request = () => {
    if (document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(
      (sentinel) => (lock = sentinel),
      () => undefined,
    );
  };
  request();
  document.addEventListener('visibilitychange', request);
  return () => {
    document.removeEventListener('visibilitychange', request);
    void lock?.release();
  };
}
