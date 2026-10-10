import { createRequire } from 'node:module';
const require = createRequire('file:///C:/Users/limer/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/');
const sharp = require('sharp');
import fs from 'node:fs';

const mode = process.argv[2];
const svg = fs.readFileSync(process.argv[3]);
const BASE = 6; // px per pt

if (mode === 'base') {
  const png = await sharp(svg, { density: 72 * BASE })
    .resize({ width: Math.round(1198.08 * BASE) })
    .png().toBuffer();
  fs.writeFileSync(process.argv[4], png);
  const m = await sharp(png).metadata();
  console.log('base', m.width, m.height, png.length);
} else {
  const [, , , src, out, x, y, w, h] = process.argv;
  const X = +x, Y = +y, WW = +w, HH = +h;
  const png = await sharp(src)
    .extract({ left: Math.round(X * BASE), top: Math.round(Y * BASE), width: Math.round(WW * BASE), height: Math.round(HH * BASE) })
    .resize({ width: Math.round(WW * 7) })
    .png().toBuffer();
  fs.writeFileSync(out, png);
  console.log(out, png.length);
}
