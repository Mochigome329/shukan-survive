import { useEffect, useRef, useState } from 'react';
import { COMBO_REGISTRY } from '../core/combos';
import { COMPLETION_BONUS_CAP, COMPLETION_BONUS_PER_COMBO } from '../core/finale';
import type { ComboScoreDetail } from '../core/types';
import { MAX_WARNINGS } from '../core/types';
import { MAX_PLAYABLE_WEEK, type GameAction, type GameState } from '../state/gameReducer';
import { playCheer, playCutinNote } from './audio';
import { addDiscovered, getDiscovered } from './discovery';
import { SfxMark } from './SfxMark';
import { pickVoices } from './voices';

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

/**
 * 演出のテンポ（v7.3でスピードアップ）。
 * カットインのスラム演出自体は0.28秒（styles.cssの`cutin-slam`）なので、
 * CUTIN_MSからその分を引いた時間が実際に静止して読める時間になる。
 * 役が5つ6つ並ぶ週は以前の1100msだと待たされる感が強かった
 */
const INTRO_MS = 350;
const CUTIN_MS = 700;
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

/** 文字列から安定した指標を作る（同じ役には毎回同じ描き文字が出る） */
function pickOnomatopoeia(kind: string, seed: string): string | undefined {
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
  const isLastImplemented = !cancelled && run.week > MAX_PLAYABLE_WEEK;

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

  // 連載が終わる週（最終回の掲載／打ち切り決定）は、続きを匂わせる声を出さない
  const voices = pickVoices(b, run.runSeed, playedWeek, cancelled || isLastImplemented);

  // この週にキャストへ加わったキャラ（登場・復活・復帰）。役と同じくカットインで見せる（v5.9）
  const debuts = b.stateChanges
    .filter((c): c is { type: 'moveZone'; instanceId: string; to: 'field' } => c.type === 'moveZone' && c.to === 'field')
    .map((c) => {
      const instance = run.cards.find((x) => x.instanceId === c.instanceId);
      const def = instance ? state.data.definitions.get(instance.definitionId) : undefined;
      return def?.kind === 'character' ? { instanceId: c.instanceId, name: def.name, popularity: def.popularity } : null;
    })
    .filter((x): x is { instanceId: string; name: string; popularity: number } => x !== null)
    // 同じキャラが複数の効果で戻る場合があるので重複を落とす
    .filter((x, i, arr) => arr.findIndex((y) => y.instanceId === x.instanceId) === i);

  // 最終回だけ、完結ボーナスの元になった仕込み役を1つずつ積み上げて見せる（v6.3、design_finale.md 7節）。
  // b.setupComboIds はこの週の完結ボーナス計算に使われた「これまでの」仕込み役（今週分の新規成立は含まない）
  const isFinaleWeek = state.data.quotas.get(playedWeek)?.final ?? false;
  const bonusCombos = isFinaleWeek
    ? b.setupComboIds.map((id) => COMBO_REGISTRY.find((c) => c.id === id)).filter((c): c is (typeof COMBO_REGISTRY)[number] => !!c)
    : [];

  // step: 0=導入 → 1..d=登場カットイン → d+1..d+n=役カットイン → +1..+m=完結ボーナス積み上げ → +1=カウントアップ → +2=完了
  const cutInSteps = debuts.length + applied.length;
  const bonusCutInSteps = cutInSteps + bonusCombos.length;
  const totalSteps = bonusCutInSteps + 2;
  const [step, setStep] = useState(0);
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
  const cutIn = step > debuts.length && step <= cutInSteps ? applied[step - debuts.length - 1]! : null;
  const bonusStep = step > cutInSteps && step <= bonusCutInSteps ? step - cutInSteps : null;
  const bonusCutIn = bonusStep ? bonusCombos[bonusStep - 1]! : null;
  const bonusRunningTotal = bonusStep
    ? Math.min(COMPLETION_BONUS_CAP, Math.round((1 + COMPLETION_BONUS_PER_COMBO * bonusStep) * 10) / 10)
    : null;
  const showScore = step >= bonusCutInSteps + 1;

  const skip = () => {
    if (!done) {
      skipped.current = true;
      setStep(totalSteps);
    }
  };

  const stampText = b.quotaBypassed ? '判定免除' : cancelled ? '打ち切り決定' : cleared ? '連載継続' : '打ち切り警告';
  const stampClass = cancelled ? 'stamp-ng' : cleared || b.quotaBypassed ? 'stamp-ok' : 'stamp-warn';

  return (
    <div className="screen result-screen" onClick={skip}>
      <h1 className="result-week">第{playedWeek}話 読者アンケート</h1>

      <div className="combo-banner-list">
        {applied.slice(0, done ? applied.length : Math.max(0, step - debuts.length - 1)).map((c) => (
          <div key={c.comboId} className={`combo-banner combo-${c.cutInTemplate}`}>
            <span className="combo-banner-name">
              {c.name}
              {newDiscoveries.has(c.comboId) && <em className="new-discovery">図鑑登録!</em>}
            </span>
            <span className="combo-banner-effect">{comboEffectText(c)}</span>
          </div>
        ))}
        {(done || step > applied.length) &&
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
      </div>

      {showScore && (
        <div className="score-line">
          <span className="score-formula">
            人気 {b.popularityTotal} × 話題 {Number.isInteger(b.buzzApplied) ? b.buzzApplied : b.buzzApplied.toFixed(1)}
            {b.weekMultiplier > 1 && <strong className="score-multiplier"> × {b.weekMultiplier}</strong>}
            {b.endingMultiplier > 1 && <strong className="score-multiplier"> × {b.endingMultiplier}</strong>}
            {b.completionBonus > 1 && <strong className="score-multiplier"> × {b.completionBonus}</strong>}
          </span>
          <ScoreCounter target={b.finalScore} instant={done && skipped.current} />
          <span className="score-quota">ノルマ {b.quota}</span>
        </div>
      )}

      {done && (
        <>
          <div className="voices">
            {voices.map((v) => (
              <span key={v} className="voice-bubble">{v}</span>
            ))}
          </div>

          {(result.achievedDemands.length > 0 || result.failedDemands.length > 0) && (
            <div className="demand-result">
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

          <div className={`stamp ${stampClass}`}>{stampText}</div>
          {!cancelled && !cleared && !b.quotaBypassed && (
            <p className="warning-note">
              打ち切り警告 {run.warnings}/{MAX_WARNINGS}（ノルマ達成で1つ回復）
            </p>
          )}
          {cancelled && result.cancelReason === 'boss' && <p className="warning-note">ボス週のノルマ未達は一発打ち切り……</p>}

          <details className="breakdown-details" onClick={(e) => e.stopPropagation()}>
            <summary>スコア明細</summary>
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
                  <span>役「{c.name}」</span>
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

          <button
            type="button"
            className="primary-btn"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'proceedFromResult' });
            }}
          >
            {cancelled ? '結果へ' : isLastImplemented ? '結果へ' : '編集会議へ'}
          </button>
        </>
      )}

      {debutCutIn && (
        <div className="cutin-overlay cutin-debut">
          <SfxMark key={debutCutIn.instanceId} id={pickOnomatopoeia('debut', debutCutIn.instanceId) ?? ''} />
          <div className="cutin-panel">
            <span className="cutin-label">登場</span>
            <span className="cutin-name">{debutCutIn.name}</span>
            <span className="cutin-effect">人気度 {debutCutIn.popularity}</span>
            <span className="cutin-extra">キャストに加わった</span>
          </div>
        </div>
      )}

      {cutIn && (
        <div className={`cutin-overlay cutin-${cutIn.cutInTemplate}`}>
          <SfxMark key={cutIn.comboId} id={pickOnomatopoeia(cutIn.cutInTemplate, cutIn.comboId) ?? ''} />
          <div className="cutin-panel">
            <span className="cutin-label">{newDiscoveries.has(cutIn.comboId) ? '役 初成立' : '成立'}</span>
            <span className="cutin-name">{cutIn.name}</span>
            <span className="cutin-effect">{comboEffectText(cutIn)}</span>
            {cutIn.extraText && <span className="cutin-extra">{cutIn.extraText}</span>}
            {newDiscoveries.has(cutIn.comboId) && <span className="cutin-codex">役図鑑に登録</span>}
          </div>
        </div>
      )}

      {bonusCutIn && bonusRunningTotal !== null && (
        <div className="cutin-overlay cutin-bonus">
          <SfxMark key={bonusCutIn.id} id={pickOnomatopoeia('bonus', bonusCutIn.id) ?? ''} />
          <div className="cutin-panel">
            <span className="cutin-label">完結ボーナス {bonusStep}/{bonusCombos.length}</span>
            <span className="cutin-name">{bonusCutIn.name}</span>
            <span className="cutin-effect">積み上げてきた仕込み</span>
            <span className="cutin-bonus-total">× {bonusRunningTotal.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
