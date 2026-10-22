import { Tournament } from '../domain/types';

export interface StoredTournament {
  tournament: Tournament;
  version: number;
}

export class ConflictError extends Error {
  constructor() {
    super('Alguien ha cambiado el torneo a la vez. Se ha recargado la última versión.');
  }
}

export class WrongPinError extends Error {
  constructor() {
    super('PIN incorrecto.');
  }
}

export class PinLockedError extends Error {
  constructor() {
    super('Demasiados PIN incorrectos. Espera 10 minutos y vuelve a probar.');
  }
}

export class VoteTakenError extends Error {
  constructor() {
    super('Ese voto se emitió desde otro móvil. Si no fuiste tú, pide al admin que lo borre.');
  }
}

export class NameTakenError extends Error {
  constructor() {
    super('Ese nombre ya lo tiene otro móvil. Si es tuyo, pide al admin que lo libere.');
  }
}

export class VotingClosedError extends Error {
  constructor() {
    super('La votación ya está cerrada.');
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('No existe ningún torneo con ese código.');
  }
}

/**
 * Persistence for tournaments. Anyone with the code can read and watch a tournament; writes
 * need the admin PIN and the version they were based on (optimistic concurrency).
 */
export abstract class TournamentRepository {
  abstract create(tournament: Tournament, pin: string): Promise<StoredTournament>;
  abstract load(id: string): Promise<StoredTournament | null>;
  abstract save(tournament: Tournament, pin: string, expectedVersion: number): Promise<StoredTournament>;
  abstract verifyPin(id: string, pin: string): Promise<boolean>;
  /**
   * Calls back on every change made elsewhere, and `onReconnect` whenever the live channel
   * (re)connects, since changes may have been missed meanwhile. Returns an unsubscribe function.
   */
  abstract watch(
    id: string,
    onChange: (stored: StoredTournament) => void,
    onReconnect?: () => void,
  ): () => void;

  /** Deletes a tournament for everyone. Needs the admin PIN. */
  abstract delete(id: string, pin: string): Promise<void>;

  /**
   * Takes a name for the phone holding `token`, letting go of any other name it had. Throws
   * NameTakenError if another phone holds it.
   */
  abstract claim(id: string, participantId: string, token: string): Promise<void>;
  /** The phone holding a name lets it go, optionally deleting the ballot it cast under it. */
  abstract release(id: string, participantId: string, token: string, dropVote: boolean): Promise<void>;
  /** Frees a name whatever phone holds it. Needs the admin PIN. */
  abstract adminRelease(id: string, pin: string, participantId: string): Promise<void>;

  /**
   * Casts or changes a participant's Ballon d'Or podium. The first ballot is tied to `token`, kept
   * on the phone that cast it: only that token can change it.
   */
  abstract castVote(id: string, voterId: string, picks: string[], token: string): Promise<void>;
  /** Closes the vote with the ballots cast so far. Needs the admin PIN. */
  abstract closeVoting(id: string, pin: string): Promise<void>;
  /** Deletes a participant's ballot so they can vote again. Needs the admin PIN. */
  abstract resetVote(id: string, pin: string, voterId: string): Promise<void>;

  /** Registers this device for push notifications addressed to one participant. */
  abstract subscribePush(id: string, participantId: string, subscription: PushSubscriptionJSON): Promise<void>;
  abstract unsubscribePush(endpoint: string): Promise<void>;
}

export async function hashPin(id: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${id}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newTournamentCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
