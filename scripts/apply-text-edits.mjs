/**
 * カード・役一覧（reference/cards.html）で編集したフレーバーテキストを、
 * ソース側（cards.json / combos.ts / finale.ts）へ書き戻す（v7.3）。
 *
 * 使い方: node scripts/apply-text-edits.mjs <card-text-edits.json> [--dry]
 *
 * キーの形式は一覧HTML側の data-edit と同じ:
 *   char:<id>:revealed|hidden|internal   → cards.json の characters
 *   dev:<id>:revealed|hidden|internal    → cards.json の developments
 *   combo:<id>:hintText                  → combos.ts
 *   ending:<id>:epilogue                 → finale.ts
 *
 * 数値や効果は書き戻さない（一覧側でも編集させていない）。
 * 置換対象が1件でない場合は必ず落とす——曖昧なまま書き換えるくらいなら失敗した方がいい。
 */
import fs from 'node:fs';

const [editsPath, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry');
if (!editsPath) throw new Error('使い方: node scripts/apply-text-edits.mjs <card-text-edits.json> [--dry]');

const edits = JSON.parse(fs.readFileSync(editsPath, 'utf8'));
const DESC_FIELDS = new Set(['revealed', 'hidden', 'internal']);

const cardsPath = 'src/data/cards.json';
const combosPath = 'src/core/combos.ts';
const finalePath = 'src/core/finale.ts';

const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
let combosSrc = fs.readFileSync(combosPath, 'utf8');
let finaleSrc = fs.readFileSync(finalePath, 'utf8');

let cardsDirty = false;
let combosDirty = false;
let finaleDirty = false;
const applied = [];
const problems = [];

/** TypeScriptのシングルクォート文字列に入れる形へ整える */
const tsQuote = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** `id: '<id>'` から始まる定義ブロックの中の `<field>: '...'` を1件だけ置換する */
function replaceInBlock(src, id, field, value, what) {
  const idAt = src.indexOf(`id: '${id}'`);
  if (idAt === -1) {
    problems.push(`${what}: id '${id}' が見つからない`);
    return src;
  }
  // 次の定義の開始（= 次の `id: '`）までをこの定義のブロックとみなす
  const nextAt = src.indexOf("id: '", idAt + 5);
  const end = nextAt === -1 ? src.length : nextAt;
  const block = src.slice(idAt, end);
  const re = new RegExp(`(${field}: ')((?:[^'\\\\]|\\\\.)*)(')`);
  const hits = block.match(new RegExp(re.source, 'g'));
  if (!hits || hits.length !== 1) {
    problems.push(`${what}: '${id}' の ${field} の置換対象が1件ではない（${hits ? hits.length : 0}件）`);
    return src;
  }
  const newBlock = block.replace(re, `$1${tsQuote(value)}$3`);
  return src.slice(0, idAt) + newBlock + src.slice(end);
}

/**
 * 省略可能な文字列フィールドを設定する（v7.14）。
 * 空文字なら行ごと消し、値があれば置換、無ければ cutInTemplate の直後に挿入する。
 * hintText と違って「そのフィールドが無い」状態が正常なので、置換だけでは足りない
 */
function setOptionalInBlock(src, id, field, value, what) {
  const idAt = src.indexOf(`id: '${id}'`);
  if (idAt === -1) {
    problems.push(`${what}: id '${id}' が見つからない`);
    return src;
  }
  const nextAt = src.indexOf("id: '", idAt + 5);
  const end = nextAt === -1 ? src.length : nextAt;
  const block = src.slice(idAt, end);
  const lineRe = new RegExp(`\\n[ \\t]*${field}: '(?:[^'\\\\]|\\\\.)*',`);
  const has = lineRe.test(block);

  let newBlock;
  if (value === '') {
    if (!has) return src; // もともと無いので何もしない
    newBlock = block.replace(lineRe, '');
  } else if (has) {
    newBlock = block.replace(lineRe, `\n    ${field}: '${tsQuote(value)}',`);
  } else {
    // cutInTemplate の直後に置く（役の定義でカットイン関連がまとまるように）
    const anchor = block.match(/\n[ \t]*cutInTemplate: '[^']*',/);
    if (!anchor) {
      problems.push(`${what}: '${id}' に ${field} を挿入する位置（cutInTemplate）が見つからない`);
      return src;
    }
    newBlock = block.replace(anchor[0], `${anchor[0]}\n    ${field}: '${tsQuote(value)}',`);
  }
  return src.slice(0, idAt) + newBlock + src.slice(end);
}

for (const [key, value] of Object.entries(edits)) {
  const [kind, id, field] = key.split(':');
  if (!kind || !id || !field) {
    problems.push(`キーの形式が不正: ${key}`);
    continue;
  }

  if (kind === 'char' || kind === 'dev') {
    if (!DESC_FIELDS.has(field)) {
      problems.push(`${key}: descriptions 以外は書き戻さない`);
      continue;
    }
    const list = kind === 'char' ? cards.characters : cards.developments;
    const card = list.find((c) => c.id === id);
    if (!card) {
      problems.push(`${key}: カード '${id}' が cards.json にない`);
      continue;
    }
    if (card.descriptions[field] !== value) {
      card.descriptions[field] = value;
      cardsDirty = true;
      applied.push(key);
    }
  } else if (kind === 'combo') {
    if (field !== 'hintText' && field !== 'sfxId') {
      problems.push(`${key}: 役は hintText と sfxId だけ書き戻せる`);
      continue;
    }
    const before = combosSrc;
    // sfxIdは「無い状態」も正しい値（＝カットイン種別から自動で選ぶ）なので、追加・削除も要る
    combosSrc =
      field === 'sfxId' ? setOptionalInBlock(combosSrc, id, 'sfxId', value, '役') : replaceInBlock(combosSrc, id, 'hintText', value, '役');
    if (combosSrc !== before) {
      combosDirty = true;
      applied.push(key);
    }
  } else if (kind === 'ending') {
    if (field !== 'epilogue') {
      problems.push(`${key}: 結末カードは epilogue だけ書き戻せる`);
      continue;
    }
    const before = finaleSrc;
    finaleSrc = replaceInBlock(finaleSrc, id, 'epilogue', value, '結末');
    if (finaleSrc !== before) {
      finaleDirty = true;
      applied.push(key);
    }
  } else {
    problems.push(`${key}: 未知の種別 '${kind}'`);
  }
}

if (problems.length > 0) {
  console.error('--- 適用できなかったもの ---');
  for (const p of problems) console.error(`  ${p}`);
}

if (dryRun) {
  console.log(`[--dry] 適用対象 ${applied.length}件 / 問題 ${problems.length}件。ファイルは書き換えていない`);
} else {
  if (cardsDirty) fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2) + '\n');
  if (combosDirty) fs.writeFileSync(combosPath, combosSrc);
  if (finaleDirty) fs.writeFileSync(finalePath, finaleSrc);
  console.log(`${applied.length}件を書き戻した（問題 ${problems.length}件）`);
  for (const k of applied) console.log(`  ${k}`);
  if (applied.length > 0) console.log('確認: npx tsc --noEmit && npx vitest run && npm run cards');
}

if (problems.length > 0) process.exitCode = 1;
