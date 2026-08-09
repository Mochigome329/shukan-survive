/**
 * 連載の長さ（キャンペーン）の定義と取得API（v7.30）。
 *
 * 通常連載（全25話）に加えて短期連載（全13話）を選べるようにしたことで、
 * 「第17話以降」「第16話は人気投票」のような**絶対話数の決め打ち**が成立しなくなった。
 * 話数・幕・要求・カード解放週・バランス値をキャンペーン単位で束ね、
 * 呼び出し側は必ずここの関数を通して引く。
 *
 * validate.ts とは型だけの相互参照（import type は実行時に消える）なので循環しない。
 */
import { ACTS_LONG, ACTS_SHORT, actOfWeekIn, actStartingAtIn, type ActInfo } from './acts';
import { DEMANDS_LONG, DEMANDS_SHORT, type DemandDefinition } from './demands';
import type { Act, CardDefinition, RunState } from './types';
import type { GameData, QuotaEntry } from './validate';

export type CampaignMode = 'long' | 'short';

/** キャンペーンごとに変わるバランス値 */
export interface CampaignBalance {
  /** 完結ボーナスの1種類あたりの倍率（上限はCOMPLETION_BONUS_CAPで共通） */
  completionBonusPerCombo: number;
  /** 役「伝説の完結」に必要な仕込み役の種類数 */
  legendaryCompletionCombos: number;
  /** 役「有終の美」の絶対点の下限 */
  yuushuuMinScore: number;
  /** ボス週のブリーフィングを出しはじめる残り話数 */
  bossBriefingLead: number;
  /** 編集部の要求の「手立てカード」を出しやすくする／枠を確保する残り話数 */
  hintBoostWeeks: number;
  hintForceWeeks: number;
}

export interface Campaign {
  mode: CampaignMode;
  /** 画面に出す連載の長さの名前 */
  label: string;
  quotas: ReadonlyMap<number, QuotaEntry>;
  totalWeeks: number;
  acts: readonly ActInfo[];
  demands: readonly DemandDefinition[];
  /** 定義ID→解放週の上書き。無い定義は cards.json の unlockWeek をそのまま使う */
  unlockWeeks: Readonly<Record<string, number>>;
  balance: CampaignBalance;
}

/**
 * 短期連載でのカード解放週の上書き（v7.30）。
 *
 * 話数比（12/24）での機械換算だと、後ろ3枚が早く出すぎる。
 * カードの act タグはショップの提示重みであって使用禁止ではないため、
 * 解放週が早いと「第三幕のカード」が第二幕の頭から使えてしまいテーマとずれる。
 * タイトル回収（話題性8＋全員恒久+2）のような大技は特に効く
 */
const SHORT_UNLOCK_WEEKS: Record<string, number> = {
  na_serifu: 2, // 名ゼリフ（通常3）
  kakusareta_kettou: 3, // 隠された血統（通常5）
  souryokusen: 3, // 総力戦（通常5）
  timeskip: 6, // タイムスキップ（通常9）
  title_kaishu: 6, // タイトル回収（通常10）
  zenin_seikan: 10, // 全員生還（通常17）。急の開始に合わせる
};

const LONG_BALANCE: CampaignBalance = {
  completionBonusPerCombo: 0.1,
  legendaryCompletionCombos: 10,
  yuushuuMinScore: 10000,
  bossBriefingLead: 5,
  hintBoostWeeks: 6,
  hintForceWeeks: 3,
};

/*
 * 短期は全体が半分の長さなので、積み上げ系の閾値と相対期間を詰める。
 * 完結ボーナスは仕込み役が中央値2種しか溜まらない実測（gpt-5.6-solのシミュレーション）から
 * 0.25/種＝4種で上限×2.0。伝説の完結も10種→4種。
 * 有終の美の絶対下限は、短期の最終スコアが best中央値11,223 / casual中央値7,712 なので6,000
 */
const SHORT_BALANCE: CampaignBalance = {
  completionBonusPerCombo: 0.25,
  legendaryCompletionCombos: 4,
  yuushuuMinScore: 6000,
  bossBriefingLead: 3,
  hintBoostWeeks: 3,
  hintForceWeeks: 2,
};

export function buildCampaign(
  mode: CampaignMode,
  quotas: ReadonlyMap<number, QuotaEntry>,
  totalWeeks: number,
): Campaign {
  return mode === 'long'
    ? {
        mode,
        label: '通常連載',
        quotas,
        totalWeeks,
        acts: ACTS_LONG,
        demands: DEMANDS_LONG,
        unlockWeeks: {},
        balance: LONG_BALANCE,
      }
    : {
        mode,
        label: '短期連載',
        quotas,
        totalWeeks,
        acts: ACTS_SHORT,
        demands: DEMANDS_SHORT,
        unlockWeeks: SHORT_UNLOCK_WEEKS,
        balance: SHORT_BALANCE,
      };
}

/** 不正な値・古いセーブ（mode なし）は通常連載として扱う */
export function normalizeMode(mode: unknown): CampaignMode {
  return mode === 'short' ? 'short' : 'long';
}

/** ランのキャンペーン。run が無い場面（タイトル画面など）は通常連載を返す */
export function campaignOf(data: GameData, run: { mode?: CampaignMode } | null | undefined): Campaign {
  return data.campaigns[normalizeMode(run?.mode)];
}

export function quotaAt(data: GameData, run: RunState, week: number): QuotaEntry | undefined {
  return campaignOf(data, run).quotas.get(week);
}

export function totalWeeksOf(data: GameData, run: { mode?: CampaignMode } | null | undefined): number {
  return campaignOf(data, run).totalWeeks;
}

export function actOf(data: GameData, run: RunState, week: number): Act {
  return actOfWeekIn(campaignOf(data, run).acts, week);
}

export function actStartingAt(data: GameData, run: RunState, week: number): ActInfo | null {
  return actStartingAtIn(campaignOf(data, run).acts, week);
}

/** そのカードがこのキャンペーンで解放される話数 */
export function unlockWeekOf(campaign: Campaign, def: CardDefinition): number {
  return campaign.unlockWeeks[def.id] ?? def.unlockWeek;
}

/** その週がボス週なら名前を返す */
export function bossAt(campaign: Campaign, week: number): string | null {
  return campaign.quotas.get(week)?.boss ?? null;
}

/** 最終回の話数 */
export function finaleWeekOf(campaign: Campaign): number {
  for (const [week, entry] of campaign.quotas) {
    if (entry.final) return week;
  }
  return campaign.totalWeeks;
}
