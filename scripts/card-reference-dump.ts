/**
 * カード・役の一覧HTMLを作るための中間データを吐き出す（`npm run cards` の前半）。
 * combos.ts は条件関数を持つTypeScriptのレジストリなので、tsxで読み込んで
 * 関数を落とした素のデータに変換してから、レンダラ側（.mjs）に渡す。
 */
import fs from 'node:fs';
import { COMBO_REGISTRY } from '../src/core/combos';
import { ENDING_CARDS } from '../src/core/finale';
import cards from '../src/data/cards.json';

/** 関数（match / available など）と空配列を落として素のデータにする */
const plain = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => typeof v !== 'function' && v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );

const combos = COMBO_REGISTRY.map((c) => plain(c as unknown as Record<string, unknown>));
const endings = ENDING_CARDS.map((c) => plain(c as unknown as Record<string, unknown>));

const out = process.argv[2];
if (!out) throw new Error('出力先を指定してください: tsx scripts/card-reference-dump.ts <out.json>');
fs.writeFileSync(out, JSON.stringify({ cards, combos, endings }, null, 1));
console.log(
  `カード ${cards.characters.length + cards.developments.length}枚 / 役 ${combos.length}種 / 結末 ${endings.length}種 を ${out} に書き出しました`,
);
