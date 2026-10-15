#!/usr/bin/env node
/**
 * tools/check-kicad.mjs
 * 用**本机 KiCad** 真实验证生成的符号库（这是最强的验证：KiCad 自己的解析器）。
 *
 * 用法：node tools/check-kicad.mjs
 *
 * 做两件事：
 *   ① `sym export svg`  → 把 14 个符号全部渲染出来（能渲染 = 解析通过 + 版式可目视）
 *   ② 输出 SVG 目录，供人用浏览器/看图工具检查引脚名有没有撞字
 *
 * ⛔ 绝不调用 `kicad-cli sym upgrade`：那是**原地改写**，会污染生成物。
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT } from './design.config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, 'build', `${PROJECT.libName}.kicad_sym`);
const OUT = join(HERE, 'build', 'svg');

/** 找 kicad-cli：优先环境变量，其次常见安装位置 */
function findCli() {
  if (process.env.KICAD_CLI && existsSync(process.env.KICAD_CLI)) return process.env.KICAD_CLI;
  const cands = [
    'F:\\Kicad\\bin\\kicad-cli.exe',                 // 本机（注册表 InstallLocation = F:\Kicad）
    'C:\\Program Files\\KiCad\\10.0\\bin\\kicad-cli.exe',
    'C:\\Program Files\\KiCad\\9.0\\bin\\kicad-cli.exe',
    'C:\\Program Files\\KiCad\\8.0\\bin\\kicad-cli.exe',
  ];
  for (const c of cands) if (existsSync(c)) return c;
  const w = spawnSync('where.exe', ['kicad-cli'], { encoding: 'utf8', shell: false });
  const p = (w.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  if (p && existsSync(p)) return p;
  return null;
}

const cli = findCli();
if (!cli) {
  console.error('✗ 找不到 kicad-cli。可用环境变量 KICAD_CLI 指定完整路径。');
  process.exit(2);
}
console.log(`kicad-cli : ${cli}`);
const ver = spawnSync(cli, ['--version'], { encoding: 'utf8' });
console.log(`version   : ${(ver.stdout || '').trim() || '(空)'}`);
if (!existsSync(LIB)) {
  console.error(`✗ 未找到 ${LIB}，先跑 node tools/gen-lib.mjs`);
  process.exit(2);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const r = spawnSync(cli, ['sym', 'export', 'svg', '--output', OUT, '--black-and-white', LIB],
  { encoding: 'utf8', shell: false });
const svgs = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.svg')) : [];
console.log(`\nexport svg exit=${r.status}  渲染出 ${svgs.length} 个符号`);
if (r.stderr) console.log('stderr:', r.stderr.trim().slice(0, 300));

const expect = 14;   // 与 design.config.mjs 的元件条目数一致
if (r.status !== 0 || svgs.length !== expect) {
  console.error(`\n✗ KiCad 验证失败：期望 ${expect} 个符号，实际 ${svgs.length}（exit ${r.status}）`);
  process.exit(1);
}
console.log('✓ KiCad 解析并渲染全部符号通过');
console.log(`  目视检查目录：${OUT}`);
console.log('  （建议逐个看 SVG，确认引脚名没有互相压字）');
