/**
 * 編集部の要求（v5.2d、v5.4でジャンル廃止）。
 * 「スコアさえ足りていれば何を描いてもいい」状態を避けるための裏ロジック。
 * 「この話数までにこういう展開になっているべき」という期限つき要求を課し、
 * 達成すれば原稿料ボーナス、期限切れなら読者が離れて打ち切り警告が増える。
 */
import type { CardInstance, DemandState, RunState, WeekLogEntry } from './types';
import type { GameData } from './validate';

/** 判定に使う進行状況のスナップショット */
export interface DemandContext {
  log: readonly WeekLogEntry[];
  cards: readonly CardInstance[];
  data: GameData;
}

export interface DemandDefinition {
  id: string;
  text: string;
  deadline: number;
  /** この話数までに達成すると早期ボーナス（物語の芯を早く提示した評価、v5.3） */
  earlyBonusWeek?: number;
  check: (ctx: DemandContext) => boolean;
  /**
   * その要求を達成する手立てになるカード（v7.16）。
   * 期限が近いのに未達成なら、編集会議でこれらが並びやすくなる。
   * 「編集部が求めているのに手段がまったく回ってこない」状態を避けるためのもので、
   * 手段が複数ある要求や、達成条件が積み上げ型の要求には付けない
   */
  shopHints?: string[];
}

const countPlayed = (ctx: DemandContext, defId: string) =>
  ctx.log.reduce((sum, w) => sum + w.playedDefinitionIds.filter((id) => id === defId).length, 0);

const hasCombo = (ctx: DemandContext, ...comboIds: string[]) =>
  ctx.log.some((w) => w.comboIds.some((id) => comboIds.includes(id)));

const distinctCombos = (ctx: DemandContext) => new Set(ctx.log.flatMap((w) => w.comboIds)).size;

const castCount = (ctx: DemandContext) =>
  ctx.cards.filter((c) => c.zone === 'field' && ctx.data.definitions.get(c.definitionId)?.kind === 'character').length;

/** 場・控え・死亡を問わず、そのキャラを連載に登場させたか */
const hasCharacter = (ctx: DemandContext, ...defIds: string[]) =>
  ctx.cards.some((c) => defIds.includes(c.definitionId) && c.zone !== 'bench');


/** 要求の達成条件。長短のキャンペーンで文言と期限だけ変え、判定は共有する（v7.30） */
const CHECKS = {
  rivalAppeared: (c: DemandContext) => hasCharacter(c, 'rival', 'shukuteki'),
  battleTwice: (c: DemandContext) => countPlayed(c, 'battle') >= 2,
  rivalDuelOrHissatsu: (c: DemandContext) => hasCombo(c, 'rival_taiketsu', 'hissatsu_hatsuhirou'),
  castFour: (c: DemandContext) => castCount(c) >= 4,
  catharsis: (c: DemandContext) => hasCombo(c, 'catharsis'),
  mysteryDug: (c: DemandContext) => hasCombo(c, 'fukusen_kaishu', 'kanashiki_akuyaku', 'kyara_horisage'),
  enemyRetired: (c: DemandContext) =>
    c.cards.some((x) => (x.zone === 'dead' || x.zone === 'waiting') && x.faction === 'enemy'),
} as const;

/*
 * 強敵を退場させる要求の「手立てカード」。
 * 退場させる手段（撃破・途中離脱・喪失）に加えて、敵そのものを用意する手段（闇落ち・悪役会議）も挙げておく。
 * 開始時にライバルを仲間側にしていると場に敵が1人もいないことがあり、
 * その場合は退場カードを持っていても達成しようがないため
 */
const ENEMY_RETIRE_HINTS = ['gekiha', 'ridatsu', 'soushitsu', 'yamiochi', 'akuyaku_kaigi'];

/**
 * 王道バトル連載の要求（v5.4: ジャンル分岐を廃止し1系統に統一）。
 * 恋愛・謎はバトル漫画のサブ要素として扱い、要求にも織り交ぜる。
 */
export const DEMANDS_LONG: DemandDefinition[] = [
  // 物語の芯（敵の提示）は早いほど評価される（v5.3）
  {
    id: 'battle_0',
    text: '第4話までに「ライバル」か「宿敵」を連載に登場させる（第2話までなら特別評価）',
    deadline: 4,
    earlyBonusWeek: 2,
    check: CHECKS.rivalAppeared,
  },
  { id: 'battle_1', text: '第3話までに「バトル」を2回描く', deadline: 3, check: CHECKS.battleTwice },
  {
    id: 'battle_2',
    text: '第6話までに「ライバル対決」か「必殺技初披露」を成立させる',
    deadline: 6,
    check: CHECKS.rivalDuelOrHissatsu,
  },
  { id: 'battle_3', text: '第8話までにキャストを4人以上にする', deadline: 8, check: CHECKS.castFour },
  // 第2部（v5.3）
  {
    id: 'battle_4',
    // 緊張の発生源は敗北に限らない（大ピンチ・洗脳・闇堕ち・禁断の力でも溜まる）ので、
    // 表記を「溜まった緊張の解放」に合わせる（v5.7）
    text: '第11話までに溜まった緊張を一気に解放する（カタルシス成立）',
    deadline: 11,
    check: CHECKS.catharsis,
  },
  {
    id: 'battle_5',
    text: '第13話までに謎か因縁を掘り下げる（伏線回収・悲しき悪役・キャラの掘り下げのいずれか）',
    deadline: 13,
    check: CHECKS.mysteryDug,
  },
  {
    id: 'battle_6',
    text: '第14話までに強敵を1人退場させる（死亡か離脱）',
    deadline: 14,
    check: CHECKS.enemyRetired,
    shopHints: ENEMY_RETIRE_HINTS,
  },
  { id: 'battle_7', text: '第16話までに役を通算12種類成立させる', deadline: 16, check: (c) => distinctCombos(c) >= 12 },
];

/**
 * 短期連載（全13話）の要求（v7.30）。
 *
 * 8件は13話には過密なので5件に絞る。落としたのは
 * battle_5（謎か因縁）・battle_6（強敵退場）＝短い獲得期間で特定素材や退場手段を要求するのが重いため、
 * battle_7（役の種類数）＝内容を指定しない数量目標で、要求の多様性に寄与しないため。
 * battle_2 は「バトル+修行」の必殺技初披露という初期デッキで狙える代替条件があるので残す
 */
export const DEMANDS_SHORT: DemandDefinition[] = [
  {
    id: 'battle_0',
    text: '第2話までに「ライバル」か「宿敵」を連載に登場させる（第1話なら特別評価）',
    deadline: 2,
    earlyBonusWeek: 1,
    check: CHECKS.rivalAppeared,
  },
  { id: 'battle_1', text: '第3話までに「バトル」を2回描く', deadline: 3, check: CHECKS.battleTwice },
  {
    id: 'battle_2',
    text: '第5話までに「ライバル対決」か「必殺技初披露」を成立させる',
    deadline: 5,
    check: CHECKS.rivalDuelOrHissatsu,
  },
  { id: 'battle_3', text: '第6話までにキャストを4人以上にする', deadline: 6, check: CHECKS.castFour },
  {
    id: 'battle_4',
    text: '第7話までに溜まった緊張を一気に解放する（カタルシス成立）',
    deadline: 7,
    check: CHECKS.catharsis,
  },
];

export function createDemands(defs: readonly DemandDefinition[]): DemandState[] {
  return defs.map((d) => ({ id: d.id, text: d.text, deadline: d.deadline, achievedWeek: null, failed: false }));
}

/**
 * 期限が近いのに未達成な要求の「手立てカード」を返す（v7.16）。
 *
 * 編集会議の抽選がこれを見て、該当カードを出やすくする。
 * 要求そのものは達成条件を示すだけで、手段が回ってくるかは運任せだったため、
 * 「何をすればいいかは分かっているのにカードが来ない」で詰むことがあった。
 */
export function pendingDemandHints(
  defs: readonly DemandDefinition[],
  demands: readonly DemandState[],
  week: number,
  boostWeeks: number,
  forceWeeks: number,
): { boost: string[]; force: string[] } {
  const boost: string[] = [];
  const force: string[] = [];
  for (const state of demands) {
    if (state.achievedWeek !== null || state.failed) continue;
    const def = defs.find((d) => d.id === state.id);
    if (!def?.shopHints) continue;
    const left = state.deadline - week;
    if (left < 0 || left > boostWeeks) continue;
    boost.push(...def.shopHints);
    if (left <= forceWeeks) force.push(...def.shopHints);
  }
  return { boost, force };
}

export interface DemandUpdate {
  demands: DemandState[];
  /** この週に新しく達成した要求 */
  achieved: DemandState[];
  /** この週に期限切れで失敗した要求 */
  failed: DemandState[];
  /** 早期達成による追加の原稿料（v5.3） */
  earlyBonusFee: number;
}

/**
 * 週の解決後に要求の達成・失敗を判定する。
 * 達成は期限前でも成立し、失敗は期限の話数を終えた時点で確定する。
 */
export function updateDemands(
  defs: readonly DemandDefinition[],
  state: RunState,
  ctx: DemandContext,
  week: number,
): DemandUpdate {
  const achieved: DemandState[] = [];
  const failed: DemandState[] = [];
  let earlyBonusFee = 0;

  const demands = state.demands.map((demand) => {
    if (demand.achievedWeek !== null || demand.failed) return demand;
    const def = defs.find((d) => d.id === demand.id);
    if (!def) return demand;

    if (def.check(ctx)) {
      const next = { ...demand, achievedWeek: week };
      achieved.push(next);
      // 物語の芯を早く提示できたら特別評価（v5.3）
      if (def.earlyBonusWeek && week <= def.earlyBonusWeek) earlyBonusFee += DEMAND_EARLY_BONUS_FEE;
      return next;
    }
    if (week >= demand.deadline) {
      const next = { ...demand, failed: true };
      failed.push(next);
      return next;
    }
    return demand;
  });

  return { demands, achieved, failed, earlyBonusFee };
}

/** 達成1件あたりの原稿料ボーナス */
export const DEMAND_REWARD_FEE = 2;
/** 早期達成（物語の芯の提示）の追加ボーナス */
export const DEMAND_EARLY_BONUS_FEE = 3;
