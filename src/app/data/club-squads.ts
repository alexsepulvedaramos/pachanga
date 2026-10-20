import { Injectable, signal } from '@angular/core';
import { ClubSquadsFile, EditionIndexEntry, RatedPlayer } from '../domain/club-ratings';
import { findClub } from '../domain/club-match';

/** Real squads (from the same EA data as the club ratings), loaded once on demand. */
@Injectable({ providedIn: 'root' })
export class ClubSquads {
  private readonly data = signal<ClubSquadsFile | null>(null);
  private loading: Promise<void> | null = null;

  /** Loads the newest edition's squads. Safe to call repeatedly. */
  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const index = (await (await fetch('data/clubs/index.json')).json()) as EditionIndexEntry[];
        const file = index.find((e) => e.squadsFile)?.squadsFile;
        if (!file) return;
        this.data.set((await (await fetch(`data/clubs/${file}`)).json()) as ClubSquadsFile);
      } catch {
        this.loading = null; // offline: try again next time
      }
    })();
    return this.loading;
  }

  /** Squad for a club as typed in the tournament ("Man City", "Barça"…), or null if unknown. */
  squadFor(clubName: string): { name: string; players: RatedPlayer[] } | null {
    const data = this.data();
    if (!data) return null;
    const match = findClub(data.clubs.map((c) => c.name), clubName);
    return match ? data.clubs.find((c) => c.name === match)! : null;
  }
}
