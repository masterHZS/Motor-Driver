const fs = require('fs');
const https = require('https');
const dst = process.argv[2];
function getBuf(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(getBuf(r.headers.location));
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => res(Buffer.concat(chunks)));
    }).on('error', rej);
  });
}
(async () => {
  const j = JSON.parse((await getBuf('https://pypi.org/pypi/pypdf/json')).toString('utf8'));
  console.log('pypdf version', j.info.version);
  const pick = j.urls.find(u => u.filename.endsWith('py3-none-any.whl'));
  console.log('pick', pick.filename);
  const b = await getBuf(pick.url);
  fs.writeFileSync(dst, b);
  console.log('saved', b.length, '->', dst);
})();
