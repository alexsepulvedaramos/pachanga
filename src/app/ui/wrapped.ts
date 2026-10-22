// The night in one picture, story-sized, to send to the group chat: the numbers, the champions,
// the Golden Boot and the Ballon d'Or podium, drawn on a canvas in the app's own look.

import { galaSlides } from '../domain/gala';
import { finalTeamOrder } from '../domain/ballon-dor';
import { Match, Tournament } from '../domain/types';
import { clubColor } from './club-colors';

const W = 1080;
const H = 1920;
const PAD = 72;
const C = {
  ink: '#060a15',
  pitch: '#151e38',
  raised: '#212d50',
  line: '#34436c',
  chalk: '#f2f5ff',
  mist: '#9eaac8',
  volt: '#c8ff2e',
  cyan: '#18d6ff',
  gold: '#ffc83d',
};
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const TIERS = {
  1: ['#fbe7a1', '#d4a537', '#8a6411', '#2b1d00'],
  2: ['#f4f7fb', '#b9c3d0', '#6f7b8c', '#1b2330'],
  3: ['#f2c49b', '#b8743f', '#6b3d1b', '#2a1406'],
} as const;

/** Where to find a club's crest image, or null to draw a plain shield. */
export type CrestUrl = (club: string) => string | null;

/** Draws the summary of a finished tournament and returns it as a PNG. */
export async function renderWrapped(t: Tournament, crestUrl: CrestUrl): Promise<Blob> {
  await Promise.all(
    ['italic 800 100px', '700 40px', '800 100px'].map((f) => document.fonts?.load(`${f} "Barlow Condensed"`)),
  ).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const crest = crestLoader(t, crestUrl);
  const name = (id: string) => t.participants.find((p) => p.id === id)?.name ?? '';
  const club = (teamId: string) => t.teams.find((x) => x.id === teamId)?.club ?? '';
  const clubOf = (id: string) => t.teams.find((x) => x.memberIds.includes(id))?.club ?? '';

  // Background with the app's diagonal light stripes.
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  stripe(ctx, 0.62, 0.64, 'rgba(200,255,46,0.05)');
  stripe(ctx, 0.7, 0.71, 'rgba(24,214,255,0.05)');

  const slides = galaSlides(t);
  let y = 110;

  // Header
  text(ctx, 'PACHANGA', PAD, y, { size: 44, color: C.volt, italic: true });
  text(ctx, formatDate(t.createdAt), W - PAD, y, { size: 34, color: C.mist, weight: 700, align: 'right' });
  y += 90;
  text(ctx, 'ASÍ FUE', PAD, y, { size: 32, color: C.cyan, weight: 700, spacing: 6 });
  y += 110;
  fitText(ctx, t.name.toUpperCase(), PAD, y, W - 2 * PAD, { size: 120, min: 64, italic: true });

  // The numbers of the night
  const intro = slides.find((s) => s.kind === 'intro');
  if (intro?.kind === 'intro') {
    y += 50;
    const boxW = (W - 2 * PAD - 2 * 24) / 3;
    const boxes: [string, string, string, string][] = [
      [`${intro.matches}`, 'PARTIDOS', C.volt, C.ink],
      [`${intro.goals}`, 'GOLES', C.cyan, C.ink],
    ];
    if (intro.biggestWin) boxes.push([score(intro.biggestWin), 'MAYOR GOLEADA', C.raised, C.chalk]);
    boxes.forEach(([value, label, bg, fg], i) => {
      const x = PAD + i * (boxW + 24);
      cut(ctx, x, y, boxW, 190, 18, bg);
      fitText(ctx, value, x + 28, y + 110, boxW - 56, { size: 96, min: 48, color: fg, italic: true });
      text(ctx, label, x + 28, y + 158, { size: 26, color: fg, weight: 700, spacing: 3 });
    });
    y += 190;
  }

  // Champions
  const champions = slides.find((s) => s.kind === 'champions');
  if (champions?.kind === 'champions') {
    y += 40;
    const h = 330;
    cut(ctx, PAD, y, W - 2 * PAD, h, 24, C.volt);
    const champion = club(champions.teamId);
    await crest.draw(ctx, champion, PAD + 40, y + 45, 240);
    const x = PAD + 320;
    text(ctx, 'CAMPEONES', x, y + 85, { size: 32, color: C.ink, weight: 700, spacing: 6 });
    fitText(ctx, champion.toUpperCase(), x, y + 200, W - PAD - x - 40, { size: 120, min: 56, color: C.ink, italic: true });
    fitText(ctx, champions.playerIds.map(name).join(' + ').toUpperCase(), x, y + 270, W - PAD - x - 40, {
      size: 52,
      min: 30,
      color: C.ink,
      weight: 700,
    });
    y += h;
  }

  // Golden Boot
  const boot = slides.find((s) => s.kind === 'goldenBoot');
  if (boot?.kind === 'goldenBoot') {
    y += 32;
    const h = 200;
    cut(ctx, PAD, y, W - 2 * PAD, h, 18, C.pitch);
    ctx.fillStyle = C.gold;
    ctx.fillRect(PAD, y, 10, h);
    text(ctx, boot.participantIds.length > 1 ? 'BOTA DE ORO COMPARTIDA' : 'BOTA DE ORO', PAD + 48, y + 70, {
      size: 30,
      color: C.gold,
      weight: 700,
      spacing: 5,
    });
    fitText(ctx, boot.participantIds.map(name).join(' + ').toUpperCase(), PAD + 48, y + 160, 560, {
      size: 84,
      min: 40,
      italic: true,
    });
    text(ctx, `${boot.goals}`, W - PAD - 190, y + 150, { size: 120, color: C.gold, italic: true, align: 'right' });
    text(ctx, boot.goals === 1 ? 'GOL' : 'GOLES', W - PAD - 40, y + 150, { size: 44, color: C.gold, weight: 700, align: 'right' });
    y += h;
  }

  // Ballon d'Or podium, or the final standings without a vote
  const podium = slides.filter((s) => s.kind === 'ballonDor');
  y += 70;
  if (podium.length) {
    text(ctx, 'BALÓN DE ORO', PAD, y, { size: 32, color: C.gold, weight: 700, spacing: 6 });
    const cardW = 290;
    const spots = { 1: { x: (W - cardW) / 2, top: y + 40, h: 520 }, 2: { x: PAD, top: y + 110, h: 450 }, 3: { x: W - PAD - cardW, top: y + 150, h: 410 } };
    for (const slide of [...podium].sort((a, b) => b.place - a.place)) {
      if (slide.kind !== 'ballonDor') continue;
      const spot = spots[slide.place];
      await podiumCard(ctx, crest, spot.x, spot.top, cardW, spot.h, slide.place, name(slide.participantId), slide.points, clubOf(slide.participantId));
    }
  } else {
    text(ctx, 'CLASIFICACIÓN FINAL', PAD, y, { size: 32, color: C.cyan, weight: 700, spacing: 6 });
    let rowY = y + 40;
    for (const [i, teamId] of finalTeamOrder(t).slice(0, 4).entries()) {
      cut(ctx, PAD, rowY, W - 2 * PAD, 110, 12, C.pitch);
      text(ctx, `${i + 1}`, PAD + 36, rowY + 76, { size: 60, italic: true, color: i === 0 ? C.volt : C.mist });
      await crest.draw(ctx, club(teamId), PAD + 110, rowY + 15, 80);
      fitText(ctx, club(teamId).toUpperCase(), PAD + 220, rowY + 76, W - 2 * PAD - 260, { size: 60, min: 36, italic: true });
      rowY += 126;
    }
  }

  text(ctx, location.host || 'pachanga', W / 2, H - 70, { size: 30, color: C.mist, weight: 700, align: 'center', spacing: 4 });

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se ha podido crear la imagen.'))), 'image/png'),
  );
}

/** Opens the phone's share sheet with the picture, or downloads it where sharing files isn't possible. */
export async function shareImage(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

async function podiumCard(
  ctx: CanvasRenderingContext2D,
  crest: ReturnType<typeof crestLoader>,
  x: number,
  y: number,
  w: number,
  h: number,
  place: 1 | 2 | 3,
  player: string,
  points: number,
  playerClub: string,
): Promise<void> {
  const [c1, c2, c3, ink] = TIERS[place];
  const gradient = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  gradient.addColorStop(0, c1);
  gradient.addColorStop(0.55, c2);
  gradient.addColorStop(1, c3);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + w * 0.14, y);
  ctx.lineTo(x + w * 0.86, y);
  ctx.lineTo(x + w, y + h * 0.09);
  ctx.lineTo(x + w, y + h * 0.84);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h * 0.84);
  ctx.lineTo(x, y + h * 0.09);
  ctx.closePath();
  ctx.fillStyle = gradient;
  if (place === 1) {
    ctx.shadowColor = 'rgba(255,200,61,0.55)';
    ctx.shadowBlur = 60;
  }
  ctx.fill();
  ctx.restore();

  text(ctx, `${place}º`, x + 30, y + 80, { size: 64, color: ink, italic: true });
  if (playerClub) await crest.draw(ctx, playerClub, x + w - 30 - 64, y + 28, 64);
  const r = w * 0.24;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.4, r, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, player.charAt(0).toUpperCase(), x + w / 2, y + h * 0.4 + r * 0.45, { size: r * 1.3, color: ink, italic: true, align: 'center' });
  fitText(ctx, player.toUpperCase(), x + w / 2, y + h * 0.68, w - 40, { size: 56, min: 28, color: ink, italic: true, align: 'center' });
  text(ctx, `${points} PTS`, x + w / 2, y + h * 0.78, { size: 34, color: ink, weight: 700, align: 'center', spacing: 2 });
}

/** Loads each club's crest once; falls back to a shield in the club's colour with its initials. */
function crestLoader(t: Tournament, crestUrl: CrestUrl) {
  const cache = new Map<string, Promise<HTMLImageElement | null>>();
  const load = (club: string) => {
    if (!cache.has(club)) {
      const url = crestUrl(club);
      cache.set(
        club,
        url
          ? new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => resolve(null);
              img.src = url;
            })
          : Promise.resolve(null),
      );
    }
    return cache.get(club)!;
  };
  return {
    async draw(ctx: CanvasRenderingContext2D, club: string, x: number, y: number, size: number): Promise<void> {
      const img = await load(club);
      if (img) {
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 40, size / 46);
      ctx.beginPath();
      ctx.moveTo(20, 1);
      ctx.lineTo(38, 7);
      ctx.lineTo(38, 22);
      ctx.bezierCurveTo(38, 33, 30, 41, 20, 45);
      ctx.bezierCurveTo(10, 41, 2, 33, 2, 22);
      ctx.lineTo(2, 7);
      ctx.closePath();
      ctx.fillStyle = clubColor(t.clubs, club);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.restore();
      const initials = club
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
      text(ctx, initials, x + size / 2, y + size * 0.62, { size: size * 0.32, color: C.ink, align: 'center' });
    },
  };
}

interface TextStyle {
  size: number;
  color?: string;
  weight?: number;
  italic?: boolean;
  align?: CanvasTextAlign;
  /** Letter spacing in pixels. */
  spacing?: number;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, style: TextStyle): void {
  ctx.font = `${style.italic ? 'italic ' : ''}${style.weight ?? 800} ${style.size}px ${DISPLAY}`;
  ctx.fillStyle = style.color ?? C.chalk;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${style.spacing ?? 0}px`;
  ctx.fillText(value, x, y);
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
}

/** Text shrunk until it fits `maxWidth`, never below `min`. */
function fitText(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  style: TextStyle & { min: number },
): void {
  let size = style.size;
  for (; size > style.min; size -= 2) {
    ctx.font = `${style.italic ? 'italic ' : ''}${style.weight ?? 800} ${size}px ${DISPLAY}`;
    if (ctx.measureText(value).width <= maxWidth) break;
  }
  text(ctx, value, x, y, { ...style, size });
}

/** A rectangle with the bottom-right corner cut, like the app's panels. */
function cut(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, corner: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - corner);
  ctx.lineTo(x + w - corner, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function stripe(ctx: CanvasRenderingContext2D, from: number, to: number, color: string): void {
  // 115deg like the CSS background: a band across the picture.
  const g = ctx.createLinearGradient(0, 0, W, H * 0.47);
  g.addColorStop(0, 'transparent');
  g.addColorStop(from, 'transparent');
  g.addColorStop(from, color);
  g.addColorStop(to, color);
  g.addColorStop(to, 'transparent');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function score(m: Match): string {
  return `${m.homeGoals}–${m.awayGoals}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
}
