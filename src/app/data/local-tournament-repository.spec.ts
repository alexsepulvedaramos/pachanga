import { beforeEach, describe, expect, it } from 'vitest';
import { LocalTournamentRepository } from './local-tournament-repository';
import { NameTakenError } from './tournament-repository';
import { createTournament, DEFAULT_CONFIG } from '../domain/tournament';
import { Tournament } from '../domain/types';

const PIN = '1234';
const ALEX_PHONE = 'a'.repeat(32);
const BEA_PHONE = 'b'.repeat(32);

function tournament(): Tournament {
  const t = createTournament({
    id: 'DEMOCLAIM',
    name: 'Claims',
    participantNames: ['Alex', 'Bea', 'Carla', 'Dani', 'Eva', 'Fer'],
    clubs: ['A', 'B', 'C'],
    config: { ...DEFAULT_CONFIG, ballonDor: true, seed: 1 },
  });
  // Straight to the end so the Ballon d'Or vote is open.
  return { ...t, stage: 'finished' };
}

describe('names taken by phones', () => {
  let repo: LocalTournamentRepository;
  const claimed = async () => (await repo.load('DEMOCLAIM'))!.tournament.claimed;

  beforeEach(async () => {
    sessionStorage.clear();
    repo = new LocalTournamentRepository();
    await repo.create(tournament(), PIN);
  });

  it('gives each name to one phone only', async () => {
    await repo.claim('DEMOCLAIM', 'p1', ALEX_PHONE);
    await expect(repo.claim('DEMOCLAIM', 'p1', BEA_PHONE)).rejects.toBeInstanceOf(NameTakenError);
    expect(await claimed()).toEqual(['p1']);
  });

  it('lets a phone switch names, freeing the one it had', async () => {
    await repo.claim('DEMOCLAIM', 'p2', ALEX_PHONE); // picked Bea by mistake
    await repo.claim('DEMOCLAIM', 'p1', ALEX_PHONE);
    expect(await claimed()).toEqual(['p1']);
    await repo.claim('DEMOCLAIM', 'p2', BEA_PHONE);
    expect(await claimed()).toEqual(['p1', 'p2']);
  });

  it('can delete the ballot cast under a name picked by mistake when letting it go', async () => {
    await repo.claim('DEMOCLAIM', 'p2', ALEX_PHONE);
    await repo.castVote('DEMOCLAIM', 'p2', ['p1', 'p3', 'p4'], ALEX_PHONE);
    await repo.release('DEMOCLAIM', 'p2', ALEX_PHONE, true);

    const t = (await repo.load('DEMOCLAIM'))!.tournament;
    expect(t.claimed).toEqual([]);
    expect(t.ballonDor?.voters).toEqual([]);
    // The real Bea can now take her name and vote.
    await repo.castVote('DEMOCLAIM', 'p2', ['p3', 'p4', 'p5'], BEA_PHONE);
    expect((await repo.load('DEMOCLAIM'))!.tournament.ballonDor?.voters).toEqual(['p2']);
  });

  it("won't let a phone vote under a name another phone holds", async () => {
    await repo.claim('DEMOCLAIM', 'p2', BEA_PHONE);
    await expect(repo.castVote('DEMOCLAIM', 'p2', ['p1', 'p3', 'p4'], ALEX_PHONE)).rejects.toBeInstanceOf(
      NameTakenError,
    );
  });

  it('lets the admin free a name, keeping its ballot', async () => {
    await repo.castVote('DEMOCLAIM', 'p2', ['p1', 'p3', 'p4'], BEA_PHONE);
    await repo.adminRelease('DEMOCLAIM', PIN, 'p2');
    const t = (await repo.load('DEMOCLAIM'))!.tournament;
    expect(t.claimed).toEqual([]);
    expect(t.ballonDor?.voters).toEqual(['p2']);
  });
});

describe("the demo's Ballon d'Or", () => {
  it('has its made-up players vote by themselves, leaving the names taken to vote', async () => {
    sessionStorage.clear();
    const repo = new LocalTournamentRepository();
    const t = tournament();
    await repo.create({ ...t, stage: 'knockout', demo: true }, PIN);
    await repo.claim('DEMOCLAIM', 'p1', ALEX_PHONE);
    const before = (await repo.load('DEMOCLAIM'))!;

    // The final is entered: the vote opens and everyone but Alex has voted.
    await repo.save({ ...before.tournament, stage: 'finished' }, PIN, before.version);
    const voters = (await repo.load('DEMOCLAIM'))!.tournament.ballonDor?.voters ?? [];
    expect(voters).toHaveLength(t.participants.length - 1);
    expect(voters).not.toContain('p1');

    await repo.castVote('DEMOCLAIM', 'p1', ['p2', 'p3', 'p4'], ALEX_PHONE);
    expect((await repo.load('DEMOCLAIM'))!.tournament.ballonDor?.closedAt).toBeTruthy();
  });
});
