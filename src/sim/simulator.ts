/**
 * シミュレーター（設計書 14節・M0完了条件）。
 * UIなしで多数のランを実行し、初期デッキの手札分布・通常スコア分布・週ごとの達成率を算出する。
 */
import { hashSeed, mulberry32, randInt } from '../core/rng';
import { createRun, resolveWeek, startWeek } from '../core/run';
import { enumerateLegalPlays, findBestPlay } from '../core/search';
import { offeredEndings } from '../core/finale';
import { previewScore } from '../core/run';
import { buyCard, rollPack, PACK_PRICE } from '../core/shop';
import type { RunState } from '../core/types';
import type { GameData } from '../core/validate';
import { normalizeMode, type CampaignMode } from '../core/campaign';

/** ショップの簡易方針: 資金がある限りパックを買い、素材価値の高いカードを選ぶ */
const COMBO_MATERIALS = new Set(['uragiri', 'kanashii_kako', 'shinchara', 'shibou', 'kakusei', 'battle', 'shugyou']);

function shopPolicy(data: GameData, state: RunState, maxWeek: number): RunState {
  let s = state;
  while (s.funds >= PACK_PRICE) {
    const pack = rollPack(data, s, maxWeek);
    if (pack.length === 0) break;
    const best = pack.reduce((a, b) => (value(data, b) > value(data, a) ? b : a));
    s = buyCard(data, s, best);
  }
  return s;
}

function value(data: GameData, defId: string): number {
  const def = data.definitions.get(defId)!;
  if (def.kind === 'character') return def.popularity;
  return def.buzz + (COMBO_MATERIALS.has(def.id) ? 2 : 0);
}

/**
 * キャストを失わない（死亡・離脱の状態変化を含まない）範囲での最善手。
 * 目先の話題性のために全滅・死亡を撃つ自滅プレイを除外し、実プレイヤーに近づける。
 */
function findBestSafePlay(data: GameData, state: RunState) {
  let best: { selection: import('../core/types').PlaySelection; score: number } | null = null;
  for (const selection of enumerateLegalPlays(data, state)) {
    const breakdown = previewScore(data, state, selection);
    const losesCast = breakdown.stateChanges.some((c) => c.type === 'moveZone' && (c.to === 'dead' || c.to === 'waiting'));
    if (losesCast) continue;
    if (!best || breakdown.finalScore > best.score) best = { selection, score: breakdown.finalScore };
  }
  return best;
}

/**
 * 「役を知らないプレイヤー」の手（v6.1）。
 *
 * best は81種の役をすべて知っていて毎週の合法手を総当たりする前提なので、実プレイとはかけ離れている。
 * こちらはカードの額面（話題性）だけを見て、キャストを失わない範囲でいちばん派手な手を選ぶ。
 * 役の成立は結果的に起きることはあっても、狙ってはいない。
 */
function findCasualPlay(data: GameData, state: RunState) {
  let best: { selection: import('../core/types').PlaySelection; face: number } | null = null;
  for (const selection of enumerateLegalPlays(data, state)) {
    let face = 0;
    for (const id of selection.cards) {
      const def = data.definitions.get(state.cards.find((c) => c.instanceId === id)!.definitionId)!;
      if (def.kind !== 'development') continue;
      // 額面の話題性。鮮度は画面に出ているので考慮する
      face += def.buzz * (state.freshnessByDef[def.id] ?? 1);
      // 「キャラが増える＝強い」は見ればわかるので、デビュー系は高く評価する
      if (def.effects.some((e) => e.effect.type === 'debutSelect')) face += 4;
    }
    // キャストを失う手は選ばない（best と同じ前提）
    const breakdown = previewScore(data, state, selection);
    if (breakdown.stateChanges.some((c) => c.type === 'moveZone' && (c.to === 'dead' || c.to === 'waiting'))) continue;
    if (!best || face > best.face) best = { selection, face };
  }
  return best;
}

export type Strategy = 'best' | 'casual' | 'random';

export interface WeekStats {
  week: number;
  quota: number;
  samples: number;
  clearRate: number;
  scoreMean: number;
  scoreP10: number;
  scoreP50: number;
  scoreP90: number;
}

export interface SimReport {
  strategy: Strategy;
  runs: number;
  weeksPlayed: number;
  /** ランが第weeksPlayed話まで生き残った割合 */
  survivalRate: number;
  weekStats: WeekStats[];
  /** 手札中のキャラ枚数の分布（通常抽選のみ） */
  handCharCountDist: Record<number, number>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

export interface SimOptions {
  runs: number;
  weeks: number;
  strategy: Strategy;
  seedBase?: number;
  /** 連載の長さ（v7.30）。省略時は通常連載（全25話） */
  mode?: CampaignMode;
}

export function simulate(data: GameData, options: SimOptions): SimReport {
  const { runs, weeks, strategy } = options;
  const seedBase = options.seedBase ?? 12345;
  const mode = normalizeMode(options.mode);
  const campaign = data.campaigns[mode];
  const scoresByWeek = new Map<number, number[]>();
  const clearsByWeek = new Map<number, number>();
  const samplesByWeek = new Map<number, number>();
  const handCharCountDist: Record<number, number> = {};
  let survived = 0;

  for (let r = 0; r < runs; r++) {
    const runSeed = hashSeed(seedBase, 'sim-run', r);
    const pickRng = mulberry32(hashSeed(runSeed, 'sim-pick'));
    let state = createRun(data, runSeed, { mangaTitle: 'sim', mode });
    let alive = true;

    for (let w = 1; w <= weeks && alive; w++) {
      state = startWeek(data, state);

      // v5.2: 手札は展開のみ。分布はキャスト人数を記録する
      const castCount = state.cards.filter(
        (c) => c.zone === 'field' && data.definitions.get(c.definitionId)!.kind === 'character',
      ).length;
      handCharCountDist[castCount] = (handCharCountDist[castCount] ?? 0) + 1;

      let selection;
      if (strategy === 'best') {
        selection = findBestSafePlay(data, state)?.selection ?? findBestPlay(data, state)?.selection ?? null;
      } else if (strategy === 'casual') {
        selection = findCasualPlay(data, state)?.selection ?? findBestPlay(data, state)?.selection ?? null;
      } else {
        const legal = enumerateLegalPlays(data, state);
        selection = legal.length > 0 ? legal[randInt(pickRng, legal.length)]! : null;
      }
      if (!selection) {
        alive = false;
        break;
      }

      // 最終回は提示された結末カードのうち、いちばん点が出るものを選ぶ（v5.9）
      let endingId: string | null = null;
      if (campaign.quotas.get(w)?.final) {
        let best = -1;
        for (const card of offeredEndings(data, state)) {
          const score = previewScore(data, state, selection, card.id).finalScore;
          if (score > best) {
            best = score;
            endingId = card.id;
          }
        }
      }

      const breakdown = previewScore(data, state, selection, endingId);
      samplesByWeek.set(w, (samplesByWeek.get(w) ?? 0) + 1);
      scoresByWeek.set(w, [...(scoresByWeek.get(w) ?? []), breakdown.finalScore]);
      if (breakdown.cleared) clearsByWeek.set(w, (clearsByWeek.get(w) ?? 0) + 1);

      const result = resolveWeek(data, state, selection, [], endingId);
      state = result.state;
      if (result.outcome === 'cancelled') alive = false;
      else state = shopPolicy(data, state, campaign.totalWeeks);
    }
    if (alive) survived++;
  }

  const weekStats: WeekStats[] = [];
  for (let w = 1; w <= weeks; w++) {
    const scores = (scoresByWeek.get(w) ?? []).slice().sort((a, b) => a - b);
    const samples = samplesByWeek.get(w) ?? 0;
    weekStats.push({
      week: w,
      quota: campaign.quotas.get(w)?.quota ?? 0,
      samples,
      clearRate: samples > 0 ? (clearsByWeek.get(w) ?? 0) / samples : 0,
      scoreMean: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      scoreP10: percentile(scores, 10),
      scoreP50: percentile(scores, 50),
      scoreP90: percentile(scores, 90),
    });
  }

  return {
    strategy,
    runs,
    weeksPlayed: weeks,
    survivalRate: survived / runs,
    weekStats,
    handCharCountDist,
  };
}
