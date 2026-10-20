// The Pachanga mark: an italic P whose round counter is a football, with optional speed lines
// and an offset shadow. Shared by the icon renderer and the design previews.

export const COLORS = {
  ink: '#0a0f1e',
  pitch: '#141c33',
  volt: '#c8ff2e',
  cyan: '#18d6ff',
  flare: '#ff3b6b',
  chalk: '#f2f5ff',
};

const SKEW_DEG = 10;
const SKEW = Math.tan((SKEW_DEG * Math.PI) / 180);
// Upright proportions (the italic skew is applied when drawing).
const STEM = 13; // stem width, equal to the ring so the ball sits evenly
const RING = 13; // bowl thickness around the hole
const COUNTER = 13.5; // hole radius
const RIM = 1.6; // gap between hole and ball, reads as the hole's edge
const BASE = 76; // cap height
const OUTER = COUNTER + RING;
const CX = STEM + COUNTER; // hole centre: the stem is the hole's left wall
const CY = OUTER;

/**
 * The mark with its optical reference at the origin, `size` units tall. Options:
 * - lines: colour of the speed lines, or null
 * - shadow: colour of the offset shadow, or null
 */
export function markBody({ bg, letter, lines = null, shadow = null }, size) {
  const k = size / BASE;
  const map = (x, y) => [k * (x - SKEW * y), k * y];
  const letterShape = (fill, dx = 0, dy = 0) =>
    `<g transform="translate(${dx} ${dy}) scale(${k}) skewX(-${SKEW_DEG})">` +
    `<rect x="0" y="0" width="${STEM}" height="${BASE}" rx="2.2" fill="${fill}"/>` +
    `<path d="M${STEM - 1} 0H${CX}A${OUTER} ${OUTER} 0 0 1 ${CX} ${2 * OUTER}H${STEM - 1}z" fill="${fill}"/>` +
    `</g>`;

  const [hx, hy] = map(CX, CY);
  const rHole = COUNTER * k;
  const rBall = (COUNTER - RIM) * k;
  const pr = rBall * 0.92;
  const pentagon =
    `M${hx} ${hy - pr * 0.6}l${pr * 0.57} ${pr * 0.41}-${pr * 0.22} ${pr * 0.67}` +
    `h-${pr * 0.7}l-${pr * 0.22}-${pr * 0.67}z`;

  const off = 0.045 * size; // shadow offset, down-right
  const shadowShape = shadow ? letterShape(shadow, off, off) : '';

  // Speed lines to the left of the stem, centred on the ball's height.
  const stemLeft = map(0, CY)[0];
  const lx = stemLeft - 0.38 * size;
  const sw = 0.055 * size;
  const speed = lines
    ? `<path d="M${lx + 0.1 * size} ${hy - 0.16 * size}h${0.17 * size}` +
      `M${lx} ${hy}h${0.22 * size}` +
      `M${lx + 0.12 * size} ${hy + 0.16 * size}h${0.11 * size}" ` +
      `stroke="${lines}" stroke-width="${sw}" stroke-linecap="round"/>`
    : '';

  return (
    speed +
    shadowShape +
    letterShape(letter) +
    `<circle cx="${hx}" cy="${hy}" r="${rHole}" fill="${bg}"/>` +
    `<circle cx="${hx}" cy="${hy}" r="${rBall}" fill="${COLORS.chalk}"/>` +
    `<path d="${pentagon}" fill="${COLORS.ink}"/>`
  );
}

/**
 * Optical centre of a drawing: halfway between its bounding-box centre and the centroid of its
 * ink, measured on a rendered bitmap with the given resvg `Resvg` class.
 */
export function opticalCentre(Resvg, body) {
  const S = 400, PAD = 150;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="${-PAD} ${-PAD} ${S} ${S}">${body}</svg>`;
  const { pixels, width, height } = new Resvg(svg).render();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = pixels[(y * width + x) * 4 + 3] / 255;
      if (a < 0.02) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      sx += x * a; sy += y * a; sw += a;
    }
  }
  return [((minX + maxX) / 2 + sx / sw) / 2 - PAD, ((minY + maxY) / 2 + sy / sw) / 2 - PAD];
}

/** A 96×96 icon: background plus the optically centred mark. */
export function iconSvg(Resvg, params, { size = 62, radius = 22, fullBleed = false } = {}) {
  const body = markBody(params, size);
  const [ox, oy] = opticalCentre(Resvg, body);
  const bg = fullBleed
    ? `<rect width="96" height="96" fill="${params.bg}"/>`
    : `<rect width="96" height="96" rx="${radius}" fill="${params.bg}"/>`;
  return `${bg}<g transform="translate(${48 - ox} ${48 - oy})">${body}</g>`;
}
