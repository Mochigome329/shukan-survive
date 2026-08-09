/**
 * カード・役の使用率レポート（v7.2）。
 * `best`戦略（役を熟知した総当たり探索）でNラン回し、
 * 「ほぼ選ばれない展開カード」「ほぼ成立しない役」「デビューさせられないキャラ」を洗い出す。
 * 使い方: npx tsx scripts/card-usage.ts [-- --runs 30]
 */
import cardsJson from '../src/data/cards.json';
import quotasJson from '../src/data/quotas.json';
import quotasShortJson from '../src/data/quotas-short.json';
import tutorialJson from '../src/data/tutorial.json';
import { buildGameData } from '../src/core/validate';
import { castOf, createRun, previewScore, resolveWeek, rosterOf, startWeek } from '../src/core/run';
import { enumerateLegalPlays } from '../src/core/search';
import { offeredEndings } from '../src/core/finale';
import { buyCard, rollPack, PACK_PRICE } from '../src/core/shop';
import { hashSeed } from '../src/core/rng';
import { COMBO_REGISTRY } from '../src/core/combos';
import type { PlaySelection, RunState } from '../src/core/types';

function argValue(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

const runs = argValue('runs', 30);
const weeks = 25;
const data = buildGameData(cardsJson, quotasJson, tutorialJson, quotasShortJson);

/**
 * simulator.ts の findBestSafePlay と同じ方針（キャストを失う自滅プレイは除外）に加えて、
 * 「もし自滅も許すなら、そもそも死亡・途中離脱・撃破・全滅・自己犠牲・喪失は選ばれうるのか」も同時に見る。
 * safeがゲーム進行に使う実際の手、rawUnsafeBetter=trueなら「自滅込みの最善手のほうが高得点だった」週
 */
function findBestPlays(state: RunState): {
  safe: { selection: PlaySelection; score: number } | null;
  rawUnsafeBetter: boolean;
  rawBestUsesLossyCard: boolean;
} {
  let safe: { selection: PlaySelection; score: number } | null = null;
  let raw: { selection: PlaySelection; score: number; lossy: boolean } | null = null;
  for (const selection of enumerateLegalPlays(data, state)) {
    const breakdown = previewScore(data, state, selection);
    const losesCast = breakdown.stateChanges.some((c) => c.type === 'moveZone' && (c.to === 'dead' || c.to === 'waiting'));
    if (!losesCast && (!safe || breakdown.finalScore > safe.score)) safe = { selection, score: breakdown.finalScore };
    if (!raw || breakdown.finalScore > raw.score) raw = { selection, score: breakdown.finalScore, lossy: losesCast };
  }
  return {
    safe,
    rawUnsafeBetter: !!raw && !!safe && raw.score > safe.score && raw.lossy,
    rawBestUsesLossyCard: !!raw?.lossy,
  };
}

// simulator.ts の shopPolicy と同じ価値づけ（購入傾向を揃えるため）
const COMBO_MATERIALS = new Set(['uragiri', 'kanashii_kako', 'shinchara', 'shibou', 'kakusei', 'battle', 'shugyou']);
function value(defId: string): number {
  const def = data.definitions.get(defId)!;
  if (def.kind === 'character') return def.popularity;
  return def.buzz + (COMBO_MATERIALS.has(def.id) ? 2 : 0);
}

const playedDefCounts = new Map<string, number>();
const purchasedDefCounts = new Map<string, number>();
const debutedDefCounts = new Map<string, number>();
const castWeekCounts = new Map<string, number>();
const rosterWeekCounts = new Map<string, number>();
const comboAppliedCounts = new Map<string, number>();
const comboSuppressedCounts = new Map<string, number>();
let totalWeeksSimulated = 0;
let runsCompleted25 = 0;
let weeksWhereLossyWasOptimal = 0;
let weeksWhereLossyWasStrictlyBetter = 0;

for (let r = 0; r < runs; r++) {
  const runSeed = hashSeed(20260808, 'usage-run', r);
  let state = createRun(data, runSeed, { mangaTitle: 'usage' });
  let alive = true;
  let lastWeek = 0;

  for (let w = 1; w <= weeks && alive; w++) {
    state = startWeek(data, state);
    totalWeeksSimulated++;
    lastWeek = w;

    for (const c of rosterOf(data, state)) {
      rosterWeekCounts.set(c.definitionId, (rosterWeekCounts.get(c.definitionId) ?? 0) + 1);
    }
    for (const c of castOf(data, state)) {
      castWeekCounts.set(c.definitionId, (castWeekCounts.get(c.definitionId) ?? 0) + 1);
    }

    const { safe, rawUnsafeBetter, rawBestUsesLossyCard } = findBestPlays(state);
    if (rawBestUsesLossyCard) weeksWhereLossyWasOptimal++;
    if (rawUnsafeBetter) weeksWhereLossyWasStrictlyBetter++;
    const selection = safe?.selection ?? null;
    if (!selection) {
      alive = false;
      break;
    }

    for (const id of selection.cards) {
      const inst = state.cards.find((c) => c.instanceId === id)!;
      playedDefCounts.set(inst.definitionId, (playedDefCounts.get(inst.definitionId) ?? 0) + 1);
      const def = data.definitions.get(inst.definitionId)!;
      if (def.kind === 'development' && def.effects.some((e) => e.effect.type === 'debutSelect')) {
        const targetId = selection.targets[id];
        const targetInst = targetId ? state.cards.find((c) => c.instanceId === targetId) : undefined;
        if (targetInst) debutedDefCounts.set(targetInst.definitionId, (debutedDefCounts.get(targetInst.definitionId) ?? 0) + 1);
      }
    }

    let endingId: string | null = null;
    if (data.campaigns.long.quotas.get(w)?.final) {
      let bestScore = -1;
      for (const card of offeredEndings(data, state)) {
        const score = previewScore(data, state, selection, card.id).finalScore;
        if (score > bestScore) {
          bestScore = score;
          endingId = card.id;
        }
      }
    }

    const breakdown = previewScore(data, state, selection, endingId);
    for (const c of breakdown.combos) {
      if (c.status === 'applied') comboAppliedCounts.set(c.comboId, (comboAppliedCounts.get(c.comboId) ?? 0) + 1);
      if (c.status === 'suppressed') comboSuppressedCounts.set(c.comboId, (comboSuppressedCounts.get(c.comboId) ?? 0) + 1);
    }

    const result = resolveWeek(data, state, selection, [], endingId);
    state = result.state;
    if (result.outcome === 'cancelled') {
      alive = false;
    } else {
      while (state.funds >= PACK_PRICE) {
        const pack = rollPack(data, state, weeks);
        if (pack.length === 0) break;
        const bought = pack.reduce((a, b) => (value(b) > value(a) ? b : a));
        purchasedDefCounts.set(bought, (purchasedDefCounts.get(bought) ?? 0) + 1);
        state = buyCard(data, state, bought);
      }
    }
  }
  if (lastWeek === weeks) runsCompleted25++;
}

console.log(`=== カード・役の使用率レポート（best戦略・${runs}ラン・全${weeks}話、完走${runsCompleted25}ラン） ===`);
console.log('※ best戦略は描き直し・ネーム保管・出演者選択を使わない前提（既知の制約）');
console.log('※ 実際のゲーム進行は「キャストを失わない安全な最善手」を使う（simulator.tsと同じ）。');
console.log('  自滅（死亡・途中離脱・撃破・全滅・自己犠牲・喪失）を含む展開カードは、この安全策のせいで');
console.log('  プレイ回数が構造的に0になる。そこで「自滅込みなら"客観的な最善手"だった週」も別途数える:');
console.log(
  `  自滅込みの最善手が自滅系カードを使っていた週: ${weeksWhereLossyWasOptimal} / ${totalWeeksSimulated}`,
);
console.log(
  `  そのうち安全策より明確に高得点だった週（＝安全策が損をしていた週）: ${weeksWhereLossyWasStrictlyBetter} / ${totalWeeksSimulated}`,
);
console.log('');

console.log('--- 展開カード: プレイされた回数（総週数に対する割合、少ない順） ---');
const devDefs = [...data.definitions.values()].filter((d) => d.kind === 'development');
const devRows = devDefs
  .map((d) => ({ id: d.id, name: d.name, count: playedDefCounts.get(d.id) ?? 0 }))
  .sort((a, b) => a.count - b.count);
for (const row of devRows) {
  const pct = ((row.count / totalWeeksSimulated) * 100).toFixed(2);
  console.log(`${String(row.count).padStart(5)} (${pct.padStart(5)}%)  ${row.id}\t${row.name}`);
}

console.log('');
console.log('--- キャラ: 控えから実際にデビューさせられた回数 ---');
const charDefs = [...data.definitions.values()].filter((d) => d.kind === 'character');
const charRows = charDefs
  .map((d) => ({
    id: d.id,
    name: d.name,
    debuted: debutedDefCounts.get(d.id) ?? 0,
    purchased: purchasedDefCounts.get(d.id) ?? 0,
    rosterWeeks: rosterWeekCounts.get(d.id) ?? 0,
    castWeeks: castWeekCounts.get(d.id) ?? 0,
  }))
  .sort((a, b) => a.rosterWeeks - b.rosterWeeks);
for (const row of charRows) {
  console.log(
    `購入${String(row.purchased).padStart(3)}  デビュー${String(row.debuted).padStart(3)}  在籍週${String(row.rosterWeeks).padStart(4)}  出演週${String(row.castWeeks).padStart(4)}  ${row.id}\t${row.name}`,
  );
}

console.log('');
console.log('--- 役: 成立回数0（一度も成立していない役） ---');
console.log('（条件不成立=0/0、条件は満たしたが上位役に抑制=0/N、の両方を出す。抑制側は「仕様どおり」の可能性が高い）');
const zeroCombos = COMBO_REGISTRY.filter((c) => (comboAppliedCounts.get(c.id) ?? 0) === 0);
for (const c of zeroCombos) {
  const sup = comboSuppressedCounts.get(c.id) ?? 0;
  console.log(`0/${sup}\t${c.id}\t${c.name}\t(${c.cutInTemplate})${sup > 0 ? '  ※抑制されている' : ''}`);
}
console.log(`計 ${zeroCombos.length} / ${COMBO_REGISTRY.length} 役`);

console.log('');
console.log('--- 役: 成立回数1〜4（低頻度） ---');
const lowCombos = COMBO_REGISTRY.filter((c) => {
  const n = comboAppliedCounts.get(c.id) ?? 0;
  return n >= 1 && n <= 4;
});
for (const c of lowCombos) {
  const sup = comboSuppressedCounts.get(c.id) ?? 0;
  console.log(`${comboAppliedCounts.get(c.id)}/${sup}\t${c.id}\t${c.name}`);
}
