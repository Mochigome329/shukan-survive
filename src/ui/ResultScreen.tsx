import { useCallback, useEffect, useRef, useState } from 'react';
import { COMBO_REGISTRY } from '../core/combos';
import { COMPLETION_BONUS_CAP } from '../core/finale';
import type { ComboScoreDetail } from '../core/types';
import { displayName, MAX_WARNINGS } from '../core/types';
import { campaignOf, totalWeeksOf } from '../core/campaign';
import { type GameAction, type GameState } from '../state/gameReducer';
import { playCheer, playCutinNote } from './audio';
import { addDiscovered, getDiscovered } from './discovery';
import { duckMusic, unduckMusic } from './music';
import { ComboCutIn, IllustratedCutIn } from './ComboCutIn';
import { pickVoices } from './voices';
import { selectFeaturedCombos } from './resultPresentation';
import { MangaArt } from './MangaArt';
import { ReaderVoices } from './ReaderVoices';
import './result-screen.css';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/** スコアのカウントアップ表示（13節: 演出投資順位2位） */
function ScoreCounter({ target, instant }: { target: number; instant: boolean }) {
  const [value, setValue] = useState(instant ? target : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (instant) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.floor(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // 非表示タブなどでrAFが止まっても最終値は必ず表示する
    const fallback = setTimeout(() => setValue(target), duration + 150);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(fallback);
    };
  }, [target, instant]);
  return <span className="final-score">{value}</span>;
}

function comboEffectText(combo: ComboScoreDetail): string {
  const parts: string[] = [];
  if (combo.popularityAdd > 0) parts.push(`人気度 +${combo.popularityAdd}`);
  if (combo.buzzAdd > 0) parts.push(`話題性 +${combo.buzzAdd}`);
  if (combo.scoreMultiplier > 1) parts.push(`週スコア ×${combo.scoreMultiplier}`);
  if (combo.charMultiplier > 1) parts.push(`人気度 ×${combo.charMultiplier}`);
  return parts.join(' / ');
}

/*
 * 役の鮮度が下がっているときの但し書き（v7.31）。
 * 加算が黙って目減りすると「なぜ先週より低いのか」が分からないので、
 * 同じ役を続けたせいだと分かる言葉を添える。
 * 加算を持たない役（乗算だけの神回など）には鮮度が効かないので出さない
 */
function comboFreshnessNote(combo: ComboScoreDetail): string | null {
  if (combo.status !== 'applied' || combo.freshness >= 1) return null;
  if (combo.popularityAdd === 0 && combo.buzzAdd === 0) return null;
  return `見飽きられ ×${combo.freshness.toFixed(1)}`;
}

export function ResultComboBanner({ combo, isNew, onReplay }: {
  combo: ComboScoreDetail;
  isNew: boolean;
  onReplay?: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className={`combo-banner combo-${combo.cutInTemplate}`}>
      <span className="combo-banner-name">
        {combo.name}
        {isNew && <em className="new-discovery">図鑑登録!</em>}
        {comboFreshnessNote(combo) && <em className="combo-stale">{comboFreshnessNote(combo)}</em>}
      </span>
      <span className="combo-banner-effect">{comboEffectText(combo)}</span>
      {combo.extraText && <span className="combo-banner-extra">{combo.extraText}</span>}
      {onReplay && <button type="button" className="combo-replay-button" aria-haspopup="dialog"
        aria-label={`${combo.name}の見開きを見る`} onClick={(event) => {
          event.stopPropagation();
          onReplay(event.currentTarget);
        }}>見開きを見る <span aria-hidden="true">↗</span></button>}
    </div>
  );
}

/**
 * 個別演出は初発見と仕込み回収に絞り、絵・役名・効果を読む時間を確保する。
 * 既知の通常役は一覧にまとめるので、一律に全役を待つ必要はない。
 */
const INTRO_MS = 350;
const CUTIN_MS = 1050;
const COUNTUP_MS = 800;

/**
 * カットインに重ねる漫画の描き文字（v7.6c）。
 * カットイン種別ごとに手触りを変える。衝撃は激しく、情感は静かに。
 * 同じ役なら毎回同じ文字が出るよう、IDから決めて選ぶ（毎回変わると演出が落ち着かない）
 */
const ONOMATOPOEIA: Record<string, string[]> = {
  shock: ['baan', 'gogogo', 'dododo', 'bang2', 'interrobang'],
  emotion: ['jiin', 'poroporo', 'horori'],
  setupPayoff: ['katsu', 'don', 'dokidoki'],
  normal: ['waiwai', 'zawazawa', 'don', 'dododo'],
  debut: ['baan', 'katsu', 'bang2'],
  bonus: ['katsu', 'don', 'bang2'],
};

/**
 * 文字列から安定した指標を作る（同じ役には毎回同じ描き文字が出る）。
 * 役側で sfxId を指定していればそれを最優先する（v7.14）
 */
function pickOnomatopoeia(kind: string, seed: string, sfxId?: string): string | undefined {
  if (sfxId) return sfxId;
  const pool = ONOMATOPOEIA[kind] ?? ONOMATOPOEIA.normal!;
  if (pool.length === 0) return undefined;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length]!;
}

/**
 * リザルト画面 =「今週の読者アンケート」（13.3節、v5.2）。
 * 役カットイン→スコアカウントアップ→アンケート判定の順に再生する。タップで早送り。
 * このマウントで初発見の役は図鑑に登録し、「図鑑登録」バッジを出す。
 */
export function ResultScreen({ state, dispatch }: Props) {
  const result = state.lastResult!;
  const b = result.breakdown;
  const run = state.run!;
  const playedWeek = run.week - 1;
  const cleared = b.cleared;
  const cancelled = result.outcome === 'cancelled';
  const isLastImplemented = !cancelled && run.week > totalWeeksOf(state.data, run);

  const applied = b.combos.filter((c) => c.status === 'applied');
  const suppressed = b.combos.filter((c) => c.status !== 'applied');

  // 初発見の役を図鑑へ登録（matchedベース=抑制された役も登録、7.1節）
  const [newDiscoveries] = useState<Set<string>>(() => {
    const known = getDiscovered();
    const all = b.combos.map((c) => c.comboId);
    const fresh = new Set(all.filter((id) => !known.has(id)));
    addDiscovered(all);
    return fresh;
  });
  const featured = selectFeaturedCombos(applied, newDiscoveries);

  // 連載が終わる週（最終回の掲載／打ち切り決定）は、続きを匂わせる声を出さない
  const voices = pickVoices(b, run.runSeed, playedWeek, cancelled || isLastImplemented);

  // この週にキャストへ加わったキャラ（登場・復活・復帰）。役と同じくカットインで見せる（v5.9）
  const debuts = b.stateChanges
    .filter((c): c is { type: 'moveZone'; instanceId: string; to: 'field' } => c.type === 'moveZone' && c.to === 'field')
    .map((c) => {
      const instance = run.cards.find((x) => x.instanceId === c.instanceId);
      const def = instance ? state.data.definitions.get(instance.definitionId) : undefined;
      return def?.kind === 'character' && instance
        ? { instanceId: c.instanceId, definitionId: def.id, name: displayName(def, instance), popularity: def.popularity }
        : null;
    })
    .filter((x): x is { instanceId: string; definitionId: string; name: string; popularity: number } => x !== null)
    // 同じキャラが複数の効果で戻る場合があるので重複を落とす
    .filter((x, i, arr) => arr.findIndex((y) => y.instanceId === x.instanceId) === i);

  // 最終回だけ、完結ボーナスの元になった仕込み役を1つずつ積み上げて見せる（v6.3、design_finale.md 7節）。
  // b.setupComboIds はこの週の完結ボーナス計算に使われた「これまでの」仕込み役（今週分の新規成立は含まない）
  const isFinaleWeek = campaignOf(state.data, run).quotas.get(playedWeek)?.final ?? false;
  const bonusCombos = isFinaleWeek
    ? b.setupComboIds.map((id) => COMBO_REGISTRY.find((c) => c.id === id)).filter((c): c is (typeof COMBO_REGISTRY)[number] => !!c)
    : [];

  // step: 0=導入 → 1..d=登場カットイン → d+1..d+n=役カットイン → +1..+m=完結ボーナス積み上げ → +1=カウントアップ → +2=完了
  const cutInSteps = debuts.length + featured.length;
  const bonusCutInSteps = cutInSteps + bonusCombos.length;
  const totalSteps = bonusCutInSteps + 2;
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState<{ combo: ComboScoreDetail; trigger: HTMLButtonElement } | null>(null);
  const closeReplay = useCallback(() => setReplay(null), []);
  const skipped = useRef(false);

  useEffect(() => {
    if (step >= totalSteps) return;
    const duration = step === 0 ? INTRO_MS : step <= bonusCutInSteps ? CUTIN_MS : COUNTUP_MS;
    const t = setTimeout(() => setStep((s) => s + 1), duration);
    return () => clearTimeout(t);
  }, [step, totalSteps, bonusCutInSteps]);

  // カットインが1枚出るたびに音階が1段上がる（7枚でドレミファソラシ、それ以上は1オクターブ上へ）。
  // 早送り（skip）で複数ステップを飛び越えたときは、飛ばした音は鳴らさず結果の歓声だけ鳴らす
  useEffect(() => {
    if (step === 0) return;
    if (step <= bonusCutInSteps) playCutinNote(step - 1);
    else if (step === totalSteps) playCheer();
  }, [step, bonusCutInSteps, totalSteps]);

  const done = step >= totalSteps;
  const debutCutIn = step >= 1 && step <= debuts.length ? debuts[step - 1]! : null;
  const cutIn = step > debuts.length && step <= cutInSteps ? featured[step - debuts.length - 1]! : null;
  const bonusStep = step > cutInSteps && step <= bonusCutInSteps ? step - cutInSteps : null;
  const bonusCutIn = bonusStep ? bonusCombos[bonusStep - 1]! : null;
  const bonusRunningTotal = bonusStep
    ? Math.min(
        COMPLETION_BONUS_CAP,
        Math.round((1 + campaignOf(state.data, run).balance.completionBonusPerCombo * bonusStep) * 10) / 10,
      )
    : null;
  const showScore = step >= bonusCutInSteps + 1;
  // 通常役は導入直後にまとめて表示。個別の役はカットインが終わったら一覧に加える。
  const pendingFeaturedIds = new Set(
    featured.slice(Math.max(0, step - debuts.length - 1)).map((c) => c.comboId),
  );
  const visibleApplied = done ? applied : step > 0
    ? applied.filter((c) => !pendingFeaturedIds.has(c.comboId))
    : [];

  /*
   * v7.34: カットインの連打中（debut〜役〜完結ボーナスの演出）はBGMを下げ、
   * スコア表示に入ったら戻す。早送り（skip）でstepが一気にtotalStepsへ飛ぶ場合も
   * showScoreがtrueになる一度きりの遷移なので同じ経路で戻る。
   * アンマウント時の戻し忘れ防止に、クリーンアップでも一応呼んでおく
   */
  useEffect(() => {
    if (showScore) unduckMusic();
    else duckMusic();
    return () => unduckMusic();
  }, [showScore]);

  const skip = () => {
    if (!done) {
      skipped.current = true;
      setStep(totalSteps);
    }
  };

  /*
   * v7.31: 最終回はノルマ判定をしないので「連載継続」では意味が通らない。
   * ノルマ0なら cleared が常に true になり、完結したのに
   * 「連載継続」のスタンプが押されていた
   */
  const stampText = isFinaleWeek
    ? '完結'
    : b.quotaBypassed
      ? '判定免除'
      : cancelled
        ? '打ち切り決定'
        : cleared
          ? '連載継続'
          : '打ち切り警告';
  const stampClass = isFinaleWeek ? 'stamp-ok' : cancelled ? 'stamp-ng' : cleared || b.quotaBypassed ? 'stamp-ok' : 'stamp-warn';

  return (
    <div className={`screen result-screen result-edition ${done ? 'result-settled' : 'result-printing'}`} onClick={skip}>
      <header className="result-masthead">
        <div className="result-issue"><span>第</span><strong>{playedWeek}</strong><span>話</span></div>
        <div className="result-heading">
          <p className="result-kicker">週刊サバイブ ／ 掲載結果</p>
          <h1 className="result-week">読者アンケート</h1>
          <p className="result-series">{run.mangaTitle}</p>
        </div>
      </header>

      <section className="result-splash" aria-label="今週の得点と掲載判定">
        <div className="result-score-panel">
          <span className="result-panel-caption">今週のスコア</span>
          {showScore ? (
            <div className="score-line">
              <ScoreCounter target={b.finalScore} instant={done && skipped.current} />
              <span className="score-quota">{b.quota > 0 ? `掲載ノルマ ${b.quota}` : '最終回'}</span>
              <span className="score-formula">
                人気 {b.popularityTotal} × 話題 {Number.isInteger(b.buzzApplied) ? b.buzzApplied : b.buzzApplied.toFixed(1)}
                {b.weekMultiplier > 1 && <strong className="score-multiplier"> × {b.weekMultiplier}</strong>}
                {b.endingMultiplier > 1 && <strong className="score-multiplier"> × {b.endingMultiplier}</strong>}
                {b.completionBonus > 1 && <strong className="score-multiplier"> × {b.completionBonus}</strong>}
              </span>
            </div>
          ) : (
            <div className="result-score-pending"><strong>集計中</strong><span>今週の物語を振り返る</span></div>
          )}
        </div>
        <div className="result-verdict-panel">
          <MangaArt definitionId={cancelled ? 'shibou' : cleared || isFinaleWeek ? 'battle' : 'shugyou'} />
          <span className="result-verdict-heading">{isFinaleWeek ? '物語の、その先へ。' : 'この一話に、すべてを。'}</span>
          {done && <div className={`stamp ${stampClass}`}>{stampText}</div>}
        </div>
      </section>
      {showScore && result.payoffNote && <p className="payoff-note result-payoff">{result.payoffNote}</p>}
      {!done && <button type="button" className="result-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>演出を飛ばして結果を見る →</button>}

      {done && <ReaderVoices voices={voices} week={playedWeek} />}

      <div className="result-columns">
      <section className="result-combos" aria-label="今週成立した役">
      <h2 className="result-section-heading">今週の見せ場</h2>

      <div className="combo-banner-list">
        {visibleApplied.map((c) => (
          <ResultComboBanner key={c.comboId} combo={c} isNew={newDiscoveries.has(c.comboId)}
            onReplay={done ? (trigger) => setReplay({ combo: c, trigger }) : undefined} />
        ))}
        {(done || step > 0) &&
          suppressed.map((c) => (
            <div key={c.comboId} className="combo-banner combo-suppressed">
              <span className="combo-banner-name">
                {c.name}
                {newDiscoveries.has(c.comboId) && <em className="new-discovery">図鑑登録!</em>}
              </span>
              <span className="combo-banner-effect">
                {c.status === 'notApplied' ? '成立（より高い倍率を優先）' : '上位役により抑制'}
              </span>
            </div>
          ))}
        {done && b.combos.length === 0 && <p className="result-empty">今週は役の成立なし。キャラと展開の得点を集計しました。</p>}
      </div>
      </section>

      {done && (
        <>
          {(result.achievedDemands.length > 0 || result.failedDemands.length > 0) && (
            <div className="demand-result">
              <h2 className="result-section-heading">編集部の記録</h2>
              {result.achievedDemands.map((d) => (
                <div key={d.id} className="demand-achieved">
                  編集部の要求を達成: {d.text}（原稿料+2）
                </div>
              ))}
              {result.failedDemands.map((d) => (
                <div key={d.id} className="demand-failed">
                  読者が離れた: {d.text} — 未達（警告+1）
                </div>
              ))}
            </div>
          )}

          {!cancelled && !cleared && !b.quotaBypassed && (
            <p className="warning-note">
              打ち切り警告 {run.warnings}/{MAX_WARNINGS}（ノルマ達成で1つ回復）
            </p>
          )}
          {cancelled && result.cancelReason === 'boss' && <p className="warning-note">ボス週のノルマ未達は一発打ち切り……</p>}

          <details className="breakdown-details" onClick={(e) => e.stopPropagation()}>
            <summary>採点台帳 <span>スコアの内訳を開く</span></summary>
            <div className="breakdown">
              {b.characters.map((c) => (
                <div key={c.instanceId} className="breakdown-row">
                  <span>{c.name}</span>
                  <span>
                    人気 {c.basePopularity}
                    {c.permanentBonus > 0 && ` +${c.permanentBonus}`}
                    {c.trainingBonus > 0 && <em className="training-bonus"> +修行{c.trainingBonus}</em>}
                    {c.multiplier > 1 && <em className="training-bonus"> ×{c.multiplier}</em>}
                  </span>
                </div>
              ))}
              {b.developments.map((d) => (
                <div key={d.instanceId} className="breakdown-row">
                  <span>
                    {d.name}
                    {d.freshness < 1 && <small className="freshness-note">（鮮度{Math.round(d.freshness * 100)}%）</small>}

                  </span>
                  <span>話題 +{Number.isInteger(d.effective) ? d.effective : d.effective.toFixed(1)}</span>
                </div>
              ))}
              {b.stressPenalty < 0 && (
                <div className="breakdown-row breakdown-stress">
                  <span>読者の緊張</span>
                  <span>人気度 {b.stressPenalty}</span>
                </div>
              )}
              {b.stressReleased > 0 && (
                <div className="breakdown-row breakdown-combo">
                  <span>緊張の解放（{b.stressReleased}）</span>
                  <span>話題性 +{b.stressReleased * 5}</span>
                </div>
              )}
              {applied.map((c) => (
                <div key={c.comboId} className="breakdown-row breakdown-combo">
                  <span>
                    役「{c.name}」{comboFreshnessNote(c) && <em className="combo-stale">{comboFreshnessNote(c)}</em>}
                  </span>
                  <span>{comboEffectText(c)}</span>
                </div>
              ))}
              {b.combosDisabled && (
                <div className="breakdown-row breakdown-combo">
                  <span>温泉回</span>
                  <span>役はすべて無効・鮮度全回復</span>
                </div>
              )}
              {b.fee > 0 && (
                <div className="breakdown-row breakdown-subtotal">
                  <span>原稿料</span>
                  <span>+{b.fee}</span>
                </div>
              )}
            </div>
          </details>

          <footer className="result-next">
          <span className="result-next-copy">{cancelled || isLastImplemented ? 'この連載の記録へ' : '原稿を閉じて、次の一話へ。'}</span>
          <button
            type="button"
            className="primary-btn"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'proceedFromResult' });
            }}
          >
            {cancelled || isLastImplemented ? '連載結果へ' : '編集会議へ'} <span aria-hidden="true">→</span>
          </button>
          </footer>
        </>
      )}
      </div>

      {debutCutIn && (
        <IllustratedCutIn key={debutCutIn.instanceId} kind="debut" artId={debutCutIn.definitionId}
          faction={run.cards.find(c => c.instanceId === debutCutIn.instanceId)?.faction}
          name={debutCutIn.name} label="登場" effectText={`人気度 ${debutCutIn.popularity}`}
          extraText="キャストに加わった" sfxId={pickOnomatopoeia('debut', debutCutIn.instanceId)} onSkip={skip} />
      )}

      {cutIn && (
        <ComboCutIn key={cutIn.comboId} combo={cutIn} effectText={comboEffectText(cutIn)}
          freshnessNote={comboFreshnessNote(cutIn)} payoffNote={result.payoffNote}
          isNew={newDiscoveries.has(cutIn.comboId)}
          sfxId={pickOnomatopoeia(cutIn.cutInTemplate, cutIn.comboId, COMBO_REGISTRY.find(c => c.id === cutIn.comboId)?.sfxId)}
          onSkip={skip} />
      )}

      {bonusCutIn && bonusRunningTotal !== null && (
        <IllustratedCutIn key={bonusCutIn.id} kind="bonus" artId={bonusCutIn.id} name={bonusCutIn.name}
          label={`完結ボーナス ${bonusStep}/${bonusCombos.length}`} effectText="積み上げてきた仕込み"
          bonusTotal={`× ${bonusRunningTotal.toFixed(1)}`}
          sfxId={pickOnomatopoeia('bonus', bonusCutIn.id, bonusCutIn.sfxId)} onSkip={skip} />
      )}
      {done && replay && (
        <ComboCutIn key={`replay-${replay.combo.comboId}`} combo={replay.combo}
          effectText={comboEffectText(replay.combo)} freshnessNote={comboFreshnessNote(replay.combo)}
          payoffNote={result.payoffNote} isNew={newDiscoveries.has(replay.combo.comboId)}
          sfxId={pickOnomatopoeia(replay.combo.cutInTemplate, replay.combo.comboId,
            COMBO_REGISTRY.find(c => c.id === replay.combo.comboId)?.sfxId)}
          isReplay skipLabel="結果に戻る" returnFocusTo={replay.trigger} onSkip={closeReplay} />
      )}
    </div>
  );
}
