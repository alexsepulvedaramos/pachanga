import { formatSummary, groupMatchCount, knockoutFormat, knockoutPhases, PHASE_LABELS } from './knockout';
import { POINTS, TIEBREAKER_LABELS } from './standings';
import { halfMinutesOf } from './tournament';
import { Phase, Tournament } from './types';

/** A block of the "format and rules" sheet: a heading and the points under it. */
export interface GuideSection {
  title: string;
  items: string[];
}

/** The knockout in words, for the team count of this tournament. */
function knockoutItems(teamCount: number): string[] {
  switch (teamCount) {
    case 3:
      return [
        'El 1º de la liguilla pasa directo a la final.',
        'El 2º y el 3º juegan una semifinal: el ganador es el otro finalista.',
        'No hay partido por el tercer puesto.',
      ];
    case 4:
      return [
        'Semifinales: 1º contra 4º y 2º contra 3º.',
        'Los dos perdedores juegan por el tercer puesto y los dos ganadores, la final.',
      ];
    case 5:
      return [
        'Pasan directos a semifinales el 1º, el 2º y el 3º.',
        'El 4º y el 5º juegan la repesca, a partido único: el ganador entra en semifinales.',
        'En semifinales, el 1º elige su rival entre el 3º y el ganador de la repesca. No puede elegir al 2º: ese es el privilegio de quedar segundo, que juega contra el que sobra.',
        'El 3º decide si su semifinal se juega primera o segunda.',
        'Los perdedores de las semis juegan por el tercer puesto y los ganadores, la final.',
      ];
    case 6:
    case 7:
      return [
        'Pasan directos a semifinales el 1º y el 2º.',
        teamCount === 7
          ? 'La repesca la juegan el 3º, el 4º, el 5º y el 6º. El 7º queda eliminado.'
          : 'La repesca la juegan el 3º, el 4º, el 5º y el 6º.',
        'En la repesca, el 3º elige su rival entre el 5º y el 6º. No puede elegir al 4º, que juega contra el que sobra. El 5º decide si su partido de repesca va primero o segundo.',
        'Los dos ganadores de la repesca entran en semifinales.',
        'En semifinales, el 1º elige su rival entre los dos que vienen de la repesca. No puede elegir al 2º, que juega contra el que sobra. El ganador de la repesca mejor clasificado en la liguilla decide si su semifinal va primera o segunda.',
        'Los perdedores de las semis juegan por el tercer puesto y los ganadores, la final.',
      ];
    default:
      return [
        'Cuartos de final: 1º contra 8º, 4º contra 5º, 2º contra 7º y 3º contra 6º.',
        'Semifinales: el ganador de 1º–8º contra el de 4º–5º, y el de 2º–7º contra el de 3º–6º.',
        'Los perdedores de las semis juegan por el tercer puesto y los ganadores, la final.',
      ];
  }
}

/** Minutes per half of every phase this tournament plays, in playing order and without repeats. */
function minutesLine(t: Tournament): string {
  const phases: Phase[] = ['group', ...new Set(knockoutPhases(Math.ceil(t.participants.length / 2)))];
  return phases.map((phase) => `${PHASE_LABELS[phase]} ${halfMinutesOf(t, phase)}`).join(' · ');
}

/** Everything a player may want to know about how this tournament is played, from its own settings. */
export function formatGuide(t: Tournament): GuideSection[] {
  // Teams only exist once the draw is done; the rules are the same from the start.
  const teamCount = Math.ceil(t.participants.length / 2);
  const format = knockoutFormat(teamCount);
  const total = groupMatchCount(teamCount) + knockoutPhases(teamCount).length;
  const solo = t.participants.length % 2 === 1;

  const sections: GuideSection[] = [
    {
      title: 'Así se juega',
      items: [
        `${t.participants.length} jugadores en ${teamCount} parejas.`,
        formatSummary(teamCount),
        `${total} partidos en total: ${groupMatchCount(teamCount)} de liguilla y ${total - groupMatchCount(teamCount)} de eliminatorias.`,
        `Minutos por parte: ${minutesLine(t)}.`,
      ],
    },
    {
      title: 'Liguilla',
      items: [
        format.legs === 2
          ? `Todas las parejas juegan entre sí dos veces (ida y vuelta): ${(teamCount - 1) * 2} partidos por pareja.`
          : `Todas las parejas juegan entre sí una vez: ${teamCount - 1} partidos por pareja.`,
        `Victoria ${POINTS.win} puntos, empate ${POINTS.draw}, derrota ${POINTS.loss}.`,
        `Si hay empate a puntos, desempatan por este orden: ${t.config.tiebreakers.map((c) => TIEBREAKER_LABELS[c].toLowerCase()).join(', ')}.`,
        'El orden de los partidos evita, siempre que se puede, que una pareja juegue dos seguidos.',
      ],
    },
    {
      title: 'Eliminatorias',
      items: [
        ...knockoutItems(teamCount),
        'Si una eliminatoria acaba en empate se juega prórroga y, si sigue igual, penaltis.',
        'Quien elige rival o el orden de su partido lo hace desde su móvil, y todas las pantallas lo enseñan al momento.',
      ],
    },
    {
      title: 'Jugadores',
      items: [
        ...(solo
          ? [
              'Al ser impares, uno juega solo: antes de cada partido de liguilla se le sortea compañero entre quienes no juegan, y en las eliminatorias tiene un compañero fijo sorteado entre los eliminados.',
              'Ese invitado sale del sorteo con prioridad para quien menos se juega: primero los que ya no pueden cambiar su puesto con el resultado, luego los que están lejos en la tabla, y después los que menos veces han sido invitados, no acaban de jugar ni juegan justo después. Si el admin repite el sorteo, no vuelve a salir el descartado y queda anotado en el partido.',
            ]
          : []),
        'Cualquier jugador del partido puede empezarlo y meter el resultado desde su móvil. El admin puede corregirlo.',
        'Una lesión o una roja deja a ese jugador fuera del siguiente partido de su equipo, salvo en la final, que la juegan todos. Si alguien no puede seguir, su pareja pasa a jugar sola.',
        ...(t.config.trackScorers ? ['Se apuntan los goleadores y el que más tenga se lleva la Bota de Oro.'] : []),
        ...(t.config.ballonDor
          ? [
              'Al acabar la final cada jugador vota desde su móvil un podio para el Balón de Oro (3, 2 y 1 puntos), sin votarse a sí mismo. Los votos son secretos hasta que se cierra la votación y después llega la gala.',
            ]
          : []),
      ],
    },
  ];
  return sections;
}
