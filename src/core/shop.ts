/**
 * 編集会議（ショップ、設計書 12節）。
 * カードパック（3枚提示・1枚選択・価格2）、作画強化、恒久サービスを扱う。
 * v5.6: カードの提示は幕タグと直近の展開に応じた重み付き抽選にする（design_story_types.md）。
 */
import { actOfWeek } from './acts';
import { mulberry32, hashSeed, weightedSample } from './rng';
import type { Act, CardInstance, RunState } from './types';
import type { GameData } from './validate';

export const PACK_PRICE = 2;
export const PACK_SIZE = 3;
/** 作画強化: キャラ1枚の人気度を恒久+5（12節） */
export const ART_UPGRADE_PRICE = 3;
export const ART_UPGRADE_AMOUNT = 5;

/**
 * 編集会議のサービス（v5.5）。対象選択の要らない強化。
 * once=true のものは1ランに1回だけ買える。
 */
export interface ShopService {
  id: string;
  name: string;
  price: number;
  once: boolean;
  description: string;
}

export const SHOP_SERVICES: ShopService[] = [
  {
    id: 'deep_thought',
    name: '熟考',
    price: 3,
    once: false,
    description: '3週間、すべての展開カードの話題性+1。何度でも依頼できる',
  },
  {
    id: 'fast_draft',
    name: '速筆',
    price: 4,
    once: true,
    description: 'ネーム描き直しの回数が毎週+1される（恒久）',
  },
  {
    id: 'battle_art',
    name: 'バトル描写強化',
    price: 5,
    once: true,
    description: 'バトルタグの展開カードの鮮度が下がらなくなる（恒久）',
  },
];

/** いま購入できるサービス（購入済みの一度きりサービスは除く） */
export function availableServices(state: RunState): ShopService[] {
  return SHOP_SERVICES.filter((s) => !(s.once && state.upgrades.includes(s.id)));
}

/** サービスを購入する。恒久サービスはupgradesへ、熟考は期間効果として付与する */
export function buyService(state: RunState, serviceId: string): RunState {
  const service = SHOP_SERVICES.find((s) => s.id === serviceId);
  if (!service) throw new Error(`サービスが見つかりません: ${serviceId}`);
  if (state.funds < service.price) throw new Error('原稿料が足りません');
  if (service.once && state.upgrades.includes(service.id)) throw new Error('すでに依頼済みです');

  if (service.id === 'deep_thought') {
    // 期間効果として3週間付与する（再購入で残り期間を更新）
    const modifiers = state.modifiers.filter((m) => m.modifierId !== 'deep_thought');
    return {
      ...state,
      funds: state.funds - service.price,
      modifiers: [...modifiers, { modifierId: 'deep_thought', remaining: 3 }],
    };
  }

  return {
    ...state,
    funds: state.funds - service.price,
    upgrades: [...state.upgrades, service.id],
  };
}

/**
 * 現在入手可能な定義IDの一覧（最大所持数と解禁話数を考慮）。
 * v5.7: **まだ解禁されていないカードは提示しない**。編集会議の時点で `state.week` は
 * 「次に描く話」なので、この週にプレイできないカードは仕入れさせない
 * （買ったのに数話プレイできないのは駆け引きではなく単なるストレス、というプレイ後の指摘による）。
 * `maxWeek` は実装範囲の上限で、それ以降にしか解禁されないカードも同様に除く。
 */
export function obtainablePool(data: GameData, state: RunState, maxWeek: number): string[] {
  const ownedCount = new Map<string, number>();
  for (const c of state.cards) {
    ownedCount.set(c.definitionId, (ownedCount.get(c.definitionId) ?? 0) + 1);
  }
  const playableFrom = Math.min(state.week, maxWeek);
  const pool: string[] = [];
  for (const def of data.definitions.values()) {
    if ((ownedCount.get(def.id) ?? 0) >= def.maxCopies) continue;
    if (def.unlockWeek > playableFrom) continue;
    pool.push(def.id);
  }
  return pool.sort();
}

/** 緊張を解放できるカード（読者の溜めを解放する展開） */
const RELIEF_CARDS = new Set(['dai_shouri', 'kyuushutsu', 'fukkatsu', 'kakusei']);

/** レアカードの提示重み倍率（v5.7）。「レア」表示に見合うだけ実際に出にくくする */
const RARE_WEIGHT = 0.4;

const ACT_ORDER: Act[] = ['jo', 'ha', 'kyu'];

/** 幕タグによる提示重み。現在の幕=3倍、隣の幕=1倍、遠い幕=0.3倍（2節） */
function actWeight(cardAct: Act | undefined, currentAct: Act): number {
  if (!cardAct) return 1;
  if (cardAct === currentAct) return 3;
  const dist = Math.abs(ACT_ORDER.indexOf(cardAct) - ACT_ORDER.indexOf(currentAct));
  return dist === 1 ? 1 : 0.3;
}

interface FollowUpRule {
  trigger: (data: GameData, state: RunState) => boolean;
  boosts: readonly string[];
}

/** 直近3週分の週ログを見る（新しい順ではなく古い順のまま） */
function recentlyPlayed(state: RunState, defId: string, lookback = 3): boolean {
  return state.log.slice(-lookback).some((w) => w.playedDefinitionIds.includes(defId));
}

/** 指定した定義IDのカードを直近lookback週以内に入手したか（初期デッキ分は含まない） */
function recentlyAcquired(state: RunState, defId: string, lookback = 3): boolean {
  return state.cards.some((c) => c.definitionId === defId && c.acquiredWeek > 0 && state.week - c.acquiredWeek <= lookback);
}

/**
 * 追随ルール（design_story_types.md 3節）。
 * 直前の展開に「応える」カードの提示重みを上げ、因果が繋がった物語を誘導する。
 * 判定は定義に基づく（裏切り等で陣営が変わっても「敵として入手した」事実は変わらない）。
 */
const FOLLOW_UP_RULES: FollowUpRule[] = [
  { trigger: (_d, s) => recentlyPlayed(s, 'fukusen'), boosts: ['fukusen_kaishu', 'kaisou', 'douki_no_kokuhaku'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'haiboku') || recentlyPlayed(s, 'dai_pinch'), boosts: ['dai_shouri', 'kyuushutsu', 'nouryoku_kakusei'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'surechigai'), boosts: ['kokuhaku'] },
  // v5.8の追加分
  { trigger: (_d, s) => recentlyPlayed(s, 'innen'), boosts: ['dai_shouri', 'shibou', 'shukuteki', 'teki_kanbu_power', 'teki_kanbu_brain'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'oogenka'), boosts: ['ichiji_kyuusen', 'katai_kizuna', 'hitodasuke'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'soushitsu'), boosts: ['ippou_sonokoro', 'kanashii_kako'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'daihakai'), boosts: ['hangeki', 'kyuushutsu', 'jiko_gisei'] },
  {
    trigger: (_d, s) => recentlyPlayed(s, 'densetsu') || recentlyPlayed(s, 'key_item'),
    // v6.6: 伝説武器ゲット・伝説技ゲット・宝探しの素材も追随させる
    boosts: ['fukusen_kaishu', 'kakusareta_kettou', 'buki_get', 'waza_get', 'key_item'],
  },
  { trigger: (_d, s) => recentlyAcquired(s, 'shishou'), boosts: ['shibou', 'shugyou'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'nouryoku_kakusei'), boosts: ['kakusei', 'buki_get', 'waza_get'] },
  { trigger: (_d, s) => recentlyPlayed(s, 'shibou') || recentlyPlayed(s, 'zenmetsu'), boosts: ['fukkatsu', 'yumeochi', 'shinchara'] },
  {
    trigger: (_d, s) => s.cards.some((c) => c.zone === 'waiting' && c.leftWeek !== undefined && s.week - c.leftWeek <= 3),
    boosts: ['uragiri', 'kanashii_kako'],
  },
  {
    trigger: (data, s) =>
      s.cards.some((c) => {
        if (c.acquiredWeek <= 0 || s.week - c.acquiredWeek > 3) return false;
        return data.definitions.get(c.definitionId)?.kind === 'character' && (data.definitions.get(c.definitionId) as { faction?: string })?.faction === 'enemy';
      }),
    // v7.12: 敵を倒す／退場させる手段（撃破）もここに追随させる。
    // 以前はここに無く、しかも撃破自体が幕タグ「急」寄りの重み付けだったため、
    // 敵が出てから実際に退場させられるまでの導線がほぼ運任せになっていた
    boosts: ['battle', 'kanashii_kako', 'kaishin', 'gekiha'],
  },
  { trigger: (_d, s) => recentlyPlayed(s, 'timeskip'), boosts: ['shinchara', 'kakusareta_kettou'] },
  { trigger: (_d, s) => s.stress >= 2, boosts: [...RELIEF_CARDS] },
  // 控えでデビューを待っているキャラがいるなら、デビュー手段を出しやすくする（v5.9）。
  // デッキが育つほど手札に来にくくなるので、必要なときに補充できる導線を作る
  {
    trigger: (data, s) =>
      s.cards.some((c) => c.zone === 'bench' && data.definitions.get(c.definitionId)?.kind === 'character'),
    boosts: ['shinchara', 'unmei_deai'],
  },
];

/** 追随ルールで重みが上がっているカードID（複数該当しても倍率は上限3倍で頭打ち） */
function followUpBoostedIds(data: GameData, state: RunState): Set<string> {
  const boosted = new Set<string>();
  for (const rule of FOLLOW_UP_RULES) {
    if (!rule.trigger(data, state)) continue;
    for (const id of rule.boosts) boosted.add(id);
  }
  return boosted;
}

/**
 * カードパックの提示内容（3枚）。shopSeed系列で決定的に選ぶ（14.7節）。
 * v5.6: 幕タグ（話数帯）と直近の展開に応じた重み付き抽選にする。
 * 緊張が2以上たまっているときは、解放できるカードの提示枠を1つ確保する（v5.5の保証を維持）。
 */
/**
 * カードパックを引く。
 * reroll は「ラインナップ入れ替え」の回数（v7.13）。同じ週・同じ購入回数でも
 * 別の抽選結果になるよう乱数の系列に混ぜる。0のときは従来と同じ結果になる
 */
export function rollPack(data: GameData, state: RunState, maxWeek: number, reroll = 0): string[] {
  const pool = obtainablePool(data, state, maxWeek);
  const rng = mulberry32(
    reroll > 0
      ? hashSeed(state.runSeed, 'shop', state.week, state.shopPurchases, 'reroll', reroll)
      : hashSeed(state.runSeed, 'shop', state.week, state.shopPurchases),
  );
  const currentAct = actOfWeek(state.week);
  const boosted = followUpBoostedIds(data, state);

  const weightOf = (id: string) => {
    const def = data.definitions.get(id)!;
    return actWeight(def.act, currentAct) * (boosted.has(id) ? 3 : 1) * (def.rare ? RARE_WEIGHT : 1);
  };

  let forced: string | null = null;
  if (state.stress >= 2) {
    const reliefPool = pool.filter((id) => RELIEF_CARDS.has(id));
    const picked = weightedSample(reliefPool.map((id) => ({ item: id, weight: weightOf(id) })), 1, rng);
    forced = picked[0] ?? null;
  }

  const rest = pool.filter((id) => id !== forced);
  const remaining = weightedSample(
    rest.map((id) => ({ item: id, weight: weightOf(id) })),
    forced ? PACK_SIZE - 1 : PACK_SIZE,
    rng,
  );
  return forced ? [forced, ...remaining] : remaining;
}

/**
 * 抽選プールにあるデビュー手段（新キャラ登場・運命的な出会い）を1枚返す（v5.9）。
 * 見つからなければ空配列。すでに確定枠に入っているものは重ねない。
 */
function findDebutCard(data: GameData, state: RunState): string[] {
  const found = state.cards.find((c) => {
    if (c.zone !== 'activeDeck' || state.guaranteedNextHand.includes(c.instanceId)) return false;
    const def = data.definitions.get(c.definitionId);
    return def?.kind === 'development' && def.effects.some((e) => e.effect.type === 'debutSelect');
  });
  return found ? [found.instanceId] : [];
}

/** パックからカード1枚を購入し、デッキへ加える */
export function buyCard(data: GameData, state: RunState, definitionId: string): RunState {
  if (state.funds < PACK_PRICE) throw new Error('原稿料が足りません');
  const def = data.definitions.get(definitionId);
  if (!def) throw new Error(`カード定義が見つかりません: ${definitionId}`);
  const ownedSuffixes = state.cards
    .filter((c) => c.definitionId === definitionId)
    .map((c) => Number(c.instanceId.split('#')[1] ?? 0));
  if (ownedSuffixes.length >= def.maxCopies) throw new Error(`「${def.name}」はこれ以上入手できません`);
  const suffix = ownedSuffixes.length > 0 ? Math.max(...ownedSuffixes) + 1 : 1;

  // v5.2: 購入したキャラは控えに入り、「新キャラ登場」でデビューさせる。展開は抽選プールへ
  const instance: CardInstance = {
    instanceId: `${definitionId}#${suffix}`,
    definitionId,
    permanentPopularityBonus: 0,
    faction: def.kind === 'character' ? def.faction : null,
    flags: { training: 0, love: false },
    acquiredWeek: state.week,
    playCount: 0,
    zone: def.kind === 'character' ? 'bench' : 'activeDeck',
    // 購入したキャラはまだデビューしていない（v6.6）
    debutFaction: null,
  };

  return {
    ...state,
    cards: [...state.cards, instance],
    funds: state.funds - PACK_PRICE,
    shopPurchases: state.shopPurchases + 1,
    // 仕入れた展開カードは次の話の手札に必ず入る（v5.2c: 買ったのに使えない問題の対策）
    // 仕入れた展開カードは次の話の手札に必ず入る（v5.2c）。
    // キャラを仕入れたときは、代わりに手持ちのデビュー手段を1枚confirmする（v5.9）。
    // これがないと「買ったキャラが控えで眠り続け、カードを買うほどデビュー手段を引けなくなる」ため
    guaranteedNextHand:
      def.kind === 'development'
        ? [...state.guaranteedNextHand, instance.instanceId]
        : [...state.guaranteedNextHand, ...findDebutCard(data, state)],
  };
}

/** 作画強化: 場または控えのキャラ1枚の人気度を恒久+5する（12節） */
export function upgradeArt(data: GameData, state: RunState, instanceId: string): RunState {
  if (state.funds < ART_UPGRADE_PRICE) throw new Error('原稿料が足りません');
  const target = state.cards.find((c) => c.instanceId === instanceId);
  if (!target) throw new Error(`カードが見つかりません: ${instanceId}`);
  const def = data.definitions.get(target.definitionId);
  if (def?.kind !== 'character') throw new Error('作画強化の対象はキャラのみです');
  if (target.zone !== 'field' && target.zone !== 'bench') throw new Error('作画強化の対象は場か控えのキャラのみです');

  return {
    ...state,
    cards: state.cards.map((c) =>
      c.instanceId === instanceId ? { ...c, permanentPopularityBonus: c.permanentPopularityBonus + ART_UPGRADE_AMOUNT } : c,
    ),
    funds: state.funds - ART_UPGRADE_PRICE,
  };
}
