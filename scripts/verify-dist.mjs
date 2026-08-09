import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 配布物の検査。
 * ・dist/ に uchikiri.html / ALLOWED_EXTRA_FILES 以外のファイルがないこと
 * ・HTML が外部リソース（http / https / 相対パスのアセット）を参照していないこと
 */

/*
 * v7.32: og:image は絶対URLでないと動かないため、data URI 化できず単一HTMLの外に置く。
 * uchikiri.html 本体が単一ファイルである原則はそのまま守り、
 * OGP用の画像だけを例外として許可する
 */
const ALLOWED_EXTRA_FILES = new Set(['ogp.png']);

const dist = resolve(process.cwd(), 'dist');
const problems = [];

function walk(dir, prefix = '') {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) walk(full, rel);
    else if (rel !== 'uchikiri.html' && !ALLOWED_EXTRA_FILES.has(rel)) problems.push(`dist に余分なファイルがあります: ${rel}`);
  }
}

let html = '';
try {
  walk(dist);
  html = readFileSync(join(dist, 'uchikiri.html'), 'utf8');
} catch (e) {
  problems.push(`dist/uchikiri.html を読めません: ${e.message}`);
}

if (html) {
  const external = html.match(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']/gi) ?? [];
  for (const m of external) problems.push(`外部リソース参照が残っています: ${m}`);

  const relative =
    html.match(/(?:src|href)\s*=\s*["'](?!data:|#|javascript:)[^"']*\.(?:js|css|png|jpe?g|svg|woff2?)["']/gi) ??
    [];
  for (const m of relative) problems.push(`埋め込まれていないアセット参照があります: ${m}`);

  if (/<script[^>]+\ssrc=/i.test(html)) problems.push('外部 script タグが残っています');

  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`dist/uchikiri.html : ${kb} KB (単一ファイル)`);
}

if (problems.length > 0) {
  console.error('\n配布物の検査に失敗しました:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('配布物の検査: OK（uchikiri.html 1 ファイルのみ / 外部参照なし）');
