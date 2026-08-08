/**
 * ランと週の進行（設計書 4.2〜4.8節、v5.2改訂）。UI非依存の純関数群。
 * v5.2: キャラは場に常駐し、手札とプレイは展開カードのみ。
 * 打ち切り判定は警告制（未達+1、達成-1、3で打ち切り。ボス週未達は即打ち切り）。
 * 状態は破壊せず、新しいRunStateを返す。
 */
import { actOfWeek } from './acts';
import { ACT3_COMBO_MATERIALS, ACT3_DRAW_WEIGHT, COMBO_REGISTRY, SETUP_COMBO_IDS } from './combos';
import { completionBonus, endingBuzz, endingById, endingPopularityAdd, FINALE_MAX_PLAY_CARDS } from './finale';
import { createDemands, updateDemands, DEMAND_REWARD_FEE } from './demands';
import { drawRng, hashSeed, mulberry32, redrawRng, shuffled, weightedSample } from './rng';
import { applyStateChanges, computeScore } from './scoring';
import type {
  ActiveModifier,
  CardInstance,
  DemandState,
  DevelopmentCardDefinition,
  Faction,
  PlaySelection,
  RunState,
  ScoreBreakdown,
  SelectionValidity,
  WeekEvent,
  WeekLogEntry,
} from './types';
import { HAND_SIZE, HIGHLIGHT_LIMIT, MAX_PLAY_CARDS, MAX_STOCK, MAX_WARNINGS, PROTAGONIST_ID, REDRAWS_PER_WEEK } from './types';
export { HIGHLIGHT_LIMIT, PROTAGONIST_ID };
import type { GameData } from './validate';

/**
 * 初期デッキからカード実体を生成する。キャラは場に常駐、展開は抽選プールへ。
 * startingCastが指定された場合、そのキャラを場に、残りのキャラを控えにする（v5.2d）。
 * startingFactionsで、flexFactionキャラの開始時陣営を指定できる（v6.7）。省略時は既定の陣営のまま
 */
export function createInitialDeck(
  data: GameData,
  startingCast?: readonly string[],
  startingFactions?: Readonly<Record<string, Faction>>,
  runSeed?: number,
): CardInstance[] {
  /*
   * 可変枠（v7.13）。固定枠だけだと初期デッキが10枚7種類しかなく、
   * 毎週その6〜7割が手札に来るため、何度遊んでも序盤がまったく同じ形になっていた。
   * ランごとにプールから数枚引いて混ぜ、出だしを変える。
   * runSeedが無いとき（テスト等）は固定枠だけの従来どおりの構成にする
   */
  const variableEntries =
    runSeed !== undefined && data.starterSlots > 0
      ? shuffled([...data.starterPool], mulberry32(hashSeed(runSeed, 'starter')))
          .slice(0, data.starterSlots)
          .map((definitionId) => ({ definitionId, count: 1, start: undefined }))
      : [];

  const cards: CardInstance[] = [];
  for (const entry of [...data.initialDeck, ...variableEntries]) {
    const def = data.definitions.get(entry.definitionId);
    if (!def) throw new Error(`初期デッキの定義が見つかりません: ${entry.definitionId}`);
    for (let i = 1; i <= entry.count; i++) {
      const onField = startingCast
        ? entry.definitionId === PROTAGONIST_ID || startingCast.includes(entry.definitionId)
        : entry.start !== 'bench';
      const faction =
        def.kind === 'character'
          ? (def.flexFaction && startingFactions?.[entry.definitionId]) || def.faction
          : null;
      cards.push({
        instanceId: `${entry.definitionId}#${i}`,
        definitionId: entry.definitionId,
        permanentPopularityBonus: 0,
        faction,
        flags: { training: 0, love: false },
        acquiredWeek: 0,
        playCount: 0,
        zone: def.kind === 'character' ? (onField ? 'field' : 'bench') : 'activeDeck',
        // 場からスタートするキャラは、その時点でもう「デビュー済み」（v6.6）。控えは実際にデビューするまでnull
        debutFaction: def.kind === 'character' && onField ? faction : null,
      });
    }
  }
  return cards;
}

/** 初期デッキに含まれるキャラのうち、主人公以外（セットアップ画面の選択肢） */
export function initialCastChoices(data: GameData): string[] {
  return data.initialDeck
    .filter((e) => data.definitions.get(e.definitionId)?.kind === 'character' && e.definitionId !== PROTAGONIST_ID)
    .map((e) => e.definitionId);
}

/** 主人公に加えて選ぶ人数 */
export const STARTING_CAST_PICKS = 2;

export interface RunOptions {
  mangaTitle: string;
  /** 場からスタートするキャラの定義ID（3人）。省略時はcards.jsonのstart指定に従う */
  startingCast?: string[];
  /** 開始時共演者（flexFactionのみ）の陣営選択（v6.7）。省略時は既定の陣営のまま */
  startingFactions?: Record<string, Faction>;
}

export function createRun(data: GameData, runSeed: number, options: RunOptions): RunState {
  return {
    runSeed,
    mangaTitle: options.mangaTitle,
    week: 1,
    cards: createInitialDeck(data, options.startingCast, options.startingFactions, runSeed),
    hand: [],
    redrawsUsed: 0,
    foreshadowTokens: 0,
    foreshadowWeeks: [],
    stress: 0,
    warnings: 0,
    freshnessByDef: {},
    modifiers: [],
    pendingFreshnessPenalty: 0,
    returnUsedThisWeek: false,
    setupComboHistory: [],
    highlightIds: [],
    stockedIds: [],
    guaranteedNextHand: [],
    funds: 0,
    shopPurchases: 0,
    comboUsage: { oncePerRun: [], perCharacter: {} },
    permanentBuzzByDef: {},
    upgrades: [],
    demands: createDemands(),
    log: [],
  };
}

function isDevelopment(data: GameData, card: CardInstance): boolean {
  return data.definitions.get(card.definitionId)?.kind === 'development';
}


/**
 * 連載に在籍しているキャラ全員（v6.0）。
 * 「場にいる」＝連載のレギュラーであることを表し、毎週の得点に直結するわけではない。
 */
export function rosterOf(data: GameData, state: RunState): CardInstance[] {
  return state.cards.filter((c) => c.zone === 'field' && !isDevelopment(data, c));
}

/**
 * 今週の話に出演するキャラ（ハイライト、最大6人。v6.0）。
 *
 * v5.9までは在籍キャラ全員が毎週得点していたため、キャラを増やすほど強いという構造になり、
 * 終盤はキャスト14人・ノルマの5〜10倍という状態だった。
 * 漫画としても「今週スポットが当たるのは数人」が自然なので、毎週の出演者を選ぶ形にした。
 * 得点も役の対象も、このハイライトだけが対象になる。
 */
export function castOf(data: GameData, state: RunState): CardInstance[] {
  const roster = rosterOf(data, state);
  const picked = roster.filter((c) => state.highlightIds.includes(c.instanceId));
  // 未選択（保存データや初期状態）のときは、人気度の高い順に自動で埋める
  if (picked.length === 0 && roster.length > 0) return defaultHighlight(data, roster);
  return picked;
}

/** ハイライト未指定のときの既定（人気度の高い順に上限まで） */
function defaultHighlight(data: GameData, roster: CardInstance[]): CardInstance[] {
  const popularityOf = (c: CardInstance) => {
    const def = data.definitions.get(c.definitionId);
    return def?.kind === 'character' ? def.popularity + c.permanentPopularityBonus : 0;
  };
  return [...roster].sort((a, b) => popularityOf(b) - popularityOf(a)).slice(0, HIGHLIGHT_LIMIT);
}

/** ハイライトの選択を切り替える（上限を超える場合は変更しない） */
export function toggleHighlight(data: GameData, state: RunState, instanceId: string): RunState {
  const roster = rosterOf(data, state);
  if (!roster.some((c) => c.instanceId === instanceId)) return state;
  const current = castOf(data, state).map((c) => c.instanceId);
  const removing = current.includes(instanceId);
  /*
   * v7.6c: 出演者を0人にはできない。
   * castOfは「ハイライトが空なら人気順で自動補充」する仕様なので、
   * 最後の1人を外すと highlightIds=[] になり、画面上は全員が黙って復活していた
   * （外したはずなのに3/6に戻る、という分かりにくい挙動）。
   * ここで拒否して、呼び出し側が理由を出せるように state をそのまま返す
   */
  if (removing && current.length <= 1) return state;
  const next = removing
    ? current.filter((id) => id !== instanceId)
    : current.length >= HIGHLIGHT_LIMIT
      ? current
      : [...current, instanceId];
  return { ...state, highlightIds: next };
}

/** 対象キャラを今週のキャストに加える効果（復活・デビュー・再登場） */
export const JOIN_EFFECTS: readonly string[] = ['reviveSelect', 'debutSelect', 'returnSelect'];

/**
 * この選択によって「今週からキャストに加わる」キャラのinstanceId（v5.7）。
 * 「復活」の対象（死亡済み）と「新キャラ登場」「運命的な出会い」の対象（控え）が該当する。
 * 採点側（scoring.ts）はすでにこの2種を今週のキャストに数えているので、
 * 対象指定の可否も揃える。復活させたその週に強化カードを重ねられないのは、
 * 劇的な立て直しを狙うほど手が縛られて不便だった（プレイ後の指摘）。
 */
export function joiningCastIds(data: GameData, state: RunState, selection: PlaySelection): string[] {
  const byId = new Map(state.cards.map((c) => [c.instanceId, c]));
  const ids: string[] = [];
  for (const id of selection.cards) {
    const instance = byId.get(id);
    const def = instance ? data.definitions.get(instance.definitionId) : undefined;
    if (def?.kind !== 'development') continue;
    if (!def.effects.some((e) => JOIN_EFFECTS.includes(e.effect.type))) continue;
    const targetId = selection.targets[id];
    if (targetId && byId.has(targetId)) ids.push(targetId);
  }
  return ids;
}

/**
 * 週開始時の手札抽選（4.2節、v5.2: 展開カードのみ）。
 * - ネームストック（前週の持ち越し）と編集会議で仕入れたカードは必ず手札に入る（v5.2c）
 * - 残り枠を抽選プールの展開カードから引く。7枚（ボス週「合併号」は5枚）
 * - 対象が規定枚数未満なら全カードを手札にする
 */
export function startWeek(data: GameData, state: RunState): RunState {
  // 前週の手札を抽選対象へ戻し、再登場フラグをリセットする（キャラのzoneには触れない）
  const cards = state.cards.map((c) => {
    const next = c.returnedThisWeek ? { ...c, returnedThisWeek: false } : c;
    return next.zone === 'hand' || next.zone === 'selected' ? { ...next, zone: 'activeDeck' as const } : next;
  });
  const pool = cards.filter((c) => c.zone === 'activeDeck' && isDevelopment(data, c));
  const poolIds = new Set(pool.map((c) => c.instanceId));

  // ボス週「合併号」は手札が2枚少ない（10節）
  const handSize = data.quotas.get(state.week)?.boss === '合併号' ? HAND_SIZE - 2 : HAND_SIZE;

  // 確定枠: 仕入れたカード → ストックの順（重複と紛失を除く）
  const forced: string[] = [];
  for (const id of [...state.guaranteedNextHand, ...state.stockedIds]) {
    if (poolIds.has(id) && !forced.includes(id) && forced.length < handSize) forced.push(id);
  }

  const rest = pool.filter((c) => !forced.includes(c.instanceId));
  const remaining = handSize - forced.length;
  let handIds: string[];
  if (rest.length <= remaining) {
    handIds = [...forced, ...rest.map((c) => c.instanceId)];
  } else {
    const rng = drawRng(state.runSeed, state.week, 0);
    if (actOfWeek(state.week) === 'kyu') {
      // 第3部だけ、専用役の素材が手札に来やすいよう重みをつけて引く（v7.4b）。
      // 終盤はデッキが70枚を超えるので、均等に引くと2枚組の役が実測1.8〜5.5%しか揃わなかった。
      // 第2部までは従来どおりの均等シャッフルのままにして、影響範囲を第3部に閉じ込める
      const weighted = rest.map((c) => ({
        item: c.instanceId,
        weight: ACT3_COMBO_MATERIALS.has(c.definitionId) ? ACT3_DRAW_WEIGHT : 1,
      }));
      handIds = [...forced, ...weightedSample(weighted, remaining, rng)];
    } else {
      handIds = [...forced, ...shuffled(rest, rng).slice(0, remaining).map((c) => c.instanceId)];
    }
  }

  // 夢オチ: 次週開始時に全種類の鮮度が下がる（6.1節 nextWeekStart）
  let freshnessByDef = state.freshnessByDef;
  if (state.pendingFreshnessPenalty > 0) {
    freshnessByDef = { ...freshnessByDef };
    for (const c of cards) {
      const def = data.definitions.get(c.definitionId);
      if (def?.kind !== 'development') continue;
      const current = freshnessByDef[def.id] ?? 1;
      freshnessByDef[def.id] = Math.max(0.25, current - state.pendingFreshnessPenalty);
    }
  }

  // ハイライトは先週の顔ぶれを引き継ぐ（v6.0）。
  // 在籍が6人以下のうちは全員が自動でハイライトされる（v6.2）。デビューのたびに選び直す必要はない。
  // 7人目が加わって初めて「選ぶ」対象になり、以降は退場した人だけ落として持ち越す
  const roster = cards.filter((c) => c.zone === 'field' && !isDevelopment(data, c));
  const onField = new Set(roster.map((c) => c.instanceId));
  const kept = state.highlightIds.filter((id) => onField.has(id));
  const highlightIds =
    roster.length <= HIGHLIGHT_LIMIT
      ? roster.map((c) => c.instanceId)
      : kept.length > 0
        ? kept
        : defaultHighlight(data, roster).map((c) => c.instanceId);

  const handSet = new Set(handIds);
  return {
    ...state,
    cards: cards.map((c) => (handSet.has(c.instanceId) ? { ...c, zone: 'hand' as const } : c)),
    hand: handIds,
    redrawsUsed: 0,
    highlightIds,
    stockedIds: [],
    guaranteedNextHand: [],
    freshnessByDef,
    pendingFreshnessPenalty: 0,
    returnUsedThisWeek: false,
  };
}

/** 再登場可能なキャラ（離脱から2週以上経過、4.5節） */
export function returnableCharacters(data: GameData, state: RunState): CardInstance[] {
  // 最終回は待機期間を無視して全員戻せる（11節、v5.9）
  const isFinale = data.quotas.get(state.week)?.final ?? false;
  return state.cards.filter(
    (c) =>
      c.zone === 'waiting' &&
      data.definitions.get(c.definitionId)?.kind === 'character' &&
      (isFinale || state.week - (c.leftWeek ?? 0) >= 2),
  );
}

/**
 * 再登場（4.5節）。週1人まで、再登場待ちのキャラを場へ戻す。
 * 戻した週は returnedThisWeek を立て、役「宿命の再会」等の判定に使う。
 */
export function returnCharacter(data: GameData, state: RunState, instanceId: string): RunState {
  // 最終回は週1人の制限も外す（11節、v5.9）
  const isFinale = data.quotas.get(state.week)?.final ?? false;
  if (state.returnUsedThisWeek && !isFinale) throw new Error('再登場させられるのは週に1人までです');
  const target = returnableCharacters(data, state).find((c) => c.instanceId === instanceId);
  if (!target) throw new Error('そのキャラはまだ再登場できません');
  const cards = state.cards.map((c) =>
    c.instanceId === instanceId ? { ...c, zone: 'field' as const, returnedThisWeek: true, leftWeek: undefined } : c,
  );
  // v7.3: 戻したキャラを今週の出演者にも入れる。
  // ハイライトの自動補充はstartWeekでしか走らないため、週の途中で戻したキャラは
  // 在籍6人以下でも出演していない＝得点にも役にも絡まない、という状態になっていた。
  // 枠が埋まっているときだけ、これまでどおりプレイヤーが手動で入れ替える
  const next = { ...state, cards };
  const current = castOf(data, next).map((c) => c.instanceId);
  const highlightIds = current.includes(instanceId)
    ? current
    : current.length < HIGHLIGHT_LIMIT
      ? [...current, instanceId]
      : current;
  return { ...next, highlightIds, returnUsedThisWeek: true };
}

/** その週に使える描き直し回数（「速筆」を依頼していれば+1。v5.5） */
export function redrawLimit(state: RunState): number {
  return REDRAWS_PER_WEEK + (state.upgrades.includes('fast_draft') ? 1 : 0);
}

/**
 * ネーム描き直し（4.2節）。週2回まで（速筆で3回）。
 * 任意の枚数を抽選プールへ戻し、同数を引き直す。戻したカードを再び引く可能性がある。
 */
export function redraw(data: GameData, state: RunState, returnIds: string[]): RunState {
  const limit = redrawLimit(state);
  if (state.redrawsUsed >= limit) throw new Error(`描き直しは週${limit}回までです`);
  if (returnIds.length === 0) throw new Error('戻すカードを選んでください');
  const handSet = new Set(state.hand);
  for (const id of returnIds) {
    if (!handSet.has(id)) throw new Error(`手札にないカードは戻せません: ${id}`);
  }

  const returnSet = new Set(returnIds);
  const keptHand = state.hand.filter((id) => !returnSet.has(id));
  const pool = state.cards.filter(
    (c) => isDevelopment(data, c) && (c.zone === 'activeDeck' || returnSet.has(c.instanceId)),
  );

  const rng = redrawRng(state.runSeed, state.week, state.redrawsUsed);
  const drawn = shuffled(pool, rng).slice(0, returnIds.length);
  const newHand = [...keptHand, ...drawn.map((c) => c.instanceId)];

  const handSet2 = new Set(newHand);
  return {
    ...state,
    cards: state.cards.map((c) => {
      if (!isDevelopment(data, c)) return c;
      if (c.zone !== 'activeDeck' && c.zone !== 'hand') return c;
      return { ...c, zone: handSet2.has(c.instanceId) ? ('hand' as const) : ('activeDeck' as const) };
    }),
    hand: newHand,
    redrawsUsed: state.redrawsUsed + 1,
  };
}

/**
 * プレイ選択の妥当性検証（4.3〜4.4節、5.4節、v5.2改訂）。
 * 選べるのは手札の展開カード0〜4枚。対象は場のキャストから選ぶ。
 * zone競合はプレイ確定を禁止し、選択画面の時点で止める。
 */
export function validateSelection(data: GameData, state: RunState, selection: PlaySelection): SelectionValidity {
  const { cards: ids, targets } = selection;
  if (new Set(ids).size !== ids.length) return { ok: false, reason: '同じカードを複数回選べません' };
  const playLimit = data.quotas.get(state.week)?.final ? FINALE_MAX_PLAY_CARDS : MAX_PLAY_CARDS;
  if (ids.length > playLimit) return { ok: false, reason: `プレイできるのは${playLimit}枚までです` };

  const handSet = new Set(state.hand);
  const byId = new Map(state.cards.map((c) => [c.instanceId, c]));
  const cast = castOf(data, state);
  const castIds = new Set(cast.map((c) => c.instanceId));
  // 今週復活・デビューするキャラも「場のキャラ」として対象に取れる（v5.7）
  const joining = joiningCastIds(data, state, selection);
  const targetableIds = new Set([...castIds, ...joining]);

  const devs: { instance: CardInstance; def: DevelopmentCardDefinition }[] = [];
  for (const id of ids) {
    if (!handSet.has(id)) return { ok: false, reason: '手札にないカードが含まれています' };
    const instance = byId.get(id)!;
    const def = data.definitions.get(instance.definitionId)!;
    if (def.kind !== 'development') return { ok: false, reason: 'プレイできるのは展開カードのみです' };
    if (def.unlockWeek > state.week) return { ok: false, reason: `「${def.name}」は第${def.unlockWeek}話以降のみプレイできます` };
    devs.push({ instance, def });
  }

  // 伏線を張っていないのに伏線回収はできない（v5.2d）
  const kaishu = devs.find((d) => d.def.id === 'fukusen_kaishu');
  if (kaishu && state.foreshadowTokens <= 0) {
    return { ok: false, reason: 'まだ伏線を張っていません（「伏線」をプレイしてから回収する）' };
  }

  // 「閉ざされた舞台」の期間中は新キャラのデビューができない（v5.6）
  if (state.modifiers.some((m) => m.modifierId === 'closed_stage')) {
    const debut = devs.find((d) => d.def.effects.some((e) => e.effect.type === 'debutSelect'));
    if (debut) return { ok: false, reason: `「閉ざされた舞台」の期間中は「${debut.def.name}」を使えません` };
  }

  // soloOnly: 単独プレイのみ（総集編・宴会）。
  // v5.8c: ボス週・最終回の禁止は「ノルマ判定を免除する」カード（総集編）だけに限る。
  // soloOnly 全体に掛けていたため、宴会までボス週で使えなくなっていた
  const solo = devs.find((d) => d.def.soloOnly);
  if (solo) {
    if (ids.length !== 1) return { ok: false, reason: `「${solo.def.name}」は単独でのみプレイできます` };
    const bypassesQuota = solo.def.effects.some((e) => e.effect.type === 'bypassQuota');
    const quotaEntry = data.quotas.get(state.week);
    // 最終回は総集編も宴会も描けない（11節）。ボス週で禁止するのはノルマ判定を免除するものだけ
    if (quotaEntry?.final) {
      return { ok: false, reason: `「${solo.def.name}」は最終回では使用できません` };
    }
    if (bypassesQuota && quotaEntry?.boss) {
      return { ok: false, reason: `「${solo.def.name}」はボス週では使用できません` };
    }
    return { ok: true };
  }

  // 対象割当の検証（5.2節。onePlayed=場のキャスト、oneDead=死亡済み、oneBench=控え、oneEnemy=場の敵キャラ）
  for (const { instance, def } of devs) {
    const targetId = targets[instance.instanceId];
    if (def.target === 'onePlayed') {
      if (!targetId) return { ok: false, reason: `「${def.name}」の対象キャラを選んでください` };
      if (!targetableIds.has(targetId)) return { ok: false, reason: `「${def.name}」の対象は場のキャラのみです` };
    } else if (def.target === 'oneEnemy') {
      if (!targetId) return { ok: false, reason: `「${def.name}」の対象となる敵キャラを選んでください` };
      const target = byId.get(targetId);
      if (!target || !targetableIds.has(targetId) || target.faction !== 'enemy') {
        return { ok: false, reason: `「${def.name}」の対象は場の敵キャラのみです` };
      }
    } else if (def.target === 'oneDead') {
      if (!targetId) return { ok: false, reason: `「${def.name}」の対象となる死亡済みキャラを選んでください` };
      const target = byId.get(targetId);
      if (!target || target.zone !== 'dead') return { ok: false, reason: `「${def.name}」の対象は死亡済みキャラのみです` };
    } else if (def.target === 'oneBench') {
      if (!targetId) return { ok: false, reason: `「${def.name}」でデビューさせる控えキャラを選んでください` };
      const target = byId.get(targetId);
      if (!target || target.zone !== 'bench') return { ok: false, reason: `「${def.name}」の対象は控えキャラのみです` };
    } else if (def.target === 'oneWaiting') {
      if (!targetId) return { ok: false, reason: `「${def.name}」で呼び戻す再登場待ちのキャラを選んでください` };
      const target = byId.get(targetId);
      if (!target || target.zone !== 'waiting') {
        return { ok: false, reason: `「${def.name}」の対象は再登場待ちのキャラのみです` };
      }
    } else if (def.target === 'oneBenchEnemy') {
      if (!targetId) return { ok: false, reason: `「${def.name}」でデビューさせる敵キャラを選んでください` };
      const target = byId.get(targetId);
      const targetDef = target ? data.definitions.get(target.definitionId) : undefined;
      const canBeEnemy = targetDef?.kind === 'character' && (targetDef.flexFaction || targetDef.faction === 'enemy');
      if (!target || target.zone !== 'bench' || !canBeEnemy) {
        return { ok: false, reason: `「${def.name}」の対象は控えの中で敵になれるキャラのみです` };
      }
    }
  }

  // 同じ控えキャラを2枚のデビュー展開の対象にはできない（v6.6c）。
  // 許してしまうと、どちらの陣営でデビューしたか（debutFaction）が処理順で不定になる
  const debutTargets = new Set<string>();
  for (const { instance, def } of devs) {
    if (!def.effects.some((e) => e.effect.type === 'debutSelect')) continue;
    const targetId = targets[instance.instanceId];
    if (!targetId) continue;
    if (debutTargets.has(targetId)) {
      return { ok: false, reason: '同じキャラを2枚のデビュー展開の対象にはできません' };
    }
    debutTargets.add(targetId);
  }

  // zone競合の禁止（4.4節）: 1キャラに死亡系と離脱を同時に割り当てられない
  const zoneChanges = new Map<string, Set<'dead' | 'waiting'>>();
  for (const { instance, def } of devs) {
    for (const { effect } of def.effects) {
      if (effect.type !== 'moveZoneAtEndWeek') continue;
      const affected =
        def.target === 'allPlayed'
          ? [...targetableIds].filter((id) => !effect.faction || byId.get(id)?.faction === effect.faction)
          : [targets[instance.instanceId]].filter((x): x is string => !!x);
      for (const charId of affected) {
        const set = zoneChanges.get(charId) ?? new Set();
        set.add(effect.zone);
        zoneChanges.set(charId, set);
      }
    }
  }
  for (const [charId, zones] of zoneChanges) {
    if (zones.size > 1) {
      const name = data.definitions.get(byId.get(charId)!.definitionId)?.name ?? charId;
      return { ok: false, reason: `「${name}」に死亡と途中離脱を同時に設定できません` };
    }
  }

  return { ok: true };
}

/** 確定前プレビュー（13.2節）。スコア計算と同じ純関数から生成する */
export function previewScore(data: GameData, state: RunState, selection: PlaySelection, endingId?: string | null): ScoreBreakdown {
  const timeskipWeek = state.log.find((w) => w.playedDefinitionIds.includes('timeskip'))?.week ?? null;
  return computeScore({
    data,
    cards: state.cards,
    week: state.week,
    selection,
    comboUsage: state.comboUsage,
    permanentBuzzByDef: state.permanentBuzzByDef,
    freshnessByDef: state.freshnessByDef,
    foreshadowTokens: state.foreshadowTokens,
    foreshadowWeeks: state.foreshadowWeeks,
    stress: state.stress,
    modifiers: state.modifiers,
    recentComboHistory: state.log.map((w) => w.comboIds),
    pastPlayedDefIds: state.log.flatMap((w) => w.playedDefinitionIds),
    timeskipWeek,
    setupComboCount: state.setupComboHistory.length,
    highlightIds: castOf(data, state).map((c) => c.instanceId),
    ...finaleScoreInput(data, state, endingId),
  });
}

/** 最終回の結末カードと完結ボーナスをスコア入力へ変換する（v5.9） */
function finaleScoreInput(data: GameData, state: RunState, endingId?: string | null) {
  if (!data.quotas.get(state.week)?.final) return {};
  const card = endingId ? endingById(endingId) : undefined;
  return {
    completionBonus: completionBonus(state),
    setupComboIds: state.setupComboHistory,
    finaleEnding: card
      ? {
          id: card.id,
          name: card.name,
          buzzAdd: endingBuzz(card, state),
          scoreMultiplier: card.scoreMultiplier,
          charMultiplier: card.charMultiplier,
          popularityAdd: endingPopularityAdd(card.id),
        }
      : undefined,
  };
}

export type CancelReason = 'boss' | 'warnings' | 'noCast';

export interface WeekResult {
  state: RunState;
  breakdown: ScoreBreakdown;
  outcome: 'continue' | 'cancelled';
  cancelReason?: CancelReason;
  /** この週に達成した編集部の要求（v5.2d） */
  achievedDemands: DemandState[];
  /** この週に期限切れになった要求（読者が離れ、警告+1） */
  failedDemands: DemandState[];
}

/**
 * 週の解決（6.2節の解決順、v5.2の警告制）。
 * - ノルマ達成: 警告を1つ回復（下限0）
 * - 未達: 警告+1。3つたまると打ち切り。ボス週の未達は即打ち切り
 * - 総集編（判定免除）: 警告は変動しない
 */
export function resolveWeek(
  data: GameData,
  state: RunState,
  selection: PlaySelection,
  stockIds: string[] = [],
  endingId?: string | null,
): WeekResult {
  // 1. 妥当性確認
  const validity = validateSelection(data, state, selection);
  if (!validity.ok) throw new Error(`不正なプレイです: ${validity.reason}`);

  // 2〜6. スナップショットに対するスコア計算（役判定を含む）
  const breakdown = previewScore(data, state, selection, endingId);

  // 7. endWeek段階の状態変化を適用
  const {
    cards: appliedCards,
    foreshadowGained,
    foreshadowConsumed,
    restoreFreshness,
    freshnessRestoreAmount,
    permanentBuzzByDef: buzzGained,
    startedModifiers,
    freshnessPenaltyNextWeek,
    stressAdded,
    stressReleased,
  } = applyStateChanges(state.cards, breakdown.stateChanges);

  // 役の発動回数制限を記録（5.5節）。制限の種類はレジストリ側の定義を参照する
  const comboUsage = {
    oncePerRun: [...state.comboUsage.oncePerRun],
    perCharacter: Object.fromEntries(Object.entries(state.comboUsage.perCharacter).map(([k, v]) => [k, [...v]])),
  };
  for (const combo of breakdown.combos) {
    if (combo.status !== 'applied') continue;
    const def = COMBO_REGISTRY.find((c) => c.id === combo.comboId);
    if (!def) continue;
    if (def.oncePerRun && !comboUsage.oncePerRun.includes(def.id)) comboUsage.oncePerRun.push(def.id);
    if (def.oncePerCharacter) {
      comboUsage.perCharacter[def.id] = [...new Set([...(comboUsage.perCharacter[def.id] ?? []), ...combo.boundCharIds])];
    }
  }

  // プレイ回数を記録。キャストは登場週数、展開はプレイ枚数として数える
  const playedSet = new Set(selection.cards);
  const zoneBefore = new Map(state.cards.map((c) => [c.instanceId, c.zone]));
  const cards = appliedCards.map((c) => {
    let next = c;
    const wasOnField = zoneBefore.get(c.instanceId) === 'field';
    if (playedSet.has(c.instanceId) || (wasOnField && data.definitions.get(c.definitionId)?.kind === 'character')) {
      next = { ...next, playCount: next.playCount + 1 };
    }
    // 途中離脱したキャラは離脱週を記録する（再登場可能判定に使う、4.5節）
    if (next.zone === 'waiting' && zoneBefore.get(c.instanceId) !== 'waiting') {
      next = { ...next, leftWeek: state.week };
    }
    return next;
  });

  // プレイした展開の定義ID（同じ種類を2枚出したら2回分数える）
  const playedDefinitionIds = selection.cards
    .map((id) => state.cards.find((c) => c.instanceId === id)!.definitionId)
    .filter((defId) => data.definitions.get(defId)?.kind === 'development');

  // 8. 鮮度の低下と回復（9節、v5.2d: 展開の種類ごと）
  // プレイした種類は枚数×25%下がり（下限25%）、出さなかった種類は25%回復する（上限100%）
  // トーナメント期間中は鮮度低下が2倍（5.2〜5.3節）
  // 開始した週から効かせる（v5.8c。採点側の期間効果と揃える）
  const tournamentActive =
    state.modifiers.some((m) => m.modifierId === 'tournament') ||
    startedModifiers.some((m) => m.modifierId === 'tournament');
  const baseDecay = tournamentActive ? 0.5 : 0.25;

  let freshnessByDef: Record<string, number> = {};
  if (restoreFreshness) {
    // 宴会: 全種類の鮮度を全回復（5.2節）
    freshnessByDef = {};
  } else {
    const knownDefs = new Set([...Object.keys(state.freshnessByDef), ...playedDefinitionIds]);
    for (const defId of knownDefs) {
      const current = state.freshnessByDef[defId] ?? 1;
      const playedCount = playedDefinitionIds.filter((id) => id === defId).length;
      // 王道バトル連載なので、バトルタグの展開は飽きられにくい（低下が半分。v5.5）
      const def = data.definitions.get(defId);
      const isBattle = def?.tags.includes('battle') ?? false;
      // 「バトル描写強化」を依頼したら、バトルタグは常に鮮度100%として扱う（v7.5）。
      // v7.4までは decay を0にするだけだったので、購入前にすでに下がっていたぶんが
      // 「下がりも戻りもしない」まま固定され、毎週バトルを出す限り永久に低いままだった
      // （原稿料5を払ったのに何も起きていないように見える、というプレイ中の指摘）
      if (isBattle && state.upgrades.includes('battle_art')) continue;
      const decay = isBattle ? baseDecay / 2 : baseDecay;
      // 骨休め: 出さなかった種類の回復に上乗せする（v5.8）
      const recovery = 0.25 + freshnessRestoreAmount;
      const next = playedCount > 0 ? Math.max(0.25, current - decay * playedCount) : Math.min(1, current + recovery);
      if (next < 1) freshnessByDef[defId] = next;
    }
  }

  // 9. 期間効果の残り週数を更新（5.3節）。再使用時は残り期間を更新し、延長加算はしない
  const modifiers: ActiveModifier[] = state.modifiers
    .map((m) => ({ ...m, remaining: m.remaining - 1 }))
    .filter((m) => m.remaining > 0);
  for (const started of startedModifiers) {
    const existing = modifiers.find((m) => m.modifierId === started.modifierId);
    if (existing) existing.remaining = started.duration - 1;
    else modifiers.push({ modifierId: started.modifierId, remaining: started.duration - 1 });
  }

  // 打ち切り判定（v5.2 警告制）
  const quotaEntry = data.quotas.get(state.week);
  let warnings = state.warnings;
  let outcome: 'continue' | 'cancelled' = 'continue';
  let cancelReason: CancelReason | undefined;
  if (breakdown.quotaBypassed) {
    // 総集編: 判定免除、警告は変動しない
  } else if (breakdown.cleared) {
    warnings = Math.max(0, warnings - 1);
  } else if (quotaEntry?.boss || quotaEntry?.final) {
    outcome = 'cancelled';
    cancelReason = 'boss';
  } else {
    warnings += 1;
    if (warnings >= MAX_WARNINGS) {
      outcome = 'cancelled';
      cancelReason = 'warnings';
    }
  }

  // 連載続行不能の検出（4.7節）: キャストが空で、デッキに復帰手段が存在しない場合は即打ち切り。
  // 手段（新キャラ登場+控え、または復活+死亡済み）が残っていれば、警告を消費しながら引きに行ける
  if (outcome === 'continue') {
    const isChar = (c: CardInstance) => data.definitions.get(c.definitionId)?.kind === 'character';
    const castEmpty = !cards.some((c) => c.zone === 'field' && isChar(c));
    if (castEmpty) {
      const devHasEffect = (...types: string[]) =>
        cards.some((c) => {
          const def = data.definitions.get(c.definitionId);
          return def?.kind === 'development' && def.effects.some((e) => types.includes(e.effect.type));
        });
      const hasIn = (zone: CardInstance['zone']) => cards.some((c) => c.zone === zone && isChar(c));
      const canDebut = hasIn('bench') && devHasEffect('debutSelect');
      // v5.8c: 「夢オチ」「全員生還」(reviveAllDead) と「一方そのころ」(returnSelect)、
      // および無料の再登場も復帰手段。ここを見落としていたため、
      // 全滅した週の終了時点で夢オチを持っていても打ち切りになっていた
      const canRevive = hasIn('dead') && devHasEffect('reviveSelect', 'reviveAllDead');
      // 再登場待ちがいれば、カードがなくても無料の再登場（2週後）で戻せる
      const canReturn = hasIn('waiting');
      if (!canDebut && !canRevive && !canReturn) {
        outcome = 'cancelled';
        cancelReason = 'noCast';
      }
    }
  }

  // 10. 原稿料（12節）
  const permanentBuzzByDef = { ...state.permanentBuzzByDef };
  for (const [defId, amount] of Object.entries(buzzGained)) {
    permanentBuzzByDef[defId] = (permanentBuzzByDef[defId] ?? 0) + amount;
  }

  // ネームストック: プレイしなかった手札のうち、指定された最大2枚を翌週へ持ち越す（v5.2c）
  const stockedIds = stockIds
    .filter((id) => state.hand.includes(id) && !playedSet.has(id))
    .slice(0, MAX_STOCK);

  // 連載年表用に、この週のキャラの出入り・陣営の変化を拾う（v6.8）。
  // 適用前後の zone/faction を比べるのではなく stateChanges を読むことで、
  // 「同じ週に敵化してから死亡した」ようなケースも順番どおりに残せる
  const nameOf = (instanceId: string) => {
    const inst = state.cards.find((c) => c.instanceId === instanceId);
    return inst ? (data.definitions.get(inst.definitionId)?.name ?? null) : null;
  };
  const events: WeekEvent[] = [];
  for (const change of breakdown.stateChanges) {
    if (change.type === 'moveZone') {
      const name = nameOf(change.instanceId);
      if (!name) continue;
      const before = state.cards.find((c) => c.instanceId === change.instanceId)?.zone;
      if (change.to === 'dead') events.push({ kind: 'death', name });
      else if (change.to === 'waiting') events.push({ kind: 'leave', name });
      // 場へ戻る動きは、控えからならデビュー、それ以外（死亡済み・再登場待ち）なら復帰
      else if (change.to === 'field') events.push({ kind: before === 'bench' ? 'debut' : 'return', name });
    } else if (change.type === 'flipFaction') {
      const name = nameOf(change.instanceId);
      const before = state.cards.find((c) => c.instanceId === change.instanceId)?.faction;
      // デビュー時の陣営確定は「変化」ではないので、実際に陣営が変わったときだけ記録する
      if (name && before && before !== change.to) {
        events.push({ kind: change.to === 'enemy' ? 'toEnemy' : 'toAlly', name });
      }
    }
  }

  const log: WeekLogEntry[] = [
    ...state.log,
    {
      week: state.week,
      playedInstanceIds: selection.cards.slice(),
      playedDefinitionIds,
      comboIds: breakdown.combos.filter((c) => c.status === 'applied').map((c) => c.comboId),
      score: breakdown.finalScore,
      quota: breakdown.quota,
      cleared: breakdown.cleared,
      warningsAfter: warnings,
      events,
    },
  ];

  // 編集部の要求（v5.2d）: 達成なら原稿料ボーナス、期限切れなら読者が離れて警告+1
  const demandUpdate = updateDemands(state, { log, cards, data }, state.week);
  let demandWarnings = warnings;
  for (const _failed of demandUpdate.failed) {
    void _failed;
    demandWarnings += 1;
  }
  if (outcome === 'continue' && demandWarnings >= MAX_WARNINGS) {
    outcome = 'cancelled';
    cancelReason = 'warnings';
  }
  const demandFee = demandUpdate.achieved.length * DEMAND_REWARD_FEE + demandUpdate.earlyBonusFee;
  if (demandUpdate.failed.length > 0) log[log.length - 1]!.warningsAfter = demandWarnings;

  // 仕込み役の成立履歴（完結ボーナスと連載メモに使う、11節）
  const setupComboHistory = [
    ...new Set([
      ...state.setupComboHistory,
      ...breakdown.combos.filter((c) => c.status === 'applied' && SETUP_COMBO_IDS.has(c.comboId)).map((c) => c.comboId),
    ]),
  ];

  // 「両想い」の相手を残す（v7.3）。恋愛フラグは成立時に消費されるので、
  // ここで記録しておかないと最終回に「相手が生きているか」を確かめられない
  const romanceIds = [
    ...new Set([
      ...(state.romanceIds ?? []),
      ...breakdown.combos
        .filter((c) => c.status === 'applied' && c.comboId === 'ryouomoi')
        .flatMap((c) => c.boundCharIds),
    ]),
  ];

  // 伏線: 回収した週はリセットし、今週張ったぶんを積む（寝かせた週数のボーナスに使う、v5.3）
  const keptForeshadowWeeks = foreshadowConsumed ? [] : state.foreshadowWeeks;
  const foreshadowWeeks = [...keptForeshadowWeeks, ...Array<number>(foreshadowGained).fill(state.week)];

  const nextState: RunState = {
    ...state,
    cards,
    hand: [],
    foreshadowTokens: foreshadowConsumed ? foreshadowGained : state.foreshadowTokens + foreshadowGained,
    foreshadowWeeks,
    stress: stressReleased ? stressAdded : state.stress + stressAdded,
    funds: state.funds + breakdown.fee + demandFee,
    warnings: demandWarnings,
    freshnessByDef,
    modifiers,
    pendingFreshnessPenalty: freshnessPenaltyNextWeek,
    setupComboHistory,
    romanceIds,
    stockedIds,
    comboUsage,
    permanentBuzzByDef,
    demands: demandUpdate.demands,
    week: state.week + 1,
    log,
  };

  return {
    state: nextState,
    breakdown,
    outcome,
    cancelReason,
    achievedDemands: demandUpdate.achieved,
    failedDemands: demandUpdate.failed,
  };
}
