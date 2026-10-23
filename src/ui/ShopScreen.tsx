import { availableServices, ART_UPGRADE_AMOUNT, ART_UPGRADE_PRICE, PACK_PRICE } from '../core/shop';
import { displayName } from '../core/types';
import { campaignOf } from '../core/campaign';
import { SHOP_REROLL_LIMIT, type GameAction, type GameState } from '../state/gameReducer';
import { playPurchase } from './audio';
import { SoundToggle } from './SoundToggle';
import { TitleReturnButton } from './TitleReturnButton';
import { getShopCardHint } from '../core/editorHints';
import { MangaArt } from './MangaArt';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/** 編集会議（ショップ、12節）: カードパックと作画強化 */
export function ShopScreen({ state, dispatch }: Props) {
  const run = state.run!;
  const data = state.data;
  const pack = state.shopPack ?? [];
  const upgradable = run.cards.filter(
    (c) => (c.zone === 'field' || c.zone === 'bench') && data.definitions.get(c.definitionId)?.kind === 'character',
  );

  const shopTutorial = state.shopTutorialStep !== null;

  /*
   * v7.28: 第24話のあとの編集会議ではカードを仕入れられない。
   * 最終回は展開カードを出さず、キャストもベース点（中央値）に置き換わるので、
   * キャラも展開も出番が無いまま連載が終わってしまう。サービスの依頼だけ残す
   */
  const campaign = campaignOf(data, run);
  const isFinaleNext = campaign.quotas.get(run.week)?.final ?? false;

  return (
    <div className="screen shop-screen">
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

      {shopTutorial && (
        <aside className="issue-guide shop-guide">
          <div className="issue-guide-top"><span>担当から、次の1話へ</span><button type="button" className="guide-dismiss" onClick={() => dispatch({ type: 'dismissShopTutorial' })}>閉じる</button></div>
          <strong>次に描きたい展開を仕入れよう。</strong>
          <p>展開カードは次の手札に必ず入ります。キャラは控えに加わり、「新キャラ登場」でデビュー。人気を育てるなら作画強化へ。</p>
        </aside>
      )}

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
            const contextHint = getShopCardHint(data, run, defId);
            return (
              <div key={defId} className={`shop-item shop-illustrated ${isChar ? 'shop-item-char' : 'shop-item-dev'} ${def.rare ? 'shop-item-rare' : ''}`}>
                <MangaArt definitionId={def.id} faction={def.kind === 'character' ? def.faction : null} />
                <div className="shop-item-head">
                  <span className="card-kind">{isChar ? 'キャラ' : '展開'}</span>
                  {def.rare && <span className="card-rare">レア</span>}
                  <span className="shop-item-name">{def.name}</span>
                  <span className="shop-item-value">{isChar ? `人気 ${def.popularity}` : `話題 +${def.buzz}`}</span>
                </div>
                <p className="shop-item-desc">{def.descriptions.revealed}</p>
                {contextHint && <p className="shop-context-hint">{contextHint}</p>}
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

    </div>
  );
}
