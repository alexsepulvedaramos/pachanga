// Renders every app icon from the Pachanga mark. Needs @resvg/resvg-js:
//   npm i --no-save @resvg/resvg-js && node scripts/icons/render-icons.mjs
import { writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { COLORS, iconSvg } from './pachanga-mark.mjs';

// Lime background, black P, cyan offset shadow and speed lines.
const MARK = { bg: COLORS.volt, letter: COLORS.ink, lines: COLORS.ink, shadow: COLORS.cyan };

const out = (file) => new URL(`../../public/${file}`, import.meta.url);
const svgDoc = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`;
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

// Rounded icon: browser tab, desktop install, Android "any".
const rounded = svgDoc(iconSvg(Resvg, MARK, { size: 56 }));
// Full-bleed icons: Android adaptive icons keep the mark inside the central safe circle;
// iOS rounds the corners itself.
const maskable = svgDoc(iconSvg(Resvg, MARK, { size: 44, fullBleed: true }));
const apple = svgDoc(iconSvg(Resvg, MARK, { size: 52, fullBleed: true }));

for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) {
  writeFileSync(out(`icons/icon-${size}x${size}.png`), png(rounded, size));
}
for (const size of [192, 512]) writeFileSync(out(`icons/maskable-${size}x${size}.png`), png(maskable, size));
writeFileSync(out('icons/apple-touch-icon.png'), png(apple, 180));
// The favicon doubles as the logo in the app header.
writeFileSync(out('favicon.svg'), rounded);
console.log('Icons rendered.');
