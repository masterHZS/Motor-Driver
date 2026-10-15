#!/usr/bin/env node
/**
 * tools/check-lcsc.mjs
 * 用立创官方组件数据接口核实「LCSC 货号 -> 官方封装名」。
 *
 * 依据：01_PCB/Motor-project/器件选型规范.md  R0.2 / R0.4
 *   接口：https://lceda.cn/api/products/{LCSC货号}/components
 *   取字段：result.dataStr.head.c_para.package  （= 立创官方库里的封装名）
 *
 * ⚠️ 本机 PowerShell 的 TLS 不通，Node 的 fetch 可以。若网络被拦，脚本会明确报错，不会伪造结果。
 *
 * 用法：
 *   node tools/check-lcsc.mjs C6186 C5846954 ...
 *   node tools/check-lcsc.mjs --from-config        # 检查 design.config.mjs 里已填的货号
 */

import { COMPONENTS } from './design.config.mjs';

const API = (code) => `https://lceda.cn/api/products/${code}/components`;

async function lookup(code) {
  const res = await fetch(API(code), { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const head = j?.result?.dataStr?.head;
  if (!head) throw new Error('返回结构里没有 dataStr.head（货号可能不存在）');
  const para = head.c_para || {};
  return {
    code,
    title: head.title || (j.result && j.result.title) || '',
    manufacturer: para.Manufacturer || para.manufacturer || '',
    mpn: para['Manufacturer Part'] || para.manufacturer_part || '',
    package: para.package || '',
    stock: j?.result?.lcsc?.stock ?? para.stock ?? '',
  };
}

const args = process.argv.slice(2);
let codes = args.filter((a) => !a.startsWith('--'));
if (args.includes('--from-config')) {
  codes = COMPONENTS.filter((c) => c.lcsc).map((c) => c.lcsc);
}
if (!codes.length) {
  console.error('用法: node tools/check-lcsc.mjs <C号...> | --from-config');
  process.exit(2);
}

let fail = 0;
console.log('货号        封装名（立创官方库）                              型号 / 厂商 / 现货');
console.log('-'.repeat(110));
for (const code of codes) {
  try {
    const r = await lookup(code);
    console.log(`${r.code.padEnd(11)} ${String(r.package).padEnd(46)} ${r.title} | ${r.manufacturer} | 现货 ${r.stock}`);
  } catch (e) {
    fail += 1;
    console.log(`${code.padEnd(11)} ✗ 查询失败：${e.message}`);
  }
}
console.log('-'.repeat(110));
console.log(fail ? `✗ ${fail}/${codes.length} 条查询失败（不要凭猜测填封装名）` : `✓ ${codes.length} 条全部核实`);
process.exit(fail ? 1 : 0);
