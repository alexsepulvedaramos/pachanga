import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { TournamentSession } from '../../data/tournament-session';
import { KnockoutDecision } from '../../domain/knockout';
import { choosers, currentDecision, makeChoice } from '../../domain/tournament';
import { Id, KnockoutChoices, Tournament } from '../../domain/types';

/** What a team just chose, shown on every screen for a few seconds. */
export interface ChoiceReveal {
  chooserId: Id;
  kind: KnockoutDecision['kind'];
  /** The rival picked, for opponent choices. */
  opponentId?: Id;
  /** Whether they play first, for order choices. */
  first?: boolean;
}

const REVEAL_MS = 6000;

/**
 * The knockout "moment to choose": opens on every screen when a team has to pick a rival or the
 * order of play, lets that team's players (or the admin) choose, then reveals the choice to all.
 * It follows the tournament whether or not it is on screen, so nothing is missed behind another
 * overlay.
 */
@Injectable()
export class ChoiceMomentViewer {
  private readonly session = inject(TournamentSession);

  readonly decision = computed(() => {
    const t = this.session.tournament();
    return t ? currentDecision(t) : null;
  });
  readonly reveal = signal<ChoiceReveal | null>(null);
  /** The decision this screen closed, so it stays closed until the next one. */
  private readonly dismissed = signal<string | null>(null);

  readonly open = computed(() => !!this.reveal() || (!!this.decision() && this.dismissed() !== keyOf(this.decision())));

  /** Whether the person on this phone can make the pending choice, as a player of that team. */
  readonly mine = computed(() => {
    const t = this.session.tournament();
    const d = this.decision();
    const me = this.session.me();
    return !!t && !!d && !!me && choosers(t, d.chooserId).includes(me);
  });

  private last: KnockoutDecision | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const t = this.session.tournament();
      const d = this.decision();
      untracked(() => this.follow(t, d));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Picks a rival, or whether to play first, for the pending decision. */
  async choose(value: Id | boolean): Promise<void> {
    const d = this.decision();
    if (!d) return;
    const choice = choiceFor(d.kind, value);
    // The admin chooses with the PIN; a player of the team, from the phone holding their name.
    if (this.session.isAdmin()) await this.session.apply((t) => makeChoice(t, choice));
    else if (this.mine()) await this.session.chooseAsPlayer(choice);
  }

  show(): void {
    this.dismissed.set(null);
  }

  close(): void {
    clearTimeout(this.timer);
    this.reveal.set(null);
    this.dismissed.set(keyOf(this.decision()));
  }

  private follow(t: Tournament | null, d: KnockoutDecision | null): void {
    const previous = this.last;
    this.last = d;
    if (!t || !previous || keyOf(previous) === keyOf(d)) return;
    // The decision this screen was waiting on has been made: show what was chosen.
    const reveal: ChoiceReveal = { chooserId: previous.chooserId, kind: previous.kind };
    if (previous.kind === 'playoffOpponent') reveal.opponentId = t.knockout.playoffOpponentId;
    if (previous.kind === 'semiOpponent') reveal.opponentId = t.knockout.semiOpponentId;
    if (previous.kind === 'playoffOrder') reveal.first = t.knockout.playoffChooserFirst;
    if (previous.kind === 'semiOrder') reveal.first = t.knockout.semiChooserFirst;
    if (reveal.opponentId === undefined && reveal.first === undefined) return; // undone, not made
    this.reveal.set(reveal);
    this.dismissed.set(null);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reveal.set(null), REVEAL_MS);
  }
}

function keyOf(d: KnockoutDecision | null): string | null {
  return d ? `${d.kind}:${d.chooserId}` : null;
}

function choiceFor(kind: KnockoutDecision['kind'], value: Id | boolean): Partial<KnockoutChoices> {
  switch (kind) {
    case 'playoffOpponent':
      return { playoffOpponentId: value as Id };
    case 'semiOpponent':
      return { semiOpponentId: value as Id };
    case 'playoffOrder':
      return { playoffChooserFirst: value as boolean };
    case 'semiOrder':
      return { semiChooserFirst: value as boolean };
  }
}
