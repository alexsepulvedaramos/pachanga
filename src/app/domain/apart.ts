import { DrawState, Id, Tournament } from './types';

/** People who must not end up on the same team in the wheel, by participant (kept symmetric). */
export type Apart = Record<Id, Id[]>;

export function keepsApart(apart: Apart, a: Id, b: Id): boolean {
  return !!apart[a]?.includes(b) || !!apart[b]?.includes(a);
}

/** Everyone `id` must not be paired with. */
export function apartFrom(apart: Apart, id: Id): Id[] {
  return Object.keys(apart).filter((other) => other !== id && keepsApart(apart, id, other));
}

/** Adds the restriction between two people, or removes it if it was there. */
export function toggleApart(apart: Apart, a: Id, b: Id): Apart {
  if (a === b) return apart;
  const next: Apart = {};
  for (const [id, others] of Object.entries(apart)) next[id] = others.filter((o) => !(id === a && o === b) && !(id === b && o === a));
  if (!keepsApart(apart, a, b)) {
    next[a] = [...(next[a] ?? []), b];
    next[b] = [...(next[b] ?? []), a];
  }
  for (const id of Object.keys(next)) if (next[id].length === 0) delete next[id];
  return next;
}

/** Whether everybody without a club yet can still be placed without breaking a restriction. */
function completable(t: Tournament, apart: Apart, picks: DrawState['picks']): boolean {
  const members = new Map<string, Id[]>(t.clubs.map((club) => [club, []]));
  for (const { participantId, club } of picks) members.get(club)!.push(participantId);
  const assigned = new Set(picks.map((p) => p.participantId));
  const todo = t.participants.filter((p) => !assigned.has(p.id)).map((p) => p.id);

  const place = (i: number): boolean => {
    if (i === todo.length) return true;
    let triedEmpty = false;
    for (const ids of members.values()) {
      if (ids.length >= 2) continue;
      if (ids.length === 0) {
        if (triedEmpty) continue; // empty clubs are interchangeable
        triedEmpty = true;
      } else if (keepsApart(apart, todo[i], ids[0])) {
        continue;
      }
      ids.push(todo[i]);
      const ok = place(i + 1);
      ids.pop();
      if (ok) return true;
    }
    return false;
  };
  return place(0);
}

/**
 * Clubs `participantId` can be drawn into: the partner already there is fine with them and the
 * rest of the players can still be placed afterwards. Empty when the restrictions can't be met.
 */
export function allowedClubs(t: Tournament, participantId: Id, apart: Apart): Set<string> {
  const allowed = new Set<string>();
  for (const club of new Set(t.clubs)) {
    const taken = t.draw.picks.filter((p) => p.club === club);
    if (taken.length >= 2) continue;
    if (taken.some((p) => keepsApart(apart, participantId, p.participantId))) continue;
    if (completable(t, apart, [...t.draw.picks, { participantId, club }])) allowed.add(club);
  }
  return allowed;
}

/** Whether a draw exists at all that respects every restriction, from scratch. */
export function drawIsPossible(t: Tournament, apart: Apart): boolean {
  return completable(t, apart, []);
}
