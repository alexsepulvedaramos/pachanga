import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { PUSH_PUBLIC_KEY } from '../config';
import { DEMO_PREFIX, TournamentStore } from './tournament-store';

export type PushAvailability =
  /** Works here. */
  | 'ready'
  /** iPhone/iPad in the browser: Apple only allows push for apps added to the home screen. */
  | 'needs-install'
  /** Blocked by the user in the browser settings. */
  | 'blocked'
  /** No service worker (development) or no push support, or a demo tournament. */
  | 'unavailable';

const key = (tournamentId: string) => `pachanga:push:${tournamentId}`;

/** Push notifications for "it's your turn", per tournament and per person. */
@Injectable({ providedIn: 'root' })
export class PushNotifications {
  private readonly swPush = inject(SwPush);
  private readonly store = inject(TournamentStore);

  /** Participant this device receives notifications for, per tournament id. */
  readonly subscribedAs = signal<Record<string, string>>({});

  availability(tournamentId: string): PushAvailability {
    if (tournamentId.startsWith(DEMO_PREFIX)) return 'unavailable';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      matchMedia('(display-mode: standalone)').matches;
    if (ios && !standalone) return 'needs-install';
    if (!this.swPush.isEnabled || !('Notification' in window)) return 'unavailable';
    if (Notification.permission === 'denied') return 'blocked';
    return 'ready';
  }

  isOn(tournamentId: string, participantId: string): boolean {
    return this.readSaved(tournamentId) === participantId;
  }

  async enable(tournamentId: string, participantId: string): Promise<void> {
    const subscription = await this.swPush.requestSubscription({ serverPublicKey: PUSH_PUBLIC_KEY });
    await (await this.store.repo(tournamentId)).subscribePush(tournamentId, participantId, subscription.toJSON());
    this.save(tournamentId, participantId);
  }

  async disable(tournamentId: string): Promise<void> {
    const subscription = await firstValueFrom(this.swPush.subscription);
    if (subscription) {
      await (await this.store.repo(tournamentId)).unsubscribePush(subscription.endpoint);
    }
    this.save(tournamentId, null);
  }

  /** Keeps notifications going to the right person after "who are you" changes. */
  async follow(tournamentId: string, participantId: string | null): Promise<void> {
    const saved = this.readSaved(tournamentId);
    if (!saved || saved === participantId) return;
    if (participantId) await this.enable(tournamentId, participantId);
    else await this.disable(tournamentId);
  }

  private readSaved(tournamentId: string): string | null {
    const known = this.subscribedAs()[tournamentId];
    if (known !== undefined) return known || null;
    try {
      return localStorage.getItem(key(tournamentId));
    } catch {
      return null;
    }
  }

  private save(tournamentId: string, participantId: string | null): void {
    this.subscribedAs.update((map) => ({ ...map, [tournamentId]: participantId ?? '' }));
    try {
      if (participantId) localStorage.setItem(key(tournamentId), participantId);
      else localStorage.removeItem(key(tournamentId));
    } catch {
      /* remembered for this visit only */
    }
  }
}

