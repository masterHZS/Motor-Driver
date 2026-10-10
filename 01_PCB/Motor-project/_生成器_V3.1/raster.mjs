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

/* ---- 方案 2：sharp 回退 ----
 * sharp 通常不在本工程的 node_modules 里，但 **DSH 自带一份**
 * （`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\sharp`）。
 * 注意 sharp 0.35+ 的入口是 `dist/index.cjs`（不是 lib/index.js），用 createRequire 让
 * Node 自己按 package.json 解析，避免写死路径。 */
async function trySharp() {
  let sharp;
  const { createRequire } = await import('node:module');
  const bases = [
    path.join(process.cwd(), 'package.json'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'package.json'),
  ].filter(Boolean);
  for (const b of bases) {
    try { if (!fs.existsSync(b)) continue; } catch { continue; }
    try {
      const req = createRequire(b);
      sharp = req('sharp');
      if (sharp) break;
    } catch { /* 试下一个 base */ }
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

/* ---- 方案 3：headless Chrome / Edge（Windows 上通常一定有，无需 npm 依赖） ---- */
function tryBrowser() {
  const cands = [
    `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);
  const exe = cands.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (!exe) return false;

  const abs = path.resolve(src);
  /* headless 截图只能截视口：用 --window-size 指定输出尺寸。
     crop 时用一个只含裁剪窗的临时 HTML，把 SVG 平移并裁剪后渲染。 */
  const tmpDir = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'raster-'));
  const htmlPath = path.join(tmpDir, 'page.html');
  const pngPath = path.join(tmpDir, 'shot.png');

  let w = width, h;
  const meta = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(fs.readFileSync(abs, 'utf8'));
  const svgW = meta ? +meta[1] : width, svgH = meta ? +meta[2] : width;
  if (crop) {
    const [l, t, cw, ch] = crop.split(',').map(Number);
    w = width; h = Math.round(width * ch / cw);
    fs.writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:#fff}
#v{position:absolute;left:${-l * (width / cw)}px;top:${-t * (width / cw)}px;width:${svgW * (width / cw)}px}
#v svg{width:100%;height:auto;display:block}</style>
<div id="v">${fs.readFileSync(abs, 'utf8').replace(/<\?xml[^>]*\?>/, '')}</div>`);
  } else {
    h = Math.round(width * svgH / svgW);
    fs.writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}svg{width:${w}px;height:auto;display:block}</style>
${fs.readFileSync(abs, 'utf8').replace(/<\?xml[^>]*\?>/, '')}`);
  }

  try {
    execFileSync(exe, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--no-sandbox', `--screenshot=${pngPath}`, `--window-size=${w},${h}`,
      `--user-data-dir=${path.join(tmpDir, 'prof')}`,
      `file:///${htmlPath.replace(/\\/g, '/')}`,
    ], { stdio: 'ignore' });
    if (!fs.existsSync(pngPath)) return false;
    fs.copyFileSync(pngPath, dst);
    console.log(`browser -> ${dst} ${w}x${h}`);
    return true;
  } catch {
    return false;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

if (!tryPymupdf() && !(await trySharp()) && !tryBrowser()) {
  console.error('栅格化失败：PyMuPDF / sharp / Chrome 都不可用。');
  console.error('  安装其一：  pip install pymupdf   或   npm i sharp');
  process.exit(1);
}
