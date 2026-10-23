// src/app/domain/rng.ts
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function pick(items, rng) {
  if (items.length === 0) throw new Error("Cannot pick from an empty list");
  return items[Math.floor(rng() * items.length)];
}

// src/app/domain/standings.ts
var POINTS = { win: 3, draw: 1, loss: 0 };
function emptyRow(teamId) {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: []
  };
}
function isScored(match2) {
  return match2.status === "done" && match2.homeGoals !== null && match2.awayGoals !== null;
}
function tally(teamIds, matches) {
  const rows = new Map(teamIds.map((id) => [id, emptyRow(id)]));
  for (const match2 of matches) {
    if (!isScored(match2)) continue;
    const home = rows.get(match2.homeId);
    const away = rows.get(match2.awayId);
    if (!home || !away) continue;
    apply(home, match2.homeGoals, match2.awayGoals);
    apply(away, match2.awayGoals, match2.homeGoals);
  }
  return rows;
}
function apply(row, scored, conceded) {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.won++;
    row.points += POINTS.win;
    row.form.push("W");
  } else if (scored === conceded) {
    row.drawn++;
    row.points += POINTS.draw;
    row.form.push("D");
  } else {
    row.lost++;
    row.points += POINTS.loss;
    row.form.push("L");
  }
}
function computeStandings(teamIds, groupMatches2, tiebreakers, seed) {
  const rows = tally(teamIds, groupMatches2);
  const lotOrder = shuffle([...teamIds].sort(), seededRng(seed));
  const metric = (criterion, tied) => {
    switch (criterion) {
      case "goalDifference":
        return new Map(tied.map((id) => [id, rows.get(id).goalDifference]));
      case "goalsFor":
        return new Map(tied.map((id) => [id, rows.get(id).goalsFor]));
      case "goalsAgainst":
        return new Map(tied.map((id) => [id, -rows.get(id).goalsAgainst]));
      case "wins":
        return new Map(tied.map((id) => [id, rows.get(id).won]));
      case "headToHeadPoints": {
        const mini = tally(tied, groupMatches2);
        return new Map(tied.map((id) => [id, mini.get(id).points]));
      }
      case "headToHeadGoalDifference": {
        const mini = tally(tied, groupMatches2);
        return new Map(tied.map((id) => [id, mini.get(id).goalDifference]));
      }
      case "lot":
        return new Map(tied.map((id) => [id, -lotOrder.indexOf(id)]));
    }
  };
  const resolve = (tied, criteria) => {
    if (tied.length <= 1) return tied;
    if (criteria.length === 0) return [...tied].sort((a, b) => lotOrder.indexOf(a) - lotOrder.indexOf(b));
    const [criterion, ...rest] = criteria;
    const values = metric(criterion, tied);
    return groupByValue(tied, values).flatMap((block) => resolve(block, rest));
  };
  const byPoints = new Map(teamIds.map((id) => [id, rows.get(id).points]));
  const ordered = groupByValue([...teamIds], byPoints).flatMap(
    (block) => resolve(block, tiebreakers)
  );
  return ordered.map((id) => rows.get(id));
}
function groupByValue(ids, values) {
  const sorted = [...ids].sort((a, b) => values.get(b) - values.get(a));
  const blocks = [];
  for (const id of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && values.get(last[0]) === values.get(id)) last.push(id);
    else blocks.push([id]);
  }
  return blocks;
}

// src/app/domain/knockout.ts
var MIN_TEAMS = 3;
var MAX_TEAMS = 8;
var REPECHAGE = {
  legs: 1,
  firstRound: "playoff",
  choices: true,
  thirdPlace: true,
  directLabel: "Directo a semis",
  playoffLabel: "Repesca"
};
function knockoutFormat(teamCount) {
  switch (teamCount) {
    case 3:
      return {
        legs: 2,
        direct: 1,
        playoff: [2, 3],
        firstRound: "semi",
        choices: false,
        thirdPlace: false,
        directLabel: "Directo a la final",
        playoffLabel: "Semifinal"
      };
    case 4:
      return {
        legs: 2,
        direct: 0,
        playoff: [1, 2, 3, 4],
        firstRound: "semi",
        choices: false,
        thirdPlace: true,
        directLabel: "",
        playoffLabel: "Semifinales"
      };
    case 5:
      return { ...REPECHAGE, direct: 3, playoff: [4, 5] };
    case 6:
    case 7:
      return { ...REPECHAGE, direct: 2, playoff: [3, 4, 5, 6] };
    case 8:
      return {
        legs: 1,
        direct: 0,
        playoff: [1, 2, 3, 4, 5, 6, 7, 8],
        firstRound: "quarter",
        choices: false,
        thirdPlace: true,
        directLabel: "",
        playoffLabel: "Cuartos"
      };
    default:
      throw new Error(`Unsupported team count: ${teamCount}`);
  }
}
var QUARTER_SEEDS = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6]
];
function winnerOf(match2) {
  if (match2.status !== "done" || match2.homeGoals === null || match2.awayGoals === null) return null;
  if (match2.homeGoals > match2.awayGoals) return match2.homeId;
  if (match2.awayGoals > match2.homeGoals) return match2.awayId;
  const home = match2.homePens ?? null;
  const away = match2.awayPens ?? null;
  if (home === null || away === null || home === away) return null;
  return home > away ? match2.homeId : match2.awayId;
}
function loserOf(match2) {
  const winner = winnerOf(match2);
  if (!winner) return null;
  return winner === match2.homeId ? match2.awayId : match2.homeId;
}
function knockoutMatch(id, phase, homeId, awayId) {
  return { id, phase, homeId, awayId, status: "pending", homeGoals: null, awayGoals: null };
}
function byPhase(matches, phase) {
  return matches.filter((m) => m.phase === phase);
}
var allDone = (matches) => matches.length > 0 && matches.every((m) => winnerOf(m) !== null);
function playoffTeams(ranking) {
  const format = knockoutFormat(ranking.length);
  if (format.firstRound !== "playoff") return [];
  return format.playoff.map((pos) => ranking[pos - 1]);
}
function semiFinalists(ranking, matches) {
  const format = knockoutFormat(ranking.length);
  if (format.firstRound === "semi") return ranking.slice(0, format.direct + format.playoff.length);
  const first = byPhase(matches, format.firstRound);
  if (!allDone(first)) return null;
  const winners = new Set(first.map((m) => winnerOf(m)));
  const direct = ranking.slice(0, format.direct);
  return [...direct, ...ranking.filter((id) => winners.has(id))];
}
function pendingDecision(ranking, choices, matches) {
  const pool = playoffTeams(ranking);
  if (pool.length === 4 && byPhase(matches, "playoff").length === 0) {
    const [chooser, , orderChooser] = pool;
    if (!choices.playoffOpponentId) {
      return { kind: "playoffOpponent", chooserId: chooser, options: pool.slice(2) };
    }
    if (choices.playoffChooserFirst === void 0) {
      return { kind: "playoffOrder", chooserId: orderChooser };
    }
  }
  const semis = knockoutFormat(ranking.length).choices ? semiFinalists(ranking, matches) : null;
  if (semis && byPhase(matches, "semi").length === 0) {
    const [chooser, , orderChooser] = semis;
    if (!choices.semiOpponentId) {
      return { kind: "semiOpponent", chooserId: chooser, options: semis.slice(2) };
    }
    if (choices.semiChooserFirst === void 0) {
      return { kind: "semiOrder", chooserId: orderChooser };
    }
  }
  return null;
}
function nextKnockoutMatches(ranking, choices, matches) {
  const format = knockoutFormat(ranking.length);
  const seed = (position) => ranking[position - 1];
  const ranked = (a, b) => ranking.indexOf(a) <= ranking.indexOf(b) ? [a, b] : [b, a];
  if (format.firstRound === "playoff" && byPhase(matches, "playoff").length === 0) {
    const pool = playoffTeams(ranking);
    if (pool.length === 2) return [knockoutMatch("po1", "playoff", pool[0], pool[1])];
    if (!choices.playoffOpponentId || choices.playoffChooserFirst === void 0) return [];
    return pairUp("po", "playoff", pool, choices.playoffOpponentId, choices.playoffChooserFirst);
  }
  if (format.firstRound === "quarter" && byPhase(matches, "quarter").length === 0) {
    return QUARTER_SEEDS.map(([a, b], i) => knockoutMatch(`qf${i + 1}`, "quarter", seed(a), seed(b)));
  }
  const semis = semiFinalists(ranking, matches);
  if (!semis) return [];
  if (byPhase(matches, "semi").length === 0) {
    if (ranking.length === 3) return [knockoutMatch("sf1", "semi", seed(2), seed(3))];
    if (format.firstRound === "quarter") {
      const [qf1, qf2, qf3, qf4] = byPhase(matches, "quarter").map((m) => winnerOf(m));
      return [
        knockoutMatch("sf1", "semi", ...ranked(qf1, qf2)),
        knockoutMatch("sf2", "semi", ...ranked(qf3, qf4))
      ];
    }
    if (!format.choices) {
      return [
        knockoutMatch("sf1", "semi", seed(1), seed(4)),
        knockoutMatch("sf2", "semi", seed(2), seed(3))
      ];
    }
    if (!choices.semiOpponentId || choices.semiChooserFirst === void 0) return [];
    return pairUp("sf", "semi", semis, choices.semiOpponentId, choices.semiChooserFirst);
  }
  const semiMatches = byPhase(matches, "semi");
  if (!allDone(semiMatches) || byPhase(matches, "final").length > 0) return [];
  if (!format.thirdPlace) {
    return [knockoutMatch("final", "final", seed(1), winnerOf(semiMatches[0]))];
  }
  const [sf1, sf2] = semiMatches;
  return [
    knockoutMatch("third", "third", loserOf(sf1), loserOf(sf2)),
    knockoutMatch("final", "final", winnerOf(sf1), winnerOf(sf2))
  ];
}
function pairUp(prefix, phase, teams, opponentId, orderChooserFirst) {
  const [chooser, , orderChooser] = teams;
  const rest = teams.filter((id) => id !== chooser && id !== opponentId);
  const chooserMatch = [chooser, opponentId];
  const otherMatch = [rest[0], rest[1]];
  const orderChooserMatch = chooserMatch.includes(orderChooser) ? chooserMatch : otherMatch;
  const otherOne = orderChooserMatch === chooserMatch ? otherMatch : chooserMatch;
  const ordered = orderChooserFirst ? [orderChooserMatch, otherOne] : [otherOne, orderChooserMatch];
  return ordered.map(([home, away], i) => knockoutMatch(`${prefix}${i + 1}`, phase, home, away));
}

// src/app/domain/tournament.ts
var MIN_PARTICIPANTS = MIN_TEAMS * 2;
var MAX_PARTICIPANTS = MAX_TEAMS * 2;
var TournamentError = class extends Error {
};
function participant(t, id) {
  const found = t.participants.find((p) => p.id === id);
  if (!found) throw new TournamentError(`Participante desconocido: ${id}`);
  return found;
}
function team(t, id) {
  const found = t.teams.find((x) => x.id === id);
  if (!found) throw new TournamentError(`Equipo desconocido: ${id}`);
  return found;
}
function match(t, id) {
  const found = t.matches.find((m) => m.id === id);
  if (!found) throw new TournamentError(`Partido desconocido: ${id}`);
  return found;
}
function activeMembers(t, teamId) {
  return team(t, teamId).memberIds.filter((id) => !participant(t, id).disqualified);
}
function isSolo(t, teamId) {
  return activeMembers(t, teamId).length === 1;
}
function lineup(t, m, teamId) {
  const members = activeMembers(t, teamId);
  const partner = team(t, teamId).knockoutPartnerId;
  const standIn = m.standIns?.[teamId];
  if (members.length === 1 && isLateKnockout(m) && partner) return [...members, partner];
  if (members.length === 1 && standIn) return [...members, standIn];
  return members;
}
var isLateKnockout = (m) => m.phase === "semi" || m.phase === "third" || m.phase === "final";
function playsIn(t, m, participantId) {
  return [m.homeId, m.awayId].some((teamId) => lineup(t, m, teamId).includes(participantId));
}
function nextMatch(t) {
  return t.matches.find((m) => m.status !== "done") ?? null;
}
function startMatch(t, matchId, rng) {
  const m = match(t, matchId);
  if (m.status === "done") throw new TournamentError("Ese partido ya est\xE1 terminado.");
  const standIns = { ...m.standIns };
  for (const teamId of [m.homeId, m.awayId]) {
    if (!needsStandIn(t, m, teamId) || standIns[teamId]) continue;
    standIns[teamId] = drawStandIn(t, m, teamId, rng);
  }
  const updated = {
    ...m,
    status: "live",
    ...Object.keys(standIns).length ? { standIns } : {}
  };
  return {
    ...t,
    liveMatchId: matchId,
    matches: t.matches.map(
      (x) => x.id === matchId ? updated : x.status === "live" ? { ...x, status: "pending" } : x
    )
  };
}
function needsStandIn(t, m, teamId) {
  if (!isSolo(t, teamId)) return false;
  const hasKnockoutPartner = !!team(t, teamId).knockoutPartnerId;
  return !(hasKnockoutPartner && (m.phase === "semi" || m.phase === "third" || m.phase === "final"));
}
function drawStandIn(t, m, teamId, rng) {
  const busy = /* @__PURE__ */ new Set([
    ...lineup(t, m, m.homeId),
    ...lineup(t, m, m.awayId),
    ...Object.values(m.standIns ?? {})
  ]);
  const candidates = t.participants.filter((p) => !p.disqualified && !busy.has(p.id));
  if (candidates.length === 0) throw new TournamentError("No hay nadie libre para hacer pareja.");
  const timesUsed = (id) => t.matches.filter((x) => x.standIns?.[teamId] === id).length;
  const fewest = Math.min(...candidates.map((p) => timesUsed(p.id)));
  return pick(
    candidates.filter((p) => timesUsed(p.id) === fewest),
    rng
  ).id;
}
function recordResult(t, matchId, result) {
  const m = match(t, matchId);
  validateResult(t, m, result);
  assertEditable(t, m);
  const knockout = m.phase !== "group";
  const level = result.homeGoals === result.awayGoals;
  const updated = {
    ...m,
    status: "done",
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    extraTime: knockout ? !!result.extraTime || level : void 0,
    homePens: knockout && level ? result.homePens : null,
    awayPens: knockout && level ? result.awayPens : null,
    goals: t.config.trackScorers ? result.goals ?? [] : void 0,
    incidents: result.incidents?.length ? result.incidents : void 0,
    reportedBy: void 0
  };
  const next = replaceMatch(t, updated);
  return sync({ ...next, liveMatchId: t.liveMatchId === matchId ? void 0 : t.liveMatchId });
}
function playerStartMatch(t, participantId, matchId, rng) {
  const m = match(t, matchId);
  if (m.status === "live") return t;
  if (t.matches.some((x) => x.status === "live")) throw new TournamentError("Ya hay un partido en juego.");
  if (nextMatch(t)?.id !== matchId) throw new TournamentError("Ese partido a\xFAn no toca.");
  if (!playsIn(t, m, participantId)) {
    throw new TournamentError("Solo pueden empezarlo los que juegan el partido.");
  }
  return startMatch(t, matchId, rng);
}
function reportResult(t, participantId, matchId, result) {
  const m = match(t, matchId);
  if (m.status === "done") {
    throw new TournamentError("Ese partido ya tiene resultado. Si est\xE1 mal, que lo corrija el admin.");
  }
  if (m.status !== "live") throw new TournamentError("El partido a\xFAn no ha empezado.");
  if (!playsIn(t, m, participantId)) {
    throw new TournamentError("Solo pueden meter el resultado los que juegan el partido.");
  }
  const next = recordResult(t, matchId, result);
  return replaceMatch(next, { ...match(next, matchId), reportedBy: participantId });
}
function validateResult(t, m, r) {
  const goals = [r.homeGoals, r.awayGoals];
  if (!goals.every((g) => Number.isInteger(g) && g >= 0 && g < 100)) {
    throw new TournamentError("El marcador no es v\xE1lido.");
  }
  if (m.phase !== "group" && r.homeGoals === r.awayGoals) {
    const pens = [r.homePens, r.awayPens];
    if (!pens.every((p) => Number.isInteger(p) && p >= 0) || r.homePens === r.awayPens) {
      throw new TournamentError("En eliminatoria, un empate necesita ganador en los penaltis.");
    }
  }
  if (r.goals) {
    for (const [teamId, total] of [
      [m.homeId, r.homeGoals],
      [m.awayId, r.awayGoals]
    ]) {
      if (r.goals.filter((g) => g.teamId === teamId).length > total) {
        throw new TournamentError("Hay m\xE1s goleadores que goles.");
      }
    }
  }
  for (const incident of r.incidents ?? []) {
    if (incident.teamId !== m.homeId && incident.teamId !== m.awayId) {
      throw new TournamentError("La sanci\xF3n tiene que ser de uno de los dos equipos del partido.");
    }
    if (!incident.player?.trim()) throw new TournamentError("Falta el nombre del jugador sancionado.");
  }
}
function assertEditable(t, m) {
  if (m.status !== "done") return;
  if (m.phase === "group" && t.stage !== "groups") {
    throw new TournamentError("La liguilla ya est\xE1 cerrada.");
  }
  const later = {
    group: [],
    playoff: ["semi", "third", "final"],
    quarter: ["semi", "third", "final"],
    semi: ["third", "final"],
    third: [],
    final: []
  };
  if (t.matches.some((x) => later[m.phase].includes(x.phase))) {
    throw new TournamentError("Ya se ha jugado la siguiente ronda con este resultado.");
  }
}
function replaceMatch(t, updated) {
  return { ...t, matches: t.matches.map((m) => m.id === updated.id ? updated : m) };
}
function groupMatches(t) {
  return t.matches.filter((m) => m.phase === "group");
}
function standings(t) {
  return computeStandings(
    t.teams.map((x) => x.id),
    groupMatches(t),
    t.config.tiebreakers,
    t.config.seed
  );
}
function currentDecision(t) {
  if (t.stage !== "knockout" || !t.groupRanking) return null;
  return pendingDecision(t.groupRanking, t.knockout, t.matches);
}
function makeChoice(t, choice) {
  const decision = currentDecision(t);
  if (!decision) throw new TournamentError("No hay ninguna elecci\xF3n pendiente.");
  const allowed = {
    playoffOpponent: "playoffOpponentId",
    playoffOrder: "playoffChooserFirst",
    semiOpponent: "semiOpponentId",
    semiOrder: "semiChooserFirst"
  };
  const key = allowed[decision.kind];
  const value = choice[key];
  if (value === void 0) throw new TournamentError("Esa elecci\xF3n no toca ahora.");
  if ((decision.kind === "playoffOpponent" || decision.kind === "semiOpponent") && !decision.options.includes(value)) {
    throw new TournamentError("Ese rival no se puede elegir.");
  }
  return sync({ ...t, knockout: { ...t.knockout, [key]: value } });
}
function choosers(t, teamId) {
  const partner = team(t, teamId).knockoutPartnerId;
  return [...activeMembers(t, teamId), ...partner ? [partner] : []];
}
function playerMakeChoice(t, participantId, choice) {
  const decision = currentDecision(t);
  if (!decision) throw new TournamentError("No hay ninguna elecci\xF3n pendiente.");
  if (!choosers(t, decision.chooserId).includes(participantId)) {
    throw new TournamentError("Esta elecci\xF3n le toca a otro equipo.");
  }
  return makeChoice(t, choice);
}
function sync(t) {
  let next = t;
  const groups = groupMatches(next);
  if (next.stage === "groups" && groups.length > 0 && groups.every((m) => m.status === "done")) {
    next = { ...next, stage: "knockout", groupRanking: standings(next).map((r) => r.teamId) };
  }
  if (next.stage !== "knockout" || !next.groupRanking) return next;
  for (; ; ) {
    const created = nextKnockoutMatches(next.groupRanking, next.knockout, next.matches);
    if (created.length === 0) break;
    if (created[0].phase === "semi") next = drawKnockoutPartners(next);
    next = { ...next, matches: [...next.matches, ...created] };
  }
  const final = next.matches.find((m) => m.phase === "final");
  const third = next.matches.find((m) => m.phase === "third");
  const thirdDone = third ? !!winnerOf(third) : !knockoutFormat(next.teams.length).thirdPlace;
  if (final && winnerOf(final) && thirdDone) next = { ...next, stage: "finished" };
  return next;
}
function drawKnockoutPartners(t) {
  const semis = semiFinalists(t.groupRanking, t.matches) ?? [];
  const eliminatedTeams = t.teams.filter((x) => !semis.includes(x.id));
  const pool = eliminatedTeams.flatMap((x) => activeMembers(t, x.id));
  const rng = seededRng(t.config.seed ^ 24301);
  const taken = /* @__PURE__ */ new Set();
  const teams = t.teams.map((x) => {
    if (!semis.includes(x.id) || !isSolo(t, x.id) || x.knockoutPartnerId) return x;
    const free = pool.filter((id) => !taken.has(id));
    if (free.length === 0) return x;
    const partnerId = pick(free, rng);
    taken.add(partnerId);
    return { ...x, knockoutPartnerId: partnerId };
  });
  return { ...t, teams };
}
export {
  playerMakeChoice,
  playerStartMatch,
  reportResult
};
