/**
 * UIのフェーズマシン（設計書 14節、v5.2: setup→draw→play→result→shop）。
 * ゲームロジックはcore/の純関数を呼ぶだけで、ここでは画面遷移と選択状態のみを扱う。
 */
import {
  castOf,
  createRun,
  HIGHLIGHT_LIMIT,
  rosterOf,
  toggleHighlight,
  JOIN_EFFECTS,
  redraw,
  redrawLimit,
  resolveWeek,
  returnCharacter,
  setNickname,
  startWeek,
  validateSelection,
  type CancelReason,
} from '../core/run';
import {
  buyCard,
  buyService,
  rollPack,
  upgradeArt,
  ART_UPGRADE_PRICE,
  PACK_PRICE,
  SHOP_SERVICES,
} from '../core/shop';
import { SETUP_COMBO_IDS } from '../core/combos';
import type { SavePhase } from '../core/save';
import type { Act, CardInstance, DemandState, Faction, PlaySelection, RunState, ScoreBreakdown } from '../core/types';
import { displayName, MAX_PLAY_CARDS, MAX_STOCK } from '../core/types';
import { actStartingAt } from '../core/acts';
import { FINALE_MAX_PLAY_CARDS } from '../core/finale';
import type { GameData } from '../core/validate';

/** 実装範囲は最終回（第25話）まで。第25話をクリアすると完結 */
export const MAX_PLAYABLE_WEEK = 25;

/** ボス週のブリーフィングを何話前に出すか（v7.5） */
export const BOSS_BRIEFING_LEAD = 5;
/** 初回チュートリアルのステップ数（WeekPlayScreenのTUTORIAL_STEPSと揃える） */
export const TUTORIAL_STEP_COUNT = 8;
/** 編集会議チュートリアルのステップ数（ShopScreenのSHOP_TUTORIAL_STEPSと揃える） */
export const SHOP_TUTORIAL_STEP_COUNT = 4;
/** 1回の編集会議でラインナップを入れ替えられる回数（v7.13） */
export const SHOP_REROLL_LIMIT = 1;

export type Screen = 'title' | 'setup' | 'codex' | 'play' | 'result' | 'shop' | 'cancelled' | 'clearedAll';

export interface GameState {
  data: GameData;
  screen: Screen;
  run: RunState | null;
  selection: PlaySelection;
  /** 対象キャラのタップ待ちになっている展開カードのinstanceId */
  pendingTargetDev: string | null;
  redrawMode: boolean;
  redrawPicks: string[];
  /** ネームストック（翌週へ持ち越す手札）の選択モードと選択内容（v5.2c） */
  stockMode: boolean;
  stockPicks: string[];
  /** 作画強化の対象選択モード（ショップ画面） */
  artUpgradeMode: boolean;
  /**
   * ボス週の事前ブリーフィング（v7.5）。
   * 対象のボス週の話数を入れる。nullなら非表示。
   * 以前は第8話「合併号」の分だけを1回出していたが、
   * どのボス週も5話前に「何が来るか・何を準備すべきか」を出すようにした
   */
  bossBriefingWeek: number | null;
  /** 説明済みのボス週（同じ週で二度出さない） */
  briefedBossWeeks: number[];
  /** 幕の変わり目に出すシーンチェンジ（表示中の幕。nullなら非表示。v5.9） */
  actIntro: Act | null;
  /** 最終回で選んだ結末カードのid（v5.9）。未選択はnull */
  selectedEnding: string | null;
  /** 対象キャラのタップ待ちが解決した後、陣営選択のタップ待ちになっている展開のinstanceId（v6.2） */
  pendingFactionChoice: string | null;
  /** 出演者を初めて自分で選ぶ場面（在籍7人目のデビュー翌週）で出す説明（v6.2） */
  showHighlightTutorial: boolean;
  highlightTutorialShown: boolean;
  /** ボス週「人気投票」でノルマが急に下がる理由を説明する（v7.3） */
  showVoteTutorial: boolean;
  /** 最終回はルールが変わる（プレイ5枚・結末カード・完結ボーナス）ので説明する（v7.3） */
  showFinaleTutorial: boolean;
  /** 連載メモ（仕込み一覧）パネルの開閉（13.2節） */
  memoOpen: boolean;
  /** カード効果の説明を表示している定義ID（v5.3） */
  inspectedCardId: string | null;
  /** 編集部の要求の一覧表示（v5.5） */
  demandListOpen: boolean;
  lastResult: {
    breakdown: ScoreBreakdown;
    outcome: 'continue' | 'cancelled';
    cancelReason?: CancelReason;
    achievedDemands: DemandState[];
    failedDemands: DemandState[];
  } | null;
  /** 編集会議のカードパック提示内容（定義ID3枚） */
  shopPack: string[] | null;
  /**
   * 今回の編集会議でラインナップを入れ替えた回数（v7.13）。
   * 1回まで無料で引き直せる。編集会議に入るたび0に戻す。
   * セーブには含めない（中断して再開すると、もともとパックは引き直される仕様のため）
   */
  shopRerolls: number;
  /**
   * 初回チュートリアル（v7.5）。画面の各部を順に説明する。
   * 数値は現在のステップ（0始まり）、nullなら非表示
   */
  tutorialStep: number | null;
  /** 初回の編集会議で「この画面で何ができるか」を順に説明する（v7.5）。nullなら非表示 */
  shopTutorialStep: number | null;
  shopTutorialShown: boolean;
  /** 連載中に重ねて開く役図鑑（v7.5） */
  codexOpen: boolean;
  /** 次に始めるランで初回チュートリアルを出すか（v7.5。タイトルで選ぶ） */
  tutorialEnabled: boolean;
  /** 鮮度が初めて下がったときの一行説明を出したか（3.2節） */
  freshnessHintShown: boolean;
  /** 選択できない操作の理由を一行表示する（13.2節） */
  notice: string | null;
}

export type GameAction =
  | { type: 'openSetup'; withTutorial: boolean }
  | { type: 'openCodex' }
  /** セーブから再開する（v6.8）。中断した画面（週プレイ／編集会議）へ戻る */
  | { type: 'resumeRun'; run: RunState; phase: SavePhase }
  | {
      type: 'startRun';
      seed: number;
      mangaTitle: string;
      startingCast: string[];
      startingFactions?: Record<string, Faction>;
      /** 主人公・初期共演者候補のニックネーム（v7.29） */
      startingNicknames?: Record<string, string>;
    }
  | { type: 'tapHandCard'; instanceId: string }
  | { type: 'tapFieldCard'; instanceId: string }
  | { type: 'tapCastChar'; instanceId: string }
  | { type: 'toggleRedrawMode' }
  | { type: 'executeRedraw' }
  | { type: 'toggleStockMode' }
  | { type: 'returnCharacter'; instanceId: string }
  /** 控えキャラのニックネームを設定・解除する（v7.29）。nullで既定名に戻す */
  | { type: 'setNickname'; instanceId: string; nickname: string | null }
  | { type: 'toggleMemo' }
  | { type: 'inspectCard'; definitionId: string | null }
  | { type: 'toggleDemandList' }
  | { type: 'confirmPlay' }
  | { type: 'proceedFromResult' }
  | { type: 'buyShopCard'; definitionId: string }
  | { type: 'rerollShopPack' }
  | { type: 'toggleArtUpgradeMode' }
  | { type: 'upgradeArtTarget'; instanceId: string }
  | { type: 'buyService'; serviceId: string }
  | { type: 'leaveShop' }
  | { type: 'dismissActIntro' }
  | { type: 'selectEnding'; endingId: string }
  | { type: 'toggleHighlight'; instanceId: string }
  | { type: 'chooseFaction'; devId: string; faction: Faction }
  | { type: 'dismissHighlightTutorial' }
  | { type: 'dismissBossBriefing' }
  | { type: 'advanceTutorial' }
  | { type: 'dismissTutorial' }
  | { type: 'advanceShopTutorial' }
  | { type: 'dismissShopTutorial' }
  | { type: 'toggleCodexOverlay' }
  | { type: 'dismissVoteTutorial' }
  | { type: 'dismissFinaleTutorial' }
  | { type: 'backToTitle' }
  /** 以下はデバッグモード専用（`import.meta.env.DEV`のみ有効。本番配布物からは丸ごと除去される） */
  | { type: 'debugJumpWeek'; week: number }
  | { type: 'debugAddCard'; definitionId: string }
  | { type: 'debugFillSetupCombos' };

export function initialGameState(data: GameData): GameState {
  return {
    data,
    screen: 'title',
    run: null,
    selection: { cards: [], targets: {} },
    pendingTargetDev: null,
    redrawMode: false,
    redrawPicks: [],
    stockMode: false,
    stockPicks: [],
    artUpgradeMode: false,
    bossBriefingWeek: null,
    briefedBossWeeks: [],
    tutorialStep: null,
    shopTutorialStep: null,
    shopTutorialShown: false,
    codexOpen: false,
    tutorialEnabled: true,
    actIntro: null,
    selectedEnding: null,
    pendingFactionChoice: null,
    showHighlightTutorial: false,
    highlightTutorialShown: false,
    showVoteTutorial: false,
    showFinaleTutorial: false,
    memoOpen: false,
    inspectedCardId: null,
    demandListOpen: false,
    lastResult: null,
    shopPack: null,
    shopRerolls: 0,
    freshnessHintShown: false,
    notice: null,
  };
}

function defOf(state: GameState, instanceId: string) {
  const run = state.run!;
  const instance = run.cards.find((c) => c.instanceId === instanceId)!;
  return state.data.definitions.get(instance.definitionId)!;
}

/**
 * 対象割当の整理（13.2節）。
 * 対象候補が一意なら自動割当し、複数候補のときだけタップを求める。
 * onePlayedの候補は場のキャスト、oneDeadの候補は死亡済みキャラ。
 */
function refreshTargets(
  state: GameState,
  selection: PlaySelection,
): { selection: PlaySelection; pending: string | null; factionPending: string | null } {
  const run = state.run!;
  const cast = castOf(state.data, run);
  const castIds = cast.map((c) => c.instanceId);
  const enemyCastIds = cast.filter((c) => c.faction === 'enemy').map((c) => c.instanceId);
  const charIdsIn = (zone: 'dead' | 'bench' | 'waiting') =>
    run.cards
      .filter((c) => c.zone === zone && state.data.definitions.get(c.definitionId)?.kind === 'character')
      .map((c) => c.instanceId);
  const deadIds = charIdsIn('dead');
  const benchIds = charIdsIn('bench');
  const waitingIds = charIdsIn('waiting');
  // 敵になれる控えキャラ（flexFactionまたは既定陣営が敵）。悪役会議の対象候補（v6.3）
  const benchEnemyIds = benchIds.filter((id) => {
    const def = defOf(state, id);
    return def.kind === 'character' && (def.flexFaction || def.faction === 'enemy');
  });

  const targets: Record<string, string> = {};
  let pending: string | null = null;

  // 復活・デビューを先に解決する（v5.7）。
  // 対象が決まればそのキャラは今週のキャストなので、後続の強化カードの対象に取れる。
  const joinsCast = (id: string) => {
    const def = defOf(state, id);
    return def.kind === 'development' && def.effects.some((e) => JOIN_EFFECTS.includes(e.effect.type));
  };
  const ordered = [...selection.cards].sort((a, b) => Number(joinsCast(b)) - Number(joinsCast(a)));
  const joined: string[] = [];

  for (const id of ordered) {
    const def = defOf(state, id);
    if (def.kind !== 'development') continue;
    const options =
      def.target === 'onePlayed'
        ? [...castIds, ...joined]
        : def.target === 'oneEnemy'
          ? [...enemyCastIds, ...joined.filter((j) => run.cards.find((c) => c.instanceId === j)?.faction === 'enemy')]
          : def.target === 'oneDead'
            ? deadIds
            : def.target === 'oneBench'
              ? benchIds
              : def.target === 'oneBenchEnemy'
                ? benchEnemyIds
                : def.target === 'oneWaiting'
                  ? waitingIds
                  : null;
    if (!options) continue;
    const current = selection.targets[id];
    if (current && options.includes(current)) {
      targets[id] = current;
    } else if (options.length === 1) {
      targets[id] = options[0]!;
    } else if (pending === null) {
      pending = id;
    }
    if (targets[id] && joinsCast(id)) joined.push(targets[id]!);
  }

  /*
   * 陣営選択（v6.2）。復活・再登場（reviveSelect/returnSelect）では選び直さない。
   * 最初にデビューした時だけの一度きりの選択。
   *
   * v7.18: 既に選んだ陣営を引き継ぐ処理を `pending === null`（他の対象選択待ちが無いとき）
   * に限っていたため、運命的な出会いで陣営を選んだ後に対象選択が要る展開カードを
   * もう1枚選ぶと、その対象を解決するまでの間 factionChoices が空で返り続け、
   * 対象解決の瞬間には「選んだ陣営」自体が失われて再度プロンプトが出ていた。
   * 引き継ぎ自体は毎回行い、新しくプロンプトを出すかどうかだけ pending で絞る
   */
  let factionPending: string | null = null;
  const factionChoices: Record<string, Faction> = {};
  for (const id of selection.cards) {
    const def = defOf(state, id);
    if (def.kind !== 'development') continue;
    const debutEffect = def.effects.find((e) => e.effect.type === 'debutSelect')?.effect;
    if (!debutEffect || debutEffect.type !== 'debutSelect') continue;
    // 陣営が強制指定されたデビュー（悪役会議など）は選択プロンプトを出さない（v6.3）
    if (debutEffect.faction) continue;
    const targetId = targets[id];
    if (!targetId) continue;
    const targetDef = defOf(state, targetId);
    if (targetDef.kind !== 'character' || !targetDef.flexFaction) continue;
    const existing = selection.factionChoices?.[id];
    if (existing) {
      factionChoices[id] = existing;
    } else if (pending === null && factionPending === null) {
      factionPending = id;
    }
  }

  return { selection: { cards: selection.cards, targets, factionChoices }, pending, factionPending };
}

function withNotice(state: GameState, notice: string): GameState {
  return { ...state, notice };
}

/** 手札カードの追加可否を軽く検査する（確定時の完全検証はvalidateSelectionが行う） */
function tryAddCard(state: GameState, instanceId: string): GameState {
  const { selection } = state;
  const def = defOf(state, instanceId);
  const selectedDefs = selection.cards.map((id) => defOf(state, id));

  // v7.4: 選択済みのsoloOnlyカードの名前をそのまま出す（総集編で決め打ちしていたため、
  // 宴会を選んでいるときも「総集編は〜」と出ていた）
  const selectedSolo = selectedDefs.find((d) => d.kind === 'development' && d.soloOnly);
  if (selectedSolo) {
    return withNotice(state, `「${selectedSolo.name}」は単独でのみプレイできます`);
  }
  if (def.kind === 'development' && def.soloOnly && selection.cards.length > 0) {
    return withNotice(state, `「${def.name}」は単独でのみプレイできます`);
  }
  if (def.unlockWeek > state.run!.week) {
    return withNotice(state, `「${def.name}」は第${def.unlockWeek}話以降のみプレイできます`);
  }
  // 最終回はプレイ上限が5枚に増える（11節、v5.9）
  const playLimit = state.data.quotas.get(state.run!.week)?.final ? FINALE_MAX_PLAY_CARDS : MAX_PLAY_CARDS;
  if (selection.cards.length >= playLimit) {
    return withNotice(state, `プレイできるのは${playLimit}枚までです`);
  }

  const next = { cards: [...selection.cards, instanceId], targets: selection.targets, factionChoices: selection.factionChoices };
  const { selection: refreshed, pending, factionPending } = refreshTargets(state, next);
  return { ...state, selection: refreshed, pendingTargetDev: pending, pendingFactionChoice: factionPending, notice: null };
}

function removeCard(state: GameState, instanceId: string): GameState {
  const cards = state.selection.cards.filter((id) => id !== instanceId);
  const { selection, pending, factionPending } = refreshTargets(state, {
    cards,
    targets: state.selection.targets,
    factionChoices: state.selection.factionChoices,
  });
  return { ...state, selection, pendingTargetDev: pending, pendingFactionChoice: factionPending, notice: null };
}

/**
 * 次の話へ入る（週プレイ画面を開く）。編集会議から進む場合と、
 * 最終回の前で編集会議そのものを飛ばす場合（v7.28）の両方から呼ぶ共通処理。
 * ボス週ブリーフィング・幕の変わり目・各種チュートリアルの出し分けをここに集約する
 */
function enterWeek(state: GameState, run: RunState): GameState {
  // 鮮度が初めて下がったとき、一行説明を出す（3.2節）
  const anyStale = Object.values(run.freshnessByDef).some((f) => f < 1);
  const showHint = anyStale && !state.freshnessHintShown;
  // v7.5: どのボス週も5話前にブリーフィングを出す（何が来るか・何を準備すべきか）。
  // 以前は第8話「合併号」の分だけを1回出していたので、人気投票と新連載攻勢は無警告だった
  const upcomingBoss = [...state.data.quotas.values()]
    .filter((q) => q.boss && q.week > run.week && q.week - run.week <= BOSS_BRIEFING_LEAD)
    .map((q) => q.week)
    .find((w) => !state.briefedBossWeeks.includes(w));
  // 幕の変わり目にシーンチェンジを挟む（v5.9）
  const actStart = actStartingAt(run.week);
  // 在籍が6人を超えた翌週、出演者を自分で選ぶ場面だと説明する（v6.2）。
  // それまでは全員自動でハイライトされているので、ここで初めて「選ぶ」操作が必要になる
  const showHighlightTutorial = rosterOf(state.data, run).length > HIGHLIGHT_LIMIT && !state.highlightTutorialShown;
  // ルールが変わる週は、その週に入った時点で理由を説明する（v7.3）。
  // どちらもラン中に1回しか来ない週なので「表示済み」フラグは持たない
  const quotaEntry = state.data.quotas.get(run.week);
  const showVoteTutorial = quotaEntry?.boss === '人気投票';
  const showFinaleTutorial = quotaEntry?.final === true;
  return {
    ...state,
    run,
    screen: 'play',
    shopPack: null,
    actIntro: actStart?.act ?? null,
    artUpgradeMode: false,
    freshnessHintShown: state.freshnessHintShown || showHint,
    bossBriefingWeek: upcomingBoss ?? null,
    briefedBossWeeks: upcomingBoss ? [...state.briefedBossWeeks, upcomingBoss] : state.briefedBossWeeks,
    showHighlightTutorial,
    highlightTutorialShown: state.highlightTutorialShown || showHighlightTutorial,
    showVoteTutorial,
    showFinaleTutorial,
    notice: showHint ? '同じ展開の連発は読者に飽きられる（鮮度低下）。数週休ませると回復する' : null,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'openSetup':
      // v7.5: チュートリアルの要否はタイトルで決めて、ここまで持ち回る
      return { ...state, screen: 'setup', notice: null, tutorialEnabled: action.withTutorial };

    case 'openCodex':
      return { ...state, screen: 'codex', notice: null };

    case 'startRun': {
      const run = startWeek(
        state.data,
        createRun(state.data, action.seed, {
          mangaTitle: action.mangaTitle,
          startingCast: action.startingCast,
          startingFactions: action.startingFactions,
          startingNicknames: action.startingNicknames,
        }),
      );
      return {
        ...initialGameState(state.data),
        screen: 'play',
        run,
        // v7.5: 一枚の要約だけだったのをやめ、画面の各部を順に説明する形にした。
        // 2回目以降はタイトルで「不要」を選べる
        tutorialStep: state.tutorialEnabled ? 0 : null,
        /*
         * v7.18: ここを明示せず ...initialGameState(...) 任せにしていたため、
         * initialGameStateの既定値trueで上書きされ、スキップを選んだこと自体が
         * このランの間ずっと忘れられていた。tutorialStepは上の行で
         * 「まだ壊れる前」の値を使って正しく決めていたので気づきにくかったが、
         * 以降のチュートリアル判定（編集会議など）はこの値を見るたびに
         * 「有効」扱いに戻ってしまっていた
         */
        tutorialEnabled: state.tutorialEnabled,
        actIntro: actStartingAt(run.week)?.act ?? null,
      };
    }

    case 'resumeRun': {
      /*
       * 第1話の説明や幕のシーンチェンジは初回だけのものなので、再開時には出さない。
       * 編集会議で中断していた場合、提示カードはUI状態なので保存しておらず、ここで引き直す。
       *
       * v7.21: tutorialEnabled/shopTutorialShownも明示する。セーブはUI都合の状態を
       * 意図的に持たない設計（run以外は再開のたびに initialGameState の既定値に戻る）ため、
       * 何もしないと tutorialEnabled が既定値 true に戻り、「不要」を選んで始めた連載でも
       * 再開後に最初の編集会議へ進んだ瞬間に説明が再び出てしまっていた。
       * 再開は定義からして初回ではないので、両方とも「もう出さない」側に倒す
       */
      const base = { ...initialGameState(state.data), run: action.run, tutorialEnabled: false, shopTutorialShown: true };
      if (action.phase === 'shop') {
        return {
          ...base,
          screen: 'shop',
          shopPack: rollPack(state.data, action.run, MAX_PLAYABLE_WEEK),
          notice: '編集会議から再開した',
        };
      }
      return { ...base, screen: 'play', notice: `第${action.run.week}話から再開した` };
    }

    case 'tapHandCard': {
      if (!state.run || state.screen !== 'play') return state;
      if (state.redrawMode) {
        const picks = state.redrawPicks.includes(action.instanceId)
          ? state.redrawPicks.filter((id) => id !== action.instanceId)
          : [...state.redrawPicks, action.instanceId];
        return { ...state, redrawPicks: picks, notice: null };
      }
      if (state.stockMode) {
        if (state.stockPicks.includes(action.instanceId)) {
          return { ...state, stockPicks: state.stockPicks.filter((id) => id !== action.instanceId), notice: null };
        }
        if (state.stockPicks.length >= MAX_STOCK) return withNotice(state, `ストックできるのは${MAX_STOCK}枚までです`);
        return { ...state, stockPicks: [...state.stockPicks, action.instanceId], notice: null };
      }
      if (state.selection.cards.includes(action.instanceId)) return removeCard(state, action.instanceId);
      return tryAddCard(state, action.instanceId);
    }

    case 'tapFieldCard': {
      if (!state.run || state.screen !== 'play') return state;
      return removeCard(state, action.instanceId);
    }

    case 'tapCastChar': {
      if (!state.run || state.screen !== 'play') return state;
      // 陣営選択の待ち中は、専用ボタンで答えるまで他の操作を受け付けない（v6.2）
      if (state.pendingFactionChoice) return state;
      // 対象待ちでなければ、在籍キャラのタップは今週の出演者の入れ替え（v6.0）
      if (!state.pendingTargetDev) {
        const inRoster = rosterOf(state.data, state.run).some((c) => c.instanceId === action.instanceId);
        return inRoster ? gameReducer(state, { type: 'toggleHighlight', instanceId: action.instanceId }) : state;
      }
      // 場・控え・死亡済みいずれのキャラのタップも、対象待ちの展開への割当として扱う
      // （不正な割当はrefreshTargetsが候補外として捨てる）
      const def = defOf(state, state.pendingTargetDev);
      if (def.kind !== 'development' || def.target === 'none' || def.target === 'allPlayed') return state;
      const targets = { ...state.selection.targets, [state.pendingTargetDev]: action.instanceId };
      const { selection, pending, factionPending } = refreshTargets(state, {
        cards: state.selection.cards,
        targets,
        factionChoices: state.selection.factionChoices,
      });
      return { ...state, selection, pendingTargetDev: pending, pendingFactionChoice: factionPending, notice: null };
    }

    case 'toggleRedrawMode': {
      if (!state.run) return state;
      const limit = redrawLimit(state.run);
      if (!state.redrawMode && state.run.redrawsUsed >= limit) {
        return withNotice(state, `描き直しは週${limit}回までです`);
      }
      return { ...state, redrawMode: !state.redrawMode, redrawPicks: [], stockMode: false, notice: null };
    }

    case 'returnCharacter': {
      if (!state.run || state.screen !== 'play') return state;
      try {
        const run = returnCharacter(state.data, state.run, action.instanceId);
        const instance = run.cards.find((c) => c.instanceId === action.instanceId)!;
        const def = state.data.definitions.get(instance.definitionId);
        const name = def && displayName(def, instance);
        return { ...state, run, notice: `「${name}」が再登場した` };
      } catch (e) {
        return withNotice(state, e instanceof Error ? e.message : '再登場できません');
      }
    }

    case 'setNickname': {
      if (!state.run || state.screen !== 'play') return state;
      try {
        const run = setNickname(state.data, state.run, action.instanceId, action.nickname);
        return { ...state, run, notice: null };
      } catch (e) {
        return withNotice(state, e instanceof Error ? e.message : 'ニックネームを設定できません');
      }
    }

    case 'toggleMemo':
      return { ...state, memoOpen: !state.memoOpen };

    case 'inspectCard':
      return { ...state, inspectedCardId: action.definitionId };

    case 'toggleDemandList':
      return { ...state, demandListOpen: !state.demandListOpen };

    case 'toggleStockMode': {
      if (!state.run) return state;
      return {
        ...state,
        stockMode: !state.stockMode,
        redrawMode: false,
        redrawPicks: [],
        notice: state.stockMode ? null : `プレイしないカードを最大${MAX_STOCK}枚、次の話へ持ち越せる`,
      };
    }

    case 'executeRedraw': {
      if (!state.run || state.redrawPicks.length === 0) return withNotice(state, '戻すカードを選んでください');
      const run = redraw(state.data, state.run, state.redrawPicks);
      const { selection, pending, factionPending } = refreshTargets(
        { ...state, run },
        {
          cards: state.selection.cards.filter((id) => run.hand.includes(id)),
          targets: state.selection.targets,
          factionChoices: state.selection.factionChoices,
        },
      );
      return {
        ...state,
        run,
        selection,
        pendingTargetDev: pending,
        pendingFactionChoice: factionPending,
        redrawMode: false,
        redrawPicks: [],
        notice: null,
      };
    }

    case 'confirmPlay': {
      if (!state.run) return state;
      if (state.pendingTargetDev) return withNotice(state, '対象キャラを選んでください');
      if (state.pendingFactionChoice) return withNotice(state, 'キャラの陣営を選んでください');
      const validity = validateSelection(state.data, state.run, state.selection);
      if (!validity.ok) return withNotice(state, validity.reason);
      // 最終回は結末カードを1枚選んでから確定する（v5.9）
      if (state.data.quotas.get(state.run.week)?.final && !state.selectedEnding) {
        return withNotice(state, 'この連載の結末を選んでください');
      }
      const result = resolveWeek(state.data, state.run, state.selection, state.stockPicks, state.selectedEnding);
      return {
        ...state,
        run: result.state,
        lastResult: {
          breakdown: result.breakdown,
          outcome: result.outcome,
          cancelReason: result.cancelReason,
          achievedDemands: result.achievedDemands,
          failedDemands: result.failedDemands,
        },
        selection: { cards: [], targets: {} },
        pendingTargetDev: null,
        pendingFactionChoice: null,
        redrawMode: false,
        redrawPicks: [],
        stockMode: false,
        stockPicks: [],
        screen: 'result',
        notice: null,
      };
    }

    case 'proceedFromResult': {
      if (!state.run || !state.lastResult) return state;
      if (state.lastResult.outcome === 'cancelled') return { ...state, screen: 'cancelled' };
      if (state.run.week > MAX_PLAYABLE_WEEK) return { ...state, screen: 'clearedAll' };
      /*
       * v7.28: 最終回の前の編集会議は飛ばす。カードは仕入れられず、
       * キャラも展開もベース点（中央値）に置き換わって出番が無いので、開いても選べることが無い
       */
      if (state.data.quotas.get(state.run.week)?.final) {
        const run = startWeek(state.data, state.run);
        return { ...enterWeek(state, run), lastResult: null };
      }
      // 継続なら編集会議（12節）へ。カードパックを提示する。
      // 初回だけ「この画面で何ができるか」を説明する（v7.5）
      return {
        ...state,
        screen: 'shop',
        shopPack: rollPack(state.data, state.run, MAX_PLAYABLE_WEEK),
        shopRerolls: 0,
        lastResult: null,
        // v7.18: タイトルでチュートリアルを不要と答えていたら、編集会議の説明も出さない
        shopTutorialStep: state.tutorialEnabled && !state.shopTutorialShown ? 0 : null,
        shopTutorialShown: true,
      };
    }

    case 'buyShopCard': {
      if (!state.run || state.screen !== 'shop') return state;
      // v7.28: 最終回の前の編集会議ではカードを仕入れられない（出番が無いまま終わるため）
      if (state.data.quotas.get(state.run.week)?.final) {
        return withNotice(state, '最終回は結末を選ぶだけなので、カードは仕入れられません');
      }
      if (state.run.funds < PACK_PRICE) return withNotice(state, '原稿料が足りません');
      if (!state.shopPack?.includes(action.definitionId)) return state;
      const run = buyCard(state.data, state.run, action.definitionId);
      const def = state.data.definitions.get(action.definitionId);
      const name = def?.name ?? action.definitionId;
      return {
        ...state,
        run,
        shopPack: rollPack(state.data, run, MAX_PLAYABLE_WEEK, state.shopRerolls),
        notice:
          def?.kind === 'character'
            ? `「${name}」を控えに加えた（「新キャラ登場」でデビュー）`
            : `「${name}」を仕入れた（次の話の手札に必ず入る）`,
      };
    }

    /**
     * ラインナップの入れ替え（v7.13）。1回の編集会議につき1回だけ、無料で引き直せる。
     * 3枚とも噛み合わないときに何もできないのが辛いという声への対応で、
     * 原稿料を使わせると「引き直しのために買い物を諦める」判断になってしまうため無料にした
     */
    case 'rerollShopPack': {
      if (!state.run || state.screen !== 'shop') return state;
      if (state.shopRerolls >= SHOP_REROLL_LIMIT) return withNotice(state, '入れ替えは1回までです');
      const rerolls = state.shopRerolls + 1;
      return {
        ...state,
        shopRerolls: rerolls,
        shopPack: rollPack(state.data, state.run, MAX_PLAYABLE_WEEK, rerolls),
        notice: 'ラインナップを入れ替えた',
      };
    }

    case 'toggleArtUpgradeMode': {
      if (!state.run) return state;
      if (!state.artUpgradeMode && state.run.funds < ART_UPGRADE_PRICE) return withNotice(state, '原稿料が足りません');
      return { ...state, artUpgradeMode: !state.artUpgradeMode, notice: null };
    }

    case 'upgradeArtTarget': {
      if (!state.run || state.screen !== 'shop') return state;
      if (state.run.funds < ART_UPGRADE_PRICE) return withNotice(state, '原稿料が足りません');
      const run = upgradeArt(state.data, state.run, action.instanceId);
      const instance = state.run.cards.find((c) => c.instanceId === action.instanceId)!;
      const targetDef = state.data.definitions.get(instance.definitionId);
      const name = targetDef && displayName(targetDef, instance);
      return { ...state, run, artUpgradeMode: false, notice: `「${name}」の作画を強化した（人気度+5）` };
    }

    case 'buyService': {
      if (!state.run || state.screen !== 'shop') return state;
      try {
        const run = buyService(state.run, action.serviceId);
        const name = SHOP_SERVICES.find((s) => s.id === action.serviceId)?.name ?? action.serviceId;
        return { ...state, run, notice: `「${name}」を依頼した` };
      } catch (e) {
        return withNotice(state, e instanceof Error ? e.message : '依頼できません');
      }
    }

    case 'leaveShop': {
      if (!state.run) return state;
      const run = startWeek(state.data, state.run);
      return enterWeek(state, run);
    }

    case 'toggleHighlight': {
      if (!state.run || state.screen !== 'play') return state;
      const before = castOf(state.data, state.run).map((c) => c.instanceId);
      // 拒否されたときに理由を出し分ける（上限に当たった／最後の1人を外そうとした）
      const removingLast = before.length <= 1 && before.includes(action.instanceId);
      const run = toggleHighlight(state.data, state.run, action.instanceId);
      const after = castOf(state.data, run).map((c) => c.instanceId);
      if (before.length === after.length && before.every((id) => after.includes(id))) {
        return withNotice(
          state,
          removingLast ? '今週の話には最低1人は出さないといけません' : `今週の話に出せるのは${HIGHLIGHT_LIMIT}人までです`,
        );
      }
      // 出演者が変わると対象の割当がずれるので選び直す
      const { selection, pending, factionPending } = refreshTargets({ ...state, run }, state.selection);
      return { ...state, run, selection, pendingTargetDev: pending, pendingFactionChoice: factionPending, notice: null };
    }

    case 'chooseFaction': {
      if (!state.run || state.screen !== 'play') return state;
      const factionChoices = { ...state.selection.factionChoices, [action.devId]: action.faction };
      const { selection, pending, factionPending } = refreshTargets(state, { ...state.selection, factionChoices });
      return { ...state, selection, pendingTargetDev: pending, pendingFactionChoice: factionPending, notice: null };
    }

    case 'selectEnding':
      return { ...state, selectedEnding: action.endingId, notice: null };

    case 'dismissActIntro':
      return { ...state, actIntro: null };

    case 'dismissHighlightTutorial':
      return { ...state, showHighlightTutorial: false };

    case 'dismissBossBriefing':
      return { ...state, bossBriefingWeek: null };

    case 'advanceTutorial': {
      if (state.tutorialStep === null) return state;
      const next = state.tutorialStep + 1;
      return { ...state, tutorialStep: next >= TUTORIAL_STEP_COUNT ? null : next };
    }

    case 'dismissTutorial':
      return { ...state, tutorialStep: null };

    case 'advanceShopTutorial': {
      if (state.shopTutorialStep === null) return state;
      const next = state.shopTutorialStep + 1;
      return { ...state, shopTutorialStep: next >= SHOP_TUTORIAL_STEP_COUNT ? null : next };
    }

    case 'dismissShopTutorial':
      return { ...state, shopTutorialStep: null };

    case 'toggleCodexOverlay':
      return { ...state, codexOpen: !state.codexOpen };

    case 'dismissVoteTutorial':
      return { ...state, showVoteTutorial: false };

    case 'dismissFinaleTutorial':
      return { ...state, showFinaleTutorial: false };

    case 'backToTitle':
      return { ...initialGameState(state.data) };

    // デバッグモード専用（v6.4）。`import.meta.env.DEV`はVite本番ビルドで`false`に置き換わるため、
    // 各caseの本体はビルド時に丸ごと除去され、配布物（dist/uchikiri.html）には残らない
    case 'debugJumpWeek': {
      if (!import.meta.env.DEV || !state.run) return state;
      const week = Math.max(1, Math.min(MAX_PLAYABLE_WEEK, Math.round(action.week)));
      const run = startWeek(state.data, { ...state.run, week });
      return {
        ...state,
        run,
        screen: 'play',
        selection: { cards: [], targets: {} },
        pendingTargetDev: null,
        pendingFactionChoice: null,
        redrawMode: false,
        redrawPicks: [],
        stockMode: false,
        stockPicks: [],
        lastResult: null,
        notice: `第${week}話へジャンプした（デバッグ）`,
      };
    }

    case 'debugAddCard': {
      if (!import.meta.env.DEV || !state.run) return state;
      const def = state.data.definitions.get(action.definitionId);
      if (!def) return state;
      const dupeCount = state.run.cards.filter((c) => c.definitionId === action.definitionId).length;
      const instanceId = `${action.definitionId}#debug${dupeCount + 1}`;
      const zone = def.kind === 'character' ? 'bench' : 'hand';
      const instance: CardInstance = {
        instanceId,
        definitionId: action.definitionId,
        permanentPopularityBonus: 0,
        faction: def.kind === 'character' ? def.faction : null,
        flags: { training: 0, love: false },
        acquiredWeek: state.run.week,
        playCount: 0,
        zone,
        debutFaction: null,
      };
      const run: RunState = {
        ...state.run,
        cards: [...state.run.cards, instance],
        hand: zone === 'hand' ? [...state.run.hand, instanceId] : state.run.hand,
      };
      return { ...state, run, notice: `「${def.name}」をデバッグ追加した（${zone === 'hand' ? '手札' : '控え'}）` };
    }

    case 'debugFillSetupCombos': {
      if (!import.meta.env.DEV || !state.run) return state;
      return {
        ...state,
        run: { ...state.run, setupComboHistory: [...SETUP_COMBO_IDS] },
        notice: '仕込み役をすべて達成済みにした（デバッグ）',
      };
    }
  }
}
