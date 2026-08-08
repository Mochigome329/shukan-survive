/**
 * スコア計算（設計書 6.3〜6.4節）。UI非依存の純関数。
 * 数値だけでなくScoreBreakdown（明細）を返し、確定前プレビューも同じ関数を使う（13.2節）。
 * 役判定は第1層・スコア計算前のみ（M2）。第2〜3層はM3で追加する。
 */
import {
  comboBuzzOf,
  evaluateCombos,
  evaluatePostScoreCombos,
  toComboDetail,
  type CastCharacter,
  type ComboMatchInput,
  type PlayedDevelopment,
} from './combos';
import type {
  ActiveModifier,
  CardInstance,
  CharacterScoreDetail,
  ComboScoreDetail,
  ComboUsageState,
  DevelopmentBuzzDetail,
  Faction,
  PlaySelection,
  ScoreBreakdown,
  StateChange,
} from './types';
import {
  FRESHNESS_MIN,
  STRESS_POPULARITY_PENALTY,
  STRESS_RELEASE_BUZZ,
  TRAINING_BONUS_PER_FLAG,
  TRAINING_FLAG_MAX,
} from './types';
import { HIGHLIGHT_LIMIT, OFF_STAGE_POPULARITY_RATE, PROTAGONIST_ID } from './types';
import type { GameData } from './validate';

export interface ScoreInput {
  data: GameData;
  /** ラン中の全カード実体（キャストと展開の検索に使う） */
  cards: readonly CardInstance[];
  week: number;
  selection: PlaySelection;
  /** 役の発動回数制限（5.5節）。省略時は制限なし扱い */
  comboUsage?: ComboUsageState;
  /** 定義ID単位の話題性恒久補正（必殺技初披露） */
  permanentBuzzByDef?: Record<string, number>;
  /** 定義ID単位の鮮度（v5.2d）。未登録は1.0 */
  freshnessByDef?: Record<string, number>;
  /** 所持している伏線トークン（役「伏線回収」の効果量） */
  foreshadowTokens?: number;
  /** 伏線を張った話数（寝かせた週数のボーナス、v5.3） */
  foreshadowWeeks?: readonly number[];
  /** 現在の緊張（v5.3） */
  stress?: number;
  /** これまでにプレイした展開の定義ID（過去参照の役、v5.3） */
  pastPlayedDefIds?: readonly string[];
  /** 進行中の期間効果（5.3節、M3） */
  modifiers?: readonly ActiveModifier[];
  /** 直近の週ログ（連続週役の判定、M3） */
  recentComboHistory?: readonly string[][];
  /** タイムスキップを使った話数（時を越えた再会、M3） */
  timeskipWeek?: number | null;
  /** 最終回で選んだ結末カードの効果（v5.9）。通常週は未指定 */
  finaleEnding?: {
    id: string;
    name: string;
    buzzAdd: number;
    scoreMultiplier: number;
    charMultiplier: number;
    popularityAdd: number;
  };
  /** 完結ボーナス倍率（v5.9）。最終回のみ1以外になる */
  completionBonus?: number;
  /** 通算で成立させた仕込み役の種類数（v5.9） */
  setupComboCount?: number;
  /** 完結ボーナスの元になった仕込み役IDの一覧（v6.3、リザルト演出用） */
  setupComboIds?: readonly string[];
  /** 今週ハイライトしたキャラ（v6.0）。未指定なら人気度上位から自動で埋める */
  highlightIds?: readonly string[];
}

/** 期間効果の効果量（5.2〜5.3節） */
const MODIFIER_BUZZ: Record<string, number> = { tournament: 2 };

/**
 * v5.2: キャラは場に常駐し、毎週の基礎点はキャスト全員の人気度合計。
 * selection.cardsは展開カードのみ。復活の対象キャラはこの週からキャストに加わる（4.6節）。
 */
function resolvePlayed(input: ScoreInput): { characters: CastCharacter[]; developments: PlayedDevelopment[] } {
  const byId = new Map(input.cards.map((c) => [c.instanceId, c]));
  const developments: PlayedDevelopment[] = [];
  for (const id of input.selection.cards) {
    const instance = byId.get(id);
    if (!instance) throw new Error(`プレイ対象の実体が見つかりません: ${id}`);
    const def = input.data.definitions.get(instance.definitionId);
    if (!def) throw new Error(`カード定義が見つかりません: ${instance.definitionId}`);
    if (def.kind !== 'development') throw new Error(`キャラカードはプレイ対象にできません: ${id}`);
    developments.push({ instance, def, targetId: input.selection.targets[id] });
  }

  // v6.0: 得点するのは在籍キャラ全員ではなく、今週ハイライトした最大6人だけ
  const roster: CastCharacter[] = [];
  for (const instance of input.cards) {
    if (instance.zone !== 'field') continue;
    const def = input.data.definitions.get(instance.definitionId);
    if (def?.kind === 'character') roster.push({ instance, def });
  }
  const highlightIds = input.highlightIds;
  const picked = highlightIds ? roster.filter((c) => highlightIds.includes(c.instance.instanceId)) : [];
  const characters: CastCharacter[] =
    picked.length > 0
      ? picked
      : // 未指定なら人気度の高い順に上限まで（run.ts の既定と揃える）
        [...roster]
          .sort(
            (a, b) =>
              b.def.popularity + b.instance.permanentPopularityBonus - (a.def.popularity + a.instance.permanentPopularityBonus),
          )
          .slice(0, HIGHLIGHT_LIMIT);
  const addToCast = (instanceId: string, factionOverride?: Faction) => {
    const instance = byId.get(instanceId);
    const def = instance ? input.data.definitions.get(instance.definitionId) : undefined;
    if (instance && def?.kind === 'character' && !characters.some((c) => c.instance.instanceId === instanceId)) {
      // デビュー時に陣営を選んだ場合、今週の役判定・採点にも即座に反映する（v6.2）
      const withChoice = factionOverride ? { ...instance, faction: factionOverride } : instance;
      characters.push({ instance: withChoice, def });
    }
  };

  // 復活(reviveSelect)・デビュー(debutSelect)・再登場(returnSelect)の対象キャラは今週からキャストに数える。
  // v6.2: returnSelect（一方そのころ）が漏れていたため追加（呼び戻したのに今週は無得点になっていた）
  for (const dev of developments) {
    const joins = dev.def.effects.some(
      (e) => e.effect.type === 'reviveSelect' || e.effect.type === 'debutSelect' || e.effect.type === 'returnSelect',
    );
    if (joins && dev.targetId) {
      const debutEffect = dev.def.effects.find((e) => e.effect.type === 'debutSelect')?.effect;
      const targetDef = input.data.definitions.get(byId.get(dev.targetId)?.definitionId ?? '');
      const flex = debutEffect && targetDef?.kind === 'character' && targetDef.flexFaction;
      // 陣営が強制指定されたデビュー（悪役会議など）は、選択を待たず今週の採点にも即座に反映する（v6.3）
      const forced = debutEffect?.type === 'debutSelect' ? debutEffect.faction : undefined;
      addToCast(dev.targetId, forced ?? (flex ? input.selection.factionChoices?.[dev.instance.instanceId] : undefined));
    }
    // 夢オチ(reviveAllDead)も同様に、戻ってきた全員を今週のキャストに数える（v5.7）。
    // 数えないと「全滅を立て直す最終手段」なのにキャスト0人で採点され、ほぼ0点になっていた。
    if (dev.def.effects.some((e) => e.effect.type === 'reviveAllDead')) {
      for (const instance of input.cards) {
        if (instance.zone === 'dead') addToCast(instance.instanceId);
      }
    }
  }
  return { characters, developments };
}

/** 原稿料 = 基本3 + ノルマ超過50%ごとに+1（上限+2）（12節） */
export function calcFee(finalScore: number, quota: number): number {
  const ratio = finalScore / quota;
  return 3 + Math.min(2, Math.max(0, Math.floor((ratio - 1) / 0.5)));
}

/**
 * 対象をデビュー時の陣営へ戻すstateChangeを組み立てる（v6.6）。
 * 復活・夢オチ・「おかえり」の3箇所で共有する。デビュー時の陣営が不明、
 * またはすでにその陣営なら何も返さない
 */
function restoreDebutFactionChanges(input: ScoreInput, targetId: string): StateChange[] {
  const target = input.cards.find((c) => c.instanceId === targetId);
  return target?.debutFaction && target.debutFaction !== target.faction
    ? [{ type: 'flipFaction', instanceId: targetId, to: target.debutFaction }]
    : [];
}

/**
 * 週スコアを計算する（6.3節の計算順）。
 * 状態は変更せず、適用すべき状態変化はstateChangesとして返す（14.5節）。
 */
export function computeScore(input: ScoreInput): ScoreBreakdown {
  const { data, week } = input;
  const comboUsage = input.comboUsage ?? { oncePerRun: [], perCharacter: {} };
  const permanentBuzzByDef = input.permanentBuzzByDef ?? {};
  const { characters, developments } = resolvePlayed(input);
  const quotaEntry = data.quotas.get(week);
  if (!quotaEntry) throw new Error(`第${week}話のノルマが定義されていません`);

  const stateChanges: StateChange[] = [];

  // v5.8b: 「宴会」（旧・温泉回）の役全無効は廃止した。
  // 単独プレイ限定という機会費用があるので、そのうえ役まで消すと使う意味がなくなる、という指摘による。
  const combosDisabled = false;

  // 役判定（第1〜2層・スコア計算前）。スナップショットに対して行う（6.2節）
  const foreshadowTokens = input.foreshadowTokens ?? 0;
  const deadCharacters: CastCharacter[] = [];
  for (const instance of input.cards) {
    if (instance.zone !== 'dead') continue;
    const def = data.definitions.get(instance.definitionId);
    if (def?.kind === 'character') deadCharacters.push({ instance, def });
  }
  const recentComboHistory = input.recentComboHistory ?? [];

  // 緊張の付与と解放（v5.3のカタルシス）。解放は付与より先に判定し、同週の自演を防ぐ
  const currentStress = input.stress ?? 0;
  const releasesStress = developments.some((d) => d.def.effects.some((e) => e.effect.type === 'releaseStress'));
  const stressAdded = developments.reduce(
    (sum, d) => sum + d.def.effects.reduce((s, e) => s + (e.effect.type === 'addStress' ? e.effect.amount : 0), 0),
    0,
  );
  const stressReleased = releasesStress ? currentStress : 0;
  // 解放しなかった場合は、今週の付与分も含めて人気度が下がる
  const effectiveStress = releasesStress ? 0 : currentStress + stressAdded;

  const comboInput: ComboMatchInput = {
    week,
    characters,
    developments,
    foreshadowTokens,
    foreshadowWeeks: input.foreshadowWeeks ?? [],
    deadCharacters,
    previousComboIds: recentComboHistory[recentComboHistory.length - 1] ?? [],
    recentComboHistory,
    timeskipWeek: input.timeskipWeek ?? null,
    pastPlayedDefIds: input.pastPlayedDefIds ?? [],
    stressReleased,
    layer1ComboIds: [],
    weekScore: 0,
    quota: quotaEntry.quota,
    isFinale: quotaEntry.final ?? false,
    setupComboCount: input.setupComboCount ?? 0,
  };
  const evaluation = combosDisabled
    ? { applied: [], suppressed: [], notApplied: [], weekMultiplier: 1 }
    : evaluateCombos(comboInput, comboUsage);
  const combos: ComboScoreDetail[] = [
    ...evaluation.applied.map((e) => toComboDetail(e, 'applied', comboInput)),
    ...evaluation.suppressed.map((e) => toComboDetail(e, 'suppressed', comboInput)),
    ...evaluation.notApplied.map((e) => toComboDetail(e, 'notApplied', comboInput)),
  ];

  // 1〜3. 基礎人気度 + 恒久/一時補正（修行フラグ消費） → キャラ単位の乗算役
  const charMultipliers = new Map<string, number>();
  for (const entry of evaluation.applied) {
    const mult = entry.def.charMultiplier;
    if (!mult) continue;
    for (const charId of entry.match.boundCharIds) {
      charMultipliers.set(charId, (charMultipliers.get(charId) ?? 1) * mult);
    }
  }

  // 共闘: その週だけキャスト全員の人気度を底上げする（恒久補正とは別枠、v5.8b）
  const temporaryPopularity = developments.reduce(
    (sum, d) => sum + d.def.effects.reduce((s, e) => s + (e.effect.type === 'temporaryPopularityAll' ? e.effect.amount : 0), 0),
    0,
  );

  const characterDetails: CharacterScoreDetail[] = characters.map(({ instance, def }) => {
    const base = def.popularity;
    const permanent = instance.permanentPopularityBonus;
    const trainingBonus = instance.flags.training * TRAINING_BONUS_PER_FLAG;
    if (instance.flags.training > 0) {
      stateChanges.push({ type: 'consumeTrainingFlags', instanceId: instance.instanceId, count: instance.flags.training });
    }
    // 結末カードの効果はキャラ単位の乗算役に上乗せする（v5.9）
    const ending = input.finaleEnding;
    const multiplier = (charMultipliers.get(instance.instanceId) ?? 1) * (ending?.charMultiplier ?? 1);
    const temporary = temporaryPopularity + (ending?.popularityAdd ?? 0);
    return {
      instanceId: instance.instanceId,
      name: def.name,
      basePopularity: base,
      permanentBonus: permanent,
      temporaryBonus: temporary,
      trainingBonus,
      multiplier,
      total: (base + permanent + temporary + trainingBonus) * multiplier,
    };
  });

  // 4〜5. 全キャラ合計 + 人気度への加算役（王道・ライバル対決）− 緊張による一時低下
  const comboPopularityAdd = evaluation.applied.reduce((sum, e) => sum + e.def.popularityAdd, 0);
  // 出演していない在籍キャラも、連載に居続けている分だけ半分の人気度で効く（v6.1）。
  // 修行フラグは消費せず、キャラ乗算役や役の条件にも関わらない
  const onStage = new Set(characters.map((c) => c.instance.instanceId));
  const offStagePopularity = input.cards.reduce((sum, instance) => {
    if (instance.zone !== 'field' || onStage.has(instance.instanceId)) return sum;
    const def = data.definitions.get(instance.definitionId);
    if (def?.kind !== 'character') return sum;
    return sum + Math.floor((def.popularity + instance.permanentPopularityBonus) * OFF_STAGE_POPULARITY_RATE);
  }, 0);
  const rawPopularity =
    characterDetails.reduce((sum, c) => sum + c.total, 0) + comboPopularityAdd + offStagePopularity;
  const stressPenalty =
    effectiveStress > 0 ? -Math.min(rawPopularity - 1, effectiveStress * STRESS_POPULARITY_PENALTY) : 0;
  const popularityTotal = Math.max(1, rawPopularity + stressPenalty);

  // 7. 各展開カードの話題性 = 基礎話題性 × 鮮度 + ジャンル一致補正 + 恒久補正（6.4節・8節。期間補正はM3以降）
  const freshnessByDef = input.freshnessByDef ?? {};
  const modifiers = input.modifiers ?? [];
  // v5.8: ジャンルタグが無くなったので、期間効果はどれも「すべての展開の話題性+1」に揃えた
  const untargetedBonusIds = ['flashback', 'deep_thought', 'closed_stage', 'quest'];
  // v5.8c: 今週プレイしたカードが開始する期間効果も、その週から効かせる。
  // 以前は採点後に付与していたため「2週間」と書いてあるカードが実質1週しか効いていなかった
  const startedThisWeek = new Set(
    developments.flatMap(({ def }) =>
      def.effects.filter((e) => e.effect.type === 'startTimedModifier').map((e) => (e.effect as { modifierId: string }).modifierId),
    ),
  );
  const activeModifierIds = new Set([...modifiers.map((m) => m.modifierId), ...startedThisWeek]);
  const developmentDetails: DevelopmentBuzzDetail[] = developments.map(({ instance, def }) => {
    const baseBuzz = def.buzz;
    const permanentBonus = permanentBuzzByDef[def.id] ?? 0;
    // 期間効果: 回想・熟考・閉ざされた舞台・キーアイテム探し＝全展開+1（5.2節、v5.5〜v5.8）
    const modifierBonus = untargetedBonusIds.filter((id) => activeModifierIds.has(id)).length;
    // 採点の入口でも範囲を守る（v5.8c。状態側の更新は下限0.25/上限1だが、二重の防御）
    const freshness = Math.min(1, Math.max(FRESHNESS_MIN, freshnessByDef[def.id] ?? 1));
    const effective = baseBuzz * freshness + permanentBonus + modifierBonus;
    return {
      instanceId: instance.instanceId,
      name: def.name,
      baseBuzz,
      freshness,
      permanentBonus,
      effective,
    };
  });

  // 8. 役と期間効果による話題性加算（鮮度を掛けない別枠）
  const buzzTotal = developmentDetails.reduce((sum, d) => sum + d.effective, 0);
  const comboBuzzTotal = evaluation.applied.reduce((sum, e) => sum + comboBuzzOf(e.def, comboInput), 0);
  // 解放したぶんの話題性（カタルシス、v5.3）
  const releaseBuzz = stressReleased * STRESS_RELEASE_BUZZ;
  // 弔い合戦: 死亡済み1人につき加算（v5.8b）
  const perDeadBuzz = developments.reduce(
    (sum, d) =>
      sum +
      d.def.effects.reduce((s, e) => s + (e.effect.type === 'buzzPerDead' ? e.effect.amount * deadCharacters.length : 0), 0),
    0,
  );
  const modifierBuzzTotal =
    [...activeModifierIds].reduce((sum, id) => sum + (MODIFIER_BUZZ[id] ?? 0), 0) + releaseBuzz + perDeadBuzz;
  // ボス週「人気投票」（10節）: 話題性部分は固定1。加算役・展開の話題性は発動表示のみで得点に反映しない。
  // 人気度加算役・キャラ乗算役・週スコア乗算役はそのまま有効
  const isPopularityVote = quotaEntry.boss === '人気投票';
  const endingBuzzAdd = input.finaleEnding?.buzzAdd ?? 0;
  const buzzApplied = isPopularityVote
    ? 1
    : Math.max(1, buzzTotal + comboBuzzTotal + modifierBuzzTotal + endingBuzzAdd);

  // 9〜11. 人気度合計×話題性合計 → 週スコア乗算（最高倍率1つのみ、7.6節） → 切り捨て
  // 最終回は、結末カードの倍率と完結ボーナスをさらに掛ける（役の上限規則とは別枠、11節）
  const weekMultiplier = evaluation.weekMultiplier;
  const endingMultiplier = input.finaleEnding?.scoreMultiplier ?? 1;
  const completion = input.completionBonus ?? 1;
  const finalScore = Math.floor(popularityTotal * buzzApplied * weekMultiplier * endingMultiplier * completion);

  // 第3層: スコア計算後の役（神回など、7.1節）
  const postCombos = combosDisabled
    ? []
    : evaluatePostScoreCombos({ ...comboInput, weekScore: finalScore }, comboUsage);
  for (const entry of postCombos) {
    combos.push(toComboDetail(entry, 'applied', comboInput));
  }

  // カード効果を状態変化リストへ（6.1節の発動段階に従い、適用はresolveWeekが行う）
  let quotaBypassed = false;
  for (const { instance, def, targetId } of developments) {
    for (const { effect } of def.effects) {
      switch (effect.type) {
        case 'gainToken':
          stateChanges.push({ type: 'gainForeshadowToken', amount: effect.amount });
          break;
        case 'bypassQuota':
          quotaBypassed = true;
          break;
        case 'grantTrainingFlag':
          if (targetId) stateChanges.push({ type: 'grantTrainingFlag', instanceId: targetId, amount: effect.amount });
          break;
        case 'grantLoveFlag':
          if (targetId) stateChanges.push({ type: 'grantLoveFlag', instanceId: targetId });
          break;
        case 'flipFactionAtEndWeek': {
          // 洗脳・裏切りは一時的な対立に近く、主人公が対象でも従来どおり陣営が反転する（v6.2b）
          if (targetId) {
            const target = input.cards.find((c) => c.instanceId === targetId);
            if (target?.faction) {
              stateChanges.push({ type: 'flipFaction', instanceId: targetId, to: target.faction === 'ally' ? 'enemy' : 'ally' });
            }
          }
          break;
        }
        case 'setFactionAtEndWeek': {
          if (targetId) {
            const target = input.cards.find((c) => c.instanceId === targetId);
            // 闇堕ちだけは例外: 主人公が対象でも敵陣営にはならない（v6.2）。
            // ダークヒーロー化しても物語上は主人公のままで、誰にとっての敵かが曖昧になるため
            if (!(target?.definitionId === PROTAGONIST_ID && effect.faction === 'enemy')) {
              stateChanges.push({ type: 'flipFaction', instanceId: targetId, to: effect.faction });
            }
          }
          break;
        }
        case 'moveZoneAtEndWeek': {
          if (def.target === 'allPlayed') {
            // faction 指定があればその陣営だけ（全滅は仲間だけが倒れる。v5.8b）
            for (const ch of characters) {
              if (effect.faction && ch.instance.faction !== effect.faction) continue;
              stateChanges.push({ type: 'moveZone', instanceId: ch.instance.instanceId, to: effect.zone });
            }
          } else if (targetId) {
            stateChanges.push({ type: 'moveZone', instanceId: targetId, to: effect.zone });
          }
          break;
        }
        case 'restoreAllFreshness':
          stateChanges.push({ type: 'restoreAllFreshness' });
          break;
        case 'reviveSelect':
        case 'debutSelect':
        case 'returnSelect':
          // 復活・デビュー・再登場したキャラは場（キャスト）に常駐する（4.6節、v5.2 / v5.8）
          if (targetId) {
            stateChanges.push({ type: 'moveZone', instanceId: targetId, to: 'field' });
            // デビュー時に陣営を選んだキャラは、その陣営を恒久的に確定させる（v6.2）。
            // 陣営が強制指定されたデビュー（悪役会議など）は選択を待たずそちらを優先する（v6.3）
            if (effect.type === 'debutSelect') {
              const target = input.cards.find((c) => c.instanceId === targetId);
              const targetDef = input.data.definitions.get(target?.definitionId ?? '');
              const chosen =
                effect.faction ?? (targetDef?.kind === 'character' && targetDef.flexFaction ? input.selection.factionChoices?.[instance.instanceId] : undefined);
              if (chosen) stateChanges.push({ type: 'flipFaction', instanceId: targetId, to: chosen });
              // デビュー時の陣営をここで確定・記録する（復活時に戻す基準になる、v6.6）
              stateChanges.push({ type: 'setDebutFaction', instanceId: targetId, faction: chosen ?? target?.faction ?? 'ally' });
            }
            // 復活したキャラは、裏切り等で陣営が変わっていてもデビュー時の陣営に戻る（v6.6）
            if (effect.type === 'reviveSelect') {
              stateChanges.push(...restoreDebutFactionChanges(input, targetId));
            }
          }
          break;
        case 'restoreFreshness':
          // 骨休め: 鮮度を一定量だけ戻す（宴会と違い役は無効化しない、v5.8）
          stateChanges.push({ type: 'restoreFreshness', amount: effect.amount });
          break;
        case 'clearCharFlags':
          // 記憶喪失: 仕込んだフラグをすべて失う（v5.8）
          if (targetId) stateChanges.push({ type: 'clearCharFlags', instanceId: targetId });
          break;
        case 'permanentPopularityTarget':
          // 対象キャラの人気度を恒久強化（次週以降有効、v5.2c）
          if (targetId) stateChanges.push({ type: 'permanentPopularityAdd', instanceId: targetId, amount: effect.amount });
          break;
        case 'permanentPopularityLowest': {
          // 場のキャストで最も人気度が低いキャラを恒久強化する（見くびられた男、v5.6）。
          // faction指定があればその陣営だけが対象（悪役会議: 既存の敵を強化する、v6.3）
          const pool = effect.faction ? characters.filter((ch) => ch.instance.faction === effect.faction) : characters;
          if (pool.length > 0) {
            const lowest = pool.reduce((a, b) =>
              a.def.popularity + a.instance.permanentPopularityBonus <= b.def.popularity + b.instance.permanentPopularityBonus
                ? a
                : b,
            );
            stateChanges.push({ type: 'permanentPopularityAdd', instanceId: lowest.instance.instanceId, amount: effect.amount });
          }
          break;
        }
        case 'permanentPopularityAll':
          for (const ch of characters) {
            stateChanges.push({ type: 'permanentPopularityAdd', instanceId: ch.instance.instanceId, amount: effect.amount });
          }
          break;
        case 'startTimedModifier':
          stateChanges.push({ type: 'startModifier', modifierId: effect.modifierId, duration: effect.duration });
          break;
        case 'reduceAllFreshnessNextWeek':
          stateChanges.push({ type: 'reduceFreshnessNextWeek', amount: effect.amount });
          break;
        case 'addStress':
          stateChanges.push({ type: 'addStress', amount: effect.amount });
          break;
        case 'releaseStress':
          stateChanges.push({ type: 'releaseStress' });
          break;
        case 'reviveAllDead':
          // 夢オチ: 死亡済みキャラを全員場に戻す（v5.3）。復活と同様、陣営もデビュー時に戻す（v6.6）
          for (const dead of deadCharacters) {
            stateChanges.push({ type: 'moveZone', instanceId: dead.instance.instanceId, to: 'field' });
            stateChanges.push(...restoreDebutFactionChanges(input, dead.instance.instanceId));
          }
          break;
        case 'restoreDebutFaction':
          // おかえり: 裏切り・洗脳・闇堕ちで敵になった仲間をデビュー時の陣営へ戻す（v6.6）
          if (targetId) {
            stateChanges.push(...restoreDebutFactionChanges(input, targetId));
            // v7.4: 「記憶喪失」で失ったフラグも一緒に取り戻す。
            // 陣営が変わっていなくても、記憶だけ戻すために使えるようにしてある
            const target = input.cards.find((c) => c.instanceId === targetId);
            if (target?.lostFlags) stateChanges.push({ type: 'restoreCharFlags', instanceId: targetId });
          }
          break;
      }
    }
  }

  // 役による状態変化（悲しき悪役の仲間化、恒久強化、恋愛フラグの消費など）
  for (const entry of [...evaluation.applied, ...postCombos]) {
    if (entry.def.extraChanges) stateChanges.push(...entry.def.extraChanges(entry.match, comboInput));
  }

  const cleared = quotaBypassed || finalScore >= quotaEntry.quota;
  // 神回（第3層）は次週の原稿料+2（7.5節）
  const kamikaiBonus = postCombos.some((e) => e.def.id === 'kamikai') ? 2 : 0;
  const fee = cleared && !quotaBypassed ? calcFee(finalScore, quotaEntry.quota) + kamikaiBonus : 0;

  return {
    characters: characterDetails,
    developments: developmentDetails,
    combos,
    combosDisabled,
    popularityTotal,
    buzzTotal,
    comboBuzzTotal,
    modifierBuzzTotal,
    offStagePopularity,
    stressPenalty,
    stressReleased,
    buzzApplied,
    weekMultiplier,
    finaleEnding: input.finaleEnding ? { id: input.finaleEnding.id, name: input.finaleEnding.name } : null,
    endingMultiplier,
    completionBonus: completion,
    setupComboIds: input.setupComboIds ?? [],
    finalScore,
    quota: quotaEntry.quota,
    cleared,
    quotaBypassed,
    fee,
    stateChanges,
  };
}

/** 状態変化をカード配列へ適用した新しい配列を返す（resolveWeekから使う） */
export function applyStateChanges(cards: readonly CardInstance[], changes: readonly StateChange[]): {
  cards: CardInstance[];
  foreshadowGained: number;
  foreshadowConsumed: boolean;
  restoreFreshness: boolean;
  /** 骨休めなどによる鮮度の部分回復量（v5.8） */
  freshnessRestoreAmount: number;
  permanentBuzzByDef: Record<string, number>;
  startedModifiers: { modifierId: string; duration: number }[];
  freshnessPenaltyNextWeek: number;
  stressAdded: number;
  stressReleased: boolean;
} {
  const next = cards.map((c) => ({ ...c, flags: { ...c.flags } }));
  const byId = new Map(next.map((c) => [c.instanceId, c]));
  let foreshadowGained = 0;
  let foreshadowConsumed = false;
  let restoreFreshness = false;
  let freshnessRestoreAmount = 0;
  let freshnessPenaltyNextWeek = 0;
  let stressAdded = 0;
  let stressReleased = false;
  const startedModifiers: { modifierId: string; duration: number }[] = [];
  const permanentBuzzByDef: Record<string, number> = {};
  for (const change of changes) {
    switch (change.type) {
      case 'consumeTrainingFlags': {
        const c = byId.get(change.instanceId);
        if (c) c.flags.training = 0;
        break;
      }
      case 'grantTrainingFlag': {
        const c = byId.get(change.instanceId);
        if (c) c.flags.training = Math.min(TRAINING_FLAG_MAX, c.flags.training + change.amount);
        break;
      }
      case 'grantLoveFlag': {
        const c = byId.get(change.instanceId);
        if (c) c.flags.love = true;
        break;
      }
      case 'flipFaction': {
        const c = byId.get(change.instanceId);
        if (c) c.faction = change.to;
        break;
      }
      case 'moveZone': {
        const c = byId.get(change.instanceId);
        if (c) c.zone = change.to;
        break;
      }
      case 'gainForeshadowToken':
        foreshadowGained += change.amount;
        break;
      case 'consumeForeshadowTokens':
        foreshadowConsumed = true;
        break;
      case 'permanentPopularityAdd': {
        const c = byId.get(change.instanceId);
        if (c) c.permanentPopularityBonus += change.amount;
        break;
      }
      case 'permanentBuzzByDef':
        permanentBuzzByDef[change.definitionId] = (permanentBuzzByDef[change.definitionId] ?? 0) + change.amount;
        break;
      case 'restoreAllFreshness':
        restoreFreshness = true;
        break;
      case 'consumeLoveFlag': {
        const c = byId.get(change.instanceId);
        if (c) c.flags.love = false;
        break;
      }
      case 'startModifier':
        startedModifiers.push({ modifierId: change.modifierId, duration: change.duration });
        break;
      case 'reduceFreshnessNextWeek':
        freshnessPenaltyNextWeek += change.amount / 100;
        break;
      case 'addStress':
        stressAdded += change.amount;
        break;
      case 'releaseStress':
        stressReleased = true;
        break;
      case 'reviveAllDead':
        // 実際のzone移動はmoveZoneとして個別に積まれる
        break;
      case 'restoreFreshness':
        freshnessRestoreAmount += change.amount;
        break;
      case 'clearCharFlags': {
        const c = byId.get(change.instanceId);
        if (c) {
          // v7.4: 消す前の内容を控えておく（「おかえり」で記憶ごと取り戻せるようにするため）。
          // 何も仕込んでいない相手に使ったときは控えを作らない＝取り戻すものが無い
          const had = c.flags.training > 0 || c.flags.love;
          if (had) c.lostFlags = { ...c.flags };
          c.flags = { training: 0, love: false };
        }
        break;
      }
      case 'restoreCharFlags': {
        const c = byId.get(change.instanceId);
        if (c?.lostFlags) {
          c.flags = { ...c.lostFlags };
          delete c.lostFlags;
        }
        break;
      }
      case 'setDebutFaction': {
        const c = byId.get(change.instanceId);
        if (c) c.debutFaction = change.faction;
        break;
      }
    }
  }
  return {
    cards: next,
    foreshadowGained,
    foreshadowConsumed,
    restoreFreshness,
    freshnessRestoreAmount,
    permanentBuzzByDef,
    startedModifiers,
    freshnessPenaltyNextWeek,
    stressAdded,
    stressReleased,
  };
}
