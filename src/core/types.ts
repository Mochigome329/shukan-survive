/**
 * コア型定義（設計書 14.1〜14.2節）。
 * カード定義（CardDefinition）とカード実体（CardInstance）を分離する。
 */

/**
 * カードの分類タグ（v5.4: ジャンル宣言は廃止し、カードの性格づけとしてのみ使う）。
 * v5.8: 使われなくなったジャンルの名残（lovecome / mystery）を撤去し、鮮度の扱いに関わる battle だけを残した。
 */
export type CardTag = 'battle';
export type Faction = 'ally' | 'enemy';

/**
 * 現在位置。排他的に管理する（14.1節、v5.2改訂）。
 * キャラ: field（場に常駐）/ bench（控え。「新キャラ登場」でデビュー）/ dead / waiting
 * 展開: activeDeck（抽選プール）/ hand
 */
export type Zone = 'field' | 'bench' | 'activeDeck' | 'hand' | 'selected' | 'dead' | 'waiting';

/**
 * 展開カードの対象種別（5.2節、v5.2: oneBench=控えキャラ1枚）。
 * oneBenchEnemy=控えキャラのうち敵になれる者のみ（flexFactionまたは既定陣営が敵、v6.3）
 */
export type TargetKind = 'none' | 'onePlayed' | 'allPlayed' | 'oneDead' | 'oneBench' | 'oneWaiting' | 'oneEnemy' | 'oneBenchEnemy';

/** 効果の発動段階（6.1節） */
export type EffectTiming = 'selection' | 'preScore' | 'postScore' | 'endWeek' | 'nextWeekStart';

/** カード効果の判別可能union（14.2節） */
export type CardEffect =
  | { type: 'grantTrainingFlag'; amount: number }
  | { type: 'grantLoveFlag' }
  | { type: 'flipFactionAtEndWeek' }
  /** 陣営を指定の側へ変える（改心=仲間へ / 闇堕ち=敵へ。v5.3b） */
  | { type: 'setFactionAtEndWeek'; faction: Faction }
  /**
   * 対象を週終了時に別ゾーンへ移す。
   * faction を指定すると、allPlayed でもその陣営のキャラだけが対象になる
   * （v5.8b: 「全滅」で敵まで全滅するのは不自然、という指摘への対応）
   */
  | { type: 'moveZoneAtEndWeek'; zone: 'dead' | 'waiting'; faction?: Faction }
  | { type: 'gainToken'; token: 'foreshadow'; amount: number }
  | { type: 'startTimedModifier'; modifierId: string; duration: number }
  | { type: 'restoreAllFreshness' }
  | { type: 'reduceAllFreshnessNextWeek'; amount: number }
  | { type: 'bypassQuota' }
  | { type: 'permanentPopularityAll'; amount: number }
  | { type: 'permanentPopularityTarget'; amount: number }
  /**
   * 場のキャストのうち、その時点で最も人気度が低いキャラを恒久強化する（v5.6）。
   * faction を指定すると、その陣営のキャラだけが対象になる（悪役会議、v6.3）
   */
  | { type: 'permanentPopularityLowest'; amount: number; faction?: Faction }
  | { type: 'reviveSelect' }
  /**
   * faction を指定すると、選び直しなしでその陣営に固定してデビューさせる
   * （悪役会議: 敵になれる控えキャラを敵として送り込む。v6.3）。
   * flexFactionキャラでも通常の陣営選択プロンプトは出さない
   */
  | { type: 'debutSelect'; faction?: Faction }
  /** 重い展開（敗北・喪失・死亡）。読者に緊張が溜まり、人気が一時的に下がる（v5.3） */
  | { type: 'addStress'; amount: number }
  /** 溜まった緊張を解放する（大勝利・覚醒・復活）。カタルシスとして爆発する（v5.3） */
  | { type: 'releaseStress' }
  /** 死亡済みキャラをすべて場に戻す（夢オチ、v5.3） */
  | { type: 'reviveAllDead' }
  /** 再登場待ちのキャラを場に戻す（一方そのころ、v5.8） */
  | { type: 'returnSelect' }
  /** 鮮度を一定量だけ回復する（骨休め。宴会と違い役は無効化しない、v5.8） */
  | { type: 'restoreFreshness'; amount: number }
  /** 対象の仕込みフラグ（修行・恋愛）をすべて失わせる（記憶喪失、v5.8） */
  | { type: 'clearCharFlags' }
  /** その週だけキャスト全員の人気度を上げる（共闘。恒久補正とは別枠、v5.8b） */
  | { type: 'temporaryPopularityAll'; amount: number }
  /** 死亡済みキャラ1人につき話題性を加算する（弔い合戦、v5.8b） */
  | { type: 'buzzPerDead'; amount: number }
  /**
   * 対象の陣営を、デビュー時の陣営へ戻す（おかえり、v6.6）。
   * 裏切り・洗脳・闇堕ちで敵になった仲間を取り戻すための専用カード。
   * 現在の陣営がデビュー時と同じなら何も起きない
   */
  | { type: 'restoreDebutFaction' }
  /**
   * その週の敵キャラのうち最も人気度が低い者を、週終了時に撃破する（大勝利、v7.20）。
   * 対象指定は要らず自動選択。撃破（moveZoneAtEndWeek zone:'waiting'）と同じ送り先。
   * 場に敵がいなければ何も起きない。他のカードで既に敵の退場（死亡・撃破・途中離脱等）が
   * 決まっている週は、追加の撃破は発生しない（v7.20）
   */
  | { type: 'defeatWeakestEnemyAtEndWeek' };

export interface TimedEffect {
  timing: EffectTiming;
  effect: CardEffect;
}

/** 説明文は内部・未発見時・発見後の3種類（3.4節） */
export interface CardDescriptions {
  internal: string;
  hidden: string;
  revealed: string;
}

/**
 * 幕タグ（序/破/急）。ショップの提示重みを話数帯で寄せるために使う（design_story_types.md 2節）。
 * 省略時は「汎用」として全話数帯で重み1のまま扱う。
 */
export type Act = 'jo' | 'ha' | 'kyu';

interface CardDefinitionBase {
  id: string;
  name: string;
  tags: CardTag[];
  /** 最大所持数。キャラは1人物1枚の原則により常に1（14.1節） */
  maxCopies: number;
  /** この話数以降のみプレイ可能（タイムスキップ=9）。1なら制限なし */
  unlockWeek: number;
  /**
   * 登場しやすい幕（省略時は汎用）。
   * 複数指定できる（v7.13）。「撃破」のように、破でも急でも出番があるカードは
   * 両方を挙げる。1つだけ挙げると隣の幕の重みが1/3に落ちてしまうため
   */
  act?: Act | Act[];
  /**
   * レアカード（v5.7）。編集会議での提示重みが低く、その分だけ効果が大きい。
   * UIには「レア」バッジを出し、引きの価値が分かるようにする。
   */
  rare?: boolean;
  descriptions: CardDescriptions;
}

export interface CharacterCardDefinition extends CardDefinitionBase {
  kind: 'character';
  popularity: number;
  /** デビュー前・未選択時の既定陣営。flexFactionのキャラはデビュー時に上書きされうる */
  faction: Faction;
  /**
   * デビュー時に陣営を選べるキャラ（v6.2）。
   * ヒロインが敵として現れる、父が実は組織の一員だった、といった展開を任意で選べるようにする。
   * 選ばなければ既定の faction のまま。控えにいる間や復活・再登場では選び直さない
   * （最初にデビューした時の一度きりの選択）。
   */
  flexFaction?: boolean;
}

export interface DevelopmentCardDefinition extends CardDefinitionBase {
  kind: 'development';
  buzz: number;
  target: TargetKind;
  effects: TimedEffect[];
  /** 総集編: 単独プレイのみ・キャラ0枚を許す（5.4節） */
  soloOnly: boolean;
}

export type CardDefinition = CharacterCardDefinition | DevelopmentCardDefinition;

/**
 * カード実体（14.1節）。
 * v5.2d: 鮮度は実体ではなく定義（展開の種類）単位で管理する（RunState.freshnessByDef）。
 * 同じ展開を何枚持っていても「同じ展開の連発」は等しく飽きられるべきため。
 */
export interface CardInstance {
  instanceId: string;
  definitionId: string;
  permanentPopularityBonus: number;
  /** キャラのみ意味を持つ現在陣営。展開カードはnull */
  faction: Faction | null;
  flags: {
    training: number; // 修行済みフラグ 0〜2
    love: boolean;
  };
  /**
   * 「記憶喪失」で失ったフラグの控え（v7.4）。
   * 「おかえり」で記憶ごと取り戻せるようにするために、消す前の内容をここへ退避する。
   * 取り戻したら消す。古いセーブには無いことがあるので省略可
   */
  lostFlags?: {
    training: number;
    love: boolean;
  };
  acquiredWeek: number;
  playCount: number;
  zone: Zone;
  /** 途中離脱した話数（再登場可能判定に使う。4.5節、M3） */
  leftWeek?: number;
  /** この週に再登場したか（役「宿命の再会」等の判定に使う。4.5節、M3） */
  returnedThisWeek?: boolean;
  /**
   * デビュー時の陣営（v6.6）。まだデビューしていない控えキャラはnull。
   * 裏切り・洗脳・闇堕ちで陣営が変わっても、この値は更新しない。
   * 復活時や「おかえり」で「元の陣営」に戻すための基準になる
   */
  debutFaction: Faction | null;
  /**
   * 「裏切り」の対象になった回数（v7.24）。役「二重スパイ」の判定に使う。
   * 「洗脳」は数えない（裏切りと違って対立というより支配に近いため）。省略時は0扱い
   */
  betrayalCount?: number;
}

/** プレイ選択。cardsは手札のinstanceId、targetsは展開カード→対象キャラの割当 */
export interface PlaySelection {
  cards: string[];
  targets: Record<string, string>;
  /**
   * デビュー展開カード（instanceId）→ 選んだ陣営（v6.2）。
   * flexFactionのキャラをデビューさせるときだけ意味を持つ。省略時は既定の陣営のまま。
   */
  factionChoices?: Record<string, Faction>;
}

export type SelectionValidity = { ok: true } | { ok: false; reason: string };

/** 週終了時などに適用する状態変化（スコア明細に載せる。14.5節） */
export type StateChange =
  | { type: 'consumeTrainingFlags'; instanceId: string; count: number }
  | { type: 'grantTrainingFlag'; instanceId: string; amount: number }
  | { type: 'grantLoveFlag'; instanceId: string }
  | { type: 'flipFaction'; instanceId: string; to: Faction }
  | { type: 'moveZone'; instanceId: string; to: 'dead' | 'waiting' | 'field' }
  | { type: 'gainForeshadowToken'; amount: number }
  | { type: 'consumeForeshadowTokens' }
  | { type: 'permanentPopularityAdd'; instanceId: string; amount: number }
  | { type: 'permanentBuzzByDef'; definitionId: string; amount: number }
  | { type: 'restoreAllFreshness' }
  | { type: 'consumeLoveFlag'; instanceId: string }
  | { type: 'startModifier'; modifierId: string; duration: number }
  | { type: 'reduceFreshnessNextWeek'; amount: number }
  | { type: 'addStress'; amount: number }
  | { type: 'releaseStress' }
  | { type: 'reviveAllDead' }
  | { type: 'restoreFreshness'; amount: number }
  | { type: 'clearCharFlags'; instanceId: string }
  /** 「記憶喪失」で失ったフラグを取り戻す（おかえり、v7.4） */
  | { type: 'restoreCharFlags'; instanceId: string }
  /** デビュー時の陣営を記録する（初回デビュー時に一度だけ、v6.6） */
  | { type: 'setDebutFaction'; instanceId: string; faction: Faction }
  /** 「裏切り」の対象になった回数を1増やす（役「二重スパイ」用、v7.24） */
  | { type: 'incrementBetrayalCount'; instanceId: string };

/** カットイン演出テンプレート（13.3節） */
export type CutInTemplate = 'normal' | 'shock' | 'emotion' | 'setupPayoff';

/**
 * 役の判定結果（7.1節の三分類）。
 * applied: 効果が適用された / suppressed: 上位役に抑制された /
 * notApplied: 成立したが週スコア乗算の上限規則で不採用（7.6節）
 */
export interface ComboScoreDetail {
  comboId: string;
  name: string;
  status: 'applied' | 'suppressed' | 'notApplied';
  popularityAdd: number;
  buzzAdd: number;
  /** 週スコア乗算（覚醒×3など。適用されたときのみ1以外） */
  scoreMultiplier: number;
  /** キャラ人気度の乗算（宿命の再会×3など） */
  charMultiplier: number;
  cutInTemplate: CutInTemplate;
  boundCharIds: string[];
  /** カットインに添える追加効果の説明（恒久効果など） */
  extraText?: string;
}

/** 発動回数制限の記録（5.5節） */
export interface ComboUsageState {
  oncePerRun: string[];
  perCharacter: Record<string, string[]>;
}

export interface CharacterScoreDetail {
  instanceId: string;
  name: string;
  basePopularity: number;
  permanentBonus: number;
  /** その週だけの補正（共闘など）。恒久補正と混ぜない（v5.8c） */
  temporaryBonus: number;
  trainingBonus: number;
  /** キャラ単位の乗算役（宿命の再会など、6.3節の手順3） */
  multiplier: number;
  total: number;
}

/** 期間効果（5.3節、M3） */
export interface ActiveModifier {
  modifierId: string;
  /** 当週を含む残り週数 */
  remaining: number;
}

export interface DevelopmentBuzzDetail {
  instanceId: string;
  name: string;
  baseBuzz: number;
  freshness: number;
  /** 恒久補正（必殺技初披露のバトル+1など。鮮度乗算後に加算、6.4節） */
  permanentBonus: number;
  effective: number;
}

/** スコア明細（14.5節） */
export interface ScoreBreakdown {
  characters: CharacterScoreDetail[];
  developments: DevelopmentBuzzDetail[];
  combos: ComboScoreDetail[];
  /** 温泉回による役無効化（5.2節） */
  combosDisabled: boolean;
  /** 出演していない在籍キャラの寄与（半減分、v6.1） */
  offStagePopularity: number;
  /** キャラ人気度の合計（役による加算を含む） */
  popularityTotal: number;
  /** 展開カードの話題性合計（鮮度・恒久補正込み、役加算は含まない） */
  buzzTotal: number;
  /** 役による話題性加算（鮮度を掛けない別枠、6.4節） */
  comboBuzzTotal: number;
  /** 期間効果による話題性加算（トーナメント開幕など、5.3節） */
  modifierBuzzTotal: number;
  /** 読者の緊張による人気度の一時低下（v5.3。負の値） */
  stressPenalty: number;
  /** この週に解放した緊張の量（カタルシス、v5.3） */
  stressReleased: number;
  /** max(1, buzzTotal + comboBuzzTotal + modifierBuzzTotal) 適用後 */
  buzzApplied: number;
  /** 週スコア乗算（7.6節: 最も高い倍率1つのみ） */
  weekMultiplier: number;
  /** 最終回で選んだ結末カード（v5.9）。通常週はnull */
  finaleEnding: { id: string; name: string } | null;
  /** 結末カードの週スコア乗算（v5.9） */
  endingMultiplier: number;
  /** 完結ボーナス倍率（v5.9） */
  completionBonus: number;
  /**
   * 完結ボーナスの元になった仕込み役IDの一覧（v6.3）。
   * 最終回のリザルトで「1つずつ積み上げる」演出に使う。通常週は空配列
   */
  setupComboIds: readonly string[];
  finalScore: number;
  quota: number;
  cleared: boolean;
  quotaBypassed: boolean;
  /** クリア時の原稿料（基本3+超過ボーナス、12節。判定免除時は0） */
  fee: number;
  stateChanges: StateChange[];
}

/**
 * 連載年表に載せるその週の出来事（v6.8）。
 * キャラの出入りと陣営の変化だけを拾う。役の成立は comboIds から別途引ける
 */
export interface WeekEvent {
  kind: 'debut' | 'death' | 'leave' | 'return' | 'toEnemy' | 'toAlly';
  /** 表示用のキャラ名。セーブしてもそのまま読めるよう名前で持つ */
  name: string;
}

/** ラン状態 */
export interface WeekLogEntry {
  week: number;
  playedInstanceIds: string[];
  /** プレイした展開の定義ID（編集部の要求の判定に使う、v5.2d） */
  playedDefinitionIds: string[];
  /** 成立した役のID（applied、v5.2d） */
  comboIds: string[];
  score: number;
  quota: number;
  cleared: boolean;
  /** この週の処理後の打ち切り警告数（v5.2） */
  warningsAfter: number;
  /** 連載年表用の出来事（v6.8）。古いセーブには無いことがあるので省略可 */
  events?: WeekEvent[];
}

/** 編集部の要求（v5.2d）: ジャンルごとの「連載として成立しているか」の期限つき要求 */
export interface DemandState {
  id: string;
  text: string;
  deadline: number;
  /** 達成済みならその話数、未達成ならnull */
  achievedWeek: number | null;
  /** 期限切れで失敗が確定したか */
  failed: boolean;
}

/** 打ち切り警告の上限。到達で打ち切り（v5.2の警告制） */
export const MAX_WARNINGS = 3;

export interface RunState {
  runSeed: number;
  /** 作品タイトル（連載開始時に宣言、v5.2） */
  mangaTitle: string;
  /** 現在プレイ中の話数（1始まり） */
  week: number;
  cards: CardInstance[];
  hand: string[];
  redrawsUsed: number;
  foreshadowTokens: number;
  /** 伏線を張った話数の一覧（回収時の間隔ボーナスに使う、v5.3） */
  foreshadowWeeks: number[];
  /** 読者の緊張（重い展開で増え、カタルシスで解放される。v5.3） */
  stress: number;
  /** 打ち切り警告（0〜3。ノルマ未達+1、達成-1、3で打ち切り。v5.2） */
  warnings: number;
  /** 展開の種類ごとの鮮度 0.25〜1.0（未登録は1.0。v5.2d） */
  freshnessByDef: Record<string, number>;
  /** 進行中の期間効果（5.3節、M3） */
  modifiers: ActiveModifier[];
  /** 次週の開始時に適用する鮮度低下（夢オチ、M3） */
  pendingFreshnessPenalty: number;
  /** 今週すでに再登場させたか（週1人まで、4.5節） */
  returnUsedThisWeek: boolean;
  /** 成立させた仕込み役の種類（完結ボーナスと連載メモに使う、11節） */
  setupComboHistory: string[];
  /**
   * 役「両想い」で想いが通じ合ったキャラのinstanceId（v7.3）。
   * 恋愛フラグは成立時に消費されるので、あとから相手を特定するにはここに残すしかない。
   * 結末カード「結婚式」が選べるかの判定（相手が生きているか）に使う。
   * 古いセーブには無いことがあるので省略可
   */
  romanceIds?: string[];
  /** 今週の話に出演させるキャラ（ハイライト、最大6人。v6.0） */
  highlightIds: string[];
  /** ネームストック: 翌週の手札に持ち越す展開カード（最大2枚、v5.2c） */
  stockedIds: string[];
  /** 編集会議で仕入れたカードは次の話の手札に必ず入る（v5.2c） */
  guaranteedNextHand: string[];
  /** 原稿料（編集会議で使う、12節） */
  funds: number;
  /** ショップでの累計購入回数（乱数系列のインデックスに使う） */
  shopPurchases: number;
  /** 役の発動回数制限の記録（5.5節） */
  comboUsage: ComboUsageState;
  /** 定義ID単位の話題性恒久補正（必殺技初披露、次週以降有効） */
  permanentBuzzByDef: Record<string, number>;
  /** 編集会議で購入した恒久サービス（v5.5） */
  upgrades: string[];
  /** 編集部の要求（v5.2d） */
  demands: DemandState[];
  log: WeekLogEntry[];
}

/** 緊張1つあたりのキャスト人気度の一時低下（v5.3） */
export const STRESS_POPULARITY_PENALTY = 6;
/** 緊張1つあたりの解放時の話題性ボーナス（v5.3） */
export const STRESS_RELEASE_BUZZ = 5;
/** 未回収の伏線1つあたりの最終スコア減点（v5.3） */
export const UNRESOLVED_FORESHADOW_PENALTY = 150;

/** 連載の主人公の定義ID。必ず初期キャストに入り、闇堕ちしても陣営は変わらない（v5.2e, v6.2） */
export const PROTAGONIST_ID = 'hero';

/** ルール定数（4.2〜4.3節、v5.2改訂: 手札とプレイは展開カードのみ） */
export const HAND_SIZE = 7;
export const REDRAWS_PER_WEEK = 2;
export const MAX_PLAY_CARDS = 4;
/** ネームストックで翌週へ持ち越せる枚数（v5.2c） */
export const MAX_STOCK = 2;
export const TRAINING_FLAG_MAX = 2;
export const TRAINING_BONUS_PER_FLAG = 3;
/** 鮮度の下限（3.1節）。これ以上は下がらない */
export const FRESHNESS_MIN = 0.25;
/** 今週の話に出演させられるキャラの上限（v6.0） */
export const HIGHLIGHT_LIMIT = 6;
/** 出演していない在籍キャラが人気度に寄与する割合（v6.1） */
export const OFF_STAGE_POPULARITY_RATE = 0.5;
