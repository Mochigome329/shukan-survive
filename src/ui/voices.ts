/**
 * 読者アンケートの声（リザルト演出用、v5.2 / v6.9で全役に対応）。
 *
 * その週に成立した役に紐づく声を優先して出す。
 * 役ごとの文言が無い場合でも、カットインの種別（衝撃・情感・仕込み回収）に応じた
 * 声にフォールバックするので、「汎用の声しか出ない週」がほぼ無くなる。
 */
import { COMBO_REGISTRY } from '../core/combos';
import { hashSeed, mulberry32, randInt, type Rng } from '../core/rng';
import type { CutInTemplate, ScoreBreakdown } from '../core/types';

const BY_COMBO: Record<string, string[]> = {
  // ===== 序盤専用・導入 =====
  hijou_e: ['日常が壊れた…始まったな', '1話から引き込まれた', 'この漫画、化けるかも'],
  kaomise: ['キャラの顔がやっと揃った', '登場人物が見えてきた', 'この面子で行くのか'],
  tabidachi: ['旅立ちの回、王道でいい', 'ここから始まるんだな', '見送るシーンに弱い'],
  saisho_no_shiren: ['最初の壁、いい重さ', '簡単に勝たせないのが好き', '主人公の現在地が分かった'],
  shi_tono_deai: ['師匠キャラ来た！', 'この人に鍛えられるのか', '師弟モノは名作の予感'],
  boy_meets_girl: ['出会いの描き方がうまい', 'この二人、気になる', '青春だな…'],
  shukuteki_tono_kaikou: ['宿敵、格が違う', '本物の敵が出てきた', 'こいつが最後の壁か'],
  inou_no_mebae: ['能力バトル始まった！', '力に目覚める瞬間、好き', 'ここから伸びそう'],
  unmei_no_deai: ['運命感じる出会いだった', 'この二人の関係が軸になりそう'],
  kankyuu: ['日常からのバトル、緩急が上手い', '静と動の使い分けがいい'],
  tokkun_kai: ['特訓回、地味に好き', '努力描写があると応援したくなる'],
  heiwa_na_nichijou: ['こういう回が息抜きになる', '日常回のキャラのやりとり好き'],
  ubawareta_nichijou: ['平和が壊された…', 'この喪失感で一気に引き込まれた', '許せない展開'],
  himeta_chikara: ['まだ本気じゃないやつだ', '底が見えないの好き'],
  kyara_horisage: ['あのキャラの解像度が上がった', '掘り下げ回、丁寧でいい', '好きになってしまった'],
  taiki_no_yokan: ['こいつ、伸びるぞ', '大物の予感しかない'],

  // ===== バトル・王道 =====
  oudou: ['修行からのバトル、これだよこれ', '王道は裏切らない'],
  rival_taiketsu: ['ライバル戦アツすぎる', '二人の因縁、ここで来たか', '見開きが目に浮かぶ'],
  kyouteki_no_kabe: ['敵、強すぎない…？', 'この絶望感がたまらない', '勝てる気がしないんだが'],
  kamase_inu: ['新顔、噛ませだったか…', '出てすぐ退場は容赦ない', 'あの強敵の格が上がった'],
  hissatsu_hatsuhirou: ['必殺技キター！', '技名を叫ぶやつ、好き'],
  shinsoubi: ['新装備かっこよすぎ', '武器が変わると画面が締まる'],
  densetsu_buki: ['伝説の武器、実在したのか', '前フリからの入手、気持ちいい'],
  densetsu_waza: ['あの伝説の技を…！', '語られてた技が形になった'],
  takara_sagashi: ['探してたものが見つかった！', '宝探し回、ワクワクする'],
  souryokusen_combo: ['全員出てきた！', '総力戦は盛り上がる'],
  giant_killing: ['格上に勝った！', 'これは番狂わせだ', 'アンケ入れるしかない'],
  haisui_no_jin: ['一人で背負うのかよ…', '孤独な戦い、燃える'],
  igai_no_katsuyaku: ['あいつがやるとは', '目立たない子の活躍、いいね', '株が上がった'],
  yuuki_no_hatsuro: ['一番弱い子が前に出た…', 'これは泣く', '勇気って言葉が似合う'],
  iji_wo_miseru: ['意地見せたな！', 'かませ扱いしてごめん'],
  ippanjin_no_shiten: ['一般人視点、効くな', '巻き込まれた側の目線がリアル'],
  muko_no_gisei: ['関係ない人が巻き込まれるの、きつい', 'これは許せない展開だ', '重い回だった…'],

  // ===== 裏切り・陣営 =====
  shougeki_no_uragiri: ['えっ、裏切るの!?', '信じてたのに…続きが気になる', '来週まで待てない'],
  shitto_shin: ['近い相手ほど拗れるんだよな', '嫉妬って生々しくて刺さる', 'この関係が壊れるのは辛い'],
  shishinchuu_no_mushi: ['マスコットが裏切るとは…', '一番油断してた', '可愛い顔してえげつない'],
  zetsubou: ['ヒロインが敵に回った…', '嘘だろ、心折れた', '今週は立ち直れない'],
  ano_koro_mitaini: ['戻ってきてくれた…！', 'また同じ側に立てるの、いい', '待ってた展開'],
  anata_to_tomoni: ['帰ってきた！泣いた', 'ずっとこれを待ってた', '今週は完全にやられた'],
  kanchigai_suruna: ['「別にお前のためじゃない」出た', 'ツンデレ、ここで使うか', '素直じゃないの好き'],
  kanashiki_akuyaku: ['悪役に泣かされるとは', 'あいつ、そんな過去が…', '敵なのに応援したくなる'],
  kaishin_no_monogatari: ['こっち側に来てくれた', '改心の流れが自然でよかった'],
  dark_hero: ['主人公が闇に堕ちた…', 'ここまでやるか', '主人公の顔が変わった'],
  omoi_todokazu: ['届かなかったか…', '戻ってきてほしかった', '今週は静かに泣いた'],
  teki_no_teki: ['敵同士が手を組んだ', '一時休戦の緊張感、好き'],
  aku_nimo_kizuna: ['敵側にも日常があるんだな', '悪役の人間味、ずるい'],
  shoushin_to_shukusei: ['組織、容赦ないな…', '内部から崩れていくの怖い'],

  // ===== 仕込みと回収 =====
  fukusen_kaishu: ['あの伏線、そう繋がるのか！', '全部繋がった、鳥肌', '読み返してくる'],
  missing_link: ['過去と現在が繋がった', '回想の意味が今わかった'],
  kuromaku_no_shoutai: ['黒幕こいつかよ!?', '全部あいつの仕業だったのか', '一本の線に繋がった'],
  keishou_no_kakusei: ['ついに覚醒きた！', '溜めが長かった分、爆発がすごい', '今週のための連載だった'],
  ryouomoi: ['やっと結ばれた…！', '長かった、おめでとう', 'この回のために読んでた'],
  jitsuha_ikiteita: ['生きてた！！', '死んだと思ってたのに', '声出た'],
  shukumei_no_saikai: ['敵として再会するのか…', 'この再会は重い', '因縁が深すぎる'],
  toki_wo_koeta_saikai: ['時間を越えての再会、いい', '年月の重みを感じる'],
  sedai_koutai: ['次の世代に受け継がれた', '主人公が変わっても読む'],
  innen_no_taiketsu: ['長い因縁に決着', 'ここまで積んできた甲斐がある'],
  seichou_no_jikkan: ['あの時の敗北が効いてる', '成長を感じさせる勝ち方だった'],
  densho: ['師の技を継いだのか…', '受け継がれるの、たまらない'],
  shitei_no_wakare: ['導いてくれた人が…！', '別れが主人公を変えるんだな', '涙腺やられた'],
  soumatou: ['走馬灯の演出が刺さる', 'これまでの日々が流れて泣いた'],
  sorekara_toki_ga_tatta: ['この数年の重みがすごい', '飛ばした時間がちゃんと効いてる', 'みんな大人になったな…'],
  ano_koro_no_bokutachi: ['あの頃の二人、尊い', '回想が効きすぎる'],
  chichi_wo_koeru: ['ついに父を超えた', '越えるべき壁を越える回、最高'],
  innen_no_ketchaku: ['因縁に決着ついた', 'ずっと引っ張った甲斐があった'],
  ame_futte_ji_katamaru: ['喧嘩したあとの方が強い', '仲直り回、好き'],
  senkusha_no_chikara: ['先を行く人の教えが効いた', '導いてくれる人がいるといい'],
  katakiuchi: ['あいつの分まで…！', 'かたき討ち、燃える'],
  kiseki_no_seikan: ['全員生きてた!?', '奇跡すぎる', '諦めなくてよかった'],

  // ===== v7.24追加 =====
  dokoku: ['嘘だろ…', 'この喪失感はつらい', '慟哭してる、こっちも'],
  fukushuu_oni: ['主人公が壊れた', 'もう戻れないところまで来た', '復讐に飲まれてる'],
  nakushita_kizuna: ['忘れられちゃったのか…', '積み上げてきたのに', 'これは切ない'],
  torimodoshita_kizuna: ['思い出した…！', '取り戻せてよかった', '記憶が戻る瞬間、泣ける'],
  ore_ni_makasete_saki_e: ['ここは俺に任せろ、そういうことか', '渋いキャラが決めてくれた'],
  nouaru_taka_wa: ['まさかそんな力が', '目立たない子ほど強かったりする'],
  aun_no_kokyuu: ['このコンビ息合いすぎ', '相棒との連携、好き'],
  akuyuu: ['この二人はいつも一緒だな', '悪友コンビが尊い'],
  sessa_takuma: ['二人で高め合ってる', 'ライバルというか戦友'],
  daishou_aru_chikara: ['その力、代償デカそう', '強くなったけど怖い'],
  hakai_heiki: ['その武器、危険すぎる', '禁断の力を宿した武器とか強すぎる'],
  osorubeki_henshin: ['敵がとんでもない力に…', 'これは苦戦しそう'],
  henshin: ['変身キタ！', 'マスコットの正体、そういうことか'],
  nijuu_supai: ['また裏切ったのか…', '何回目だよ二重スパイ'],
  ikinuki: ['ここで一息つく感じ、好き', '息抜き回も大事'],
  supporter: ['支えてくれる存在っていいよね', '縁の下の力持ち回'],
  dakkan: ['取り戻しに行った', '奪還、燃える展開'],

  // ===== 感情・関係 =====
  sankaku_kankei: ['三角関係きた', '誰を応援すればいいんだ'],
  ofukuro_no_aji: ['お母さんの飯の回、好き', 'ほっとする回'],
  haha_wa_tsuyoshi: ['母、強すぎる', '守るものがある人は強い'],
  ketsui_no_wakare: ['行かせたくない…', '別れの決意が重い'],
  fuon_na_nichijou: ['この日常、長くは続かないやつだ', '静けさが逆に怖い'],
  kessen_zenya: ['決戦前の空気、たまらない', '明日死にそうな会話やめて'],

  // ===== 終盤・クライマックス =====
  saishuu_kessen: ['ついに最終決戦！', '全部ここに繋がってた', '手が震える'],
  anun_tachikomeru: ['嫌な予感しかしない', '今週は不穏すぎる', 'この先どうなるんだ…'],
  sanji_no_rensa: ['畳みかけてくるな…', '救いがなさすぎる', '不幸が重なりすぎでは'],
  misugosenai: ['主人公はこうでなくちゃ', '困ってる人を放っておけないの、好き', 'こういう主人公が読みたかった'],
  zassou_damashii: ['見くびってた…すまん', '陰で努力してるの、応援したくなる', '雑草魂、燃える'],
  innen_no_hidane: ['この因縁、絶対あとで効くやつ', 'ここが始まりか', '因縁が生まれた瞬間だ'],
  douchuu_no_deai: ['寄り道した先に出会いがあるの、いい', '道草の回、好きなんだよな', 'こういう出会い方は覚えてる'],
  sekai_no_kiki: ['スケールが跳ね上がった', '世界の危機まで来たか'],
  innen_no_seisan: ['積み上げた因縁の清算', 'ここで全部返ってくるのか'],
  souryoku_no_kesshuu: ['全員集合きた！', 'この見開きは保存する'],
  saigo_no_shugyou: ['最後の修行、胸熱', 'ここから逆転してくれ'],
  daidanen: ['全員揃っての大団円', 'みんな生きててよかった'],
  densetsu_no_kanketsu: ['伝説の完結だった', '積み上げてきたものが全部生きた', '一生忘れない最終回'],
  yuushuu_no_bi: ['完璧な終わり方だった', '有終の美すぎる'],
  zenmetsu_yaku: ['まさかの全滅', 'ここでキャスト全損はキツい', '来週どうするんだこれ', '全滅した…', '受け止めきれない'],

  // ===== 展開の質・メタ =====
  dondengaeshi: ['どんでん返しきた！', '一気にひっくり返った', '予想外すぎる'],
  kiseki: ['奇跡が起きた…！', '溜めてた分の爆発がすごい'],
  kanippatsu: ['間一髪すぎる', '心臓に悪い', 'ギリギリの攻防、最高'],
  doutou_no_tenkai: ['今週、展開が止まらない', '情報量がすごい'],
  tame_kara_no_bakuhatsu: ['溜めてたものが爆発した', '我慢してた分、効く'],
  daichouhen: ['ずっと面白い回が続いてる', '毎週神回じゃないか'],
  catharsis: ['ずっと苦しかった分、スカッとした', '溜めからの解放が気持ちいい'],
  kamikai: ['今週は神回', '完全にやられた', 'これはアンケ1位'],
  shujinkou_shibou: ['主人公死んだんだけど!?', '嘘だろ…来週どうなるの', '攻めすぎでは!?'],
};

/** 役ごとの声が無いときの、カットイン種別ごとのフォールバック（v6.9） */
const BY_TEMPLATE: Record<CutInTemplate, string[]> = {
  shock: ['今週の引き、ヤバい', '衝撃展開すぎる', '来週まで待てない'],
  emotion: ['じんと来た', '泣かせにくるじゃん', 'キャラの感情が刺さる'],
  setupPayoff: ['ここで繋がるのか！', '積み上げてきたものが効いてる', '仕込みの回収が気持ちいい'],
  normal: ['今週も面白かった', 'テンポがいい', '安定して面白い'],
};

const GENERIC_GOOD = ['今週も面白かった', '来週も読みます', '単行本出たら買う', '今週は神回だった', 'アンケ1位に入れた'];
const GENERIC_MID = ['まあまあかな', '悪くはないけど…', '安定して読める'];
const GENERIC_BAD = ['そろそろ大きな動きがほしい', '今週はちょっと停滞気味', '打ち切られないか心配', '展開が読めてしまう'];

/**
 * 最終回で「積み上げが実った」とみなす倍率のしきい値（v7.31）。
 * 完結ボーナス×結末カード倍率×週スコア倍率。仕込み役をそれなりに集めて
 * 結末カードの倍率が乗れば届く程度の値で、通常連載・短期連載の
 * どちらでも同じ物差しとして使える（完結ボーナスの伸び方だけが幕構成で変わる）
 */
const FINALE_GOOD_REWARD = 2;

const templateOf = (comboId: string): CutInTemplate =>
  COMBO_REGISTRY.find((c) => c.id === comboId)?.cutInTemplate ?? 'normal';

/** 最終回・打ち切りエンドで出すと嘘になる「来週」前提の声（v7.12） */
const NO_NEXT_WEEK = /来週/;

function pick(rng: Rng, pool: string[], used: Set<string>, excludeNextWeek: boolean): string | null {
  const rest = pool.filter((v) => !used.has(v) && (!excludeNextWeek || !NO_NEXT_WEEK.test(v)));
  if (rest.length === 0) return null;
  const v = rest[randInt(rng, rest.length)]!;
  used.add(v);
  return v;
}

const GENERIC_FINALE = ['最終回、最高でした', '単行本出たら買う', 'これが読みたかった', '有終の美すぎる', '完結おめでとう'];
/**
 * 最終回だが、積み上げてきたものがそれほど実らなかったとき（v7.31）。
 * 最終回にノルマは無いので「打ち切られないか心配」のような
 * 連載が続く前提の声を出してはいけない。物足りなさは物足りなさとして、
 * ちゃんと完結した回の感想として書く
 */
const GENERIC_FINALE_MID = [
  'きれいにまとまってた',
  'もう少し読みたかったな',
  '駆け足だった気もする',
  'お疲れさまでした',
  'ここで終わりか……',
];

/**
 * 読者の声を2〜3件返す（同じ週は常に同じ内容になるようシード固定）。
 * isEnding=true（最終回の掲載、または打ち切り決定）のときは、
 * 「来週まで待てない」「来週どうなるの」のような続きを匂わせる声を混ぜない。
 * この週が最後だと確定しているのに「来週も読みます」が出るのは変（v7.12）
 */
export function pickVoices(breakdown: ScoreBreakdown, runSeed: number, week: number, isEnding = false): string[] {
  const rng = mulberry32(hashSeed(runSeed, 'voice', week));
  const used = new Set<string>();
  const voices: string[] = [];

  // その週に成立した役の声を優先。役ごとの文言が無ければカットイン種別で拾う（v6.9）
  const applied = breakdown.combos.filter((c) => c.status === 'applied');
  for (const combo of applied.slice(0, 2)) {
    const v =
      pick(rng, BY_COMBO[combo.comboId] ?? [], used, isEnding) ??
      pick(rng, BY_TEMPLATE[templateOf(combo.comboId)], used, isEnding);
    if (v) voices.push(v);
  }

  const ratio = breakdown.quota > 0 ? breakdown.finalScore / breakdown.quota : 0;
  /*
   * v7.31: 最終回とそれ以外の「連載が終わる週」を分ける。
   * v7.28 で最終回のノルマを 0 にした結果、上の ratio が常に 0 になり、
   * isEnding=true の分岐が必ず GENERIC_BAD（「打ち切られないか心配」）へ落ちていた。
   * どれだけ高得点で完結しても打ち切り寸前の声が出る、という状態だった。
   *
   * 最終回はノルマが無いので達成度では測れない。代わりに
   * 「積み上げてきたものが結末で実ったか」＝完結ボーナス（仕込み役の種類数）×
   * 結末カードと週スコアの倍率で見る。打ち切りエンド（finaleEnding が無い）は
   * 従来どおり GENERIC_BAD でよい
   */
  const isFinale = breakdown.finaleEnding !== null;
  const finaleReward = breakdown.completionBonus * breakdown.endingMultiplier * breakdown.weekMultiplier;
  const genericPool = isFinale
    ? finaleReward >= FINALE_GOOD_REWARD
      ? GENERIC_FINALE
      : GENERIC_FINALE_MID
    : isEnding
      ? GENERIC_BAD
      : breakdown.quotaBypassed
        ? GENERIC_MID
        : ratio >= 1.5
          ? GENERIC_GOOD
          : ratio >= 1
            ? [...GENERIC_GOOD, ...GENERIC_MID]
            : GENERIC_BAD;
  while (voices.length < 3) {
    const v = pick(rng, genericPool, used, isEnding);
    if (!v) break;
    voices.push(v);
  }
  return voices;
}

/** テスト用: 役ごとの声が定義されている役ID */
export const VOICED_COMBO_IDS = Object.keys(BY_COMBO);
