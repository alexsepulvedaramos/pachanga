// src/app/domain/knockout.ts
var MIN_TEAMS = 5;
var MAX_TEAMS = 7;
function knockoutFormat(teamCount) {
  switch (teamCount) {
    case 5:
      return { direct: 3, playoff: [4, 5] };
    case 6:
    case 7:
      return { direct: 2, playoff: [3, 4, 5, 6] };
    default:
      throw new Error(`Unsupported team count: ${teamCount}`);
  }
}
var PHASE_LABELS = {
  group: "Liguilla",
  playoff: "Repesca",
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
function byPhase(matches, phase) {
  return matches.filter((m) => m.phase === phase);
}
var allDone = (matches) => matches.length > 0 && matches.every((m) => winnerOf(m) !== null);
function playoffTeams(ranking) {
  return knockoutFormat(ranking.length).playoff.map((pos) => ranking[pos - 1]);
}
function semiFinalists(ranking, matches) {
  const playoff = byPhase(matches, "playoff");
  if (!allDone(playoff)) return null;
  const winners = new Set(playoff.map((m) => winnerOf(m)));
  const direct = ranking.slice(0, knockoutFormat(ranking.length).direct);
  return [...direct, ...ranking.filter((id) => winners.has(id))];
}
function pendingDecision(ranking, choices, matches) {
  const pool = playoffTeams(ranking);
  if (pool.length === 4 && byPhase(matches, "playoff").length === 0) {
    const [chooser, orderChooser] = pool;
    if (!choices.playoffOpponentId) {
      return { kind: "playoffOpponent", chooserId: chooser, options: pool.slice(1) };
    }
    if (choices.playoffChooserFirst === void 0) {
      return { kind: "playoffOrder", chooserId: orderChooser };
    }
  }
  const semis = semiFinalists(ranking, matches);
  if (semis && byPhase(matches, "semi").length === 0) {
    const [chooser, orderChooser] = semis;
    if (!choices.semiOpponentId) {
      return { kind: "semiOpponent", chooserId: chooser, options: semis.slice(1) };
    }
    if (choices.semiChooserFirst === void 0) {
      return { kind: "semiOrder", chooserId: orderChooser };
    }
  }
  return null;
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
  const suspended = new Set(suspendedFor(t, m));
  return fullLineup(t, m, teamId).filter((id) => !suspended.has(id));
}
function fullLineup(t, m, teamId) {
  const members = activeMembers(t, teamId);
  const partner = team(t, teamId).knockoutPartnerId;
  const standIn = m.standIns?.[teamId];
  if (members.length === 1 && isLateKnockout(m) && partner) return [...members, partner];
  if (members.length === 1 && standIn) return [...members, standIn];
  return members;
}
var isLateKnockout = (m) => m.phase === "semi" || m.phase === "third" || m.phase === "final";
function regulars(t, m, teamId) {
  const partner = team(t, teamId).knockoutPartnerId;
  const members = activeMembers(t, teamId);
  return partner && isLateKnockout(m) && members.length === 1 ? [...members, partner] : members;
}
function suspendedFor(t, m) {
  if (m.phase === "final") return [];
  const index = t.matches.findIndex((x) => x.id === m.id);
  const result = [];
  for (const id of [...regulars(t, m, m.homeId), ...regulars(t, m, m.awayId)]) {
    for (let i = index - 1; i >= 0; i--) {
      const prev = t.matches[i];
      const plays = [prev.homeId, prev.awayId].some((teamId) => regulars(t, prev, teamId).includes(id));
      const hadIncident = prev.incidents?.some((x) => x.participantId === id);
      if (hadIncident) {
        result.push(id);
        break;
      }
      if (plays) break;
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
    const winnerTeam = t.teams.find((x) => winners.some((id) => x.memberIds.includes(id)));
    return [
      {
        key: "champions",
        participantIds: t.participants.map((p) => p.id),
        title: `Campeones: ${winnerTeam?.club ?? ""}`,
        body: `${winners.map((id) => name(t, id)).join(" + ")} ganan ${t.name}.`
      }
    ];
  }
  if (t.stage !== "groups" && t.stage !== "knockout") return [];
  const messages = [];
  const pending = t.matches.filter((m) => m.status !== "done");
  const now = pending.find((m) => m.status === "live") ?? pending[0];
  if (now) {
    const players = [...lineup(t, now, now.homeId), ...lineup(t, now, now.awayId)];
    for (const id of players) {
      const team2 = [now.homeId, now.awayId].find((teamId) => lineup(t, now, teamId).includes(id));
      const guest = !t.teams.find((x) => x.id === team2).memberIds.includes(id);
      const partner = lineup(t, now, team2).find((x) => x !== id);
      messages.push({
        key: `turn:${now.id}`,
        participantIds: [id],
        title: "\xA1Te toca!",
        body: guest ? `Juegas de invitado con ${partner ? name(t, partner) : club(t, team2)}: ${fixture(t, now)}` : `${fixture(t, now)}. Coge el mando.`
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
