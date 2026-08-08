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
    conditionText: '死亡済みのキャラがいて、役「かたき討ち」を成立させたことがある',
    available: (data, state) => charsIn(data, state, 'dead').length > 0 && hasCombo(state, 'katakiuchi'),
    buzzAdd: 6,
    scoreMultiplier: 2,
    charMultiplier: 1,
    finalScoreDelta: 0,
    unresolvedPenaltyMultiplier: 1,
    description: '弔いを済ませ、静かに幕を引く。週スコア×2、話題性+6、死亡済み1人につきさらに+3',
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
    return card.buzzAdd + state.cards.filter((c) => c.zone === 'dead').length * 3;
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
