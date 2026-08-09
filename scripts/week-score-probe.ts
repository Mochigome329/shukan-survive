/**
 * 指定した話数で「best戦略が実際に出せる週スコア」の分布を測る診断（v7.3）。
 * ボス週のノルマを決め直すときに、勘ではなく実測から決めるために使う。
 * ノルマは一時的に1にしておき、打ち切られずに最後まで到達させた上で計測する。
 * 使い方: npx tsx scripts/week-score-probe.ts [-- --runs 30]
 */
import cardsJson from '../src/data/cards.json';
import quotasJson from '../src/data/quotas.json';
import quotasShortJson from '../src/data/quotas-short.json';
import tutorialJson from '../src/data/tutorial.json';
import { buildGameData } from '../src/core/validate';
import { createRun, previewScore, resolveWeek, startWeek } from '../src/core/run';
import { enumerateLegalPlays } from '../src/core/search';
import { offeredEndings } from '../src/core/finale';
import { buyCard, rollPack, PACK_PRICE } from '../src/core/shop';
import { hashSeed } from '../src/core/rng';
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
const WATCH = [8, 15, 16, 17, 20, 23, 24];

function findBestSafePlay(state: RunState): { selection: PlaySelection; score: number } | null {
  let best: { selection: PlaySelection; score: number } | null = null;
  for (const selection of enumerateLegalPlays(data, state)) {
    const breakdown = previewScore(data, state, selection);
    const losesCast = breakdown.stateChanges.some(
      (c) => c.type === 'moveZone' && (c.to === 'dead' || c.to === 'waiting'),
    );
    if (losesCast) continue;
    if (!best || breakdown.finalScore > best.score) best = { selection, score: breakdown.finalScore };
  }
  return best;
}

const COMBO_MATERIALS = new Set(['uragiri', 'kanashii_kako', 'shinchara', 'shibou', 'kakusei', 'battle', 'shugyou']);
function value(defId: string): number {
  const def = data.definitions.get(defId)!;
  if (def.kind === 'character') return def.popularity;
  return def.buzz + (COMBO_MATERIALS.has(def.id) ? 2 : 0);
}

const scoresByWeek = new Map<number, number[]>();

for (let r = 0; r < runs; r++) {
  const runSeed = hashSeed(20260808, 'probe-run', r);
  let state = createRun(data, runSeed, { mangaTitle: 'probe' });

  for (let w = 1; w <= weeks; w++) {
    state = startWeek(data, state);
    const best = findBestSafePlay(state);
    if (!best) break;
    const selection = best.selection;

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

    if (WATCH.includes(w)) {
      const list = scoresByWeek.get(w) ?? [];
      list.push(previewScore(data, state, selection, endingId).finalScore);
      scoresByWeek.set(w, list);
    }

    const result = resolveWeek(data, state, selection, [], endingId);
    state = result.state;
    if (result.outcome === 'cancelled') break;
    while (state.funds >= PACK_PRICE) {
      const pack = rollPack(data, state, weeks);
      if (pack.length === 0) break;
      const bought = pack.reduce((a, b) => (value(b) > value(a) ? b : a));
      state = buyCard(data, state, bought);
    }
  }
}

const pct = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] ?? 0;

console.log(`=== best戦略が出せる週スコアの分布（${runs}ラン、ノルマは計測用に1へ落としてある） ===`);
console.log('week   n   min    p25    p50    p75    max   ボス');
for (const w of WATCH) {
  const list = (scoresByWeek.get(w) ?? []).slice().sort((a, b) => a - b);
  if (list.length === 0) {
    console.log(`${String(w).padStart(4)}   0   —`);
    continue;
  }
  const boss = data.campaigns.long.quotas.get(w)?.boss ?? '';
  console.log(
    `${String(w).padStart(4)} ${String(list.length).padStart(3)} ${String(list[0]).padStart(6)} ${String(pct(list, 0.25)).padStart(6)} ${String(pct(list, 0.5)).padStart(6)} ${String(pct(list, 0.75)).padStart(6)} ${String(list[list.length - 1]).padStart(6)}   ${boss}`,
  );
}
