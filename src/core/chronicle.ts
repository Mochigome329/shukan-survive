/**
 * 連載年表の集計（v7.11）。
 *
 * 画面（EndScreen）とシェア画像（shareImage）の両方から使う。
 * 同じ数字を2か所で別々に計算すると必ずずれるので、ここに集約する。
 * 得点計算には一切関与しない、事後の集計専用。
 */
import { actStartingAt, type ActInfo } from './acts';
import { finaleBaseScore } from './finale';
import { displayName, MAX_WARNINGS, type CardInstance, type RunState, type WeekEvent, type WeekLogEntry } from './types';
import type { GameData } from './validate';

/** グラフの縦軸の上限。突出した週で他が潰れないよう、達成度4.0で頭打ちにする */
const RATIO_CAP_MAX = 4;
const RATIO_CAP_MIN = 2;

export interface ChronicleWeek {
  week: number;
  score: number;
  quota: number;
  cleared: boolean;
  warningsAfter: number;
  events: WeekEvent[];
  comboIds: string[];
  /** ノルマに対する達成度。人気投票回（ノルマが桁違いに低い）と最終回を同じ物差しで並べるために使う */
  ratio: number;
  /** ボス週ならその名前 */
  boss: string | null;
  final: boolean;
  /**
   * 出来事のない平凡な週。年表では1行に畳む。
   * ボス週・未達・最終回は「平凡」にしない（そこが読みどころなので）
   */
  quiet: boolean;
  /** この週から始まる幕（無ければnull） */
  actStart: ActInfo | null;
}

export interface ChronicleCast {
  /** 最後までキャストにいた者 */
  alive: string[];
  dead: string[];
  /** 再登場待ちのまま終わった者 */
  left: string[];
}

export interface Chronicle {
  weeks: ChronicleWeek[];
  /** 到達した最終話数 */
  lastWeek: number;
  /**
   * 実際に記録が残っている話数。
   * 通常プレイでは lastWeek と一致するが、デバッグの話数ジャンプでは飛ばした週の記録が無いのでずれる。
   * 「ノルマ達成 N/M」の分母はこちらを使う（達成率の母数は、描いた話数であるべきなので）
   */
  playedWeeks: number;
  /** ノルマを達成した週の数 */
  clearedCount: number;
  /**
   * 連載中に到達した打ち切り警告の最大値。
   * 編集部の要求が一度に複数期限切れすると warningsAfter は上限を超えることがあるため、
   * 表示用にここで MAX_WARNINGS に丸めておく（「5/3」のような表示を防ぐ）
   */
  maxWarnings: number;
  /** 成立した役の種類数（延べではない） */
  comboKinds: number;
  bestWeek: { week: number; ratio: number } | null;
  cast: ChronicleCast;
  /** グラフの縦軸の上限（達成度） */
  ratioCap: number;
}

export function buildChronicle(data: GameData, run: RunState): Chronicle {
  /*
   * v7.28: 最終回にノルマは無いので、ノルマに対する達成度が出せない。
   * 代わりに「その連載の平常運転（ベース点）の何倍を出したか」を達成度として使う。
   * 「有終の美」（ベース点の3倍）と同じ物差しなので、年表の見えかたと役の基準が揃う
   */
  const baseScore = finaleBaseScore(run);
  const weeks: ChronicleWeek[] = run.log.map((entry: WeekLogEntry) => {
    const quotaEntry = data.quotas.get(entry.week);
    const events = entry.events ?? [];
    const boss = quotaEntry?.boss ?? null;
    const final = quotaEntry?.final ?? false;
    // 最終回はベース点を分母にする。通常週はノルマ（割り算は念のため守る）
    const denominator = final ? baseScore : entry.quota;
    const ratio = denominator > 0 ? entry.score / denominator : 0;
    return {
      week: entry.week,
      score: entry.score,
      // 最終回はノルマの代わりにベース点を並べる（v7.28）
      quota: final ? baseScore : entry.quota,
      cleared: entry.cleared,
      warningsAfter: entry.warningsAfter,
      events,
      comboIds: entry.comboIds,
      ratio,
      boss,
      final,
      quiet: events.length === 0 && entry.cleared && !boss && !final,
      actStart: actStartingAt(entry.week),
    };
  });

  const comboKinds = new Set<string>();
  for (const w of weeks) for (const id of w.comboIds) comboKinds.add(id);

  const bestWeek = weeks.reduce<{ week: number; ratio: number } | null>(
    (best, w) => (best === null || w.ratio > best.ratio ? { week: w.week, ratio: w.ratio } : best),
    null,
  );

  const maxRatio = bestWeek?.ratio ?? RATIO_CAP_MIN;
  const ratioCap = Math.max(RATIO_CAP_MIN, Math.min(RATIO_CAP_MAX, maxRatio));

  const isChar = (c: CardInstance) => data.definitions.get(c.definitionId)?.kind === 'character';
  const nameOf = (c: CardInstance) => {
    const def = data.definitions.get(c.definitionId);
    return def ? displayName(def, c) : c.definitionId;
  };
  // 控え（bench）は一度も登場していないので、年表の「出た者たち」には載せない
  const cast: ChronicleCast = {
    alive: run.cards.filter((c) => isChar(c) && c.zone === 'field').map(nameOf),
    dead: run.cards.filter((c) => isChar(c) && c.zone === 'dead').map(nameOf),
    left: run.cards.filter((c) => isChar(c) && c.zone === 'waiting').map(nameOf),
  };

  return {
    weeks,
    lastWeek: weeks.length > 0 ? weeks[weeks.length - 1]!.week : 1,
    playedWeeks: weeks.length,
    clearedCount: weeks.filter((w) => w.cleared).length,
    maxWarnings: Math.min(MAX_WARNINGS, weeks.reduce((max, w) => Math.max(max, w.warningsAfter), 0)),
    comboKinds: comboKinds.size,
    bestWeek,
    cast,
    ratioCap,
  };
}

/** 達成度をグラフの高さ（0〜1）に変換する */
export function ratioToHeight(ratio: number, cap: number): number {
  return Math.max(0.02, Math.min(ratio, cap) / cap);
}

/** 達成度の表示（×1.7 の形） */
export function formatRatio(ratio: number): string {
  return `×${ratio.toFixed(1)}`;
}
