/**
 * 严格解析参考手册的「端口功能对照表」（由 _t76.txt 的 pipe 分隔导出）。
 *
 * 背景：该文本是 PDF 表格提取结果，行为 pipe 分隔。
 *       表头第 5~12 列 = Pxsel=0..7；行内第 5 列起的 8 个单元格 = GPIO + 7 种复用。
 *       之前用「顺序映射」会因单元格缺失而整体错位，故本脚本按**固定列位**解析。
 */
import fs from 'node:fs';

const f = process.argv[2];
const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);

const cells = (l) => l.split('|').map(s => s.trim());
const hdr = cells(lines[6]);          // Pxsel 表头行
console.log('=== 表头列位 ===');
hdr.forEach((c, i) => { if (c) console.log(`  col${i}: ${c}`); });

/* 表头里 Pxsel=k 出现在哪一列 */
const selCol = {};
hdr.forEach((c, i) => {
  const m = /Pxsel=(\d)/.exec(c);
  if (m) selCol[+m[1]] = i;
});
console.log('');
console.log('=== 每个引脚按列位解析 ===');
console.log('引脚 | AIN | VCIN | ' + Object.keys(selCol).map(k => `sel${k}`).join(' | '));
console.log('-'.repeat(120));

const pinRe = /^(P\d\d)/;
for (let i = 7; i < lines.length; i++) {
  const c = cells(lines[i]);
  /* 引脚名列 = 第 4 列（index 4），格式 Pxx */
  const pin = c[4];
  if (!pin || !pinRe.test(pin)) continue;
  const ain = c[0] || '', vcin = c[2] || '';
  const sels = Object.keys(selCol).map(k => (c[selCol[k]] || '').padEnd(12));
  console.log(`${pin} | ${ain.padEnd(9)} | ${vcin.padEnd(7)} | ${sels.join(' | ')}`);
}

/* 专项：TIM4_CHA / TIM4_CHB / TIM6_CHA / TIM6_CHB / TIM5_CHA / TIM5_CHB 分别落在哪个脚的哪个 sel */
console.log('');
console.log('=== 反向索引：各定时器通道 → (引脚, sel) ===');
const want = ['TIM4_CHA', 'TIM4_CHB', 'TIM5_CHA', 'TIM5_CHB', 'TIM6_CHA', 'TIM6_CHB'];
const found = {};
for (let i = 7; i < lines.length; i++) {
  const c = cells(lines[i]);
  const pin = c[4];
  if (!pin || !pinRe.test(pin)) continue;
  for (const k of Object.keys(selCol)) {
    const v = c[selCol[k]] || '';
    if (want.includes(v)) {
      (found[v] ??= []).push(`${pin}(sel${k})`);
    }
  }
}
for (const w of want) console.log(`  ${w.padEnd(10)} → ${(found[w] ?? ['(未找到)']).join(', ')}`);

/* 专项：P34 / P23 / P15 / P24 / P35 的完整功能 */
console.log('');
console.log('=== A 相候选脚的完整功能 ===');
for (let i = 7; i < lines.length; i++) {
  const c = cells(lines[i]);
  const pin = c[4];
  if (!['P34', 'P23', 'P15', 'P24', 'P35'].includes(pin)) continue;
  const list = Object.keys(selCol).map(k => `sel${k}=${c[selCol[k]] || '-'}`);
  console.log(`  ${pin}: ${list.join('  ')}`);
}
