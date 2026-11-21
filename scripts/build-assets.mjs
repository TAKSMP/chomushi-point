// Crops the shared sprite sheet into individual UI parts and converts
// images to web-friendly WebP. Also generates PWA icons.
// Usage: npm run assets   (re-run only when files under assets/ change)
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => path.join(root, 'assets', p);
const out = path.join(root, 'public', 'img');
const iconsOut = path.join(root, 'public', 'icons');
await mkdir(out, { recursive: true });
await mkdir(iconsOut, { recursive: true });

const PAD = 2;
// [name, left, top, right, bottom] measured from the alpha channel of shared-ui-sprite-sheet.png
const parts = [
  ['title-board', 153, 15, 1373, 276, 900],
  ['plank', 61, 307, 733, 477, 480],
  ['plank-selected', 788, 306, 1468, 479, 480],
  ['hanging-sign', 45, 489, 461, 699, 360],
  ['pill-yellow', 489, 535, 969, 684, 420],
  ['pill-red', 1000, 534, 1491, 684, 420],
  ['grasshopper', 324, 704, 625, 994, 300],
  ['butterfly', 846, 716, 1176, 974, 300],
];

const sheet = src('ui/shared-ui-sprite-sheet.png');
for (const [name, l, t, r, b, width] of parts) {
  await sharp(sheet)
    .extract({ left: l - PAD, top: t - PAD, width: r - l + PAD * 2, height: b - t + PAD * 2 })
    .resize({ width })
    .webp({ quality: 88, alphaQuality: 95 })
    .toFile(path.join(out, `${name}.webp`));
}

// Point tokens (add / subtract). Same crop window so the number sits in the same spot.
const tokenBox = { left: 318, top: 22, width: 874, height: 934 };
for (const [name, file] of [
  ['token-add', 'ui/point-token-add-yellow.png'],
  ['token-sub', 'ui/point-token-subtract-red.png'],
]) {
  await sharp(src(file)).extract(tokenBox).resize({ width: 220 })
    .webp({ quality: 88, alphaQuality: 95 }).toFile(path.join(out, `${name}.webp`));
}

// Background
await sharp(src('backgrounds/forest-clearing-background.png'))
  .webp({ quality: 82 }).toFile(path.join(out, 'forest-bg.webp'));
await sharp(src('backgrounds/forest-clearing-background.png'))
  .resize({ width: 40 }).blur(1).webp({ quality: 50 }).toFile(path.join(out, 'forest-bg-tiny.webp'));

// PWA icons: butterfly on a leafy green tile
const butterfly = await sharp(sheet).extract({ left: 846, top: 716, width: 330, height: 258 }).png().toBuffer();
async function icon(size, file, inset) {
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><radialGradient id="g" cx="50%" cy="40%" r="70%">
        <stop offset="0" stop-color="#bff07a"/><stop offset="1" stop-color="#3f9a2c"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  const w = Math.round(size * (1 - inset * 2));
  const fg = await sharp(butterfly).resize({ width: w }).toBuffer();
  const meta = await sharp(fg).metadata();
  await sharp(bg).composite([{ input: fg, left: Math.round((size - w) / 2), top: Math.round((size - meta.height) / 2) }])
    .png().toFile(path.join(iconsOut, file));
}
await icon(192, 'icon-192.png', 0.1);
await icon(512, 'icon-512.png', 0.1);
await icon(512, 'icon-maskable-512.png', 0.2);
await icon(180, 'apple-touch-icon.png', 0.12);
await icon(64, 'favicon-64.png', 0.06);
console.log('assets built');
