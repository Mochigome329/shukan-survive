/**
 * 役（コンボ）レジストリ（設計書 14.3節、v5.2改訂）。
 * 役はJSONのDSLではなくTypeScriptの型付きレジストリで定義する。
 * v5.2: キャラは場に常駐するため、条件の「キャラ」は場のキャスト全員を指す。
 * 週の選択は展開カード（最大4枚）とその対象割当。
 *
 * 現在は第1層・スコア計算前の役のみ。仕込み役・連続週役・事後役（7.4〜7.5節）はM3で追加する。
 */
import { PROTAGONIST_ID } from './types';
import type {
  Act,
  CardInstance,
  CharacterCardDefinition,
  ComboScoreDetail,
  ComboUsageState,
  CutInTemplate,
  DevelopmentCardDefinition,
  StateChange,
} from './types';

export interface CastCharacter {
  instance: CardInstance;
  def: CharacterCardDefinition;
}

export interface PlayedDevelopment {
  instance: CardInstance;
  def: DevelopmentCardDefinition;
  targetId?: string;
}

/** 条件関数への入力（プレイ開始時点のスナップショット） */
export interface ComboMatchInput {
  week: number;
  /** 場のキャスト全員（v5.2: 常駐） */
  characters: CastCharacter[];
  /** 今週プレイした展開カード */
  developments: PlayedDevelopment[];
  /** 所持している伏線トークン（役「伏線回収」の効果量に使う） */
  foreshadowTokens: number;
  /** 伏線を張った話数の一覧（寝かせた週数のボーナスに使う、v5.3） */
  foreshadowWeeks: readonly number[];
  /** 死亡済みキャラ（世代交代の判定に使う） */
  deadCharacters: CastCharacter[];
  /** 前週に成立した役（第2層のメタ役が参照する、7.1節） */
  previousComboIds: readonly string[];
  /** 直近の週ログ（連続週役の判定に使う。新しい順ではなく古い順） */
  recentComboHistory: readonly string[][];
  /** タイムスキップを使った話数（時を越えた再会の判定に使う） */
  timeskipWeek: number | null;
  /** これまでにプレイした展開の定義ID（成長の実感など、過去を参照する役に使う） */
  pastPlayedDefIds: readonly string[];
  /** 解放した緊張の量（カタルシス役の判定に使う、v5.3） */
  stressReleased: number;
  /** 第1層で成立した役のID（第2層の条件関数が参照する） */
  layer1ComboIds: readonly string[];
  /** 週スコアとノルマ（第3層の事後役が参照する） */
  weekScore: number;
  quota: number;
  /** 最終回かどうか（最終回専用役が参照する、v5.9） */
  /**
   * 今週の幕（v7.30）。連載の長さで区切りが変わるので、
   * 役の「序盤限定」「第三幕限定」は話数ではなくこれで判定する
   */
  act: Act;
  isFinale: boolean;
  /**
   * 最終回のベース点（人気度の中央値 × 話題性の中央値、v7.28）。
   * 通常週は0。「有終の美」がノルマの代わりの基準として使う
   */
  finaleBaseScore: number;
  /** 通算で成立させた仕込み役の種類数（完結ボーナスと「伝説の完結」に使う、v5.9） */
  setupComboCount: number;
  /**
   * このキャンペーンでの閾値（v7.30）。連載の長さで積み上がる量が変わるため、
   * 「伝説の完結」の必要種類数と「有終の美」の絶対点はデータ側から渡す
   */
  legendaryCompletionCombos: number;
  yuushuuMinScore: number;
}

/** 成立1件。対象束縛（7.2節）まで含める */
export interface ComboMatch {
  boundCharIds: string[];
}

export interface ComboDefinition {
  id: string;
  name: string;
  /** 第1〜3層（7.1節）。現在は第1層のみ */
  layer: 1 | 2 | 3;
  phase: 'preScore' | 'postScore';
  suppresses: string[];
  oncePerRun?: boolean;
  /** 対象束縛キャラごとに1回まで（かませ犬など、5.5節） */
  oncePerCharacter?: boolean;
  cutInTemplate: CutInTemplate;
  /**
   * カットインに重ねる描き文字を役ごとに指定する（v7.14）。
   * 省略すると cutInTemplate ごとの候補から、役IDのハッシュで自動的に選ばれる。
   * 「この役にはこの音を当てたい」というときだけ書けばよい。
   * 使える値は src/data/sfx.json のキー（役・カード一覧の編集画面に一覧が出る）
   */
  sfxId?: string;
  popularityAdd: number;
  buzzAdd: number;
  /** 週スコア乗算（7.6節: 最高倍率の1つだけ適用される） */
  scoreMultiplier?: number;
  /** 束縛したキャラの人気度乗算（6.3節の手順3） */
  charMultiplier?: number;
  /** 仕込み役（完結ボーナスの対象。11節） */
  isSetupCombo?: boolean;
  /** 効果量が状況で変わる役（伏線回収）の話題性加算。指定時はbuzzAddより優先する */
  dynamicBuzz?: (input: ComboMatchInput) => number;
  /** カットインに添える追加効果の説明文 */
  extraText?: string;
  /** 役図鑑: 未発見時のあいまいヒント（3.4節） */
  hintText: string;
  /** 役図鑑: 発見後の正確な条件文 */
  conditionText: string;
  /** 数値以外の状態変化（陣営変化・恒久補正など）を生成する */
  extraChanges?: (match: ComboMatch, input: ComboMatchInput) => StateChange[];
  /** 成立判定。複数成立（加算型の重複、7.2節）は配列で返す */
  match: (input: ComboMatchInput) => ComboMatch[];
}

/**
 * 「有終の美」の判定倍率（v7.28）。
 * 最終回のノルマ廃止で「ノルマの2倍」が使えなくなったので、
 * その連載自身のベース点（人気度・話題性の中央値の積）の3倍を代わりの基準にする。
 * 結末カードの倍率（最大×4）と完結ボーナス（最大×2）が乗れば届く水準。
 * finale.ts が combos.ts を参照しているため、循環参照を避けてこちらに置いてある
 */
export const YUUSHUU_NO_BI_RATIO = 3;

/**
 * 「有終の美」の絶対下限（v7.29、gpt-5.6-solのシミュレーション分析に基づく修正）。
 * ベース点の3倍という相対条件だけだと、ベース点そのものが低い（弱い）連載ほど
 * 結末カードの定額加算（後日談の「キャスト全員+10」等）が相対的に大きく効いてしまい、
 * 「弱い連載ほど有終の美を取りやすい」という逆転現象が数式上確実に起きる
 * （後日談の場合、比率 = 完結ボーナス × (1+10N/人気度) × (1+3/話題性) で、
 * 人気度・話題性が低いほど単調に増える）。相対条件はそのまま残し、
 * 絶対点の下限をAND条件で足して歯止めをかける。
 * 閾値10,000はシミュレーション実測（best戦略のP10が16,329）を踏まえた初期値で、
 * 大規模な再計測をしたら見直す想定
 */
export const YUUSHUU_NO_BI_MIN_SCORE = 10000;

const hasDev = (input: ComboMatchInput, defId: string) => input.developments.some((d) => d.def.id === defId);
const devsOf = (input: ComboMatchInput, defId: string) => input.developments.filter((d) => d.def.id === defId);
const countDev = (input: ComboMatchInput, defId: string) => devsOf(input, defId).length;
const castById = (input: ComboMatchInput, instanceId: string) =>
  input.characters.find((c) => c.instance.instanceId === instanceId);
const castPopularity = (c: CastCharacter) => c.def.popularity + c.instance.permanentPopularityBonus;

/**
 * 「仲間だった者が敵側に回る」展開（v7.16）。
 *
 * 「裏切り」と「闇堕ち」は、読者から見れば同じ出来事なので、
 * 裏切りを条件にしている役はどちらでも成立させる。
 * 主人公が寝返る話は別の筋なので、闇堕ち側では主人公を除く
 * （カードの仕様上そもそも主人公は対象に取れないが、役の側でも明示しておく）。
 */
/**
 * 死亡済みの「味方」だけ（v7.17）。
 * 弔いや生還を扱う役が input.deadCharacters をそのまま見ていたため、
 * 倒した敵が死んでいるだけで「かたき討ち」「奇跡の生還」が成立していた。
 * 悼む相手は味方なので、敵の死は勘定に入れない
 */
const deadAllies = (input: ComboMatchInput) => input.deadCharacters.filter((c) => c.instance.faction === 'ally');

const betrayalDevs = (input: ComboMatchInput) => [
  ...devsOf(input, 'uragiri'),
  ...devsOf(input, 'yamiochi').filter((d) => {
    const target = d.targetId ? castById(input, d.targetId) : undefined;
    return !!target && target.def.id !== PROTAGONIST_ID;
  }),
];

/**
 * 敵側から仲間へ戻す系の役が見る発動カード（v7.27）。
 * 「裏切り」を敵キャラに使う（寝返らせる）のと同じ効果を、「おかえり」（元の陣営へ戻す）
 * でも出せるようにした。「あの頃みたいに」「あなたと共に」「勘違いするな」で使う
 */
const comebackDevs = (input: ComboMatchInput) => [...devsOf(input, 'uragiri'), ...devsOf(input, 'okaeri')];

/**
 * 「主役級ではない」キャラ（v5.8b、v6.6でマスコットを追加）。
 * 人気度のしきい値だと育てた相棒が外れたり主人公が入ったりして意図が濁るので、
 * 三枚目・一般人・弱虫・マスコットの4人を名指しで扱う。この4人が見せ場を作る回に役をつける。
 */
const UNDERDOG_IDS = ['sanmaime', 'ippanjin', 'yowamushi', 'mascot'];
const underdogsOf = (input: ComboMatchInput) => input.characters.filter((c) => UNDERDOG_IDS.includes(c.def.id));

/**
 * 主人公を導く「師」的な立場のキャラ（v6.5）。
 * 師匠だけでなく父・母も、主人公にとっての導き手になりうる。
 * 「先駆者との別れ」「意志を継ぐ者」「先駆者の力」はこの3人のいずれでも成立する。
 */
const MENTOR_IDS = ['shishou', 'chichi', 'haha'];

/** 敵幹部の2バリエーション（パワータイプ・頭脳タイプ、v6.6）。役「昇進と粛清」はどちらでも成立する */
const TEKI_KANBU_IDS = ['teki_kanbu_power', 'teki_kanbu_brain'];

/** 意味が正反対の展開の組（役「どんでん返し」。同じ週に両方出ると成立する） */
const OPPOSITE_PAIRS: [string, string][] = [
  ['uragiri', 'kaishin'],
  ['yamiochi', 'kaishin'],
  ['dai_shouri', 'haiboku'],
  ['dai_shouri', 'dai_pinch'],
  ['shibou', 'fukkatsu'],
  ['oogenka', 'nakanaori'],
  ['zenmetsu', 'zenin_seikan'],
];

/** 役レジストリ。数値はメタデータ側に置き、条件関数には埋め込まない */
export const COMBO_REGISTRY: ComboDefinition[] = [
  // ===== 話数限定・導入役（v5.2追加: 序盤から役が光る） =====
  {
    id: 'hijou_e',
    name: '非日常へ',
    layer: 1,
    phase: 'preScore',
    // v5.8c: 「緩急」は第2話以降限定なので第1話限定のこの役とは同時成立しない。
    // 抑制指定は死んでいたため外した（残すのは「平和な日常」だけ）
    suppresses: ['heiwa_na_nichijou'],
    cutInTemplate: 'normal',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '日常が壊れる瞬間に物語は大きく動く',
    conditionText: '第1話に「日常回」と「バトル」を同時にプレイ',
    match: (input) => (input.week === 1 && hasDev(input, 'nichijou') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kaomise',
    name: '顔見せ回',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '新しい顔ぶれを、日常の中で読者に紹介',
    conditionText: '第一幕のうちに「新キャラ登場」と「日常回」を同時にプレイ',
    match: (input) => (input.act === 'jo' && hasDev(input, 'shinchara') && hasDev(input, 'nichijou') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'tabidachi',
    name: '旅立ち',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '新しい仲間と困難を乗り越えはじめる',
    conditionText: '第一幕のうちに「新キャラ登場」と「敵組織の襲来」か「悲劇」を同時にプレイ',
    match: (input) =>
      input.act === 'jo' && hasDev(input, 'shinchara') && (hasDev(input, 'teki_soshiki') || hasDev(input, 'higeki'))
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'saisho_no_shiren',
    name: '最初の試練',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'dododo',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '序盤の敗北はその後の成長の約束',
    conditionText: '第一幕のうちに「バトル」と「敗北」を同時にプレイ',
    match: (input) => (input.act === 'jo' && hasDev(input, 'battle') && hasDev(input, 'haiboku') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'shi_tono_deai',
    name: '師との出会い',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '導く者との出会い',
    conditionText: '第一幕のうちに、師匠が場にいる状態で「修行」をプレイ',
    match: (input) =>
      input.act === 'jo' && input.characters.some((c) => c.def.id === 'shishou') && hasDev(input, 'shugyou')
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'boy_meets_girl',
    name: 'ボーイミーツガール',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'dokidoki',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '少年と少女の出会いが運命を回し始める',
    // v5.8b: 「揃った状態で運命的な出会い」だと運命の相手が別キャラになってしまうので、
    // ヒロイン本人をデビューさせた週だけ成立するようにした
    conditionText: '第一幕のうちに「運命的な出会い」でヒロインをデビューさせる',
    match: (input) => {
      if (input.act !== 'jo') return [];
      const hero = input.characters.find((c) => c.def.id === 'hero');
      const heroine = input.characters.find((c) => c.def.id === 'heroine');
      if (!hero || !heroine) return [];
      const metHer = devsOf(input, 'unmei_deai').some((d) => d.targetId === heroine.instance.instanceId);
      return metHer
        ? [{ boundCharIds: [hero.instance.instanceId, heroine.instance.instanceId] }]
        : [];
    },
  },
  {
    id: 'shukuteki_tono_kaikou',
    name: '宿敵との邂逅',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '生涯の敵と初めて刃を交える',
    conditionText: '第一幕のうちに、敵キャラをデビューさせた週に「バトル」をプレイ',
    match: (input) => {
      if (input.act !== 'jo' || !hasDev(input, 'battle')) return [];
      return input.developments
        .filter((d) => d.def.effects.some((e) => e.effect.type === 'debutSelect') && !!d.targetId)
        .map((d) => castById(input, d.targetId!))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    id: 'inou_no_mebae',
    name: '異能の芽生え',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '自分でも知らなかった力に触れる',
    conditionText: '第一幕のうちに、主人公を対象に「能力覚醒」か「才能の片鱗」をプレイ',
    match: (input) => {
      if (input.act !== 'jo') return [];
      const hero = input.characters.find((c) => c.def.id === 'hero');
      if (!hero) return [];
      const target = hero.instance.instanceId;
      const awakened =
        devsOf(input, 'nouryoku_kakusei').some((d) => d.targetId === target) ||
        devsOf(input, 'sainou_no_henrin').some((d) => d.targetId === target);
      return awakened ? [{ boundCharIds: [target] }] : [];
    },
  },
  {
    id: 'unmei_no_deai',
    name: '運命の出会い',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '運命の出会いが物語を駆動する',
    conditionText: '第一幕のうちに「運命的な出会い」でキャラをデビューさせる',
    match: (input) => (input.act === 'jo' && hasDev(input, 'unmei_deai') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kankyuu',
    name: '緩急',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 2,
    hintText: '静と動を併せて描く',
    conditionText: '第2話以降に「日常回」と「バトル」を同時にプレイ',
    match: (input) => (input.week >= 2 && hasDev(input, 'nichijou') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'tokkun_kai',
    name: '特訓回',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 2,
    hintText: '鍛えて、鍛えて、鍛えまくる',
    conditionText: '「修行」を2枚同時にプレイ',
    match: (input) => (countDev(input, 'shugyou') >= 2 ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'heiwa_na_nichijou',
    name: '平和な日常',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'waiwai',
    popularityAdd: 0,
    buzzAdd: 2,
    hintText: 'なにも起こらない週にも価値がある',
    conditionText: '「日常回」を2枚以上同時にプレイ',
    match: (input) => (countDev(input, 'nichijou') >= 2 ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'ubawareta_nichijou',
    name: '奪われた日常',
    layer: 1,
    phase: 'preScore',
    suppresses: ['heiwa_na_nichijou'],
    cutInTemplate: 'shock',
    sfxId: 'interrobang',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '平和な日々が壊されるとき',
    conditionText: '「日常回」+「悲劇」または「敵組織の襲来」を同時にプレイ',
    match: (input) =>
      hasDev(input, 'nichijou') && (hasDev(input, 'higeki') || hasDev(input, 'teki_soshiki')) ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'himeta_chikara',
    name: '秘めた力',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'dododo',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '戦いの中で力が目を覚ます',
    conditionText: '「能力覚醒」+「バトル」を同時にプレイ',
    match: (input) => (hasDev(input, 'nouryoku_kakusei') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kyara_horisage',
    name: 'キャラの掘り下げ',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '何気ない時に見せるその素顔',
    conditionText: '「意外な一面」+「日常回」を同時にプレイ',
    match: (input) => (hasDev(input, 'igai_na_ichimen') && hasDev(input, 'nichijou') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kyouteki_no_kabe',
    name: '強敵の壁',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '強大な敵に挑む',
    conditionText: '敵陣営の合計人気が仲間陣営を上回る状態で「バトル」をプレイ',
    match: (input) => {
      if (!hasDev(input, 'battle')) return [];
      const enemyTotal = input.characters.filter((c) => c.instance.faction === 'enemy').reduce((s, c) => s + castPopularity(c), 0);
      const allyTotal = input.characters.filter((c) => c.instance.faction === 'ally').reduce((s, c) => s + castPopularity(c), 0);
      return enemyTotal > allyTotal ? [{ boundCharIds: [] }] : [];
    },
  },

  // ===== 基本役（7.3節） =====
  {
    id: 'fukusen_kaishu',
    name: '伏線回収',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 0,
    // 話題性 = 2×本数 + 寝かせた週数の合計（長く引っ張った伏線ほど盛り上がる、v5.3）
    dynamicBuzz: (input) =>
      2 * input.foreshadowTokens + input.foreshadowWeeks.reduce((sum, w) => sum + Math.min(8, input.week - w), 0),
    extraText: '張った伏線をすべて消費する',
    hintText: '張った伏線は回収しましょう',
    conditionText: '伏線を張った状態で「伏線回収」をプレイ（話題性 +2×本数 +寝かせた週数）',
    match: (input) =>
      input.foreshadowTokens > 0 && hasDev(input, 'fukusen_kaishu') ? [{ boundCharIds: [] }] : [],
    extraChanges: () => [{ type: 'consumeForeshadowTokens' }],
  },
  {
    id: 'shougeki_no_uragiri',
    name: '衝撃の裏切り',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'interrobang',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '信頼している者の裏切り',
    conditionText: '仲間キャラを対象に「裏切り」か「闇堕ち」をプレイ',
    match: (input) =>
      betrayalDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'ally')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
  },
  {
    id: 'shitto_shin',
    name: '嫉妬心',
    layer: 1,
    phase: 'preScore',
    suppresses: ['shougeki_no_uragiri'],
    cutInTemplate: 'emotion',
    sfxId: 'interrobang',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: 'そのキャラの人気度が恒久+4',
    hintText: '近いからこそ、こじれた想い',
    // v6.6: ライバルの味方→敵の裏切りもここに合流させた（嫉妬という動機がよく合うため）
    conditionText: '仲間の「幼なじみ」「相棒」「ライバル」のいずれかを対象に「裏切り」か「闇堕ち」をプレイ（人気度 恒久+4）',
    match: (input) =>
      betrayalDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter(
          (c): c is CastCharacter =>
            !!c && c.instance.faction === 'ally' && (c.def.id === 'osananajimi' || c.def.id === 'aibou' || c.def.id === 'rival'),
        )
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 4 }],
  },
  {
    id: 'shishinchuu_no_mushi',
    name: '獅子心中の虫',
    layer: 1,
    phase: 'preScore',
    suppresses: ['shougeki_no_uragiri'],
    cutInTemplate: 'shock',
    sfxId: 'interrobang',
    popularityAdd: 0,
    // v7.2: 嫉妬心・あの頃みたいに・勘違いするなと同じ6に統一（ヒロインの絶望/あなたと共にだけ8のまま特別扱い）。
    // スコア最大化だけを考えるとヒロインを裏切らせるのが常に正解になってしまうのを避けるため、
    // ユーザーの意向で「ヒロインだけ高くて、あとは横並び」にした
    buzzAdd: 6,
    extraText: 'そのキャラの人気度が恒久+4',
    hintText: '無害さは仮面である',
    conditionText: '仲間の「マスコット」を対象に「裏切り」か「闇堕ち」をプレイ（人気度 恒久+4）',
    match: (input) =>
      betrayalDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'ally' && c.def.id === 'mascot')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 4 }],
  },
  {
    id: 'zetsubou',
    name: '絶望',
    layer: 1,
    phase: 'preScore',
    suppresses: ['shougeki_no_uragiri'],
    cutInTemplate: 'shock',
    sfxId: 'interrobang',
    popularityAdd: 0,
    // v7.2: ヒロインの裏切り絡みだけは意図的に他の裏切り専用役（6）より高い8のまま。
    // 「誰を裏切らせても等しく報われる」よりも「ヒロインの裏切りは特別」を優先したユーザー判断
    buzzAdd: 8,
    extraText: '緊張+2',
    hintText: 'いちばん信じていた相手だからこそ',
    conditionText: '仲間の「ヒロイン」を対象に「裏切り」か「闇堕ち」をプレイ（緊張+2）',
    match: (input) =>
      betrayalDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'ally' && c.def.id === 'heroine')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: () => [{ type: 'addStress', amount: 2 }],
  },
  {
    id: 'ano_koro_mitaini',
    name: 'あの頃みたいに',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: 'そのキャラの人気度が恒久+4',
    hintText: 'またお前と同じ側に立てる',
    conditionText: '敵の「幼なじみ」か「相棒」を対象に「裏切り」か「おかえり」をプレイ（仲間へ戻る。人気度 恒久+4、v7.27）',
    match: (input) =>
      comebackDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy' && (c.def.id === 'osananajimi' || c.def.id === 'aibou'))
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 4 }],
  },
  {
    id: 'anata_to_tomoni',
    name: 'あなたと共に',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'jiin',
    popularityAdd: 0,
    // v7.2: zetsubou（ヒロインを裏切らせる側）と対の「ヒロインが戻ってくる」側。
    // 同じ理由でヒロイン絡みだけ意図的に他の裏切り専用役（6）より高い8のまま
    buzzAdd: 8,
    extraText: '緊張を全解放',
    hintText: '離れていた時間の分だけ想いは募る',
    conditionText: '敵の「ヒロイン」を対象に「裏切り」か「おかえり」をプレイ（仲間へ戻る。緊張を全解放、v7.27）',
    match: (input) =>
      comebackDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy' && c.def.id === 'heroine')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: () => [{ type: 'releaseStress' }],
  },
  {
    id: 'kanchigai_suruna',
    name: '勘違いするな',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: 'そのキャラの人気度が恒久+4',
    hintText: 'お前を倒すのはこの俺だ',
    conditionText: '敵の「ライバル」を対象に「裏切り」か「おかえり」をプレイ（仲間へ戻る。人気度 恒久+4、v7.27）',
    match: (input) =>
      comebackDevs(input)
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy' && c.def.id === 'rival')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 4 }],
  },
  {
    id: 'kanashiki_akuyaku',
    name: '悲しき悪役',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'horori',
    popularityAdd: 0,
    buzzAdd: 3,
    extraText: 'そのキャラの人気度が恒久+5',
    hintText: '悪の過去が明かされるとき',
    conditionText: '敵キャラを対象に「悲しい過去」をプレイ（人気度 恒久+5。週に1回まで）',
    /*
     * v7.17: 週に1回だけにした。以前は対象ごとに成立を返していたので、
     * 同じ週に「悲しい過去」を2枚別々の敵へ使うと役が二重に乗っていた。
     * 掘り下げる過去は週に一つ、という扱いにして、
     * 複数いるときは人気度がいちばん高い敵を選ぶ
     */
    match: (input) => {
      const targets = devsOf(input, 'kanashii_kako')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy');
      if (targets.length === 0) return [];
      const chosen = targets.reduce((a, b) => (castPopularity(b) > castPopularity(a) ? b : a));
      return [{ boundCharIds: [chosen.instance.instanceId] }];
    },
    // v5.3b: 陣営転向は「改心」など専用カードの役割にし、この役は人気度の強化に変更
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 5 }],
  },
  {
    id: 'kaishin_no_monogatari',
    name: '改心の物語',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '過去を乗り越え共に並び立つ',
    conditionText: '同じ敵キャラを対象に「悲しい過去」と「改心」をプレイ',
    match: (input) =>
      input.characters
        .filter(
          (c) =>
            c.instance.faction === 'enemy' &&
            devsOf(input, 'kanashii_kako').some((d) => d.targetId === c.instance.instanceId) &&
            devsOf(input, 'kaishin').some((d) => d.targetId === c.instance.instanceId),
        )
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
  },
  {
    id: 'dark_hero',
    name: 'ダークヒーロー',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '闇に落ちたヒーロー',
    conditionText: '主人公を対象に「闇堕ち」をプレイ',
    match: (input) => {
      const hero = input.characters.find((c) => c.def.id === 'hero');
      if (!hero) return [];
      return devsOf(input, 'yamiochi').some((d) => d.targetId === hero.instance.instanceId)
        ? [{ boundCharIds: [hero.instance.instanceId] }]
        : [];
    },
  },
  {
    id: 'oudou',
    name: '王道',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'don',
    popularityAdd: 10,
    buzzAdd: 0,
    hintText: '鍛錬＆バトルの王道展開',
    conditionText: '主人公が場にいる状態で「バトル」+主人公対象の「修行」',
    match: (input) => {
      const hero = input.characters.find((c) => c.def.id === 'hero');
      if (!hero || !hasDev(input, 'battle')) return [];
      const trained = devsOf(input, 'shugyou').some((d) => d.targetId === hero.instance.instanceId);
      return trained ? [{ boundCharIds: [hero.instance.instanceId] }] : [];
    },
  },
  {
    id: 'rival_taiketsu',
    name: 'ライバル対決',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'katsu',
    popularityAdd: 15,
    buzzAdd: 0,
    hintText: '宿命の二人が拳を交えるとき',
    conditionText: '主人公とライバルが場にいる状態で「バトル」をプレイ',
    match: (input) => {
      const hero = input.characters.find((c) => c.def.id === 'hero');
      const rival = input.characters.find((c) => c.def.id === 'rival');
      if (!hero || !rival || !hasDev(input, 'battle')) return [];
      return [{ boundCharIds: [hero.instance.instanceId, rival.instance.instanceId] }];
    },
  },
  {
    id: 'kamase_inu',
    name: 'かませ犬',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    oncePerCharacter: true,
    cutInTemplate: 'normal',
    sfxId: 'interrobang',
    popularityAdd: 0,
    buzzAdd: 3,
    extraText: '敵キャラの人気度が恒久+5',
    hintText: '今日出たばかりですぐ退場',
    conditionText: '「新キャラ登場」で出したキャラを対象に同じ週「途中離脱」か「撃破」+「バトル」をプレイ（新顔ごとに1回）',
    match: (input) => {
      if (!hasDev(input, 'battle')) return [];
      // 退場のさせ方は問わない。味方として出た新顔は「途中離脱」、敵として出た新顔は「撃破」で送り出せる
      const departedIds = new Set(
        [...devsOf(input, 'ridatsu'), ...devsOf(input, 'gekiha')]
          .map((d) => d.targetId)
          .filter((id): id is string => !!id),
      );
      const mobId = devsOf(input, 'shinchara')
        .map((d) => d.targetId)
        .find((id): id is string => !!id && departedIds.has(id));
      if (!mobId) return [];
      const enemies = input.characters.filter((c) => c.instance.faction === 'enemy' && c.instance.instanceId !== mobId);
      if (enemies.length === 0) return [];
      const chosen = enemies.reduce((a, b) => (castPopularity(b) > castPopularity(a) ? b : a));
      return [{ boundCharIds: [mobId, chosen.instance.instanceId] }];
    },
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[1]!, amount: 5 }],
  },
  {
    id: 'hissatsu_hatsuhirou',
    name: '必殺技初披露',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    oncePerRun: true,
    cutInTemplate: 'normal',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 2,
    extraText: '以後このラン、バトルの話題性が恒久+1',
    hintText: '修行の成果を見せてやる',
    conditionText: '「バトル」+「修行」を同じ週にプレイ（ラン1回）',
    match: (input) => (hasDev(input, 'battle') && hasDev(input, 'shugyou') ? [{ boundCharIds: [] }] : []),
    extraChanges: () => [{ type: 'permanentBuzzByDef', definitionId: 'battle', amount: 1 }],
  },
  {
    id: 'shujinkou_shibou',
    name: '主人公死亡',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'interrobang',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '名の通りの禁じ手',
    conditionText: '主人公を対象に「死亡」をプレイ',
    match: (input) => {
      const hero = input.characters.find((c) => c.def.id === 'hero');
      if (!hero) return [];
      const died = devsOf(input, 'shibou').some((d) => d.targetId === hero.instance.instanceId);
      return died ? [{ boundCharIds: [hero.instance.instanceId] }] : [];
    },
  },
  {
    id: 'omoi_todokazu',
    name: '思い届かず',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'horori',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: '緊張+1',
    hintText: '心は戻らないままもう戻らない',
    conditionText: '裏切り・洗脳・闇堕ちなどで敵になった仲間を対象に「死亡」をプレイ',
    match: (input) => {
      const dead = devsOf(input, 'shibou')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .find((c): c is CastCharacter => !!c && c.instance.faction === 'enemy' && c.instance.debutFaction === 'ally');
      return dead ? [{ boundCharIds: [dead.instance.instanceId] }] : [];
    },
    extraChanges: () => [{ type: 'addStress', amount: 1 }],
  },

  // ===== 仕込み役（7.4節、M3） =====
  {
    id: 'shitei_no_wakare',
    name: '先駆者との別れ',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'emotion',
    sfxId: 'poroporo',
    popularityAdd: 0,
    buzzAdd: 2,
    // v7.4: 覚醒フラグ（隠し状態）を廃止し、この役の成立そのものを「継承の覚醒」の前提条件にした
    extraText: '「継承の覚醒」の前提になる',
    hintText: '導く者を失ったとき',
    conditionText: '師匠・父・母のいずれかを対象に「死亡」をプレイ',
    match: (input) => {
      const dead = devsOf(input, 'shibou')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .find((c): c is CastCharacter => !!c && MENTOR_IDS.includes(c.def.id));
      if (!dead) return [];
      const hero = input.characters.find((c) => c.def.id === 'hero');
      return hero ? [{ boundCharIds: [dead.instance.instanceId, hero.instance.instanceId] }] : [];
    },
  },
  {
    /**
     * v7.4: 旧「覚醒」。カード「能力覚醒」「真の覚醒」と役「覚醒」と隠しフラグ「覚醒フラグ」で
     * 同じ語が4か所に出て紛らわしかったため、役名を「継承の覚醒」に変えて意味を絞った。
     * 判定もキャラのフラグではなく「過去に先駆者との別れを成立させたか」（週ログ）で見る。
     * 物語の筋（導いてくれた人を失う → のちに主人公が覚醒する）はそのまま
     */
    id: 'keishou_no_kakusei',
    name: '継承の覚醒',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    scoreMultiplier: 3,
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: '週スコア×3',
    hintText: '真の力を解き放つ',
    conditionText: '過去に「先駆者との別れ」を成立させた状態で、主人公を対象に「真の覚醒」をプレイ（週スコア×3）',
    match: (input) => {
      const mourned = input.recentComboHistory.some((ids) => ids.includes('shitei_no_wakare'));
      if (!mourned) return [];
      return devsOf(input, 'kakusei')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.def.id === PROTAGONIST_ID)
        .map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    id: 'ryouomoi',
    name: '両想い',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    scoreMultiplier: 2.5,
    cutInTemplate: 'setupPayoff',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: '週スコア×2.5。恋愛フラグを消費する',
    hintText: '想いが通じ合う瞬間',
    conditionText: '恋愛フラグ所持キャラを対象に「告白」をプレイ（週スコア×2.5）',
    match: (input) =>
      devsOf(input, 'kokuhaku')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.flags.love)
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: (match) => [{ type: 'consumeLoveFlag', instanceId: match.boundCharIds[0]! }],
  },
  {
    id: 'jitsuha_ikiteita',
    name: '実は生きていた',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: 'まさかの帰還',
    conditionText: '「復活」で死亡済みキャラを場に戻す（復活したキャラごとに成立）',
    match: (input) =>
      devsOf(input, 'fukkatsu')
        .filter((d) => !!d.targetId)
        .map((d) => ({ boundCharIds: [d.targetId!] })),
  },
  {
    id: 'shukumei_no_saikai',
    name: '宿命の再会',
    layer: 1,
    phase: 'preScore',
    // v6.6: 「裏切り」の対象が幼なじみ・相棒・ライバル・マスコット・ヒロインのときは、
    // 陣営の向き（味方→敵／敵→味方）を問わず専用役とも条件が重なるため、そちらもすべて抑制する
    suppresses: [
      'kanashiki_akuyaku',
      'shougeki_no_uragiri',
      'shitto_shin',
      'shishinchuu_no_mushi',
      'zetsubou',
      'ano_koro_mitaini',
      'anata_to_tomoni',
      'kanchigai_suruna',
    ],
    isSetupCombo: true,
    charMultiplier: 3,
    cutInTemplate: 'setupPayoff',
    sfxId: 'interrobang',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'そのキャラの人気度×3',
    hintText: 'あいつに一体何があったのか',
    conditionText: '当週再登場したキャラを対象に「裏切り」か「闇堕ち」と、「悲しい過去」を同時プレイ',
    match: (input) =>
      input.characters
        .filter(
          (c) =>
            c.instance.returnedThisWeek &&
            betrayalDevs(input).some((d) => d.targetId === c.instance.instanceId) &&
            devsOf(input, 'kanashii_kako').some((d) => d.targetId === c.instance.instanceId),
        )
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
  },
  {
    id: 'toki_wo_koeta_saikai',
    name: '時を越えた再会',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    charMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: 'そのキャラの人気度×2',
    hintText: '流れた時の分感動はひとしお',
    conditionText: '「タイムスキップ」の翌週に再登場したキャラ（キャラごとに成立）',
    match: (input) =>
      input.timeskipWeek !== null && input.week === input.timeskipWeek + 1
        ? input.characters.filter((c) => c.instance.returnedThisWeek).map((c) => ({ boundCharIds: [c.instance.instanceId] }))
        : [],
  },
  {
    id: 'kuromaku_no_shoutai',
    name: '黒幕の正体',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    charMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: 'その敵キャラの人気度×2',
    hintText: 'すべての謎がひとりの敵につながる',
    conditionText: '伏線トークン3個以上を「伏線回収」で消費し、場に敵キャラがいる',
    match: (input) => {
      if (input.foreshadowTokens < 3 || !hasDev(input, 'fukusen_kaishu')) return [];
      const enemies = input.characters.filter((c) => c.instance.faction === 'enemy');
      if (enemies.length === 0) return [];
      const chosen = enemies.reduce((a, b) => (castPopularity(b) > castPopularity(a) ? b : a));
      return [{ boundCharIds: [chosen.instance.instanceId] }];
    },
  },
  {
    id: 'sedai_koutai',
    name: '世代交代',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    oncePerCharacter: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 4,
    extraText: 'そのキャラの人気度が恒久+8',
    hintText: '主人公を失った物語は次世代が引き継ぐ',
    conditionText: '主人公が死亡済みの状態で、入手から3週以内のキャラが場にいる',
    match: (input) => {
      const heroDead = input.deadCharacters.some((c) => c.def.id === 'hero');
      if (!heroDead) return [];
      const rookies = input.characters.filter(
        (c) => c.def.id !== 'hero' && input.week - c.instance.acquiredWeek <= 3 && c.instance.acquiredWeek > 0,
      );
      if (rookies.length === 0) return [];
      const chosen = rookies.reduce((a, b) => (castPopularity(b) > castPopularity(a) ? b : a));
      return [{ boundCharIds: [chosen.instance.instanceId] }];
    },
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 8 }],
  },
  {
    id: 'innen_no_taiketsu',
    name: '因縁の対決',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '長く戦ってきた相手との決着',
    // v7.4: 「撃破」でも成立するようにした。敵を退場させる手段が死亡だけではないのに
    // 決着の役が死亡限定だったため、倒し方によって役が消えていた
    conditionText: '3週以上登場した敵キャラを対象に「死亡」か「撃破」+「バトル」をプレイ',
    match: (input) => {
      if (!hasDev(input, 'battle')) return [];
      return [...devsOf(input, 'shibou'), ...devsOf(input, 'gekiha')]
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy' && c.instance.playCount >= 3)
        // 死亡と撃破を同じ敵に重ねられた場合に二重成立させない
        .filter((c, i, arr) => arr.findIndex((x) => x.instance.instanceId === c.instance.instanceId) === i)
        .map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },

  // ===== カタルシス系・展開役（v5.3） =====
  {
    id: 'seichou_no_jikkan',
    name: '成長の実感',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '負けた相手に勝つまでの道のり',
    conditionText: '過去に「敗北」した後、「修行」か「技ゲット」を経て「大勝利」をプレイ',
    match: (input) => {
      const lost = input.recentComboHistory.length > 0 && input.pastPlayedDefIds.includes('haiboku');
      const trained = input.pastPlayedDefIds.includes('shugyou') || input.pastPlayedDefIds.includes('waza_get');
      return lost && trained && hasDev(input, 'dai_shouri') ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    id: 'giant_killing',
    name: 'ジャイアントキリング',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '格上を食う大金星',
    conditionText: '敵陣営の合計人気が仲間を上回る状態で「大勝利」をプレイ',
    match: (input) => {
      if (!hasDev(input, 'dai_shouri')) return [];
      const enemy = input.characters.filter((c) => c.instance.faction === 'enemy').reduce((s, c) => s + castPopularity(c), 0);
      const ally = input.characters.filter((c) => c.instance.faction === 'ally').reduce((s, c) => s + castPopularity(c), 0);
      return enemy > ally ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    id: 'densho',
    name: '意志を継ぐ者',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: 'まだあなたほどうまくはできませんが…',
    conditionText: '仲間の師匠・父・母のいずれかが死亡済みの状態で「技ゲット」をプレイ',
    match: (input) => {
      if (!hasDev(input, 'waza_get')) return [];
      return deadAllies(input).some((c) => MENTOR_IDS.includes(c.def.id)) ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    id: 'soumatou',
    name: '走馬灯',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'poroporo',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '最期に流れるあたたかな思い出',
    conditionText: '「回想」と「死亡」を同じ週にプレイ',
    match: (input) => (hasDev(input, 'kaisou') && hasDev(input, 'shibou') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'missing_link',
    name: 'ミッシングリンク',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '過去の断片と明かされる真相',
    conditionText: '「回想」と「伏線回収」を同じ週にプレイ',
    match: (input) => (hasDev(input, 'kaisou') && hasDev(input, 'fukusen_kaishu') ? [{ boundCharIds: [] }] : []),
  },
  {
    // v7.3: ユーザー提案。「数年後──」のタイムスキップを回想で受けると、
    // 飛ばした時間そのものが読者に伝わる。素材のタイムスキップが第9話解禁・1枚しか持てないぶん、
    // 同じ2枚組の走馬灯（5）やミッシングリンク（4）より高めの8にした
    id: 'sorekara_toki_ga_tatta',
    name: 'それから時が経った',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '飛ばした年月を振り返る',
    conditionText: '「タイムスキップ」と「回想」を同じ週にプレイ',
    match: (input) => (hasDev(input, 'timeskip') && hasDev(input, 'kaisou') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'ano_koro_no_bokutachi',
    name: 'あの頃の僕たち',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'horori',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '幼なじみと過ごした日々',
    conditionText: '場に「幼なじみ」がいる状態で「回想」をプレイ',
    match: (input) => {
      const osananajimi = input.characters.find((c) => c.def.id === 'osananajimi');
      return osananajimi && hasDev(input, 'kaisou') ? [{ boundCharIds: [osananajimi.instance.instanceId] }] : [];
    },
  },
  {
    id: 'iji_wo_miseru',
    name: '意地を見せる',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'そのキャラの人気度が恒久+6',
    hintText: '弱いやつらが見せた力',
    // v5.8b: 「意外な一面＋裏切り」は裏切り役の話になっていたので、
    // 主役級でない3人が力に目覚めて戦う回に付け替えた。v6.6でマスコットも対象に追加
    conditionText: '「三枚目」「一般人」「弱虫」「マスコット」のいずれかを対象に「能力覚醒」をプレイし、同じ週に「バトル」',
    match: (input) =>
      hasDev(input, 'battle')
        ? underdogsOf(input)
            .filter((c) => devsOf(input, 'nouryoku_kakusei').some((d) => d.targetId === c.instance.instanceId))
            .map((c) => ({ boundCharIds: [c.instance.instanceId] }))
        : [],
    extraChanges: (match) => match.boundCharIds.map((id) => ({ type: 'permanentPopularityAdd', instanceId: id, amount: 6 })),
  },
  {
    id: 'souryokusen_combo',
    name: '総力戦',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: 'みんなで総力戦',
    conditionText: 'キャストが4人以上の状態で「総力戦」をプレイ',
    match: (input) => (hasDev(input, 'souryokusen') && input.characters.length >= 4 ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'taiki_no_yokan',
    name: '大器の予感',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '荒削りな才が戦いの中できらめく',
    conditionText: '「才能の片鱗」と「バトル」を同じ週にプレイ',
    match: (input) => (hasDev(input, 'sainou_no_henrin') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'shinsoubi',
    name: '新装備',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '手に入れた武器は使ってこそ',
    conditionText: '「武器ゲット」と「バトル」を同じ週にプレイ',
    match: (input) => (hasDev(input, 'buki_get') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'densetsu_buki',
    name: '伝説武器ゲット',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'そのキャラの人気度が恒久+3',
    hintText: '伝説通りのあの武器を獲得',
    conditionText: '「伝説を聞く」と「武器ゲット」を同じ週にプレイ（人気度 恒久+3）',
    match: (input) => {
      if (!hasDev(input, 'densetsu')) return [];
      return devsOf(input, 'buki_get')
        .filter((d) => !!d.targetId)
        .map((d) => ({ boundCharIds: [d.targetId!] }));
    },
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 3 }],
  },
  {
    id: 'densetsu_waza',
    name: '伝説技ゲット',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'そのキャラの人気度が恒久+3',
    hintText: '伝説通りのあの技を獲得',
    conditionText: '「伝説を聞く」と「技ゲット」を同じ週にプレイ（人気度 恒久+3）',
    match: (input) => {
      if (!hasDev(input, 'densetsu')) return [];
      return devsOf(input, 'waza_get')
        .filter((d) => !!d.targetId)
        .map((d) => ({ boundCharIds: [d.targetId!] }));
    },
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 3 }],
  },
  {
    id: 'takara_sagashi',
    name: '宝探し',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'waiwai',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '語られた伝承の先に宝を探し当てる',
    conditionText: '「伝説を聞く」と「キーアイテム探し」を同じ週にプレイ',
    match: (input) => (hasDev(input, 'densetsu') && hasDev(input, 'key_item') ? [{ boundCharIds: [] }] : []),
  },

  // ===== 第3部専用役（第17話以降限定。design_finale.md 5節） =====
  {
    // v7.4: 条件を「バトル+総力戦」に変更（旧: バトル+大ピンチ/敗北+場に敵）。
    // 最終決戦なのに敗色の展開が要るのがちぐはぐだったため、総力を挙げてぶつかる形にした。
    // 旧条件は新役「暗雲立ち込める」が引き取っている
    id: 'saishuu_kessen',
    name: '最終決戦',
    layer: 1,
    phase: 'preScore',
    suppresses: ['souryoku_no_kesshuu', 'souryokusen_combo'],
    cutInTemplate: 'shock',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 10,
    hintText: '最後にぶつける総力戦',
    conditionText: '第三幕に入ってから、「バトル」+「総力戦」をプレイ',
    match: (input) =>
      input.act === 'kyu' && hasDev(input, 'battle') && hasDev(input, 'souryokusen') ? [{ boundCharIds: [] }] : [],
  },
  {
    // v7.4: 旧「最終決戦」の条件をこちらへ移した。決着ではなく、終盤に差す不穏さを表す役
    id: 'anun_tachikomeru',
    name: '暗雲立ち込める',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'zawazawa',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '決戦で追い詰められる',
    conditionText: '第三幕に入ってから、場に敵キャラがいる状態で「バトル」+「大ピンチ」か「敗北」をプレイ',
    match: (input) => {
      if (input.act !== 'kyu' || !hasDev(input, 'battle')) return [];
      const hasEnemy = input.characters.some((c) => c.instance.faction === 'enemy');
      const tense = hasDev(input, 'dai_pinch') || hasDev(input, 'haiboku');
      return hasEnemy && tense ? [{ boundCharIds: [] }] : [];
    },
  },
  /*
   * v7.13: 序盤カードの受け皿（4種）。
   *
   * 序盤に引ける展開カードのうち、人助け・見くびられた男・寄り道・因縁は
   * 「役の定義が無い」または「相方カード／特定キャラが揃うまで成立しない」状態で、
   * 序盤に来ても何もできない札になっていた（人助けに至っては単体効果も空）。
   * ここでは初期デッキの固定枠（バトル・修行・新キャラ登場）と必ず組める形にして、
   * 引いた週にそのまま使い道があるようにする。
   * いずれも後半の大きな役への布石でもあるので、話数の制限は付けない
   */
  {
    id: 'misugosenai',
    name: '見過ごせない',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '困っている人を放っておけない',
    conditionText: '「人助け」+「バトル」をプレイ',
    match: (input) => (hasDev(input, 'hitodasuke') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'zassou_damashii',
    name: '雑草魂',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '強くなって見返してやる！',
    conditionText: '「見くびられた男」+「修行」をプレイ',
    match: (input) =>
      hasDev(input, 'mikubirareta_otoko') && hasDev(input, 'shugyou') ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'innen_no_hidane',
    name: '因縁の火種',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'dododo',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '因縁結ぶ戦い',
    conditionText: '「因縁」+「バトル」をプレイ',
    match: (input) => (hasDev(input, 'innen') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'douchuu_no_deai',
    name: '道中の出会い',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 4,
    hintText: '寄り道の先の出会い',
    conditionText: '「寄り道」+「新キャラ登場」か「運命的な出会い」をプレイ',
    match: (input) =>
      hasDev(input, 'yorimichi') && (hasDev(input, 'shinchara') || hasDev(input, 'unmei_deai'))
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    /**
     * v7.13: 惨事系3枚（悲劇・大破壊・大ピンチ）のうち2枚以上で成立する役。
     * 「特定の1組」ではなく「どの2枚でも」成立させることで、
     * 手札事故のときでも惨事カードを腐らせずに済む受け皿にしている。
     * 話数を問わないので、第17話以降の「暗雲立ち込める」「世界の危機」とは
     * 別枠で共存する（あちらの方が条件が狭いぶん倍率も高い）
     */
    id: 'sanji_no_rensa',
    name: '惨事の連鎖',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'dododo',
    popularityAdd: 0,
    buzzAdd: 7,
    extraText: '緊張+1',
    hintText: '連なる破壊と悲劇',
    conditionText: '「悲劇」「大破壊」「大ピンチ」のうち2枚以上をプレイ',
    match: (input) => {
      const count = ['higeki', 'daihakai', 'dai_pinch'].filter((id) => hasDev(input, id)).length;
      return count >= 2 ? [{ boundCharIds: [] }] : [];
    },
    extraChanges: () => [{ type: 'addStress', amount: 1 }],
  },
  {
    id: 'sekai_no_kiki',
    name: '世界の危機',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 9,
    hintText: 'クライマックスに訪れる危機',
    conditionText: '第三幕に入ってから、「敵組織の襲来」+「大ピンチ」をプレイ',
    match: (input) =>
      input.act === 'kyu' && hasDev(input, 'teki_soshiki') && hasDev(input, 'dai_pinch') ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'innen_no_seisan',
    name: '因縁の清算',
    layer: 1,
    phase: 'preScore',
    suppresses: ['innen_no_taiketsu'],
    isSetupCombo: true,
    scoreMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: '週スコア×2',
    hintText: '長く戦い続けた相手との決着',
    conditionText: '第三幕に入ってから、通算5回以上登場した敵キャラを対象に「死亡」をプレイ',
    match: (input) => {
      if (input.act !== 'kyu') return [];
      return devsOf(input, 'shibou')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy' && c.instance.playCount >= 5)
        .map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    id: 'souryoku_no_kesshuu',
    name: '総力の結集',
    layer: 1,
    phase: 'preScore',
    suppresses: ['souryokusen_combo'],
    cutInTemplate: 'normal',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '積み上げてきたキャラが力を合わせる',
    conditionText: '第三幕に入ってから、キャストが5人以上の状態で「総力戦」をプレイ',
    match: (input) =>
      input.act === 'kyu' && hasDev(input, 'souryokusen') && input.characters.length >= 5 ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'ketsui_no_wakare',
    name: '決意の別れ',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'poroporo',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '終盤での悲しき離別',
    conditionText: '第三幕に入ってから、同じキャラを対象に「途中離脱」と「悲しい過去」をプレイ',
    match: (input) => {
      if (input.act !== 'kyu') return [];
      return input.characters
        .filter(
          (c) =>
            devsOf(input, 'ridatsu').some((d) => d.targetId === c.instance.instanceId) &&
            devsOf(input, 'kanashii_kako').some((d) => d.targetId === c.instance.instanceId),
        )
        .map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    id: 'saigo_no_shugyou',
    name: '最後の修行',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'don',
    popularityAdd: 20,
    buzzAdd: 0,
    hintText: '命運駆けた戦いの前に最後の鍛錬',
    conditionText: '第三幕に入ってから、「修行」と「能力覚醒」を同じ週にプレイ',
    match: (input) =>
      input.act === 'kyu' && hasDev(input, 'shugyou') && hasDev(input, 'nouryoku_kakusei') ? [{ boundCharIds: [] }] : [],
  },

  // ===== 関係と成長の役（v5.8: 追加キャラ・追加展開に対応する役） =====
  {
    id: 'chichi_wo_koeru',
    name: '父を超える',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    charMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: '主人公の人気度×2',
    hintText: '父を追いかけ力を解放する',
    /*
     * v7.17: 「場に父がいて主人公が覚醒する」だと、父を序盤に出しただけで
     * 毎週のように成立してしまい、他の役が霞んでいた。
     * 越えるからには一度立ちはだかってもらう必要があるので、
     * 敵に回った父を実際に退場させる週の役に変えた
     */
    conditionText: '敵になった「父」を、同じ週に「撃破」「途中離脱」「死亡」のいずれかで退場させる',
    match: (input) => {
      const hero = input.characters.find((c) => c.def.id === 'hero');
      const father = input.characters.find((c) => c.def.id === 'chichi' && c.instance.faction === 'enemy');
      if (!hero || !father) return [];
      const defeated = ['gekiha', 'ridatsu', 'shibou'].some((devId) =>
        devsOf(input, devId).some((d) => d.targetId === father.instance.instanceId),
      );
      return defeated ? [{ boundCharIds: [hero.instance.instanceId] }] : [];
    },
  },
  {
    id: 'yuuki_no_hatsuro',
    name: '勇気の発露',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    charMultiplier: 3,
    cutInTemplate: 'emotion',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'そのキャラの人気度×3',
    hintText: '弱者が踏み出す小さな一歩',
    conditionText: '「三枚目」「一般人」「弱虫」「マスコット」のいずれかが場にいる状態で「人助け」をプレイ（v6.6でマスコット追加）',
    match: (input) => {
      if (!hasDev(input, 'hitodasuke')) return [];
      const weakest = underdogsOf(input).sort((a, b) => castPopularity(a) - castPopularity(b))[0];
      return weakest ? [{ boundCharIds: [weakest.instance.instanceId] }] : [];
    },
  },
  {
    id: 'igai_no_katsuyaku',
    name: '意外な活躍',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '警戒されていないからこその大活躍',
    conditionText: '「三枚目」「一般人」「弱虫」「マスコット」のいずれかが場にいる状態で「反撃開始」か「大勝利」（v6.6でマスコット追加）',
    match: (input) =>
      (hasDev(input, 'hangeki') || hasDev(input, 'dai_shouri')) && underdogsOf(input).length > 0
        ? [{ boundCharIds: underdogsOf(input).map((c) => c.instance.instanceId) }]
        : [],
  },
  {
    id: 'teki_no_teki',
    name: '敵の敵は味方',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: 'ここは一度拳を収めよう',
    conditionText: '場に敵キャラが2人以上いる状態で「一時休戦」',
    match: (input) =>
      hasDev(input, 'ichiji_kyuusen') && input.characters.filter((c) => c.instance.faction === 'enemy').length >= 2
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'aku_nimo_kizuna',
    name: '悪にも絆',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'horori',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '名もなき誰かと心通わせる悪役',
    conditionText: '場に敵キャラと「一般人」がいる状態で「日常回」か「人助け」をプレイ',
    match: (input) => {
      // 悪役と一般人が心を通わせる展開（v5.8b: 敵への「悲しい過去」は既存の「悲しき悪役」の領分なので分けた）
      const ippanjin = input.characters.find((c) => c.def.id === 'ippanjin');
      const enemy = input.characters.find((c) => c.instance.faction === 'enemy');
      if (!ippanjin || !enemy) return [];
      return hasDev(input, 'nichijou') || hasDev(input, 'hitodasuke')
        ? [{ boundCharIds: [ippanjin.instance.instanceId, enemy.instance.instanceId] }]
        : [];
    },
  },
  {
    id: 'innen_no_ketchaku',
    name: '因縁の決着',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    scoreMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: '週スコア×2',
    hintText: '結んだ因縁がいたる結末',
    conditionText: '過去に「因縁」をプレイした状態で「大勝利」か「死亡」',
    match: (input) =>
      input.pastPlayedDefIds.includes('innen') && (hasDev(input, 'dai_shouri') || hasDev(input, 'shibou'))
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'dondengaeshi',
    name: 'どんでん返し',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 9,
    hintText: '極端から極端へひっくり返る',
    conditionText: '意味が正反対の展開を同じ週に2枚プレイ（裏切り↔改心、大勝利↔敗北／大ピンチ、死亡↔復活、闇堕ち↔改心、大喧嘩↔仲直り）',
    match: (input) =>
      OPPOSITE_PAIRS.some(([a, b]) => hasDev(input, a) && hasDev(input, b)) ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'kiseki',
    name: '奇跡',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 10,
    hintText: '溜めに溜めたストレスの解放',
    conditionText: '緊張を3つ以上まとめて解放する',
    match: (input) => (input.stressReleased >= 3 ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kanippatsu',
    name: '間一髪',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '落ちる寸前で掴む手',
    conditionText: '同じ週に「大ピンチ」と「救出」を両方プレイ',
    match: (input) => (hasDev(input, 'dai_pinch') && hasDev(input, 'kyuushutsu') ? [{ boundCharIds: [] }] : []),
  },

  // ===== 家族と組織の役（v5.8b） =====
  {
    id: 'ofukuro_no_aji',
    name: 'おふくろの味',
    layer: 1,
    phase: 'preScore',
    suppresses: ['heiwa_na_nichijou'],
    cutInTemplate: 'emotion',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'キャスト全員の人気度が恒久+2',
    hintText: '帰る場所での休息',
    /*
     * v7.25: 「日常回」か「骨休め」のどちらかでよい条件だと、新設した「サポーター」
     * （マスコットor母＋日常回）と母のケースで丸ごと重なってしまう、というユーザー指摘。
     * 両方を同じ週にプレイするAND条件にして棲み分けた
     */
    conditionText: '場に「母」がいる状態で「日常回」と「骨休め」を同じ週にプレイ',
    match: (input) =>
      input.characters.some((c) => c.def.id === 'haha') && hasDev(input, 'nichijou') && hasDev(input, 'honeyasume')
        ? [{ boundCharIds: input.characters.map((c) => c.instance.instanceId) }]
        : [],
    extraChanges: (match) => match.boundCharIds.map((id) => ({ type: 'permanentPopularityAdd', instanceId: id, amount: 2 })),
  },
  {
    id: 'haha_wa_tsuyoshi',
    name: '母は強し',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    charMultiplier: 3,
    cutInTemplate: 'shock',
    sfxId: 'horori',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: '母の人気度×3',
    hintText: '守るために前に出る',
    conditionText: '場に「母」がいる状態で「大ピンチ」をプレイ',
    match: (input) => {
      const haha = input.characters.find((c) => c.def.id === 'haha');
      return haha && hasDev(input, 'dai_pinch') ? [{ boundCharIds: [haha.instance.instanceId] }] : [];
    },
  },
  {
    id: 'senkusha_no_chikara',
    name: '先駆者の力',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '先人の圧倒的な力を見よ',
    conditionText: '場に仲間の師匠・父・母のいずれかがいる状態で「大勝利」をプレイ',
    match: (input) =>
      input.characters.some((c) => MENTOR_IDS.includes(c.def.id) && c.instance.faction === 'ally') &&
      hasDev(input, 'dai_shouri')
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'shoushin_to_shukusei',
    name: '昇進と粛清',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '上位者に与えられる死',
    conditionText: '場に敵幹部（パワータイプ・頭脳タイプどちらでも）と「宿敵」が揃った状態で、敵キャラを対象に「死亡」',
    match: (input) => {
      const hasKanbu = input.characters.some((c) => TEKI_KANBU_IDS.includes(c.def.id));
      const hasShukuteki = input.characters.some((c) => c.def.id === 'shukuteki');
      if (!hasKanbu || !hasShukuteki) return [];
      const killed = devsOf(input, 'shibou')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .find((c) => c?.instance.faction === 'enemy');
      return killed ? [{ boundCharIds: [killed.instance.instanceId] }] : [];
    },
  },
  {
    // v7.4: ユーザー提案。「逃げ惑う人たち」が脅威の大きさを見せる役なのに対して、
    // こちらは巻き込まれた側が実際に損なわれる一段重い役。緊張を積む
    id: 'muko_no_gisei',
    name: '無辜の犠牲',
    layer: 1,
    phase: 'preScore',
    suppresses: ['ippanjin_no_shiten'],
    cutInTemplate: 'shock',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 8,
    extraText: '緊張+1',
    hintText: '人々に前触れなく訪れる惨事',
    conditionText: '場に「一般人」がいる状態で「悲劇」をプレイ',
    match: (input) =>
      input.characters.some((c) => c.def.id === 'ippanjin') && hasDev(input, 'higeki') ? [{ boundCharIds: [] }] : [],
    extraChanges: () => [{ type: 'addStress', amount: 1 }],
  },
  {
    // v7.3: 役名を「一般人の視点」から改名（idは互換のため据え置き）
    id: 'ippanjin_no_shiten',
    name: '逃げ惑う人たち',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'dododo',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '巻き込まれる側から描く脅威',
    conditionText: '場に「一般人」がいる状態で「大破壊」か「敵組織の襲来」',
    match: (input) =>
      input.characters.some((c) => c.def.id === 'ippanjin') && (hasDev(input, 'daihakai') || hasDev(input, 'teki_soshiki'))
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'katakiuchi',
    name: 'かたき討ち',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: 'あいつの魂に勝利を捧げる',
    conditionText: '味方が死亡している状態で「大勝利」か「弔い合戦」',
    match: (input) =>
      deadAllies(input).length > 0 && (hasDev(input, 'dai_shouri') || hasDev(input, 'tomurai_gassen'))
        ? [{ boundCharIds: [] }]
        : [],
  },
  {
    id: 'ame_futte_ji_katamaru',
    name: '雨降って地固まる',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '強くぶつかった後の和解',
    conditionText: '過去に「大喧嘩」を描いた状態で「仲直り」をプレイ',
    match: (input) =>
      input.pastPlayedDefIds.includes('oogenka') && hasDev(input, 'nakanaori') ? [{ boundCharIds: [] }] : [],
  },

  // ===== 終盤の静けさ（v5.8b: 急タグの展開が薄く、終盤が単調になる問題への対処） =====
  {
    // v7.4b: 最終回の日常回まで「不穏」になってしまうので、最終回だけは
    // 「取り戻した日々」がこれを抑制する（決着したあとの日常は不穏ではない）
    id: 'fuon_na_nichijou',
    name: '不穏な日常',
    layer: 1,
    phase: 'preScore',
    suppresses: ['heiwa_na_nichijou', 'kankyuu'],
    cutInTemplate: 'emotion',
    sfxId: 'zawazawa',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '決戦を前にした静けさ',
    conditionText: '第三幕に入ってから「日常回」をプレイ',
    match: (input) => (input.act === 'kyu' && hasDev(input, 'nichijou') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kessen_zenya',
    name: '決戦前夜',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '最後の休息',
    conditionText: '第三幕に入ってから「宴会」か「骨休め」をプレイ',
    match: (input) =>
      input.act === 'kyu' && (hasDev(input, 'enkai') || hasDev(input, 'honeyasume')) ? [{ boundCharIds: [] }] : [],
  },

  // ===== 立て直し役（v5.7: キャスト人数が正義になりすぎる問題への対処） =====
  {
    id: 'haisui_no_jin',
    name: '背水の陣',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    charMultiplier: 3,
    cutInTemplate: 'shock',
    sfxId: 'dokidoki',
    popularityAdd: 0,
    buzzAdd: 4,
    extraText: 'そのキャラの人気度×3',
    hintText: 'ただ一人で挑む',
    conditionText: 'キャストが自分ひとりの状態で「バトル」をプレイ',
    match: (input) =>
      input.characters.length === 1 && hasDev(input, 'battle')
        ? [{ boundCharIds: [input.characters[0]!.instance.instanceId] }]
        : [],
  },
  {
    id: 'kiseki_no_seikan',
    name: '奇跡の生還',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    scoreMultiplier: 3,
    cutInTemplate: 'setupPayoff',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: '週スコア×3',
    hintText: '惨劇の後の一筋の希望',
    // 「夢オチ」は全員がまとめて戻る分だけ人気度がそのまま跳ねるので、この倍率は乗せない。
    // 一人ずつ取り戻す「復活」を選んだときだけの見返りにする。
    conditionText: '味方が3人以上死亡している状態で「復活」をプレイ',
    match: (input) =>
      deadAllies(input).length >= 3 && hasDev(input, 'fukkatsu') ? [{ boundCharIds: [] }] : [],
  },

  // ===== 最終回専用役（第25話限定。design_finale.md 6節） =====
  {
    id: 'densetsu_no_kanketsu',
    name: '伝説の完結',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    scoreMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 8,
    extraText: '週スコア×2',
    hintText: '物語を通じて多くを積み上げる',
    conditionText: '最終回に、仕込み役を規定の種類数以上（通常連載は10種、短期連載は4種）成立させた状態で迎える',
    match: (input) =>
      input.isFinale && input.setupComboCount >= input.legendaryCompletionCombos ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'daidanen',
    name: '大団円',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 8,
    hintText: '多くの仲間と結末を迎える',
    conditionText: '最終回にキャストが5人以上いる',
    match: (input) => (input.isFinale && input.characters.length >= 5 ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'yuushuu_no_bi',
    name: '有終の美',
    layer: 3,
    phase: 'postScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: '年表に「伝説の最終回」として記録される',
    hintText: '記録に残る最終回を迎える',
    /*
     * v7.28: 最終回のノルマを廃止したので「ノルマの2倍」が使えなくなった。
     * 代わりに、その連載自身のベース点（人気度・話題性の中央値の積）の3倍を基準にする。
     * 結末カードの倍率（最大×4）と完結ボーナス（最大×2）が乗れば届く水準。
     * v7.29: 相対条件だけだと弱い連載が有利になる逆転現象があったため、絶対点の下限も併せて課す
     */
    conditionText: '最終回で、それまでの連載の平常運転（中央値）の3倍以上、かつ規定の絶対点以上（通常連載は10,000点、短期連載は6,000点）のスコアを出す',
    match: (input) =>
      input.isFinale &&
      input.finaleBaseScore > 0 &&
      input.weekScore >= input.finaleBaseScore * YUUSHUU_NO_BI_RATIO &&
      input.weekScore >= input.yuushuuMinScore
        ? [{ boundCharIds: [] }]
        : [],
  },

  // ===== リスク役（7.5節、M3） =====
  {
    /*
     * v7.19: 「全滅」だけで成立する役。他の役はどれも複数条件の組み合わせだが、
     * 全滅は1枚出すだけで今週のキャストを丸ごと失う代償が既に大きいので、
     * それ単独でピーキーな一手として報われていい、というユーザー判断による例外。
     * v7.27: 「悲しい過去」を重ねた上位版「全滅エンド」（週スコア×4）は、
     * 名前が紛らわしいというユーザー指摘で廃止し、この役へ吸収。週スコアは常に×4になった
     */
    id: 'zenmetsu_yaku',
    name: '全滅',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    scoreMultiplier: 4,
    cutInTemplate: 'shock',
    popularityAdd: 0,
    buzzAdd: 8,
    extraText: '週スコア×4（キャストは全滅する）',
    hintText: 'すべてを失う',
    conditionText: '「全滅」をプレイする（それだけで成立）',
    match: (input) => (hasDev(input, 'zenmetsu') ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'sankaku_kankei',
    name: '三角関係',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'emotion',
    sfxId: 'dokidoki',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '想いが多く交錯する',
    /*
     * v7.23: 「場にキャラが3人以上」は三角関係の条件として的外れだった、というユーザー指摘。
     * 三角関係は人数ではなく「想いが重なる」ことが本質なので、既に恋愛フラグを持つキャラが
     * いる状態で、別のキャラに新たに「すれ違い」で恋愛フラグを付けたときに成立させる
     */
    conditionText: '恋愛フラグ所持キャラがいる状態で、別のキャラを対象に「すれ違い」をプレイ',
    match: (input) => {
      if (!hasDev(input, 'surechigai')) return [];
      const surechigaiTargets = new Set(devsOf(input, 'surechigai').map((d) => d.targetId).filter((id): id is string => !!id));
      const alreadyInLove = input.characters.some((c) => c.instance.flags.love && !surechigaiTargets.has(c.instance.instanceId));
      return alreadyInLove ? [{ boundCharIds: [] }] : [];
    },
  },

  // ===== v7.24: ユーザー提案の追加役 =====
  {
    id: 'dokoku',
    name: '慟哭',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'gogogo',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '大切な人を失った慟哭',
    conditionText: '仲間のヒロインか相棒を対象に「死亡」か「自己犠牲」をプレイ',
    match: (input) => {
      const targets = [...devsOf(input, 'shibou'), ...devsOf(input, 'jiko_gisei')]
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter(
          (c): c is CastCharacter => !!c && c.instance.faction === 'ally' && (c.def.id === 'heroine' || c.def.id === 'aibou'),
        )
        .filter((c, i, arr) => arr.findIndex((x) => x.instance.instanceId === c.instance.instanceId) === i);
      return targets.map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    /*
     * v7.24: 主人公を対象にした「闇堕ち」は、実際には陣営を反転させない（v6.2の仕様。
     * ダークヒーロー化しても物語上は主人公のままにする、という既存の割り切り）。
     * そのため既存の「ダークヒーロー」役と同じく、devsOf(yamiochi)のtargetIdだけを見て判定する
     */
    id: 'fukushuu_oni',
    name: '復讐鬼',
    layer: 1,
    phase: 'preScore',
    suppresses: ['dark_hero', 'dokoku'],
    cutInTemplate: 'shock',
    sfxId: 'dododo',
    charMultiplier: 2,
    popularityAdd: 0,
    buzzAdd: 9,
    extraText: '主人公の人気度×2',
    hintText: '悲しみに我を忘れる',
    conditionText: '仲間のヒロインか相棒の死亡・自己犠牲と同じ週に、主人公を対象に「闇堕ち」をプレイ',
    match: (input) => {
      const hero = input.characters.find((c) => c.def.id === 'hero');
      if (!hero) return [];
      const yamiochiOnHero = devsOf(input, 'yamiochi').some((d) => d.targetId === hero.instance.instanceId);
      if (!yamiochiOnHero) return [];
      const lost = [...devsOf(input, 'shibou'), ...devsOf(input, 'jiko_gisei')]
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .some((c) => !!c && c.instance.faction === 'ally' && (c.def.id === 'heroine' || c.def.id === 'aibou'));
      return lost ? [{ boundCharIds: [hero.instance.instanceId] }] : [];
    },
  },
  {
    id: 'nakushita_kizuna',
    name: 'なくした絆',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'emotion',
    sfxId: 'horori',
    popularityAdd: 0,
    buzzAdd: 5,
    hintText: '大切な過去の消失',
    conditionText: '仲間のヒロイン・相棒・幼なじみのいずれかを対象に「記憶喪失」をプレイ',
    match: (input) =>
      devsOf(input, 'kioku_soushitsu')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter(
          (c): c is CastCharacter =>
            !!c && c.instance.faction === 'ally' && ['heroine', 'aibou', 'osananajimi'].includes(c.def.id),
        )
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
  },
  {
    /*
     * v7.24: ユーザー原案は「なくした絆」と同じ条件（記憶喪失）が2回書かれていたが、
     * それだと同じ役が二重に定義されるだけなので、対になる「取り戻す」側と解釈した。
     * 「おかえり」は記憶喪失で失ったフラグを一緒に取り戻す効果を既に持つ（lostFlags経由）ので、
     * その対象が「なくした絆」と同じ3人のいずれかだったときに成立させる
     */
    id: 'torimodoshita_kizuna',
    name: '取り戻した絆',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'jiin',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: 'なくした過去を取り戻す',
    conditionText: '記憶を失ったヒロイン・相棒・幼なじみのいずれかを対象に「おかえり」をプレイ',
    match: (input) =>
      devsOf(input, 'okaeri')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter(
          (c): c is CastCharacter =>
            !!c && !!c.instance.lostFlags && ['heroine', 'aibou', 'osananajimi'].includes(c.def.id),
        )
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
  },
  {
    id: 'ore_ni_makasete_saki_e',
    name: '俺に任せて先へ',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '仲間を逃がす決死の一手',
    conditionText: '相棒か三枚目を対象に「自己犠牲」をプレイ',
    match: (input) =>
      devsOf(input, 'jiko_gisei')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'ally' && (c.def.id === 'aibou' || c.def.id === 'sanmaime'))
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
  },
  {
    /*
     * v7.25: 人気度の低い脇役（マスコット・三枚目・弱虫・一般人）は、強い役持ちでもないと
     * 使われにくい、というユーザー指摘。「隠れた才能が明かされる」役なので、その場限りの
     * 話題性だけでなく恒久的な人気度も伸びるようにした（意地を見せるの+6と並ぶ格の効果）
     */
    id: 'nouaru_taka_wa',
    name: '能ある鷹は',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 5,
    extraText: 'そのキャラの人気度が恒久+5',
    hintText: '実は侮れない実力',
    conditionText: '三枚目を対象に「能力覚醒」か「真の覚醒」をプレイ',
    match: (input) =>
      [...devsOf(input, 'nouryoku_kakusei'), ...devsOf(input, 'kakusei')]
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'ally' && c.def.id === 'sanmaime')
        .map((c) => ({ boundCharIds: [c.instance.instanceId] })),
    extraChanges: (match) => [{ type: 'permanentPopularityAdd', instanceId: match.boundCharIds[0]!, amount: 5 }],
  },
  {
    id: 'aun_no_kokyuu',
    name: '阿吽の呼吸',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'baan',
    popularityAdd: 0,
    buzzAdd: 2,
    hintText: '言葉なしで通じ合うバディ',
    conditionText: '場に「相棒」がいる状態で「バトル」をプレイ',
    match: (input) =>
      input.characters.some((c) => c.def.id === 'aibou') && hasDev(input, 'battle') ? [{ boundCharIds: [] }] : [],
  },
  {
    id: 'akuyuu',
    name: '悪友',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'waiwai',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: 'いつも一緒に悪だくみ',
    conditionText: '場に「相棒」と「三枚目」がいる状態で「日常回」をプレイ',
    match: (input) => {
      const hasAibou = input.characters.some((c) => c.def.id === 'aibou');
      const hasSanmaime = input.characters.some((c) => c.instance.faction === 'ally' && c.def.id === 'sanmaime');
      return hasAibou && hasSanmaime && hasDev(input, 'nichijou') ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    id: 'sessa_takuma',
    name: '切磋琢磨',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'waiwai',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '互いに高め合う関係性',
    conditionText: '場に「相棒」か「三枚目」がいる状態で「修行」をプレイ',
    match: (input) => {
      const hasPartner = input.characters.some(
        (c) => c.def.id === 'aibou' || (c.instance.faction === 'ally' && c.def.id === 'sanmaime'),
      );
      return hasPartner && hasDev(input, 'shugyou') ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    id: 'daishou_aru_chikara',
    name: '代償ある力',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    charMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: 'そのキャラの人気度×2',
    hintText: '禁忌の力に覚醒する',
    conditionText: '同じキャラを対象に「禁断の力」と「能力覚醒」か「真の覚醒」をプレイ',
    match: (input) => {
      const kindanTargets = new Set(devsOf(input, 'kindan_no_chikara').map((d) => d.targetId).filter((id): id is string => !!id));
      const awakened = [...devsOf(input, 'nouryoku_kakusei'), ...devsOf(input, 'kakusei')]
        .map((d) => d.targetId)
        .filter((id): id is string => !!id && kindanTargets.has(id));
      return [...new Set(awakened)].map((id) => ({ boundCharIds: [id] }));
    },
  },
  {
    id: 'hakai_heiki',
    name: '破壊兵器',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    sfxId: 'zawazawa',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '禁忌の力を宿した武器',
    conditionText: '同じキャラを対象に「禁断の力」と「武器ゲット」をプレイ',
    match: (input) => {
      const kindanTargets = new Set(devsOf(input, 'kindan_no_chikara').map((d) => d.targetId).filter((id): id is string => !!id));
      const armed = devsOf(input, 'buki_get')
        .map((d) => d.targetId)
        .filter((id): id is string => !!id && kindanTargets.has(id));
      return [...new Set(armed)].map((id) => ({ boundCharIds: [id] }));
    },
  },
  {
    id: 'osorubeki_henshin',
    name: '恐るべき変身',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'zawazawa',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '力に飲まれる強敵',
    conditionText: '敵キャラを対象に「禁断の力」「能力覚醒」「真の覚醒」のいずれかをプレイ',
    match: (input) => {
      const targets = [...devsOf(input, 'kindan_no_chikara'), ...devsOf(input, 'nouryoku_kakusei'), ...devsOf(input, 'kakusei')]
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && c.instance.faction === 'enemy')
        .filter((c, i, arr) => arr.findIndex((x) => x.instance.instanceId === c.instance.instanceId) === i);
      return targets.map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    id: 'henshin',
    name: '変身',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    charMultiplier: 2,
    cutInTemplate: 'setupPayoff',
    sfxId: 'katsu',
    popularityAdd: 0,
    buzzAdd: 6,
    extraText: 'マスコットとヒロインの人気度×2',
    hintText: '小さな相棒の力を借りて',
    conditionText: 'マスコットとヒロイン（ともに仲間）を、それぞれ対象に「能力覚醒」か「真の覚醒」でプレイ',
    match: (input) => {
      const awakenedIds = new Set(
        [...devsOf(input, 'nouryoku_kakusei'), ...devsOf(input, 'kakusei')].map((d) => d.targetId).filter((id): id is string => !!id),
      );
      const mascot = input.characters.find((c) => c.instance.faction === 'ally' && c.def.id === 'mascot');
      const heroine = input.characters.find((c) => c.instance.faction === 'ally' && c.def.id === 'heroine');
      if (!mascot || !heroine) return [];
      if (!awakenedIds.has(mascot.instance.instanceId) || !awakenedIds.has(heroine.instance.instanceId)) return [];
      return [{ boundCharIds: [mascot.instance.instanceId, heroine.instance.instanceId] }];
    },
  },
  {
    /*
     * v7.24: 「同じキャラが2回裏切りの対象になる」ことの判定には、その週の情報だけでは足りない
     * （前に一度裏切られたことがある、という過去の履歴が要る）。CardInstance.betrayalCount
     * （裏切りの対象になった回数。洗脳は数えない）を新設し、それが1以上＝既に一度裏切られている
     * キャラを、今週また「裏切り」の対象にしたときに成立させる
     */
    id: 'nijuu_supai',
    name: '二重スパイ',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'shock',
    sfxId: 'don',
    popularityAdd: 0,
    buzzAdd: 7,
    hintText: '何度目の寝返りだ',
    conditionText: '過去に一度「裏切り」の対象になったキャラを、再び「裏切り」の対象にする',
    match: (input) => {
      const targets = devsOf(input, 'uragiri')
        .map((d) => (d.targetId ? castById(input, d.targetId) : undefined))
        .filter((c): c is CastCharacter => !!c && (c.instance.betrayalCount ?? 0) >= 1)
        .filter((c, i, arr) => arr.findIndex((x) => x.instance.instanceId === c.instance.instanceId) === i);
      return targets.map((c) => ({ boundCharIds: [c.instance.instanceId] }));
    },
  },
  {
    id: 'ikinuki',
    name: '息抜き',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'waiwai',
    popularityAdd: 0,
    buzzAdd: 2,
    hintText: 'たまには友人とゆるく',
    conditionText: '場に「相棒」か「三枚目」がいる状態で「骨休め」をプレイ',
    match: (input) => {
      const hasPartner = input.characters.some(
        (c) => c.def.id === 'aibou' || (c.instance.faction === 'ally' && c.def.id === 'sanmaime'),
      );
      return hasPartner && hasDev(input, 'honeyasume') ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    /*
     * v7.24: 「母+日常/骨休め」は既存の「おふくろの味」と条件が重なる（そちらは母限定・
     * 日常回か骨休めのどちらでも成立）。この役はマスコットも対象に含めるぶん広いので、
     * 母のときは両方の役が同時に成立しうる。それぞれ別の見せ場として意図的に両立させる
     */
    /*
     * v7.25: マスコットが支えに回った週は、恒久的な人気度も少し伸ばす（人気度の低い脇役の
     * 底上げ、ユーザー指摘）。母は元々人気度9でこの4人ほど不遇ではないので対象外にする
     */
    id: 'supporter',
    name: 'サポーター',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    sfxId: 'waiwai',
    popularityAdd: 0,
    buzzAdd: 3,
    extraText: 'マスコットの場合、そのキャラの人気度が恒久+3',
    hintText: '日常を支える温かさ',
    conditionText: '場に「マスコット」か「母」がいる状態で「日常回」をプレイ',
    match: (input) => {
      const supporter = input.characters.find(
        (c) => c.instance.faction === 'ally' && (c.def.id === 'mascot' || c.def.id === 'haha'),
      );
      return supporter && hasDev(input, 'nichijou') ? [{ boundCharIds: [supporter.instance.instanceId] }] : [];
    },
    extraChanges: (match, input) => {
      const bound = input.characters.find((c) => c.instance.instanceId === match.boundCharIds[0]);
      return bound?.def.id === 'mascot'
        ? [{ type: 'permanentPopularityAdd', instanceId: bound.instance.instanceId, amount: 3 }]
        : [];
    },
  },
  {
    id: 'dakkan',
    name: '奪還',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'setupPayoff',
    sfxId: 'bang2',
    popularityAdd: 0,
    buzzAdd: 6,
    hintText: '大切な人を取り戻す',
    conditionText: '場にヒロインか母がいる状態で「救出」をプレイ',
    match: (input) => {
      const hasTarget = input.characters.some(
        (c) => c.instance.faction === 'ally' && (c.def.id === 'heroine' || c.def.id === 'haha'),
      );
      return hasTarget && hasDev(input, 'kyuushutsu') ? [{ boundCharIds: [] }] : [];
    },
  },

  // ===== 第2層: 連続週役（7.5節。第1層のresolved結果を参照する） =====
  {
    id: 'doutou_no_tenkai',
    name: '怒涛の展開',
    layer: 2,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '盛り上がりを3週続ける',
    conditionText: '3週連続で（自身以外の）役を成立させる',
    match: (input) => {
      if (input.layer1ComboIds.length === 0) return [];
      const lastTwo = input.recentComboHistory.slice(-2);
      if (lastTwo.length < 2) return [];
      const bothActive = lastTwo.every((ids) => ids.some((id) => id !== 'doutou_no_tenkai'));
      return bothActive ? [{ boundCharIds: [] }] : [];
    },
  },
  {
    id: 'tame_kara_no_bakuhatsu',
    name: '溜めからの爆発',
    layer: 2,
    phase: 'preScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 3,
    hintText: '静かな週のあとの爆発',
    conditionText: '前週は役なし、今週は役ありで成立',
    match: (input) => {
      if (input.layer1ComboIds.length === 0) return [];
      const prev = input.recentComboHistory[input.recentComboHistory.length - 1];
      if (!prev) return [];
      return prev.filter((id) => id !== 'tame_kara_no_bakuhatsu').length === 0 ? [{ boundCharIds: [] }] : [];
    },
  },

  {
    id: 'daichouhen',
    name: '大長編',
    layer: 2,
    phase: 'preScore',
    suppresses: ['doutou_no_tenkai'],
    scoreMultiplier: 1.5,
    cutInTemplate: 'setupPayoff',
    popularityAdd: 0,
    buzzAdd: 4,
    extraText: '週スコア×1.5',
    hintText: '盛り上がりを5週続ける',
    conditionText: '5週連続で（自身以外の）役を成立させ続ける',
    match: (input) => {
      // v5.8b: 第2層が2種しかなく、長いスパンの物語構造が拾えていなかったので追加
      if (input.layer1ComboIds.length === 0) return [];
      const lastFour = input.recentComboHistory.slice(-4);
      if (lastFour.length < 4) return [];
      const allActive = lastFour.every((ids) => ids.some((id) => id !== 'daichouhen'));
      return allActive ? [{ boundCharIds: [] }] : [];
    },
  },

  // ===== 第3層: 事後役（スコアを参照する） =====
  {
    id: 'catharsis',
    name: 'カタルシス',
    layer: 1,
    phase: 'preScore',
    suppresses: [],
    isSetupCombo: true,
    cutInTemplate: 'setupPayoff',
    popularityAdd: 0,
    buzzAdd: 0,
    dynamicBuzz: (input) => (input.stressReleased >= 2 ? 4 * input.stressReleased : 0),
    extraText: '溜めた緊張が大きいほど跳ね返る',
    hintText: '重い展開を溜めて解き放つ',
    conditionText: '緊張を2つ以上溜めた状態で解放する（話題性 +4×解放数）',
    match: (input) => (input.stressReleased >= 2 ? [{ boundCharIds: [] }] : []),
  },
  {
    id: 'kamikai',
    name: '神回',
    layer: 3,
    phase: 'postScore',
    suppresses: [],
    cutInTemplate: 'normal',
    popularityAdd: 0,
    buzzAdd: 0,
    extraText: '次週の原稿料+2',
    hintText: 'ノルマを大きく超える',
    conditionText: '週スコアがノルマの3倍以上',
    match: (input) => (input.quota > 0 && input.weekScore >= input.quota * 3 ? [{ boundCharIds: [] }] : []),
  },
];

export type ComboEntry = { def: ComboDefinition; match: ComboMatch };

export interface ComboEvaluation {
  /** 数値・状態の効果を適用する役（applied） */
  applied: ComboEntry[];
  /** 条件は満たしたが上位役に抑制された役（表示用に区別する、7.1節） */
  suppressed: ComboEntry[];
  /** 成立したが週スコア乗算の上限規則で不採用になった役（7.6節） */
  notApplied: ComboEntry[];
  /** 実際に適用される週スコア乗算（最高倍率の1つのみ） */
  weekMultiplier: number;
}

/** 指定した層の役を判定する（抑制と発動回数制限を適用してresolvedを返す） */
function evaluateLayer(input: ComboMatchInput, usage: ComboUsageState, layer: 1 | 2 | 3): {
  resolved: ComboEntry[];
  suppressed: ComboEntry[];
} {
  const matched: ComboEntry[] = [];
  for (const def of COMBO_REGISTRY) {
    if (def.layer !== layer) continue;
    if (def.oncePerRun && usage.oncePerRun.includes(def.id)) continue;
    for (const match of def.match(input)) {
      if (def.oncePerCharacter && match.boundCharIds.some((id) => (usage.perCharacter[def.id] ?? []).includes(id))) {
        continue;
      }
      matched.push({ def, match });
    }
  }

  // 抑制の解決。抑制する側が自身も抑制されている場合は無効（2回の反復で安定する規模）
  const presentIds = new Set(matched.map((m) => m.def.id));
  let suppressedIds = new Set<string>();
  for (let pass = 0; pass < 2; pass++) {
    const next = new Set<string>();
    for (const { def } of matched) {
      if (suppressedIds.has(def.id) && pass > 0) continue;
      for (const target of def.suppresses) {
        if (presentIds.has(target)) next.add(target);
      }
    }
    suppressedIds = next;
  }

  return {
    resolved: matched.filter((m) => !suppressedIds.has(m.def.id)),
    suppressed: matched.filter((m) => suppressedIds.has(m.def.id)),
  };
}

/**
 * スコア計算前の役判定（7.1節の三層構造のうち第1層と第2層）。
 * 第1層のresolved結果を第2層（連続週役）へ渡してから、週スコア乗算の上限規則を適用する。
 */
export function evaluateCombos(input: ComboMatchInput, usage: ComboUsageState): ComboEvaluation {
  const layer1 = evaluateLayer(input, usage, 1);
  const layer2 = evaluateLayer(
    { ...input, layer1ComboIds: layer1.resolved.map((e) => e.def.id) },
    usage,
    2,
  );
  const resolved = [...layer1.resolved, ...layer2.resolved];

  // 週スコア乗算は最も高い倍率の1つだけを適用する（7.6節）
  const multipliers = resolved.filter((e) => (e.def.scoreMultiplier ?? 1) > 1);
  let weekMultiplier = 1;
  let winner: ComboEntry | null = null;
  for (const entry of multipliers) {
    const value = entry.def.scoreMultiplier ?? 1;
    if (value > weekMultiplier) {
      weekMultiplier = value;
      winner = entry;
    }
  }
  const notApplied = multipliers.filter((e) => e !== winner);

  return {
    applied: resolved.filter((e) => !notApplied.includes(e)),
    suppressed: [...layer1.suppressed, ...layer2.suppressed],
    notApplied,
    weekMultiplier,
  };
}

/** スコア計算後の役判定（第3層。神回など） */
export function evaluatePostScoreCombos(input: ComboMatchInput, usage: ComboUsageState): ComboEntry[] {
  return evaluateLayer(input, usage, 3).resolved;
}

/** 役の話題性加算（動的効果量を解決する） */
export function comboBuzzOf(def: ComboDefinition, input: ComboMatchInput): number {
  return def.dynamicBuzz ? def.dynamicBuzz(input) : def.buzzAdd;
}

/** ComboScoreDetailへの変換（スコア明細用、14.5節） */
export function toComboDetail(
  entry: ComboEntry,
  status: 'applied' | 'suppressed' | 'notApplied',
  input: ComboMatchInput,
): ComboScoreDetail {
  const applied = status === 'applied';
  return {
    comboId: entry.def.id,
    name: entry.def.name,
    status,
    popularityAdd: applied ? entry.def.popularityAdd : 0,
    buzzAdd: applied ? comboBuzzOf(entry.def, input) : 0,
    scoreMultiplier: applied ? (entry.def.scoreMultiplier ?? 1) : 1,
    charMultiplier: applied ? (entry.def.charMultiplier ?? 1) : 1,
    cutInTemplate: entry.def.cutInTemplate,
    boundCharIds: entry.match.boundCharIds,
    extraText: entry.def.extraText,
  };
}

/** 仕込み役のIDセット（完結ボーナスと連載メモに使う、11節） */
export const SETUP_COMBO_IDS = new Set(COMBO_REGISTRY.filter((c) => c.isSetupCombo).map((c) => c.id));

/**
 * 第3部専用役の素材になる展開カード（v7.4b）。
 *
 * 第3部（第17話以降）は毎週の手札抽選でこれらを引きやすくする（`run.ts` の `startWeek`）。
 * 終盤はデッキが70枚を超えるため、均等に引くと2枚組の役が揃う週が実測で1.8〜5.5%しかなく、
 * 「第3部専用役が全然出ない」状態になっていた。
 * デッキを増やす（ショップ側で買わせる）のではなく、持っているカードが手札に来る確率を上げる方針。
 */
export const ACT3_COMBO_MATERIALS = new Set([
  'battle',
  'souryokusen', // 最終決戦・総力の結集
  'teki_soshiki', // 世界の危機
  'dai_pinch', // 世界の危機・暗雲立ち込める
  'haiboku', // 暗雲立ち込める
  'shibou', // 因縁の清算
  'ridatsu', // 決意の別れ
  'kanashii_kako', // 決意の別れ
  'shugyou', // 最後の修行
  'nouryoku_kakusei', // 最後の修行
]);

/** 第3部で上記素材にかける抽選重み（他のカードは1） */
export const ACT3_DRAW_WEIGHT = 3;
