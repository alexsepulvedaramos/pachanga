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
