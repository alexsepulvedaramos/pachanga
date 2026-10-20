/** Wheel/segment colours, assigned to clubs by their position in the tournament. */
export const CLUB_COLORS = ['#c8ff2e', '#18d6ff', '#ff3b6b', '#ffc83d', '#f2f5ff', '#a78bfa', '#ff8a3d'];

export function clubColor(clubs: readonly string[], club: string): string {
  const index = clubs.indexOf(club);
  return CLUB_COLORS[(index < 0 ? 0 : index) % CLUB_COLORS.length];
}
