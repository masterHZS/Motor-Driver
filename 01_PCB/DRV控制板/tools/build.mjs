#!/usr/bin/env node
/**
 * tools/build.mjs
 * 控制板设计流程的单一入口。
 *
 * 用法：
 *   node tools/build.mjs check      只做数据源自检（阶段② 即可运行）
 *   node tools/build.mjs lib        生成 KiCad 符号库
 *   node tools/build.mjs libgen     生成库 + 转成嘉立创EDA库包 .elibz2
 *   node tools/build.mjs sch        生成原理图（阶段③ 启用）
 *   node tools/build.mjs pcb        生成 PCB（阶段④ 启用）
 *   node tools/build.mjs eda        原理图/PCB -> eprj3（嘉立创EDA专业版工程）
 *   node tools/build.mjs all        check + lib + sch + pcb + eda
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selfCheck as checkPins, PIN_COUNT } from './lib/pins.mjs';
import { selfCheck as checkParts, COMPONENTS, PROJECT } from './design.config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(HERE, 'build');
const OUT = join(ROOT, '工程');
const VENDOR = join(HERE, 'vendor');

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) {
    console.error(`✗ 命令失败，exit ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

const step = process.argv[2] || 'check';

function doCheck() {
  console.log(`=== ${PROJECT.title} 数据源自检（${PROJECT.version}）===`);
  const pe = checkPins();
  console.log(`引脚表：${PIN_COUNT} 脚 ${pe.length === 0 ? '✓ 连续无重复、分配标记已登记' : '✗ ' + pe.join('; ')}`);
  const { errs, warn } = checkParts();
  console.log(`元件表：${COMPONENTS.length} 个条目`);
  for (const w of warn) console.log(`  ⚠ ${w}`);
  for (const e of errs) console.log(`  ✗ ${e}`);
  if (pe.length || errs.length) {
    console.error('\n✗ 自检失败');
    process.exit(1);
  }
  console.log(`\n✓ 自检通过（${warn.length} 项 LCSC 货号待绑定，不阻塞阶段②）`);
  console.log('⚠ 注意：本自检**只证明数据结构自洽，不证明脚号正确**。');
  console.log('   脚号正确性必须另外跑： node tools/ref-pinmap.mjs --compare   （须 64/64 一致）');
}

/**
 * ★ R1 教训（2026-08-15 审核退回）：脚号绝不能靠文本层推断。
 * 这条把「与 KiCad 官方库逐脚比对」纳入构建链，不一致就**构建失败**。
 */
function doRefCheck() {
  try {
    const r = spawnSync(process.execPath, [join(HERE, 'ref-pinmap.mjs'), '--compare'], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('\n✗ 与 KiCad 官方引脚库比对失败 —— 脚号不可信，禁止用于画图');
      process.exit(1);
    }
  } catch (e) {
    console.error(`✗ 无法运行 ref-pinmap.mjs：${e.message}`);
    process.exit(1);
  }
}

function doLib() { run('node', [join(HERE, 'gen-lib.mjs')]); }

function doLibGen() {
  doLib();
  if (!existsSync(VENDOR)) {
    console.error(`✗ 未找到转换器：${VENDOR}\n  见 tools/README.md 的安装说明`);
    process.exit(1);
  }
  mkdirSync(BUILD, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  run('node', [join(VENDOR, 'scripts', 'convert-kicad-lib.js'), 'convert', BUILD,
    join(OUT, `${PROJECT.libName}.elibz2`), '--name', PROJECT.libName]);
}

function notYet(stage) {
  console.log(`⏸ ${stage} 尚未启用：按 00_DeepSeek执行计划.md，阶段② 的审核门通过后才进入原理图/PCB。`);
  console.log('   数据源（tools/design.config.mjs + tools/lib/pins.mjs）已就绪，届时直接补 gen-sch.mjs / gen-pcb.mjs 即可。');
}

function doEda() {
  if (!existsSync(VENDOR)) {
    console.error(`✗ 未找到转换器：${VENDOR}\n  见 tools/README.md 的安装说明`);
    process.exit(1);
  }
  const src = existsSync(OUT) ? OUT : BUILD;
  mkdirSync(join(ROOT, '工程', 'eprj3'), { recursive: true });
  run('node', [join(VENDOR, 'scripts', 'convert-kicad.js'), 'convert', src,
    join(ROOT, '工程', 'eprj3'), '--project-name', PROJECT.name]);
}

switch (step) {
  case 'check': doCheck(); break;
  case 'ref': doRefCheck(); break;
  case 'guard': doCheck(); doRefCheck(); break;   // ★ 交付前必跑：数据源自检 + 官方脚号比对
  case 'test': run('node', [join(HERE, 'test-guards.mjs')]); break;   // 闸门注入测试（确认闸门真的会拦）
  case 'lib': doLib(); break;
  case 'libgen': doLibGen(); break;
  case 'sch': notYet('原理图生成'); break;
  case 'pcb': notYet('PCB 生成'); break;
  case 'eda': doEda(); break;
  case 'all': doCheck(); doRefCheck(); doLib(); notYet('原理图/PCB'); break;
  default:
    console.error(`未知步骤：${step}\n用法见本文件头部注释`);
    process.exit(2);
}
