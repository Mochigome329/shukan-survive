// オノマトペPNG（黒文字・白背景）をSVGパスにトレースし、
// src/data/sfx.json に { id, viewBox, path } の形で書き出す。
// 使い方: node scripts/trace-sfx.mjs <id>=<png> [<id>=<png> ...]
import { trace } from 'potrace';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.cwd(), 'src/data/sfx.json');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/trace-sfx.mjs <id>=<png> ...');
  process.exit(1);
}

function traceOne(file) {
  return new Promise((res, rej) => {
    trace(file, { threshold: 128, turdSize: 20, optCurve: true, optTolerance: 0.4 }, (err, svg) => {
      if (err) rej(err);
      else res(svg);
    });
  });
}

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};

for (const arg of args) {
  const eq = arg.indexOf('=');
  const id = arg.slice(0, eq);
  const file = resolve(process.cwd(), arg.slice(eq + 1));
  const svg = await traceOne(file);

  const vb = /viewBox="([^"]+)"/.exec(svg);
  // potrace は白地を fill="#ffffff" の背景パスとして出さず、黒の輪郭だけを1つのpathに入れる
  const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error(`no path traced from ${file}`);
  const raw = paths.join(' ');

  // potrace の出力は M / L / C / Z だけで、数値はすべて絶対座標のペア。
  // 偶数番目がx・奇数番目がy として、描き文字が実際に載っている範囲を割り出す。
  // 原画は正方形だが余白が広く、そのまま置くと余白ごと配置されて位置が読めないため
  const nums = raw.match(/-?\d+(\.\d+)?/g).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length - 1; i += 2) {
    minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
  }
  // 縁のストロークがギリギリで切れないよう、インク範囲の外に少しだけ余白を残す
  const pad = (maxX - minX) * 0.02;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  // 高さ1000に正規化して整数に丸める（原画1254pxに対し誤差1px未満、パス長は約4割減）
  const k = 1000 / (maxY - minY);
  let i = 0;
  const d = raw
    .replace(/-?\d+(\.\d+)?/g, (n) => {
      const v = Number(n) - (i++ % 2 === 0 ? minX : minY);
      return String(Math.round(v * k));
    })
    .replace(/ ?, ?/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  existing[id] = { viewBox: `0 0 ${Math.round((maxX - minX) * k)} 1000`, path: d };
  console.log(`${id}: ${(d.length / 1024).toFixed(1)}KB path, viewBox=${existing[id].viewBox}`);
}

writeFileSync(OUT, JSON.stringify(existing, null, 2) + '\n', 'utf8');
console.log(`\n→ ${OUT}  (total ${(JSON.stringify(existing).length / 1024).toFixed(1)}KB)`);
