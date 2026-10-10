import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const s = buf.toString('latin1');
console.log('size', buf.length, 'header', s.slice(0, 9));

// count pages
const pageCount = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
const pagesCount = (s.match(/\/Type\s*\/Pages/g) || []).length;
console.log('/Type /Page :', pageCount, ' /Type /Pages :', pagesCount);

// objstm?
console.log('ObjStm:', (s.match(/\/ObjStm/g) || []).length);
console.log('XRefStm/xref stream:', (s.match(/\/Type\s*\/XRef/g) || []).length);
console.log('FlateDecode:', (s.match(/FlateDecode/g) || []).length);
console.log('DCTDecode(jpeg):', (s.match(/DCTDecode/g) || []).length);
console.log('CCITTFax:', (s.match(/CCITTFaxDecode/g) || []).length);
console.log('JBIG2:', (s.match(/JBIG2Decode/g) || []).length);

// fonts
const fonts = [...s.matchAll(/\/BaseFont\s*\/([#\w+\-,]+)/g)].map((m) => m[1]);
console.log('fonts:', [...new Set(fonts)].slice(0, 30));

// producer
const m = s.match(/\/Producer\s*\(([^)]*)\)/);
console.log('Producer:', m ? m[1] : '-');
const m2 = s.match(/\/Creator\s*\(([^)]*)\)/);
console.log('Creator:', m2 ? m2[1] : '-');

// Count occurrences of key terms in raw (only useful if uncompressed)
for (const kw of ['HC32F072', 'LQFP', 'VC0', 'OPA', 'ADC', 'TIM6', 'TIMA']) {
  console.log(`raw "${kw}":`, (s.match(new RegExp(kw, 'g')) || []).length);
}
