// Renders the app icons from the SVG sources. Needs @resvg/resvg-js:
//   npm i --no-save @resvg/resvg-js && node scripts/icons/render-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const here = (file) => new URL(file, import.meta.url);
const out = (file) => new URL(`../../public/${file}`, import.meta.url);

const render = (svgFile, size, target) => {
  const png = new Resvg(readFileSync(here(svgFile)), { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out(target), png);
};

for (const size of [72, 96, 128, 144, 152, 192, 384, 512]) render('icon.svg', size, `icons/icon-${size}x${size}.png`);
for (const size of [192, 512]) render('icon-maskable.svg', size, `icons/maskable-${size}x${size}.png`);
render('icon-maskable.svg', 180, 'icons/apple-touch-icon.png');
writeFileSync(out('favicon.svg'), readFileSync(here('icon.svg')));
console.log('Icons rendered.');
