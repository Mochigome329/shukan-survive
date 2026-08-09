/**
 * 「敵を退場させる手段」が編集会議にどれだけ並ぶかを実測する（バランス調査用）。
 *
 *   npx tsx scripts/measure-exit-cards.ts [試行数]
 *
 * 編集部の要求 battle_6「第14話までに強敵を1人退場させる（死亡か離脱）」は
 * 敵キャラを dead か waiting に送れば達成できる。その手段が期限までに
 * 何回提示されるかを、実際の rollPack で数える。
 *
 * 要求を未達成のまま置いた最悪ケースを見るので、
 * 「手立てカードの供給」（demands.ts の shopHints）が効いた状態の数字になる。
 */
import fs from 'node:fs';
import { createRun } from '../src/core/run';
import { rollPack } from '../src/core/shop';
import { buildGameData } from '../src/core/validate';

const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const data = buildGameData(
  read('src/data/cards.json'),
  read('src/data/quotas.json'),
  read('src/data/tutorial.json'),
  read('src/data/quotas-short.json'),
);

/** 敵を dead / waiting に送れるカード（全滅は味方のみなので除く） */
const EXIT_CARDS = ['gekiha', 'ridatsu', 'soushitsu', 'shibou', 'jiko_gisei'];
const DEADLINE = 14;
const MAX_PLAYABLE = 24;
const TRIALS = Number(process.argv[2] ?? 2000);

const offersPerRun: number[] = [];
const firstOffer: number[] = [];
const byCard = new Map<string, number>();
let never = 0;

for (let t = 0; t < TRIALS; t++) {
  const run = createRun(data, t + 1, { mangaTitle: '計測' });
  let offers = 0;
  let first = 0;
  for (let week = 1; week <= DEADLINE; week++) {
    // 各話の編集会議でパック1回＋無料リロール1回ぶんを見る
    for (const reroll of [0, 1]) {
      for (const id of rollPack(data, { ...run, week }, MAX_PLAYABLE, reroll)) {
        if (!EXIT_CARDS.includes(id)) continue;
        offers += 1;
        byCard.set(id, (byCard.get(id) ?? 0) + 1);
        if (!first) first = week;
      }
    }
  }
  offersPerRun.push(offers);
  if (first) firstOffer.push(first);
  else never += 1;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
};

console.log(`試行 ${TRIALS} ラン / 第1〜${DEADLINE}話、毎話パック1回＋無料リロール1回を見た場合\n`);
console.log(`退場手段の提示回数  平均 ${mean(offersPerRun).toFixed(2)} 回`);
console.log(`  中央値 ${pct(offersPerRun, 50)} / 下位10% ${pct(offersPerRun, 10)} / 上位90% ${pct(offersPerRun, 90)}`);
console.log(`一度も出ないラン    ${((never / TRIALS) * 100).toFixed(1)}%`);
console.log(`初めて出る話数      平均 第${mean(firstOffer).toFixed(1)}話 / 中央値 第${pct(firstOffer, 50)}話`);
console.log(`\nカード別の提示回数（1ランあたり）`);
for (const id of EXIT_CARDS) {
  const def = data.definitions.get(id)!;
  console.log(`  ${def.name.padEnd(6)} ${((byCard.get(id) ?? 0) / TRIALS).toFixed(3)} 回  (幕 ${JSON.stringify(def.act)})`);
}
console.log(`\n提示回数の分布`);
for (let n = 0; n <= 5; n++) {
  const c = offersPerRun.filter((x) => x === n).length;
  console.log(`  ${n}回: ${((c / TRIALS) * 100).toFixed(1)}%`);
}
console.log(`  6回以上: ${((offersPerRun.filter((x) => x >= 6).length / TRIALS) * 100).toFixed(1)}%`);
