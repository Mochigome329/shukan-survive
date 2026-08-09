/**
 * 第3部（第17話以降）専用役がどれだけ現実的かを測る診断（v7.3）。
 * 「第3部の週が何回あったか」「そのうち役の素材が手札／場に揃っていた週は何回か」を数える。
 * 成立0回の原因が〈条件が厳しい〉なのか〈素材がそもそも手札に来ない〉のかを切り分ける。
 * 使い方: npx tsx scripts/act3-check.ts [-- --runs 30]
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

function findBestSafePlay(state: RunState): PlaySelection | null {
  let best: { selection: PlaySelection; score: number } | null = null;
  for (const selection of enumerateLegalPlays(data, state)) {
    const breakdown = previewScore(data, state, selection);
    const losesCast = breakdown.stateChanges.some(
      (c) => c.type === 'moveZone' && (c.to === 'dead' || c.to === 'waiting'),
    );
    if (losesCast) continue;
    if (!best || breakdown.finalScore > best.score) best = { selection, score: breakdown.finalScore };
  }
  return best?.selection ?? null;
}

const COMBO_MATERIALS = new Set(['uragiri', 'kanashii_kako', 'shinchara', 'shibou', 'kakusei', 'battle', 'shugyou']);
function value(defId: string): number {
  const def = data.definitions.get(defId)!;
  if (def.kind === 'character') return def.popularity;
  return def.buzz + (COMBO_MATERIALS.has(def.id) ? 2 : 0);
}

/** 第3部専用役6種の「手札に素材が揃っていたか」判定 */
const ACT3_CHECKS: { id: string; name: string; ready: (handDefs: string[], state: RunState) => boolean }[] = [
  // v7.4で条件変更: 最終決戦は「バトル+総力戦」、旧条件は「暗雲立ち込める」が引き取った
  { id: 'saishuu_kessen', name: '最終決戦', ready: (h) => h.includes('battle') && h.includes('souryokusen') },
  {
    id: 'anun_tachikomeru',
    name: '暗雲立ち込める',
    ready: (h, s) =>
      h.includes('battle') &&
      (h.includes('dai_pinch') || h.includes('haiboku')) &&
      rosterOf(data, s).some((c) => c.faction === 'enemy'),
  },
  { id: 'sekai_no_kiki', name: '世界の危機', ready: (h) => h.includes('teki_soshiki') && h.includes('dai_pinch') },
  {
    id: 'innen_no_seisan',
    name: '因縁の清算',
    ready: (h, s) =>
      h.includes('shibou') && castOf(data, s).some((c) => c.faction === 'enemy' && c.playCount >= 5),
  },
  {
    id: 'souryoku_no_kesshuu',
    name: '総力の結集',
    ready: (h, s) => h.includes('souryokusen') && castOf(data, s).length >= 5,
  },
  { id: 'ketsui_no_wakare', name: '決意の別れ', ready: (h) => h.includes('ridatsu') && h.includes('kanashii_kako') },
  { id: 'saigo_no_shugyou', name: '最後の修行', ready: (h) => h.includes('shugyou') && h.includes('nouryoku_kakusei') },
];

let act3Weeks = 0;
let runsReachingAct3 = 0;
const readyCounts = new Map<string, number>();
/** 手札の中に各素材カードが1枚でもあった第3部の週数 */
const materialInHand = new Map<string, number>();
const MATERIALS = ['battle', 'dai_pinch', 'haiboku', 'teki_soshiki', 'shibou', 'souryokusen', 'ridatsu', 'kanashii_kako', 'shugyou', 'nouryoku_kakusei'];
/** 第3部の週にデッキ（活動中＋手札）に何枚あったか（平均を出すため合計） */
const deckCountTotal = new Map<string, number>();
let deckSizeTotal = 0;

for (let r = 0; r < runs; r++) {
  const runSeed = hashSeed(20260808, 'act3-run', r);
  let state = createRun(data, runSeed, { mangaTitle: 'act3' });
  let alive = true;
  let reached = false;

  for (let w = 1; w <= weeks && alive; w++) {
    state = startWeek(data, state);

    if (w >= 17) {
      act3Weeks++;
      if (!reached) {
        reached = true;
        runsReachingAct3++;
      }
      const handDefs = state.hand
        .map((id) => state.cards.find((c) => c.instanceId === id)?.definitionId)
        .filter((d): d is string => !!d);
      for (const m of MATERIALS) {
        if (handDefs.includes(m)) materialInHand.set(m, (materialInHand.get(m) ?? 0) + 1);
      }
      const deck = state.cards.filter((c) => c.zone === 'activeDeck' || c.zone === 'hand');
      deckSizeTotal += deck.length;
      for (const m of MATERIALS) {
        const n = deck.filter((c) => c.definitionId === m).length;
        deckCountTotal.set(m, (deckCountTotal.get(m) ?? 0) + n);
      }
      for (const check of ACT3_CHECKS) {
        if (check.ready(handDefs, state)) readyCounts.set(check.id, (readyCounts.get(check.id) ?? 0) + 1);
      }
    }

    const selection = findBestSafePlay(state);
    if (!selection) {
      alive = false;
      break;
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

    const result = resolveWeek(data, state, selection, [], endingId);
    state = result.state;
    if (result.outcome === 'cancelled') {
      alive = false;
    } else {
      while (state.funds >= PACK_PRICE) {
        const pack = rollPack(data, state, weeks);
        if (pack.length === 0) break;
        const bought = pack.reduce((a, b) => (value(b) > value(a) ? b : a));
        state = buyCard(data, state, bought);
      }
    }
  }
}

console.log(`=== 第3部専用役の到達性（${runs}ラン） ===`);
console.log(`第17話に到達したラン: ${runsReachingAct3} / ${runs}`);
console.log(`第3部（17話以降）の週の総数: ${act3Weeks}`);
console.log(`第3部の週の平均デッキ枚数（活動中+手札）: ${(deckSizeTotal / Math.max(1, act3Weeks)).toFixed(1)}`);
console.log('');
console.log('--- 素材カードが手札に来ていた第3部の週（率） ---');
for (const m of MATERIALS) {
  const n = materialInHand.get(m) ?? 0;
  const owned = ((deckCountTotal.get(m) ?? 0) / Math.max(1, act3Weeks)).toFixed(2);
  console.log(`${m.padEnd(18)} 手札にあった週 ${String(n).padStart(4)} / ${act3Weeks} (${((n / Math.max(1, act3Weeks)) * 100).toFixed(1)}%)  所持平均 ${owned}枚`);
}
console.log('');
console.log('--- 第3部専用役: 素材が揃っていた週（＝成立しうる週） ---');
for (const check of ACT3_CHECKS) {
  const n = readyCounts.get(check.id) ?? 0;
  console.log(`${check.name.padEnd(8)} ${String(n).padStart(4)} / ${act3Weeks} (${((n / Math.max(1, act3Weeks)) * 100).toFixed(1)}%)  ${check.id}`);
}
