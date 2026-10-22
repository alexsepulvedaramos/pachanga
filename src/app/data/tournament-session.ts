import { computed, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Id, KnockoutChoices, Tournament } from '../domain/types';
import { Rng } from '../domain/rng';
import { TournamentStore } from './tournament-store';
import {
  ConflictError,
  NameTakenError,
  PinLockedError,
  TournamentRepository,
  WrongPinError,
} from './tournament-repository';
import { validateVote } from '../domain/ballon-dor';
import { MatchResult, playerMakeChoice, playerStartMatch, reportResult } from '../domain/tournament';
import { ToastService } from '../ui/toast.service';

/** Saves retried on top of someone else's change before giving up. */
const MAX_SAVE_ATTEMPTS = 3;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One open tournament: live state, admin rights and the actions that change it. */
@Injectable()
export class TournamentSession {
  private readonly store = inject(TournamentStore);
  private readonly toast = inject(ToastService);
  private stopWatching: (() => void) | null = null;
  private version = 0;

  readonly tournament = signal<Tournament | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly pin = signal<string | null>(null);
  readonly isAdmin = computed(() => this.pin() !== null);
  /** Who is using this device: a name only this phone holds. Remembered per tournament. */
  readonly me = signal<Id | null>(null);
  /** This phone follows the tournament without a name: it can't vote or get turn notices. */
  readonly guest = signal(false);
  /** Neither a name nor a guest yet: the phone has to say who it is first. */
  readonly needsIdentity = computed(() => !!this.tournament() && !this.me() && !this.guest());
  /** Names some phone holds. */
  readonly claimed = computed(() => new Set(this.tournament()?.claimed ?? []));

  readonly teams = computed(() => new Map((this.tournament()?.teams ?? []).map((t) => [t.id, t])));
  readonly people = computed(
    () => new Map((this.tournament()?.participants ?? []).map((p) => [p.id, p])),
  );

  constructor() {
    // Phones lock and drop the realtime socket without telling anyone: catch up when the app
    // comes back, when the connection returns, and every so often as a fallback.
    const onVisible = () => document.visibilityState === 'visible' && void this.refresh();
    const onOnline = () => void this.refresh();
    const poll = setInterval(() => document.visibilityState === 'visible' && this.refresh(), 45_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => {
      this.stopWatching?.();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    });
  }

  /** Reloads the tournament if someone else saved a newer version. */
  async refresh(): Promise<void> {
    const id = this.tournament()?.id;
    if (!id || this.saving()) return;
    try {
      const stored = await this.store.load(id);
      if (stored.version > this.version) {
        this.version = stored.version;
        this.tournament.set(stored.tournament);
      }
    } catch {
      /* offline: the next refresh will catch up */
    }
  }

  async open(id: string): Promise<void> {
    this.stopWatching?.();
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const stored = await this.store.load(id);
      this.version = stored.version;
      this.tournament.set(stored.tournament);
      this.pin.set(this.store.savedPin(id));
      this.guest.set(this.store.isGuest(id));
      const me = this.store.savedIdentity(id);
      this.me.set(me && stored.tournament.participants.some((p) => p.id === me) ? me : null);
      void this.keepName();
      this.stopWatching = (await this.store.repo(id)).watch(
        id,
        (next) => {
          if (next.version <= this.version) return;
          this.version = next.version;
          this.tournament.set(next.tournament);
        },
        () => void this.refresh(),
      );
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  async unlock(pin: string): Promise<boolean> {
    const t = this.tournament();
    if (!t) return false;
    const ok = await (await this.store.repo(t.id)).verifyPin(t.id, pin);
    if (ok) {
      this.store.rememberPin(t.id, pin);
      this.pin.set(pin);
    }
    return ok;
  }

  private setMe(participantId: Id | null): void {
    const t = this.tournament();
    if (!t) return;
    this.store.rememberIdentity(t.id, participantId);
    this.me.set(participantId);
  }

  /** Takes a name for this phone (letting go of any other it had). False if another phone has it. */
  async claim(participantId: Id): Promise<boolean> {
    const t = this.tournament();
    if (!t) return false;
    try {
      await (await this.store.repo(t.id)).claim(t.id, participantId, this.store.deviceToken(t.id));
      this.setMe(participantId);
      this.setGuest(false);
      await this.refresh();
      return true;
    } catch (error) {
      this.toast.error(error);
      return false;
    }
  }

  /** Lets go of this phone's name, and with `dropVote` of the ballot it cast under it. */
  async leaveName(dropVote: boolean): Promise<boolean> {
    const t = this.tournament();
    const me = this.me();
    if (!t || !me) return false;
    try {
      await (await this.store.repo(t.id)).release(t.id, me, this.store.deviceToken(t.id), dropVote);
      if (dropVote) this.store.rememberBallot(t.id, me, null);
      this.setMe(null);
      await this.refresh();
      return true;
    } catch (error) {
      this.toast.error(error);
      return false;
    }
  }

  /** Follow the tournament without a name, or (false) go back to picking one. */
  setGuest(guest: boolean): void {
    const t = this.tournament();
    if (!t) return;
    this.store.rememberGuest(t.id, guest);
    this.guest.set(guest);
  }

  /** Frees a name whatever phone holds it, e.g. for someone who changed phones. */
  async releaseName(participantId: Id): Promise<boolean> {
    return this.adminCall((repo, id, pin) => repo.adminRelease(id, pin, participantId));
  }

  /**
   * A name remembered from before names were exclusive, or from a reload: takes it if it's free,
   * and forgets it if another phone has it.
   */
  private async keepName(): Promise<void> {
    const t = this.tournament();
    const me = this.me();
    if (!t || !me) return;
    try {
      await (await this.store.repo(t.id)).claim(t.id, me, this.store.deviceToken(t.id));
      await this.refresh();
    } catch (error) {
      if (error instanceof NameTakenError) {
        this.setMe(null);
        this.toast.error(`${this.personName(me)} ya está en otro móvil: elige quién eres.`);
      }
      // offline: keep the name for now, the server will check it when it matters
    }
  }

  lock(): void {
    const t = this.tournament();
    if (t) this.store.forgetPin(t.id);
    this.pin.set(null);
  }

  /**
   * Applies a domain action locally, then persists it. If someone else saved in the meantime (a
   * vote, another admin device), the action runs again on their version: actions are pure, so
   * nothing is lost unless it no longer makes sense there. Rolls back if the save fails.
   */
  async apply(action: (t: Tournament, rng: Rng) => Tournament): Promise<boolean> {
    const pin = this.pin();
    if (!this.tournament() || !pin) {
      this.toast.error('Desbloquea el modo admin para hacer cambios.');
      return false;
    }
    this.saving.set(true);
    try {
      for (let attempt = 1; ; attempt++) {
        const current = this.tournament()!;
        let next: Tournament;
        try {
          next = action(current, Math.random);
        } catch (error) {
          if (attempt === 1) this.toast.error(error);
          else this.toast.error(`Alguien ha cambiado el torneo a la vez y ya no se puede: ${errorText(error)}`);
          return false;
        }
        this.tournament.set(next);
        try {
          const stored = await (await this.store.repo(next.id)).save(next, pin, this.version);
          this.version = stored.version;
          return true;
        } catch (error) {
          if (error instanceof ConflictError && attempt < MAX_SAVE_ATTEMPTS) {
            const fresh = await this.store.load(next.id);
            this.version = fresh.version;
            this.tournament.set(fresh.tournament);
            continue;
          }
          this.toast.error(error);
          if (error instanceof WrongPinError || error instanceof PinLockedError) this.lock();
          if (error instanceof ConflictError) {
            const fresh = await this.store.load(next.id);
            this.version = fresh.version;
            this.tournament.set(fresh.tournament);
          } else {
            this.tournament.set(current);
          }
          return false;
        }
      }
    } catch (error) {
      this.toast.error(error); // could not even reload: offline
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** The person using this phone starts the match that's up, which they play in. */
  startAsPlayer(matchId: Id): Promise<boolean> {
    return this.asPlayer(
      (t, me) => playerStartMatch(t, me, matchId, Math.random),
      (repo, id, me, token) => repo.startMatch(id, me, token, matchId),
    );
  }

  /** The person using this phone enters the result of the match they're playing. */
  reportResult(matchId: Id, result: MatchResult): Promise<boolean> {
    return this.asPlayer(
      (t, me) => reportResult(t, me, matchId, result),
      (repo, id, me, token) => repo.reportResult(id, me, token, matchId, result),
    );
  }

  /** The person using this phone makes their team's pending knockout choice. */
  chooseAsPlayer(choice: Partial<KnockoutChoices>): Promise<boolean> {
    return this.asPlayer(
      (t, me) => playerMakeChoice(t, me, choice),
      (repo, id, me, token) => repo.makeChoice(id, me, token, choice),
    );
  }

  /**
   * Something a player does from their phone: checked here first with the same rules (and
   * messages) the server uses, then sent, then caught up with.
   */
  private async asPlayer(
    check: (t: Tournament, me: Id) => unknown,
    send: (repo: TournamentRepository, id: string, me: Id, token: string) => Promise<void>,
  ): Promise<boolean> {
    const t = this.tournament();
    const me = this.me();
    if (!t || !me) return false;
    this.saving.set(true);
    try {
      check(t, me);
      await send(await this.store.repo(t.id), t.id, me, this.store.deviceToken(t.id));
      this.saving.set(false);
      await this.refresh();
      return true;
    } catch (error) {
      this.toast.error(error);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Casts (or changes) the Ballon d'Or podium of the person using this phone. */
  async castVote(picks: Id[]): Promise<boolean> {
    const t = this.tournament();
    const me = this.me();
    if (!t || !me) return false;
    try {
      validateVote(t, me, picks);
      await (await this.store.repo(t.id)).castVote(t.id, me, picks, this.store.deviceToken(t.id));
      this.store.rememberBallot(t.id, me, picks);
      await this.refresh();
      return true;
    } catch (error) {
      this.toast.error(error);
      return false;
    }
  }

  /** Podium this phone voted for the person using it, if any. */
  myBallot(): Id[] | null {
    const t = this.tournament();
    const me = this.me();
    return t && me ? (this.store.savedBallots(t.id)[me] ?? null) : null;
  }

  async closeVoting(): Promise<boolean> {
    return this.adminCall((repo, id, pin) => repo.closeVoting(id, pin));
  }

  async resetVote(voterId: Id): Promise<boolean> {
    return this.adminCall((repo, id, pin) => repo.resetVote(id, pin, voterId));
  }

  /** Runs a server-side admin action that changes the tournament, then catches up with it. */
  private async adminCall(
    call: (repo: TournamentRepository, id: string, pin: string) => Promise<void>,
  ): Promise<boolean> {
    const t = this.tournament();
    const pin = this.pin();
    if (!t || !pin) {
      this.toast.error('Desbloquea el modo admin para hacer cambios.');
      return false;
    }
    try {
      await call(await this.store.repo(t.id), t.id, pin);
      await this.refresh();
      return true;
    } catch (error) {
      this.toast.error(error);
      if (error instanceof WrongPinError || error instanceof PinLockedError) this.lock();
      return false;
    }
  }

  teamName(id: Id): string {
    return this.teams().get(id)?.club ?? '—';
  }

  personName(id: Id): string {
    return this.people().get(id)?.name ?? '—';
  }

  memberNames(teamId: Id): string[] {
    const team = this.teams().get(teamId);
    return team ? team.memberIds.map((id) => this.personName(id)) : [];
  }
}
