/** 序盤の手札がどれくらい単調かを測る一時スクリプト（使い捨て） */
import cardsJson from '../src/data/cards.json';
import quotasJson from '../src/data/quotas.json';
import tutorialJson from '../src/data/tutorial.json';
import { buildGameData } from '../src/core/validate';
import { createRun, startWeek } from '../src/core/run';
import type { RunState } from '../src/core/types';

const data = buildGameData(cardsJson, quotasJson, tutorialJson);

// 初期デッキの展開カード内訳
const run0 = createRun(data, 1, { mangaTitle: 'x' });
const devs = run0.cards.filter((c) => data.definitions.get(c.definitionId)!.kind === 'development');
const counts = new Map<string, number>();
for (const c of devs) counts.set(c.definitionId, (counts.get(c.definitionId) ?? 0) + 1);
console.log('=== 初期デッキの展開カード ===');
console.log(`枚数 ${devs.length} / 種類 ${counts.size}`);
for (const [id, n] of counts) console.log(`  ${data.definitions.get(id)!.name} x${n}`);

// 第1〜6話で、手札に来た展開カードの種類（ショップ購入なしの素の状態）
console.log('\n=== 手札に来る展開カードの種類（購入なし・400ラン） ===');
for (const week of [1, 2, 3, 4, 5, 6]) {
  const freq = new Map<string, number>();
  let totalDevSlots = 0;
  for (let seed = 1; seed <= 400; seed++) {
    let run: RunState = createRun(data, seed, { mangaTitle: 'x' });
    run = startWeek(data, { ...run, week });
    for (const id of run.hand) {
      const def = data.definitions.get(run.cards.find((c) => c.instanceId === id)!.definitionId)!;
      if (def.kind !== 'development') continue;
      totalDevSlots++;
      freq.set(def.name, (freq.get(def.name) ?? 0) + 1);
    }
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `第${week}話: 種類${freq.size} | ` +
      top.map(([n, c]) => `${n}${((c / totalDevSlots) * 100).toFixed(0)}%`).join(' '),
  );
}
