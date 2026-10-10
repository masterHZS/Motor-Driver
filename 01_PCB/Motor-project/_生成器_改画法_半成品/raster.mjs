/**
 * SVG → PNG 栅格化（用于目视审图）
 *
 * 用法：node _生成器/raster.mjs <src.svg> <dst.png> [width] [crop]
 *   crop = "left,top,width,height"（单位 = SVG 用户单位 px）
 *
 * 优先用本地 PyMuPDF（无需 npm 依赖）；没有时回退到 sharp。
 * 注：原版硬编码了上一台机器的路径（C:/Users/limer/...），换机就会失败，已改为自动探测。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [src, dst, widthArg, crop] = process.argv.slice(2);
if (!src || !dst) {
  console.error('用法: node raster.mjs <src.svg> <dst.png> [width] [crop]');
  process.exit(2);
}
const width = parseInt(widthArg || '2000', 10);

/* ---- 方案 1：PyMuPDF（推荐，纯本地、无 npm 依赖） ---- */
function tryPymupdf() {
  const py = `
import pymupdf, sys
src, dst, width, crop = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
doc = pymupdf.open(src)
page = doc[0]
clip = None
if crop:
    l, t, w, h = [float(v) for v in crop.split(',')]
    clip = pymupdf.Rect(l, t, l + w, t + h)
base = clip.width if clip else page.rect.width
zoom = width / base
pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip)
pix.save(dst)
print(f"pymupdf -> {dst} {pix.width}x{pix.height}")
`;
  for (const exe of ['python', 'python3', 'py']) {
    try {
      execFileSync(exe, ['-c', py, src, dst, String(width), crop ?? ''], { stdio: 'inherit' });
      return true;
    } catch { /* 试下一个解释器 */ }
  }
  return false;
}

/* ---- 方案 2：sharp 回退 ---- */
async function trySharp() {
  let sharp;
  for (const spec of ['sharp', path.join(process.cwd(), 'node_modules', 'sharp', 'lib', 'index.js')]) {
    try { sharp = (await import(spec)).default; break; } catch { /* 继续 */ }
  }
  if (!sharp) return false;
  let pipe = sharp(fs.readFileSync(src), { density: 96 });
  if (crop) {
    const [l, t, w, h] = crop.split(',').map(Number);
    pipe = pipe.extract({ left: Math.round(l), top: Math.round(t), width: Math.round(w), height: Math.round(h) });
  }
  const png = await pipe.resize({ width }).png().toBuffer();
  fs.writeFileSync(dst, png);
  console.log(`sharp -> ${dst} width=${width} bytes=${png.length}`);
  return true;
}

if (!tryPymupdf() && !(await trySharp())) {
  console.error('栅格化失败：既没有 PyMuPDF 也没有 sharp。');
  console.error('  安装其一：  pip install pymupdf   或   npm i sharp');
  process.exit(1);
}
