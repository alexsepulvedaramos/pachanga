export type Id = string;

export interface Participant {
  id: Id;
  name: string;
  disqualified?: boolean;
}

export interface Team {
  id: Id;
  club: string;
  /** One or two participants. A team with a single active member is a "solo" team. */
  memberIds: Id[];
  /** Fixed partner drawn for the knockout stage when the team is solo. */
  knockoutPartnerId?: Id;
}

export type Phase = 'group' | 'playoff' | 'semi' | 'third' | 'final';

export type MatchStatus = 'pending' | 'live' | 'done';

export interface Goal {
  /** Team credited with the goal. */
  teamId: Id;
  scorerId: Id | null;
}

export interface Match {
  id: Id;
  phase: Phase;
  /** Group round (1-based) for group matches. */
  round?: number;
  homeId: Id;
  awayId: Id;
  status: MatchStatus;
  /** Final score, extra time included. */
  homeGoals: number | null;
  awayGoals: number | null;
  extraTime?: boolean;
  homePens?: number | null;
  awayPens?: number | null;
  /** Partner drawn for a solo team for this single match, keyed by team id. */
  standIns?: Record<Id, Id>;
  goals?: Goal[];
}

export type TiebreakCriterion =
  | 'goalDifference'
  | 'goalsFor'
  | 'goalsAgainst'
  | 'headToHeadPoints'
  | 'headToHeadGoalDifference'
  | 'wins'
  | 'lot';

export interface HalfMinutes {
  group: number;
  playoff: number;
  semi: number;
  third: number;
  final: number;
}

export interface TournamentConfig {
  tiebreakers: TiebreakCriterion[];
  trackScorers: boolean;
  halfMinutes: HalfMinutes;
  /** Time lost between matches: controller swap, menus, kits. */
  changeoverMinutes: number;
  /** Seed used for the drawing of lots tiebreaker and other deterministic draws. */
  seed: number;
}

export type Stage = 'setup' | 'draw' | 'groups' | 'knockout' | 'finished';

export interface KnockoutChoices {
  /** Team picked by the best-ranked playoff team as its opponent. */
  playoffOpponentId?: Id;
  /** Whether the order-chooser's playoff match is played first. */
  playoffChooserFirst?: boolean;
  /** Team picked by the group winner as its semi-final opponent. */
  semiOpponentId?: Id;
  /** Whether the order-chooser's semi-final is played first. */
  semiChooserFirst?: boolean;
}

export interface DrawState {
  /** Participant ids in entrance order. */
  order: Id[];
  /** Club drawn by each participant, in the same order. */
  picks: { participantId: Id; club: string }[];
}

export interface Tournament {
  id: Id;
  name: string;
  createdAt: string;
  stage: Stage;
  config: TournamentConfig;
  participants: Participant[];
  clubs: string[];
  draw: DrawState;
  teams: Team[];
  matches: Match[];
  knockout: KnockoutChoices;
  /** Final group order frozen when the group stage ends. */
  groupRanking?: Id[];
  /** Id of the match currently being played, if any. */
  liveMatchId?: Id;
}
