import fs from 'node:fs';

const f = process.argv[2];
const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);

/* 数据手册 §3 引脚表结构（按行）：
   Pin No.(QFN20) / Pin No.(TSSOP20) / Pin No.(SOP20) / Pin Name / Pin Type / Description... 
   表头在第 1096 行附近。逐行扫描，遇到 "数字+数字+数字+名字" 的模式即为一行的开始。 */

const start = lines.findIndex(l => l.includes('TSSOP20'));
let i = start;
const rows = [];
while (i < lines.length) {
  const a = lines[i]?.trim(), b = lines[i + 1]?.trim(), c = lines[i + 2]?.trim();
  if (/^\d+$/.test(a) && /^\d+$/.test(b) && /^\d+$/.test(c)) {
    // 收集接下来直到下一个 "数字,数字,数字" 模式的文本
    const body = [];
    let j = i + 3;
    while (j < lines.length) {
      const x = lines[j]?.trim();
      const y = lines[j + 1]?.trim();
      const z = lines[j + 2]?.trim();
      if (/^\d+$/.test(x) && /^\d+$/.test(y) && /^\d+$/.test(z) && body.length > 0) break;
      if (body.length > 30) break;
      body.push(x);
      j++;
    }
    rows.push({ qfn: a, tssop: b, sop: c, body });
    i = j;
  } else i++;
}

console.log(`解析到 ${rows.length} 行引脚定义`);
console.log('');
console.log('TSSOP20 脚号 | 引脚名 | 前几项功能');
console.log('-'.repeat(70));
for (const r of rows) {
  // body[0]=Pin Name(中文)? 实际上第一项是 Pin Name，随后 Pin Type + 描述
  const name = r.body[0] ?? '';
  const funcs = r.body.slice(1).filter(x => x && !/^(GPIO|模拟输入|复位输入端口.*|数字输入.*)$/.test(x));
  console.log(`${String(r.tssop).padStart(3)}  | ${(name || '(空)').padEnd(22)} | ${funcs.slice(0, 8).join(', ')}`);
}
