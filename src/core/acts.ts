/**
 * 幕（序破急）の定義。話数帯・ショップの提示重み・シーンチェンジ演出で共有する。
 * 話数の区切りは design_story_types.md 2節に合わせる。
 *
 * v7.30: 連載の長さ（キャンペーン）ごとに区切りが変わるので、幕の表は
 * キャンペーン単位で持つ。話数から幕を引くには campaign.ts の actOf を使う
 */
import type { Act } from './types';

export interface ActInfo {
  act: Act;
  /** この幕が始まる話数 */
  startWeek: number;
  /** 「第一幕」等の表記 */
  label: string;
  /** 幕の副題 */
  title: string;
  /** 幕の性格を一行で */
  lead: string;
}

/** 幕の文言はキャンペーンによらず共通。話数の区切りだけが変わる */
const JO = { act: 'jo' as const, label: '第一幕', title: '物語の始まり', lead: '出会いと世界の提示。まずは読者に「誰の話か」を伝える' };
const HA = { act: 'ha' as const, label: '第二幕', title: '展開・転回・天外', lead: '試練と裏切り、そして仕込み。物語が転がりはじめる' };
const KYU = { act: 'kyu' as const, label: '第三幕', title: 'クライマックス', lead: '決着と回収。積み上げてきたものを、すべて使い切る' };

/** 通常連載（全25話）の幕: 序1〜5 / 破6〜16 / 急17〜24 / 最終回25 */
export const ACTS_LONG: readonly ActInfo[] = [
  { ...JO, startWeek: 1 },
  { ...HA, startWeek: 6 },
  { ...KYU, startWeek: 17 },
];

/** 短期連載（全13話）の幕: 序1〜3 / 破4〜9 / 急10〜12 / 最終回13（v7.30） */
export const ACTS_SHORT: readonly ActInfo[] = [
  { ...JO, startWeek: 1 },
  { ...HA, startWeek: 4 },
  { ...KYU, startWeek: 10 },
];

/** 話数から現在の幕を返す（開始話数が最も大きく、かつ今週以下の幕） */
export function actOfWeekIn(acts: readonly ActInfo[], week: number): Act {
  let current = acts[0]!;
  for (const a of acts) {
    if (week >= a.startWeek) current = a;
  }
  return current.act;
}

/** その話数が幕の初回なら幕情報を返す（シーンチェンジを出す判定に使う） */
export function actStartingAtIn(acts: readonly ActInfo[], week: number): ActInfo | null {
  return acts.find((a) => a.startWeek === week) ?? null;
}

export function actInfoIn(acts: readonly ActInfo[], act: Act): ActInfo {
  return acts.find((a) => a.act === act)!;
}
