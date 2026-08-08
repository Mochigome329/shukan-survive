/**
 * 物語10類型の事後判定（design_story_types.md 4節、v6.8）。
 *
 * 重要な設計方針: 型は**プレイヤーが狙う目標ではない**。
 * 得点にも役にも一切影響させず、連載年表の見出しとして事後的に名前が付くだけ。
 * ボーナス目当てのプレイを誘発しないため、ゲーム中に条件を提示することもしない。
 *
 * 判定材料は連載履歴（log / setupComboHistory / カードのzone）だけ。
 * 複数成立した場合は strictness（条件の厳しさ）が最も高いものを1つ選ぶ。
 */
import type { CardInstance, RunState } from './types';
import type { GameData } from './validate';

export interface StoryType {
  id: string;
  /** 〈通過儀礼〉のような角括弧つきの型名 */
  label: string;
  /** 年表の見出しに使う一行 */
  headline: string;
  /**
   * 条件の厳しさ。複数成立したときはこの値が最大のものを見出しにする。
   * 「2つ以上の役の積み上げが要る」ものを高く、「1枚使えば足りる」ものを低くしている
   */
  strictness: number;
  match: (ctx: StoryTypeContext) => boolean;
}

export interface StoryTypeContext {
  /** 通算で成立した役ID（appliedのみ） */
  comboIds: Set<string>;
  /** 役IDごとの通算成立回数 */
  comboCounts: Map<string, number>;
  /** 通算でプレイした展開の定義ID */
  playedDefIds: Set<string>;
  /** 展開の定義IDごとの通算プレイ回数 */
  playedCounts: Map<string, number>;
  /** 最終的に場にいる仲間キャラの人数 */
  allyCount: number;
  /** 最終的に死亡済みのキャラの人数 */
  deadCount: number;
  /** 到達した最終話数 */
  lastWeek: number;
}

const has = (ctx: StoryTypeContext, ...comboIds: string[]) => comboIds.every((id) => ctx.comboIds.has(id));
const hasAny = (ctx: StoryTypeContext, ...comboIds: string[]) => comboIds.some((id) => ctx.comboIds.has(id));
const played = (ctx: StoryTypeContext, ...defIds: string[]) => defIds.some((id) => ctx.playedDefIds.has(id));
const playedTimes = (ctx: StoryTypeContext, defId: string) => ctx.playedCounts.get(defId) ?? 0;

/** 10類型。design_story_types.md 4節の表と1対1で対応する */
export const STORY_TYPES: StoryType[] = [
  {
    id: 'rites_of_passage',
    label: '〈通過儀礼〉',
    headline: '師を失い、その意志を継いだ物語',
    // 「先駆者との別れ」と「意志を継ぐ者」の両方が要る＝仕込みと回収が揃って初めて成立する
    strictness: 5,
    match: (ctx) => has(ctx, 'shitei_no_wakare', 'densho'),
  },
  {
    id: 'whydunit',
    label: '〈動機の在処〉',
    headline: 'すべての謎が一つの動機に繋がった物語',
    // 黒幕の正体（伏線3本以上の消費が前提）か、伏線回収を2回以上
    strictness: 5,
    match: (ctx) => ctx.comboIds.has('kuromaku_no_shoutai') || (ctx.comboCounts.get('fukusen_kaishu') ?? 0) >= 2,
  },
  {
    id: 'fool_triumphant',
    label: '〈愚者の勝利〉',
    headline: '見くびられた者が格上を食った物語',
    // 主役級でない者の見せ場＋ジャイアントキリングの両方
    strictness: 5,
    match: (ctx) =>
      hasAny(ctx, 'igai_no_katsuyaku', 'iji_wo_miseru', 'yuuki_no_hatsuro') && ctx.comboIds.has('giant_killing'),
  },
  {
    id: 'superhero',
    label: '〈選ばれし者〉',
    headline: '異能が目覚め、覚醒に至った物語',
    // 「先駆者との別れ」を仕込んで「真の覚醒」で回収しきった
    strictness: 4,
    match: (ctx) => ctx.comboIds.has('keishou_no_kakusei') && played(ctx, 'nouryoku_kakusei', 'sainou_no_henrin'),
  },
  {
    id: 'institutionalized',
    label: '〈組織の掟〉',
    headline: '組織に奪われ、取り戻した物語',
    // 組織に奪われる（掟・洗脳・裏切り）→ 取り戻す（おかえり・改心）
    strictness: 4,
    match: (ctx) =>
      played(ctx, 'soshiki_no_okite', 'sennou', 'uragiri') &&
      (played(ctx, 'okaeri') || ctx.comboIds.has('kaishin_no_monogatari')),
  },
  {
    id: 'out_of_the_bottle',
    label: '〈禁じられた力〉',
    headline: '力を得た者が、その代償を払った物語',
    // 禁断の力を使い、実際に代償（闇堕ち・死亡）を払った
    strictness: 4,
    match: (ctx) => played(ctx, 'kindan_no_chikara') && (played(ctx, 'yamiochi', 'shibou') || ctx.deadCount > 0),
  },
  {
    id: 'buddy_love',
    label: '〈背中を預ける〉',
    headline: '二人の関係が中心にあった物語',
    strictness: 3,
    match: (ctx) => ctx.comboIds.has('ryouomoi') || hasAny(ctx, 'ano_koro_no_bokutachi', 'anata_to_tomoni'),
  },
  {
    id: 'golden_fleece',
    label: '〈果てなき旅路〉',
    headline: '仲間を増やしながら旅した物語',
    // デビュー展開を3回以上使い、最後まで仲間が5人以上残っている
    strictness: 3,
    match: (ctx) => playedTimes(ctx, 'shinchara') + playedTimes(ctx, 'unmei_deai') >= 3 && ctx.allyCount >= 5,
  },
  {
    id: 'dude_with_a_problem',
    label: '〈巻き込まれた男〉',
    headline: '日常を奪われた男が抗い続けた物語',
    strictness: 2,
    match: (ctx) => ctx.comboIds.has('ubawareta_nichijou') && played(ctx, 'hangeki', 'dai_shouri'),
  },
  {
    id: 'monster_in_the_house',
    label: '〈絶望の包囲〉',
    headline: '逃げ場のない状況を生き延びた物語',
    strictness: 2,
    match: (ctx) => played(ctx, 'tozasareta_butai', 'dai_pinch', 'zenmetsu') && ctx.lastWeek >= 10,
  },
];

/** ランの履歴から判定材料をまとめる */
export function storyTypeContext(data: GameData, state: RunState): StoryTypeContext {
  const comboIds = new Set<string>();
  const comboCounts = new Map<string, number>();
  const playedDefIds = new Set<string>();
  const playedCounts = new Map<string, number>();
  for (const entry of state.log) {
    for (const id of entry.comboIds) {
      comboIds.add(id);
      comboCounts.set(id, (comboCounts.get(id) ?? 0) + 1);
    }
    for (const id of entry.playedDefinitionIds) {
      playedDefIds.add(id);
      playedCounts.set(id, (playedCounts.get(id) ?? 0) + 1);
    }
  }
  const isChar = (c: CardInstance) => data.definitions.get(c.definitionId)?.kind === 'character';
  return {
    comboIds,
    comboCounts,
    playedDefIds,
    playedCounts,
    allyCount: state.cards.filter((c) => isChar(c) && c.zone === 'field' && c.faction === 'ally').length,
    deadCount: state.cards.filter((c) => isChar(c) && c.zone === 'dead').length,
    lastWeek: state.log.length > 0 ? state.log[state.log.length - 1]!.week : 0,
  };
}

/**
 * このランがどの型だったかを判定する。
 * 複数成立したら最も条件の厳しいものを返す。どれも成立しなければ null（見出しなし）
 */
export function detectStoryType(data: GameData, state: RunState): StoryType | null {
  const ctx = storyTypeContext(data, state);
  const matched = STORY_TYPES.filter((t) => t.match(ctx));
  if (matched.length === 0) return null;
  return matched.reduce((a, b) => (b.strictness > a.strictness ? b : a));
}
