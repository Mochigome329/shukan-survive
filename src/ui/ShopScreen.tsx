import type { ReactNode } from 'react';
import { availableServices, ART_UPGRADE_AMOUNT, ART_UPGRADE_PRICE, PACK_PRICE } from '../core/shop';
import { displayName } from '../core/types';
import { campaignOf } from '../core/campaign';
import { SHOP_REROLL_LIMIT, type GameAction, type GameState } from '../state/gameReducer';
import { playPurchase } from './audio';
import { SoundToggle } from './SoundToggle';
import { TitleReturnButton } from './TitleReturnButton';
import { useTutorialHighlight } from './useTutorialHighlight';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/**
 * 編集会議のチュートリアル（v7.5b）。
 * 一枚に詰め込むと読む気が失せる長さだったので、基本→キャラ→展開→サービスの4つに割った。
 * ステップ数は gameReducer の SHOP_TUTORIAL_STEP_COUNT と揃えること
 */
const SHOP_TUTORIAL_STEPS: {
  title: string;
  body: ReactNode;
  target?: 'funds' | 'pack' | 'service';
  boxAt?: 'top' | 'bottom';
}[] = [
  {
    title: '編集会議へようこそ',
    target: 'funds',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          毎話のあと、稼いだ<strong>原稿料</strong>で連載を強化できます。
          原稿料は<strong>スコアがノルマを超えるほど多く</strong>もらえます。
        </p>
        <p className="explain-formula">
          今すぐ使い切らず<strong>貯めて次の週に回す</strong>のも手です。ボス週の直前に備えるとよく効きます。
        </p>
      </>
    ),
  },
  {
    title: 'キャラを増やす',
    target: 'pack',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          提示された3枚から1枚を<strong>原稿料{PACK_PRICE}</strong>で選べます。この中には<strong>キャラ</strong>が混ざります。
        </p>
        <p className="explain-formula">
          買ったキャラは<strong>控え</strong>に入ります。そのままでは出番がないので、
          展開カード「<strong>新キャラ登場</strong>」でデビューさせて初めてキャストに加わります。
        </p>
      </>
    ),
  },
  {
    title: '展開カードを増やす',
    target: 'pack',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          同じ枠で<strong>展開カード</strong>も仕入れられます。買うとデッキに加わり、以後は毎週の抽選に混ざります。
        </p>
        <p className="explain-formula">
          仕入れたカードは<strong>次の話の手札に必ず入る</strong>ので、狙った役をすぐ試せます。
          役の素材を揃えたいときは、ここで買って翌週に決めるのが基本の流れです。
        </p>
      </>
    ),
  },
  {
    title: 'サービスを依頼する',
    target: 'service',
    boxAt: 'top',
    body: (
      <>
        <p className="explain-formula">
          <strong>作画強化</strong>（{ART_UPGRADE_PRICE}）— キャラ1人の人気度を恒久+{ART_UPGRADE_AMOUNT}。
          得点の土台そのものが上がります。
        </p>
        <p className="explain-formula">
          そのほか、描き直しの回数を増やす<strong>速筆</strong>、話題性を底上げする<strong>熟考</strong>など、
          連載全体に効く強化を依頼できます。
        </p>
      </>
    ),
  },
];

/** 編集会議（ショップ、12節）: カードパックと作画強化 */
export function ShopScreen({ state, dispatch }: Props) {
  const run = state.run!;
  const data = state.data;
  const pack = state.shopPack ?? [];
  const upgradable = run.cards.filter(
    (c) => (c.zone === 'field' || c.zone === 'bench') && data.definitions.get(c.definitionId)?.kind === 'character',
  );

  const shopTutorial = state.shopTutorialStep !== null ? SHOP_TUTORIAL_STEPS[state.shopTutorialStep] : undefined;
  useTutorialHighlight(shopTutorial?.target);

  /*
   * v7.28: 第24話のあとの編集会議ではカードを仕入れられない。
   * 最終回は展開カードを出さず、キャストもベース点（中央値）に置き換わるので、
   * キャラも展開も出番が無いまま連載が終わってしまう。サービスの依頼だけ残す
   */
  const campaign = campaignOf(data, run);
  const isFinaleNext = campaign.quotas.get(run.week)?.final ?? false;

  return (
    <div className="screen shop-screen" data-tutorial-target={shopTutorial?.target}>
      <header className="play-header">
        <div className="header-title-row">
          <div className="header-actions">
            <TitleReturnButton dispatch={dispatch} />
            <SoundToggle variant="inline" />
          </div>
        </div>
        <div className="header-main-row">
          <span className="week-badge">編集会議</span>
          <span className="quota">
            原稿料 <strong>{run.funds}</strong>
          </span>
        </div>
      </header>

      {state.notice && <div className="notice notice-shop">{state.notice}</div>}
      <p className="shop-lead">
        {isFinaleNext
          ? `次はいよいよ最終回（第${run.week}話）。結末を選ぶだけの回なのでカードは仕入れられない。`
          : `次の話（第${run.week}話・ノルマ${campaign.quotas.get(run.week)?.quota ?? '-'}）に向けて補強できる。`}
      </p>

      {state.artUpgradeMode ? (
        <div className="shop-items">
          <p className="shop-lead">作画を強化するキャラを選ぶ（人気度+{ART_UPGRADE_AMOUNT}）</p>
          {upgradable.map((c) => {
            const def = data.definitions.get(c.definitionId)!;
            return (
              <button
                key={c.instanceId}
                type="button"
                className="shop-item shop-item-char shop-upgrade-target"
                data-sfx="skip"
                onClick={() => {
                  playPurchase();
                  dispatch({ type: 'upgradeArtTarget', instanceId: c.instanceId });
                }}
              >
                <span className="shop-item-name">{displayName(def, c)}</span>
                <span className="shop-item-value">
                  人気 {def.kind === 'character' ? def.popularity + c.permanentPopularityBonus : 0}
                  {' → '}
                  {(def.kind === 'character' ? def.popularity + c.permanentPopularityBonus : 0) + ART_UPGRADE_AMOUNT}
                </span>
                {c.zone === 'bench' && <span className="shop-item-note">控え</span>}
              </button>
            );
          })}
          <button type="button" className="small-btn ghost" onClick={() => dispatch({ type: 'toggleArtUpgradeMode' })}>
            やめる
          </button>
        </div>
      ) : (
        <div className="shop-items">
          {!isFinaleNext && (
          <div className="shop-group shop-group-pack">
          {pack.map((defId) => {
            const def = data.definitions.get(defId)!;
            const isChar = def.kind === 'character';
            return (
              <div key={defId} className={`shop-item ${isChar ? 'shop-item-char' : 'shop-item-dev'} ${def.rare ? 'shop-item-rare' : ''}`}>
                <div className="shop-item-head">
                  <span className="card-kind">{isChar ? 'キャラ' : '展開'}</span>
                  {def.rare && <span className="card-rare">レア</span>}
                  <span className="shop-item-name">{def.name}</span>
                  <span className="shop-item-value">{isChar ? `人気 ${def.popularity}` : `話題 +${def.buzz}`}</span>
                </div>
                <p className="shop-item-desc">{def.descriptions.revealed}</p>
                <p className="shop-item-note">
                  {isChar ? '仕入れると控えに入る。「新キャラ登場」でデビュー' : '仕入れると次の話の手札に必ず入る'}
                </p>
                <button
                  type="button"
                  className="small-btn"
                  data-sfx="skip"
                  disabled={run.funds < PACK_PRICE}
                  onClick={() => {
                    playPurchase();
                    dispatch({ type: 'buyShopCard', definitionId: defId });
                  }}
                >
                  仕入れる（原稿料{PACK_PRICE}）
                </button>
              </div>
            );
          })}
          {pack.length === 0 && <p className="shop-empty">仕入れられるカードがない</p>}
          {pack.length > 0 && (
            <button
              type="button"
              className="small-btn ghost shop-reroll"
              disabled={state.shopRerolls >= SHOP_REROLL_LIMIT}
              onClick={() => dispatch({ type: 'rerollShopPack' })}
            >
              {state.shopRerolls >= SHOP_REROLL_LIMIT ? '入れ替え済み' : 'ラインナップを入れ替える（1回まで・無料）'}
            </button>
          )}
          </div>
          )}

          {/* v7.5b: チュートリアルで「仕入れ」と「サービス」を別々に指せるよう、束ねてある */}
          <div className="shop-group shop-group-service">
          <div className="shop-item shop-item-service">
            <div className="shop-item-head">
              <span className="card-kind">サービス</span>
              <span className="shop-item-name">作画強化</span>
            </div>
            <p className="shop-item-desc">キャラ1枚の人気度を恒久+{ART_UPGRADE_AMOUNT}。毎週の基礎点が上がる</p>
            <button
              type="button"
              className="small-btn"
              disabled={run.funds < ART_UPGRADE_PRICE || upgradable.length === 0}
              onClick={() => dispatch({ type: 'toggleArtUpgradeMode' })}
            >
              強化する（原稿料{ART_UPGRADE_PRICE}）
            </button>
          </div>

          {availableServices(run).map((service) => (
            <div key={service.id} className="shop-item shop-item-service">
              <div className="shop-item-head">
                <span className="card-kind">サービス</span>
                <span className="shop-item-name">{service.name}</span>
                {service.once && <span className="shop-item-value">1回限り</span>}
              </div>
              <p className="shop-item-desc">{service.description}</p>
              <button
                type="button"
                className="small-btn"
                data-sfx="skip"
                disabled={run.funds < service.price}
                onClick={() => {
                  playPurchase();
                  dispatch({ type: 'buyService', serviceId: service.id });
                }}
              >
                依頼する（原稿料{service.price}）
              </button>
            </div>
          ))}
          </div>
        </div>
      )}

      <button type="button" className="primary-btn shop-leave" onClick={() => dispatch({ type: 'leaveShop' })}>
        第{run.week}話を描く
      </button>

      {/* 初回だけ、この画面で何ができるかを4つに分けて説明する（v7.5b） */}
      {shopTutorial && (
        <div className={`overlay tutorial-overlay ${shopTutorial.boxAt ? `tutorial-box-${shopTutorial.boxAt}` : ''}`}>
          <div className="explain-box tutorial-box">
            <div className="tutorial-step-count">
              {state.shopTutorialStep! + 1} / {SHOP_TUTORIAL_STEPS.length}
            </div>
            <h2>{shopTutorial.title}</h2>
            {shopTutorial.body}
            <div className="tutorial-actions">
              <button type="button" className="small-btn ghost" onClick={() => dispatch({ type: 'dismissShopTutorial' })}>
                スキップ
              </button>
              <button type="button" className="primary-btn" onClick={() => dispatch({ type: 'advanceShopTutorial' })}>
                {state.shopTutorialStep! + 1 >= SHOP_TUTORIAL_STEPS.length ? 'はじめる' : '次へ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
