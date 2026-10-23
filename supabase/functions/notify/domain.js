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
var PHASE_LABELS = {
  group: "Liguilla",
  playoff: "Repesca",
  quarter: "Cuartos",
  semi: "Semifinal",
  third: "3er puesto",
  final: "Final"
};
function winnerOf(match) {
  if (match.status !== "done" || match.homeGoals === null || match.awayGoals === null) return null;
  if (match.homeGoals > match.awayGoals) return match.homeId;
  if (match.awayGoals > match.homeGoals) return match.awayId;
  const home = match.homePens ?? null;
  const away = match.awayPens ?? null;
  if (home === null || away === null || home === away) return null;
  return home > away ? match.homeId : match.awayId;
}
function loserOf(match) {
  const winner = winnerOf(match);
  if (!winner) return null;
  return winner === match.homeId ? match.awayId : match.homeId;
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
function podium(matches) {
  const final = matches.find((m) => m.phase === "final");
  const third = matches.find((m) => m.phase === "third");
  if (!final || !winnerOf(final)) return null;
  const top = [winnerOf(final), loserOf(final)];
  if (third) return winnerOf(third) ? [...top, winnerOf(third), loserOf(third)] : null;
  const semi = matches.find((m) => m.phase === "semi");
  return semi && loserOf(semi) ? [...top, loserOf(semi)] : null;
}

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
function activeMembers(t, teamId) {
  return team(t, teamId).memberIds.filter((id) => !participant(t, id).disqualified);
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
function unavailableFor(t, m) {
  if (m.phase === "final") return [];
  const index = t.matches.findIndex((x) => x.id === m.id);
  const result = [];
  for (const teamId of [m.homeId, m.awayId]) {
    for (let i = index - 1; i >= 0; i--) {
      const prev = t.matches[i];
      if (prev.homeId !== teamId && prev.awayId !== teamId) continue;
      result.push(...(prev.incidents ?? []).filter((x) => x.teamId === teamId && typeof x.player === "string"));
      break;
    }
  }
  return result;
}
function currentDecision(t) {
  if (t.stage !== "knockout" || !t.groupRanking) return null;
  return pendingDecision(t.groupRanking, t.knockout, t.matches);
}
function champions(t) {
  const final = t.matches.find((m) => m.phase === "final");
  const winner = final && winnerOf(final);
  if (!final || !winner) return null;
  return lineup(t, final, winner);
}
function topScorers(t) {
  const counts = /* @__PURE__ */ new Map();
  for (const m of t.matches) {
    for (const g of m.goals ?? []) {
      if (g.scorerId) counts.set(g.scorerId, (counts.get(g.scorerId) ?? 0) + 1);
    }
  }
  return [...counts].map(([participantId, goals]) => ({ participantId, goals })).sort((a, b) => b.goals - a.goals);
}

// src/app/domain/ballon-dor.ts
var PODIUM_POINTS = [3, 2, 1];
function hasBallonDor(t) {
  return !!t.config.ballonDor;
}
function votingOpen(t) {
  return hasBallonDor(t) && t.stage === "finished" && !t.ballonDor?.closedAt;
}
function votingClosed(t) {
  return hasBallonDor(t) && !!t.ballonDor?.closedAt;
}
function ballonDorRanking(t) {
  const rows = /* @__PURE__ */ new Map();
  for (const vote of t.ballonDor?.votes ?? []) {
    vote.picks.forEach((id, place) => {
      const row = rows.get(id) ?? { participantId: id, points: 0, places: [0, 0, 0] };
      row.points += PODIUM_POINTS[place] ?? 0;
      row.places[place]++;
      rows.set(id, row);
    });
  }
  const goals = new Map(topScorers(t).map((s) => [s.participantId, s.goals]));
  const teams = finalTeamOrder(t);
  const teamPosition = (id) => {
    const index = teams.findIndex((teamId) => t.teams.find((x) => x.id === teamId)?.memberIds.includes(id));
    return index < 0 ? teams.length : index;
  };
  const lots = shuffle(t.participants.map((p) => p.id).sort(), seededRng(t.config.seed ^ 47633));
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.places[0] - a.places[0] || b.places[1] - a.places[1] || (goals.get(b.participantId) ?? 0) - (goals.get(a.participantId) ?? 0) || teamPosition(a.participantId) - teamPosition(b.participantId) || lots.indexOf(a.participantId) - lots.indexOf(b.participantId)
  );
}
function finalTeamOrder(t) {
  const top = podium(t.matches) ?? [];
  const rest = (t.groupRanking ?? t.teams.map((x) => x.id)).filter((id) => !top.includes(id));
  return [...top, ...rest];
}

// src/app/domain/gala.ts
function galaSlides(t) {
  if (t.stage !== "finished") return [];
  const played = t.matches.filter((m) => m.status === "done");
  const goals = played.reduce((sum, m) => sum + (m.homeGoals ?? 0) + (m.awayGoals ?? 0), 0);
  const margin = (m) => Math.abs((m.homeGoals ?? 0) - (m.awayGoals ?? 0));
  const biggestWin = played.reduce(
    (best, m) => margin(m) > 0 && (!best || margin(m) > margin(best) || margin(m) === margin(best) && goalsIn(m) > goalsIn(best)) ? m : best,
    null
  );
  const slides = [{ kind: "intro", matches: played.length, goals, biggestWin }];
  const final = t.matches.find((m) => m.phase === "final");
  const winner = final && winnerOf(final);
  if (final && winner) slides.push({ kind: "champions", teamId: winner, playerIds: champions(t) ?? [], final });
  const scorers = topScorers(t);
  if (t.config.trackScorers && scorers.length) {
    const most = scorers[0].goals;
    slides.push({
      kind: "goldenBoot",
      participantIds: scorers.filter((s) => s.goals === most).map((s) => s.participantId),
      goals: most
    });
  }
  if (votingClosed(t)) {
    const podium2 = ballonDorRanking(t).slice(0, 3);
    for (let i = podium2.length - 1; i >= 0; i--) {
      const row = podium2[i];
      slides.push({
        kind: "ballonDor",
        place: i + 1,
        participantId: row.participantId,
        points: row.points,
        firsts: row.places[0],
        ballots: row.places[0] + row.places[1] + row.places[2]
      });
    }
  }
  return slides;
}
var goalsIn = (m) => (m.homeGoals ?? 0) + (m.awayGoals ?? 0);
function galaLive(t) {
  return !!t.gala && t.gala.step < galaSlides(t).length;
}

// supabase/functions/notify/messages.ts
var club = (t, teamId) => t.teams.find((x) => x.id === teamId)?.club ?? "";
var name = (t, id) => participant(t, id).name;
function fixture(t, m) {
  const label = m.phase === "group" ? `Jornada ${m.round}` : PHASE_LABELS[m.phase];
  return `${club(t, m.homeId)} vs ${club(t, m.awayId)} \xB7 ${label}`;
}
function buildMessages(t) {
  if (t.stage === "finished") {
    const final = t.matches.find((m) => m.phase === "final");
    const winners = champions(t) ?? [];
    if (!final || winners.length === 0) return [];
    const everybody = t.participants.map((p) => p.id);
    const winnerTeam = t.teams.find((x) => winners.some((id) => x.memberIds.includes(id)));
    const messages2 = [
      {
        key: "champions",
        participantIds: everybody,
        title: `Campeones: ${winnerTeam?.club ?? ""}`,
        body: `${winners.map((id) => name(t, id)).join(" + ")} ganan ${t.name}.`
      }
    ];
    if (votingOpen(t)) {
      messages2.push({
        key: "vote",
        participantIds: everybody.filter((id) => !t.ballonDor?.voters.includes(id)),
        title: "Vota al Bal\xF3n de Oro",
        body: `Elige tu podio de ${t.name}: 3, 2 y 1 puntos.`
      });
    }
    if (t.gala && galaLive(t)) {
      messages2.push({
        key: `gala:${t.gala.startedAt}`,
        participantIds: everybody,
        title: "\xA1Empieza la gala!",
        body: "Abre Pachanga: campeones, Bota de Oro y Bal\xF3n de Oro, en directo."
      });
    }
    return messages2;
  }
  if (t.stage !== "groups" && t.stage !== "knockout") return [];
  const messages = [];
  const pending = t.matches.filter((m) => m.status !== "done");
  const now = pending.find((m) => m.status === "live") ?? pending[0];
  if (now) {
    const players = [...lineup(t, now, now.homeId), ...lineup(t, now, now.awayId)];
    const out = unavailableFor(t, now);
    for (const id of players) {
      const team2 = [now.homeId, now.awayId].find((teamId) => lineup(t, now, teamId).includes(id));
      const guest = !t.teams.find((x) => x.id === team2).memberIds.includes(id);
      const partner = lineup(t, now, team2).find((x) => x !== id);
      const missing = out.filter((x) => x.teamId === team2).map((x) => `${x.player} (${x.kind === "redCard" ? "roja" : "lesi\xF3n"})`);
      const warning = missing.length ? ` Sin ${missing.join(", ")}.` : "";
      messages.push({
        key: `turn:${now.id}`,
        participantIds: [id],
        title: "\xA1Te toca!",
        body: guest ? `Juegas de invitado con ${partner ? name(t, partner) : club(t, team2)}: ${fixture(t, now)}.${warning}` : `${fixture(t, now)}. Coge el mando.${warning}`
      });
    }
    const next = pending.find((m) => m.id !== now.id);
    if (next) {
      const nextPlayers = [...lineup(t, next, next.homeId), ...lineup(t, next, next.awayId)];
      messages.push({
        key: `soon:${next.id}`,
        participantIds: nextPlayers.filter((id) => !players.includes(id)),
        title: "Juegas en el siguiente",
        body: `Prep\xE1rate: ${fixture(t, next)} va despu\xE9s de este partido.`
      });
    }
  }
  const decision = currentDecision(t);
  if (decision) {
    const opponent = decision.kind === "playoffOpponent" || decision.kind === "semiOpponent";
    const round = decision.kind.startsWith("playoff") ? "la repesca" : "semifinales";
    messages.push({
      key: `choose:${decision.kind}`,
      participantIds: activeMembers(t, decision.chooserId),
      title: "Te toca elegir",
      body: opponent ? `Eleg\xEDs rival para ${round}. Avisad al admin.` : `Eleg\xEDs si jug\xE1is primero o segundo en ${round}. Avisad al admin.`
    });
  }
  return messages;
}
export {
  buildMessages
};
