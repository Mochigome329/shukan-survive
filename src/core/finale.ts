/**
 * 最終回（第25話）のルール（design_finale.md 2〜4節・6節）。
 *
 * 最終回は「通常回の高ノルマ版」ではなく、積み上げてきたものを回収する回にする:
 * - プレイ上限が5枚に増える
 * - 再登場待ちのキャラは全員戻せる（週1人の制限を無視）
 * - 成立させた仕込み役の種類数だけ完結ボーナス倍率が上がる
 * - 連載の内容に応じて選べる「結末カード」が提示され、1枚だけ選ぶ
 */
import { SETUP_COMBO_IDS } from './combos';
import type { RunState } from './types';
import type { GameData } from './validate';

/** 最終回のプレイ上限（通常は4枚） */
export const FINALE_MAX_PLAY_CARDS = 5;

/**
 * 中央値ベースの最終回（v7.28）。
 *
 * 最終回は展開カードを出さない。結末カードだけを選ぶ回にしたので、
 * その週の人気度と話題性は「これまでの連載の中央値」から作る。
 * 積み上げてきた連載の実力がそのままベース点になり、そこへ結末カードを掛ける。
 *
 * 平均ではなく中央値なのは、全滅や人気投票のような外れ値の週に
 * 最終回が引きずられないようにするため。
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * ボス週「人気投票」は話題性を固定1にする特殊ルールなので、母集団から外す（v7.28）。
 * 連載の実力ではなくルールで作られた数字なので、混ぜると中央値が歪む
 */
const POPULARITY_VOTE_WEEK = 16;

export interface FinaleBase {
  popularity: number;
  buzz: number;
}

/**
 * v7.28より前のセーブには人気度・話題性の記録が無い。
 * その場合は「スコア = 人気度 × 話題性」の関係から逆算して、
 * 記録として残っている週スコアの中央値を再現できる組み合わせを作る。
 * 話題性の代表値をここに置き、人気度はそこから割り戻す
 */
const LEGACY_BUZZ_ESTIMATE = 30;

/**
 * 最終回のベース点。過去週の人気度合計・話題性合計それぞれの中央値。
 * 記録の無い週（v7.28より前のセーブ）は母集団から外し、
 * 1週も残らなければ週スコアの中央値から逆算する
 */
export function finaleBase(state: RunState): FinaleBase {
  /*
   * 最終回そのものは母集団に入れない。
   * 採点時はまだ記録されていないので影響しないが、採点後（年表の集計など）に
   * 呼ぶと自分自身を含んでしまい、同じベース点が別の値になってしまう。
   * ノルマの無い週＝最終回なので、それを目印に外す
   */
  const played = state.log.filter((w) => w.week !== POPULARITY_VOTE_WEEK && w.quota > 0);
  const usable = played.filter((w) => typeof w.popularity === 'number' && typeof w.buzz === 'number');
  if (usable.length > 0) {
    return {
      popularity: Math.floor(median(usable.map((w) => w.popularity!))),
      buzz: Math.floor(median(usable.map((w) => w.buzz!))),
    };
  }
  const legacyScore = median(played.map((w) => w.score));
  return {
    popularity: Math.floor(legacyScore / LEGACY_BUZZ_ESTIMATE),
    buzz: legacyScore > 0 ? LEGACY_BUZZ_ESTIMATE : 0,
  };
}

/** ベース点だけで出る素点。「有終の美」の判定に使う（v7.28） */
export function finaleBaseScore(state: RunState): number {
  const base = finaleBase(state);
  return base.popularity * base.buzz;
}

/** 完結ボーナス: 1 + 0.1 × 仕込み役の種類数。上限は×2.0 */
export const COMPLETION_BONUS_PER_COMBO = 0.1;
export const COMPLETION_BONUS_CAP = 2.0;

export function completionBonus(state: RunState): number {
  const raw = 1 + COMPLETION_BONUS_PER_COMBO * state.setupComboHistory.length;
  return Math.min(COMPLETION_BONUS_CAP, Math.round(raw * 10) / 10);
}

/** 仕込み役は全部で何種類あるか（リザルトで「n/N種類」を出すため） */
export const SETUP_COMBO_TOTAL = SETUP_COMBO_IDS.size;

export interface EndingCard {
  id: string;
  name: string;
  /** 提示条件。無条件枠は () => true */
  available: (data: GameData, state: RunState) => boolean;
  /** availableを人間向けに書いたもの（カード・役一覧に出す。v7.3） */
  conditionText: string;
  /** 常に提示される受け皿かどうか（枠が余ったときに必ず入る） */
  unconditional?: boolean;
  /** バッドエンド（夢オチの代償で提示される） */
  bad?: boolean;
  buzzAdd: number;
  /** 週スコア乗算。1なら乗算なし */
  scoreMultiplier: number;
  /** キャスト全員の人気度乗算。1なら乗算なし */
  charMultiplier: number;
  /** 最終評価への加算（負なら減点） */
  finalScoreDelta: number;
  /** 未回収の伏線ペナルティの倍率 */
  unresolvedPenaltyMultiplier: number;
  description: string;
  /** 連載年表の締めくくりの一行 */
  epilogue: string;
}

const hasCombo = (state: RunState, id: string) => state.log.some((w) => w.comboIds.includes(id));

/**
 * 「両想い」の相手が誰ひとり生きていないと結婚式は挙げられない（v7.3）。
 * 恋愛フラグは成立時に消費されるので、相手は `romanceIds` に記録してある。
 * 途中離脱（waiting）は最終回に全員戻ってくるので生存扱いにする
 */
const romancePartnerAlive = (state: RunState) =>
  (state.romanceIds ?? []).some((id) => {
    const zone = state.cards.find((c) => c.instanceId === id)?.zone;
    return zone !== undefined && zone !== 'dead';
  });
const countCombo = (state: RunState, id: string) => state.log.filter((w) => w.comboIds.includes(id)).length;
const charsIn = (data: GameData, state: RunState, zone: 'dead' | 'waiting') =>
  state.cards.filter((c) => c.zone === zone && data.definitions.get(c.definitionId)?.kind === 'character');

/** 死亡済みの味方（v7.17。弔いの結末は敵の死を数えない） */
const deadAllies = (data: GameData, state: RunState) =>
  charsIn(data, state, 'dead').filter((c) => c.faction === 'ally');

/** 場か再登場待ちに敵が残っているか（倒しきれずに終わる結末の条件） */
const enemyRemains = (data: GameData, state: RunState) =>
  state.cards.some(
    (c) =>
      c.faction === 'enemy' &&
      (c.zone === 'field' || c.zone === 'waiting') &&
      data.definitions.get(c.definitionId)?.kind === 'character',
  );

/** その展開カードを連載を通して何回プレイしたか（合計） */
const countPlayedTotal = (state: RunState, defIds: readonly string[]) =>
  state.log.reduce((sum, w) => sum + w.playedDefinitionIds.filter((id) => defIds.includes(id)).length, 0);

/** 連載中に「夢オチ」を使った回数（専用の状態は持たず、週ログから導出する） */
export function yumeochiCount(state: RunState): number {
  return state.log.filter((w) => w.playedDefinitionIds.includes('yumeochi')).length;
}

export const ENDING_CARDS: EndingCard[] = [
  {
    id: 'ishi_wa_uketsugareru',
    name: '意志は受け継がれる',
    conditionText: '主人公が死亡している',
    available: (data, state) => charsIn(data, state, 'dead').some((c) => c.definitionId === 'hero'),
    buzzAdd: 10,
    scoreMultiplier: 4,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '主人公は還らない。だが物語は続く。週スコア×4、話題性+10',
    epilogue: 'お前の意志は俺たちが継いでいく',
  },
  {
    id: 'kekkonshiki',
    name: '結婚式',
    conditionText: '役「両想い」を成立させ、その相手が生きている',
    available: (_d, state) => hasCombo(state, 'ryouomoi') && romancePartnerAlive(state),
    buzzAdd: 6,
    scoreMultiplier: 3,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '積み上げた恋を結ぶ。週スコア×3、話題性+6',
    epilogue: '愛するふたりは幸せに暮らしました',
  },
  {
    id: 'subete_no_nazo',
    name: 'すべての謎の解明',
    conditionText: '役「伏線回収」を2回以上成立させた',
    available: (_d, state) => countCombo(state, 'fukusen_kaishu') >= 2,
    buzzAdd: 0, // 実際の話題性は回収した伏線の本数から算出する（finaleEndingBuzz）
    scoreMultiplier: 2,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '張ってきた謎がすべて繋がる。週スコア×2、回収した伏線1本につき話題性+5',
    epilogue: 'すべての謎は、たったひとつの真実に繋がっていた。',
  },
  {
    id: 'shinsedai',
    name: '新世代の物語',
    conditionText: '直近3話以内に「タイムスキップ」をプレイした',
    available: (_d, state) => state.log.slice(-3).some((w) => w.playedDefinitionIds.includes('timeskip')),
    buzzAdd: 4,
    scoreMultiplier: 1,
    charMultiplier: 2,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '時は流れ、物語は次の世代へ。キャスト全員の人気度×2、話題性+4',
    epilogue: '物語は次の世代へ',
  },
  {
    // v7.4b: 死亡済みを条件から外した（死んでいる相手とは集結できない、というユーザー指摘）。
    // あわせて「1人につき話題性+4」が説明だけで実装されていなかったのを直した
    id: 'saishuuketsu',
    name: '再集結',
    conditionText: '再登場待ちのキャラが2人以上いる（死亡済みは数えない）',
    available: (data, state) => charsIn(data, state, 'waiting').length >= 2,
    buzzAdd: 4,
    scoreMultiplier: 1,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '去った者たちが最後に揃う。話題性+4、再登場待ち1人につきさらに+4',
    epilogue: '仲間たちは再び集う',
  },
  {
    // v7.4b: ユーザー提案。死者を悼んで終わる結末。「再集結」から外した死亡済みキャラの受け皿でもある
    id: 'hakamairi',
    name: '墓参り',
    conditionText: '味方が死亡していて、役「かたき討ち」を成立させたことがある',
    available: (data, state) => deadAllies(data, state).length > 0 && hasCombo(state, 'katakiuchi'),
    buzzAdd: 6,
    scoreMultiplier: 2,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '弔いを済ませ、静かに幕を引く。週スコア×2、話題性+6、死亡した味方1人につきさらに+3',
    epilogue: 'ここにお前もいてくれればな',
  },
  {
    id: 'gojitsudan',
    name: '後日談',
    conditionText: '無条件（枠が余れば必ず提示される受け皿）',
    available: () => true,
    unconditional: true,
    // v7.4b: 話題性を6→3に下げた。何も積んでいなくても選べる受け皿が、
    // 条件つきの結末（再集結など）より話題性で勝っているのはおかしい、というユーザー指摘。
    // キャスト全員の人気度+10という強みは据え置き
    buzzAdd: 3,
    scoreMultiplier: 1,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: 'あのあとの、なんでもない一日。話題性+3、キャスト全員の人気度+10',
    epilogue: 'その後の日々は、穏やかに続いていった。',
  },
  {
    id: 'nagepanashi',
    name: '投げっぱなしエンド',
    conditionText: '未回収の伏線が1本以上ある',
    available: (_d, state) => state.foreshadowTokens > 0,
    unconditional: true,
    buzzAdd: 4,
    scoreMultiplier: 1,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 2,
    description: '謎を残したまま幕を引く。未回収の伏線1本につき話題性+3。ただし未回収ペナルティが2倍',
    epilogue: '多くの謎を残したまま、物語は唐突に幕を下ろした。',
  },
  {
    /*
     * v7.17: ユーザー提案のバッドエンド。
     * 敵を倒しきれないまま仲間を失って終わる、という結末。
     * 話題性は出るが、決着をつけていないぶん評価は伸びない
     */
    id: 'tsukanoma_no_heiwa',
    name: 'つかの間の平和',
    conditionText: '敵が場か再登場待ちに残っていて、味方が2人以上死亡している',
    available: (data, state) => enemyRemains(data, state) && deadAllies(data, state).length >= 2,
    bad: true,
    buzzAdd: 7,
    scoreMultiplier: 2,
    charMultiplier: 1,
    finalScoreDelta: -400,
    unresolvedPenaltyMultiplier: 1,
    description: '脅威は去っていない。週スコア×2、話題性+7、死亡した味方1人につきさらに+2。最終評価-400',
    epilogue: '倒しきれなかった影は、まだどこかで息を潜めている。',
  },
  {
    /*
     * v7.17: ユーザー提案のバッドエンド。
     * 破壊と悲劇を重ねてきた連載の行き着く先。積んだ枚数がそのまま条件になる
     */
    id: 'kouhai_shita_sekai',
    name: '荒廃した世界',
    conditionText: '「大破壊」「悲劇」「敗北」「全滅」を通算5回以上プレイした',
    available: (_d, state) => countPlayedTotal(state, ['daihakai', 'higeki', 'haiboku', 'zenmetsu']) >= 5,
    bad: true,
    buzzAdd: 12,
    scoreMultiplier: 1.5,
    charMultiplier: 1,
    finalScoreDelta: -700,
    unresolvedPenaltyMultiplier: 1,
    description: '救えたものは何もなかった。週スコア×1.5、話題性+12。最終評価-700',
    epilogue: '残されたのは、瓦礫と沈黙だけだった。',
  },
  {
    id: 'yumeochi_end',
    name: '夢オチエンド',
    conditionText: '連載中に「夢オチ」を1回以上使った',
    available: (_d, state) => yumeochiCount(state) > 0,
    bad: true,
    buzzAdd: 8,
    scoreMultiplier: 0.5,
    charMultiplier: 1,
    finalScoreDelta: -1000,
    unresolvedPenaltyMultiplier: 1,
    description: 'すべては夢だった。話題性+8だが週スコア×0.5、最終評価-1000',
    epilogue: '——そして目が覚めた。すべては夢だったのだ。',
  },
];

/** 「後日談」など、キャスト全員の人気度に加算する結末カードの加算量 */
const ENDING_POPULARITY_ADD: Record<string, number> = { gojitsudan: 10 };
export function endingPopularityAdd(endingId: string | null): number {
  return endingId ? (ENDING_POPULARITY_ADD[endingId] ?? 0) : 0;
}

/**
 * 結末カードの話題性（人数・本数に応じて変わるものを含む）。
 * すべての謎の解明: 回収した伏線の総本数×5 / 投げっぱなし: 未回収×3 /
 * 再集結: 再登場待ち1人につき+4 / 墓参り: 死亡済み1人につき+3
 *
 * v7.4b: 再集結の人数ぶんは「finale側で加算する」というコメントだけがあって
 * 実際にはどこでも足されていなかった（説明文だけが約束していた状態）ので、ここで実装した。
 * この関数はGameDataを持たないため、キャラかどうかは `cards` の zone と定義照合ではなく
 * 呼び出し側と同じ `charsIn` を使えない。zone だけで数えると展開カードは
 * dead/waiting にならないので、結果としてキャラだけが数えられる
 */
export function endingBuzz(card: EndingCard, state: RunState): number {
  if (card.id === 'subete_no_nazo') {
    const resolved = state.log.reduce((sum, w) => sum + (w.comboIds.includes('fukusen_kaishu') ? 1 : 0), 0);
    return card.buzzAdd + resolved * 5;
  }
  if (card.id === 'nagepanashi') return card.buzzAdd + state.foreshadowTokens * 3;
  if (card.id === 'saishuuketsu') {
    return card.buzzAdd + state.cards.filter((c) => c.zone === 'waiting').length * 4;
  }
  if (card.id === 'hakamairi') {
    return card.buzzAdd + state.cards.filter((c) => c.zone === 'dead' && c.faction === 'ally').length * 3;
  }
  if (card.id === 'tsukanoma_no_heiwa') {
    return card.buzzAdd + state.cards.filter((c) => c.zone === 'dead' && c.faction === 'ally').length * 2;
  }
  return card.buzzAdd;
}

/** 最終回に提示する結末カード（最大3枚。無条件枠が必ず1枚は入る） */
export const ENDING_SLOTS = 3;

export function offeredEndings(data: GameData, state: RunState): EndingCard[] {
  const dreams = yumeochiCount(state);
  const bad = ENDING_CARDS.filter((c) => c.bad && c.available(data, state));
  const good = ENDING_CARDS.filter((c) => !c.bad && !c.unconditional && c.available(data, state));
  const fallback = ENDING_CARDS.filter((c) => c.unconditional && c.available(data, state));

  // 夢オチの代償（4節、v5.9で緩和）: 1回=枠を1つ占有 / 2回=良い結末は1枚だけ残る / 3回以上=全消滅
  let goodSlots = ENDING_SLOTS - bad.length;
  if (dreams >= 3) goodSlots = 0;
  else if (dreams === 2) goodSlots = Math.min(goodSlots, 1);

  const picked = [...bad, ...good.slice(0, Math.max(0, goodSlots))];
  // 残り枠を受け皿（後日談・投げっぱなし）で埋める。何も積んでいなくても必ず選べる
  for (const f of fallback) {
    if (picked.length >= ENDING_SLOTS) break;
    picked.push(f);
  }
  // 夢オチ3回以上でも、選択肢が空になることはないようにする
  if (picked.length === 0) picked.push(ENDING_CARDS.find((c) => c.id === 'gojitsudan')!);
  return picked;
}

export function endingById(id: string): EndingCard | undefined {
  return ENDING_CARDS.find((c) => c.id === id);
}
