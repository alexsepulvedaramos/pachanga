import { describe, expect, it } from 'vitest';
import { groupMatches, recordResult } from '../domain/tournament';
import { buildDemoTournament } from './demo';

describe('buildDemoTournament', () => {
  it('stops on the last group match, being played', () => {
    const t = buildDemoTournament();
    const left = groupMatches(t).filter((m) => m.status !== 'done');
    expect(t.stage).toBe('groups');
    expect(left).toHaveLength(1);
    expect(left[0].status).toBe('live');

    const after = recordResult(t, left[0].id, { homeGoals: 1, awayGoals: 0, goals: [] });
    expect(after.stage).toBe('knockout');
  });
});
