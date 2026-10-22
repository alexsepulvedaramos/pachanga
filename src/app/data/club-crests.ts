import { Injectable, signal } from '@angular/core';
import { findClub } from '../domain/club-match';

/** Crests of the big five leagues' clubs, kept in data/clubs/crests by the ratings update. */
@Injectable({ providedIn: 'root' })
export class ClubCrests {
  private readonly clubs = signal<{ id: number; name: string }[]>([]);
  private loading: Promise<void> | null = null;

  /** Loads the list of clubs with a crest. Safe to call repeatedly. */
  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        this.clubs.set(await (await fetch('data/clubs/crests.json')).json());
      } catch {
        this.loading = null; // offline: try again next time
      }
    })();
    return this.loading;
  }

  /** Crest image for a club as typed in the tournament ("Man City", "Barça"…), or null if unknown. */
  urlFor(clubName: string): string | null {
    const clubs = this.clubs();
    const match = findClub(
      clubs.map((c) => c.name),
      clubName,
    );
    const club = match ? clubs.find((c) => c.name === match) : undefined;
    return club ? `data/clubs/crests/${club.id}.png` : null;
  }
}
