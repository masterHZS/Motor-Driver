import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('file:///C:/Users/limer/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/');
const sharp = require('sharp');

const svg = fs.readFileSync(process.argv[2]);
const scale = parseFloat(process.argv[4] || '1.6');
const png = await sharp(svg, { density: 72 * scale })
  .resize({ width: Math.round(1198.08 * scale) })
  .png()
  .toBuffer();
fs.writeFileSync(process.argv[3], png);
console.log('png bytes', png.length);
