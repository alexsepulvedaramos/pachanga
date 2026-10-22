import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Tournament } from '../domain/types';
import { buildDemoTournament } from './demo';
import { TournamentSession } from './tournament-session';
import { TournamentStore } from './tournament-store';
import { ConflictError, StoredTournament } from './tournament-repository';

/** A server holding one tournament, where someone else can save behind the session's back. */
function fakeServer(initial: Tournament) {
  const server = { stored: { tournament: initial, version: 1 } as StoredTournament };
  const repo = {
    async save(tournament: Tournament, _pin: string, expected: number): Promise<StoredTournament> {
      if (expected !== server.stored.version) throw new ConflictError();
      server.stored = { tournament, version: expected + 1 };
      return server.stored;
    },
    watch: () => () => undefined,
  };
  const store = {
    load: async () => server.stored,
    repo: async () => repo,
    savedPin: () => '0000',
    savedIdentity: () => null,
  };
  return { server, store };
}

describe('TournamentSession.apply', () => {
  let server: ReturnType<typeof fakeServer>['server'];

  beforeEach(async () => {
    const fake = fakeServer(buildDemoTournament());
    server = fake.server;
    TestBed.configureTestingModule({
      providers: [TournamentSession, { provide: TournamentStore, useValue: fake.store }],
    });
    await TestBed.inject(TournamentSession).open(fake.server.stored.tournament.id);
  });

  afterEach(() => TestBed.resetTestingModule());

  it("redoes the admin's change on top of a change saved meanwhile instead of dropping it", async () => {
    const session = TestBed.inject(TournamentSession);
    // Someone else renames the tournament after this device loaded it.
    server.stored = { tournament: { ...server.stored.tournament, name: 'Renamed elsewhere' }, version: 2 };
    const clubs = server.stored.tournament.clubs;

    const ok = await session.apply((t) => ({ ...t, clubs: [...t.clubs].reverse() }));

    expect(ok).toBe(true);
    expect(server.stored.version).toBe(3);
    expect(server.stored.tournament.name).toBe('Renamed elsewhere');
    expect(server.stored.tournament.clubs).toEqual([...clubs].reverse());
    expect(session.tournament()).toEqual(server.stored.tournament);
  });

  it('gives up, keeping the other version, when the change no longer applies to it', async () => {
    const session = TestBed.inject(TournamentSession);
    server.stored = { tournament: { ...server.stored.tournament, stage: 'finished' }, version: 2 };

    const ok = await session.apply((t) => {
      if (t.stage === 'finished') throw new Error('El torneo ya ha terminado.');
      return { ...t, name: 'Mine' };
    });

    expect(ok).toBe(false);
    expect(server.stored.version).toBe(2);
    expect(session.tournament()?.stage).toBe('finished');
  });
});
