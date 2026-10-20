import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TournamentStore } from './tournament-store';
import { LocalTournamentRepository } from './local-tournament-repository';
import { buildDemoTournament, DEMO_PIN } from './demo';

describe('TournamentStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [LocalTournamentRepository] });
  });

  it('keeps the demo in this tab only, out of the recent list, one at a time', async () => {
    const store = TestBed.inject(TournamentStore);
    const first = buildDemoTournament();
    await store.create(first, DEMO_PIN);
    const second = buildDemoTournament();
    await store.create(second, DEMO_PIN);

    expect(store.recent()).toEqual([]);
    expect(Object.keys(localStorage).filter((k) => k.includes('DEMO'))).toEqual([]);
    await expect(store.load(first.id)).rejects.toThrow();
    expect((await store.load(second.id)).tournament.id).toBe(second.id);
    expect(store.isOwner(second.id)).toBe(true);
  });

  it('clears demos left behind by earlier versions', () => {
    localStorage.setItem('pachanga:tournament:DEMOABCD', '{}');
    localStorage.setItem('pachanga:pin:DEMOABCD', '0000');
    localStorage.setItem('pachanga:recent', JSON.stringify([{ id: 'DEMOABCD', name: 'Demo' }, { id: 'REAL01', name: 'Real' }]));
    const store = TestBed.inject(TournamentStore);
    expect(store.recent()).toEqual([{ id: 'REAL01', name: 'Real' }]);
    expect(localStorage.getItem('pachanga:tournament:DEMOABCD')).toBeNull();
    expect(localStorage.getItem('pachanga:pin:DEMOABCD')).toBeNull();
  });

  it('forgets a tournament on this device without touching anything else', () => {
    localStorage.setItem('pachanga:recent', JSON.stringify([{ id: 'A1B2C3', name: 'Uno' }, { id: 'D4E5F6', name: 'Dos' }]));
    localStorage.setItem('pachanga:me:A1B2C3', 'p1');
    const store = TestBed.inject(TournamentStore);
    store.forget('A1B2C3');
    expect(store.recent().map((r) => r.id)).toEqual(['D4E5F6']);
    expect(localStorage.getItem('pachanga:me:A1B2C3')).toBeNull();
    expect(store.isOwner('D4E5F6')).toBe(false);
  });
});
