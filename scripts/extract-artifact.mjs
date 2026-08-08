/**
 * 単一HTML（dist/uchikiri.html）や一覧HTMLから、Artifact用に
 * doctype/html/head/body タグを剥がした断片を作る。
 * 手で切り貼りすると壊すのでスクリプト化してある。
 * 使い方: node scripts/extract-artifact.mjs <in.html> <out.html>
 */
import fs from 'node:fs';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) throw new Error('使い方: node scripts/extract-artifact.mjs <in.html> <out.html>');

let html = fs.readFileSync(src, 'utf8');
html = html.replace(/^<!doctype[^>]*>\r?\n?/i, '');
html = html.replace(/<html[^>]*>\r?\n?/i, '');
html = html.replace(/<\/html>\s*$/i, '');
html = html.replace(/\s*<head>\r?\n?/i, '');
html = html.replace(/<\/head>\r?\n?/i, '');
html = html.replace(/\s*<body[^>]*>\r?\n?/i, '');
html = html.replace(/<\/body>\s*/i, '');
html = html.replace(/^\s*<meta charset="UTF-8" \/>\r?\n?/im, '');
html = html.replace(/^\s*<meta name="viewport"[^>]*\/>\r?\n?/im, '');
html = html.replace(/^\s*<meta name="theme-color"[^>]*\/>\r?\n?/im, '');

fs.writeFileSync(dst, html.trim() + '\n');
console.log(`extracted: ${src} -> ${dst}`);
