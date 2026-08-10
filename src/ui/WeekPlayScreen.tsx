import { useState, type ReactNode } from 'react';
import { castOf, HIGHLIGHT_LIMIT, previewScore, redrawLimit, rosterOf, validateSelection } from '../core/run';
import { displayName, MAX_STOCK, MAX_WARNINGS, OFF_STAGE_POPULARITY_RATE } from '../core/types';
import { campaignOf } from '../core/campaign';
import { type GameAction, type GameState } from '../state/gameReducer';
import { playFlip, playWrite } from './audio';
import { CardView } from './CardView';
import { CodexOverlay } from './CodexScreen';
import { SerialMemo } from './SerialMemo';
import { RunTimeline } from './RunTimeline';
import { ActIntro } from './ActIntro';
import { EndingPicker } from './EndingPicker';
import { SoundToggle } from './SoundToggle';
import { TitleReturnButton } from './TitleReturnButton';
import { useTutorialHighlight } from './useTutorialHighlight';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const TAG_LABEL: Record<string, string> = { battle: 'バトル' };

/**
 * 初回チュートリアル（v7.5）。画面の上から順に「どこが何か・何をするか」を追う。
 * 以前は一枚の要約モーダルだけで、どこを触ればいいのかは伝えていなかった。
 * ステップ数は gameReducer の TUTORIAL_STEP_COUNT と揃えること
 */
const TUTORIAL_STEPS: {
  title: string;
  body: ReactNode;
  /** この手順で光らせる画面の部位（CSSの `[data-tutorial-target]` が拾う） */
  target?: 'header' | 'cast' | 'hand' | 'preview' | 'codex' | 'status';
  /** 光らせる部位を隠さないよう、説明の箱を上下どちらへ寄せるか */
  boxAt?: 'top' | 'bottom';
}[] = [
  {
    title: 'ようこそ、担当です',
    body: (
      <>
        <p className="explain-formula">
          あなたは週刊連載の漫画家。毎週「今週の話」を作り、読者アンケートで<strong>ノルマ</strong>を超え続ける。
        </p>
        <p className="explain-formula">
          この画面の見かたを、上から順に説明します。
        </p>
      </>
    ),
  },
  {
    title: '① 画面いちばん上：話数とノルマ',
    target: 'header',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          作品タイトルの下に<strong>今が何話か</strong>と<strong>今週のノルマ</strong>が出ます。
          {/* v7.32: 短期連載（全13話）だと帯の目盛りが25話ぶんではなくなるので、話数を明言しない */}
          その下の細い帯が連載全体の進み具合と<strong>ボス週の位置</strong>。
        </p>
        <p className="explain-formula">
          ノルマを割ると<strong>打ち切り警告</strong>が1つ増え、<strong>3つで連載終了</strong>。達成すると1つ減ります。
        </p>
      </>
    ),
  },
  {
    title: '② キャスト：毎週の得点源',
    target: 'cast',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          並んでいるキャラが連載のレギュラー。<strong>この人たちの人気度の合計</strong>が得点の土台になります。
        </p>
        <p className="explain-formula">
          出演枠は<strong>{HIGHLIGHT_LIMIT}人まで</strong>。{HIGHLIGHT_LIMIT}人以下なら全員が自動で出演し、
          増えたらキャラをタップして誰を出すか選びます。控えのキャラは「新キャラ登場」でデビューさせます。
        </p>
      </>
    ),
  },
  {
    title: '③ 手札：今週の展開を選ぶ',
    target: 'hand',
    boxAt: 'top',
    body: (
      <>
        <p className="explain-formula">
          下に並ぶのが<strong>展開カード</strong>。ここから<strong>0〜4枚</strong>選んで今週の話を組み立てます。
        </p>
        <p className="explain-formula">
          カードの「<strong>?</strong>」を押すと効果が読めます。対象を選ぶカードは、選んだあとキャラをタップして指定します。
        </p>
      </>
    ),
  },
  {
    title: '④ 予想スコアと、やり直す手段',
    target: 'preview',
    boxAt: 'top',
    body: (
      <>
        <p className="explain-formula">
          カードを選ぶと<strong>予想スコア</strong>と<strong>ノルマまであといくつか</strong>が出ます。暗算は不要です。
        </p>
        <p className="explain-formula">
          手札が悪ければ<strong>描き直し</strong>（週2回）で引き直せます。
          今週使わないカードは<strong>ネーム保管</strong>で最大{MAX_STOCK}枚、来週へ持ち越せます。
        </p>
      </>
    ),
  },
  {
    title: '⑤ 役：この遊びの主役',
    target: 'codex',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          カードの組み合わせが噛み合うと<strong>役</strong>が成立し、カットインが入って大きく加点されます。
          「バトル＋修行」で〈王道〉など、漫画あるあるが役になっています。
        </p>
        <p className="explain-formula">
          どんな役があるかは、この<strong>役図鑑</strong>ボタンからいつでも確認できます。
          まだ出したことのない役はぼかして出るので、ヒントを見ながら狙ってみてください。
        </p>
      </>
    ),
  },
  {
    title: '⑥ 連載メモと編集部',
    target: 'status',
    boxAt: 'bottom',
    body: (
      <>
        <p className="explain-formula">
          <strong>📋 連載メモ</strong>は、いま仕込んである状態の一覧です。
          伏線・恋愛や修行のフラグ・再登場待ちのキャラなど、あとで回収できるものが溜まっていきます。
          再登場できる相手がいるときは、ここから戻せます。
        </p>
        <p className="explain-formula">
          <strong>✉ 編集部</strong>は、期限つきの注文です。
          「第4話までにライバルを出す」のように、応えると<strong>原稿料がもらえ</strong>、
          期限を過ぎると<strong>打ち切り警告が1つ増えます</strong>。残り話数はボタンに出ています。
        </p>
      </>
    ),
  },
  {
    title: '⑦ スコアの式',
    body: (
      <>
        <p className="explain-formula">
          <strong>キャスト人気 × 話題性</strong> ＝ 今週のスコア。
          キャラを育てて人気を上げ、展開と役で話題性を積むほど伸びます。
        </p>
        <p className="explain-formula">
          同じ展開ばかり続けると<strong>鮮度</strong>が落ちて話題性が下がるので、たまには別の手を。
        </p>
        <p className="explain-tap">それでは、第1話をどうぞ。</p>
      </>
    ),
  },
];

/** ボス週ごとの事前ブリーフィング（v7.5）。何が起きるか＋何を準備すべきか */
const BOSS_BRIEFINGS: Record<string, { what: ReactNode; prepare: ReactNode }> = {
  合併号: {
    what: (
      <>
        <strong>手札が2枚少なく</strong>（7枚→5枚）、ノルマも跳ね上がります。選択肢が減るぶん事故が起きやすい週です。
      </>
    ),
    prepare: (
      <>
        前の週に<strong>ネーム保管</strong>で強いカードを持ち越しておくと、手札減をそのまま埋められます。
        編集会議で仕入れたカードも次の話の手札に必ず入るので、直前の買い物が効きます。
      </>
    ),
  },
  人気投票: {
    what: (
      <>
        読者はキャラそのものに投票するため、この週だけ<strong>話題性が固定1</strong>になります。
        展開カードや役で積んだ話題性は<strong>まったく点になりません</strong>（ノルマが急に低く見えるのはこのため）。
      </>
    ),
    prepare: (
      <>
        点になるのは<strong>出演キャラの人気度だけ</strong>。
        「才能の片鱗」「能力覚醒」「武器ゲット」などで<strong>キャラの人気度を恒久的に上げて</strong>おき、
        編集会議の<strong>作画強化</strong>も人気度に直結します。人気度を上げる役と週スコア倍率は有効です。
      </>
    ),
  },
  新連載攻勢: {
    what: (
      <>
        特殊ルールはありませんが、<strong>純粋にノルマが高い</strong>週です。最終回の直前でもあります。
      </>
    ),
    prepare: (
      <>
        小細工より<strong>素直に大きい週</strong>を作れる形を用意しておくこと。
        役を重ねられる手札をネーム保管で温存し、連発で落ちた<strong>鮮度を回復</strong>させておくと安定します。
      </>
    ),
  },
};

/**
 * 週プレイ画面（13.2節、v5.2）。
 * 上部にタイトル・ノルマ・警告、キャスト（常駐）、場（選択した展開）、下部に手札（展開のみ）。
 */
export function WeekPlayScreen({ state, dispatch }: Props) {
  const run = state.run!;
  const data = state.data;
  const campaign = campaignOf(data, run);
  const quotaEntry = campaign.quotas.get(run.week)!;
  const byId = new Map(run.cards.map((c) => [c.instanceId, c]));
  const defOf = (id: string) => data.definitions.get(byId.get(id)!.definitionId)!;
  // 控えキャラのニックネーム編集ポップアップ（v7.29）。単なる画面内UI状態なので保存対象には含めない
  const [editingNickname, setEditingNickname] = useState<{ instanceId: string; draft: string } | null>(null);

  // ボス週の事前ブリーフィング（v7.5）: 対象週の情報と、ボスごとの説明文を組み立てる
  const briefingEntry = state.bossBriefingWeek !== null ? campaign.quotas.get(state.bossBriefingWeek) : undefined;
  const briefingText = briefingEntry?.boss ? BOSS_BRIEFINGS[briefingEntry.boss] : undefined;
  const bossBriefing =
    briefingEntry?.boss && briefingText
      ? { week: briefingEntry.week, boss: briefingEntry.boss, quota: briefingEntry.quota, ...briefingText }
      : null;

  const validity = validateSelection(data, run, state.selection);
  /*
   * v7.28: 選択中の結末カードをプレビューにも渡す。
   * 以前は渡しておらず、結末を選んでも予想スコアが変わらなかった。
   * 最終回が「結末を選ぶだけの回」になった今、ここが反映されないと
   * 唯一の選択の結果が確定するまで分からないことになる
   */
  const preview =
    validity.ok && !state.pendingTargetDev && !state.pendingFactionChoice
      ? previewScore(data, run, state.selection, state.selectedEnding)
      : null;
  const redrawsLeft = redrawLimit(run) - run.redrawsUsed;

  const cast = castOf(data, run);
  const roster = rosterOf(data, run);
  const castPopularity = cast.reduce((sum, c) => {
    const def = data.definitions.get(c.definitionId)!;
    return def.kind === 'character' ? sum + def.popularity + c.permanentPopularityBonus + c.flags.training * 3 : sum;
  }, 0);
  // 出演していない在籍キャラの半減寄与（v6.1）
  const offStagePopularity = roster
    .filter((c) => !cast.some((h) => h.instanceId === c.instanceId))
    .reduce((sum, c) => {
      const def = data.definitions.get(c.definitionId)!;
      return def.kind === 'character'
        ? sum + Math.floor((def.popularity + c.permanentPopularityBonus) * OFF_STAGE_POPULARITY_RATE)
        : sum;
    }, 0);
  const benchChars = run.cards.filter(
    (c) => c.zone === 'bench' && data.definitions.get(c.definitionId)?.kind === 'character',
  );
  const deadChars = run.cards.filter(
    (c) => c.zone === 'dead' && data.definitions.get(c.definitionId)?.kind === 'character',
  );
  const waitingChars = run.cards.filter(
    (c) => c.zone === 'waiting' && data.definitions.get(c.definitionId)?.kind === 'character',
  );
  const activeDemands = run.demands.filter((d) => d.achievedWeek === null && !d.failed);
  const inspected = state.inspectedCardId ? data.definitions.get(state.inspectedCardId) : null;
  const pendingDef = state.pendingTargetDev ? defOf(state.pendingTargetDev) : null;
  const pendingDevName = pendingDef?.name ?? null;
  const pendingTargetKind = pendingDef?.kind === 'development' ? pendingDef.target : null;
  // 陣営を選べるキャラのデビュー待ち（v6.2）: 対象として決まったキャラの名前を表示する
  const factionPendingTargetId = state.pendingFactionChoice ? state.selection.targets[state.pendingFactionChoice] : null;
  const factionPendingName = factionPendingTargetId
    ? displayName(defOf(factionPendingTargetId), byId.get(factionPendingTargetId)!)
    : null;
  const fieldIds = state.selection.cards;
  const handIds = run.hand.filter((id) => !fieldIds.includes(id));

  // 対象に選ばれているキャラ → 展開名のマップ（キャストカードに表示）
  const targetedBy = new Map<string, string[]>();
  for (const [devId, charId] of Object.entries(state.selection.targets)) {
    if (!charId) continue;
    targetedBy.set(charId, [...(targetedBy.get(charId) ?? []), defOf(devId).name]);
  }

  // チュートリアル中は、説明している部位をCSSで浮かび上がらせる（v7.5b）
  const tutorial = state.tutorialStep !== null ? TUTORIAL_STEPS[state.tutorialStep] : undefined;
  useTutorialHighlight(tutorial?.target);

  return (
    <div
      className={`screen play-screen ${quotaEntry.boss ? 'play-screen-boss' : ''}`}
      data-tutorial-target={tutorial?.target}
    >
      <header className="play-header">
        <div className="header-title-row">
          <span className="manga-title">{run.mangaTitle}</span>
          <div className="header-actions">
            <TitleReturnButton dispatch={dispatch} />
            <SoundToggle variant="inline" />
            {/* v7.5: 役図鑑は話づくり中こそ見たいので、画面を切り替えずに重ねて開けるようにした */}
            <button type="button" className="small-btn ghost codex-btn" onClick={() => dispatch({ type: 'toggleCodexOverlay' })}>
              役図鑑
            </button>
          </div>
        </div>
        <div className="header-main-row">
          <span className="week-badge">第{run.week}話</span>
          <span className="quota">
            {/* v7.28: 最終回にノルマは無い（結末を選ぶだけの回で、打ち切られない） */}
            {quotaEntry.final ? (
              <strong>完結</strong>
            ) : (
              <>
                ノルマ <strong>{quotaEntry.quota}</strong>
              </>
            )}
            {quotaEntry.boss && <em className="boss-label">{quotaEntry.boss}</em>}
          </span>
          <span className={`warning-meter ${run.warnings > 0 ? 'warning-active' : ''}`} title="打ち切り警告">
            {Array.from({ length: MAX_WARNINGS }, (_, i) => (i < run.warnings ? '⚠' : '・')).join('')}
          </span>
        </div>
        <RunTimeline campaign={campaign} week={run.week} />
        <div className="header-sub-row">
          {run.stress > 0 && (
            <span className="stress-meter">
              緊張<span className="stress-dots">{'●'.repeat(run.stress)}</span>
              <small>人気-{run.stress * 6}／解放でカタルシス</small>
            </span>
          )}
        </div>
      </header>
      {/*
       * v7.6: 「次のボス週は第N話…」という予告バナーを削除した。
       * RunTimelineのキャプション（あとN話）と内容が重複していたため。
       * ここに残すのは「今週まさにボス週／最終回」という、他では言っていない能動的な警告だけ
       */}
      {quotaEntry.final ? (
        <div className="boss-calendar boss-calendar-now">
          ★ 最終回。展開カードは出さず、結末だけを選ぶ。人気度と話題性はこれまでの連載の中央値になる
        </div>
      ) : (
        quotaEntry.boss && (
          <div className="boss-calendar boss-calendar-now">
            ⚠ 今週はボス週「{quotaEntry.boss}」。ノルマ未達で即打ち切り
            {quotaEntry.boss === '合併号' && '（手札2枚減）'}
            {quotaEntry.boss === '人気投票' && '（話題性は固定1。人気度で勝負）'}
          </div>
        )
      )}

      {state.notice && <div className="notice">{state.notice}</div>}
      {!state.notice && pendingDevName && (
        <div className="notice notice-target">
          {pendingTargetKind === 'oneBench'
            ? `「${pendingDevName}」でデビューさせる控えキャラをタップしてください`
            : pendingTargetKind === 'oneBenchEnemy'
              ? `「${pendingDevName}」でデビューさせる敵キャラをタップしてください`
              : pendingTargetKind === 'oneEnemy'
                ? `「${pendingDevName}」の対象となる敵キャラをタップしてください`
                : pendingTargetKind === 'oneWaiting'
                  ? `「${pendingDevName}」で呼び戻す再登場待ちのキャラをタップしてください`
                  : `「${pendingDevName}」の対象キャラをタップしてください`}
        </div>
      )}
      {!state.notice && !pendingDevName && factionPendingName && (
        <div className="notice notice-target faction-choice-notice">
          <span>「{factionPendingName}」の陣営を選んでください</span>
          <div className="faction-choice-buttons">
            <button
              type="button"
              className="small-btn faction-choice-ally"
              onClick={() => dispatch({ type: 'chooseFaction', devId: state.pendingFactionChoice!, faction: 'ally' })}
            >
              仲間として登場
            </button>
            <button
              type="button"
              className="small-btn faction-choice-enemy"
              onClick={() => dispatch({ type: 'chooseFaction', devId: state.pendingFactionChoice!, faction: 'enemy' })}
            >
              敵として登場
            </button>
          </div>
        </div>
      )}

      <section className="cast">
        <div className="cast-toolbar">
          <span className="hand-label">
            今週の出演
            <em className="highlight-count">
              {cast.length}/{HIGHLIGHT_LIMIT}
            </em>
          </span>
          <span className="cast-total">
            人気度合計 {castPopularity + offStagePopularity}
            {offStagePopularity > 0 && <small>（出演{castPopularity} + 控えめ{offStagePopularity}）</small>}
          </span>
        </div>
        {roster.length > cast.length && (
          <p className="highlight-hint">
            タップで今週の出演者を入れ替える。役の対象になるのは出演中の{HIGHLIGHT_LIMIT}人だけで、
            出ていない在籍キャラは人気度が半分だけ乗る
          </p>
        )}
        <div className="cast-cards">
          {roster.map((c) => {
            const onStage = cast.some((h) => h.instanceId === c.instanceId);
            return (
              <CardView
                key={c.instanceId}
                instance={c}
                def={data.definitions.get(c.definitionId)!}
                compact
                offStage={!onStage}
                targetHighlight={
                  !!state.pendingTargetDev &&
                  onStage &&
                  (pendingTargetKind === 'onePlayed' || (pendingTargetKind === 'oneEnemy' && c.faction === 'enemy'))
                }
                targetName={targetedBy.get(c.instanceId)?.join('・')}
                onTap={() => {
                  playFlip();
                  dispatch({ type: 'tapCastChar', instanceId: c.instanceId });
                }}
              />
            );
          })}
          {roster.length === 0 && <p className="field-empty">キャストがいない……「新キャラ登場」か「復活」で立て直そう</p>}
        </div>
        {benchChars.length > 0 && (
          <div className="bench-row">
            <span className="bench-label">控え</span>
            {benchChars.map((c) => {
              const def = data.definitions.get(c.definitionId)!;
              const canBeEnemy = def.kind === 'character' && (def.flexFaction || def.faction === 'enemy');
              const highlight =
                !!state.pendingTargetDev &&
                (pendingTargetKind === 'oneBench' || (pendingTargetKind === 'oneBenchEnemy' && canBeEnemy));
              return (
                <button
                  key={c.instanceId}
                  type="button"
                  data-sfx="skip"
                  className={`bench-chip ${highlight ? 'bench-chip-highlight' : ''} ${targetedBy.has(c.instanceId) ? 'bench-chip-targeted' : ''}`}
                  onClick={() => {
                    /*
                     * v7.29: 対象待ちが無いときの控えタップは、以前は何も起きなかった
                     * （tapCastCharはrosterOfに無い控えを黙って無視する）。
                     * その“死んでいるタップ”をニックネーム編集に転用する。
                     * 対象待ち中は今まで通りデビュー対象の割当のまま
                     */
                    if (!state.pendingTargetDev) {
                      setEditingNickname({ instanceId: c.instanceId, draft: c.nickname ?? '' });
                      return;
                    }
                    playFlip();
                    dispatch({ type: 'tapCastChar', instanceId: c.instanceId });
                  }}
                >
                  {displayName(def, c)}
                  {def.kind === 'character' && ` ${def.popularity + c.permanentPopularityBonus}`}
                  {targetedBy.has(c.instanceId) && ' ◀デビュー'}
                </button>
              );
            })}
          </div>
        )}
        {waitingChars.length > 0 && (
          <div className="bench-row">
            <span className="bench-label">再登場待ち</span>
            {waitingChars.map((c) => {
              const def = data.definitions.get(c.definitionId)!;
              return (
                <button
                  key={c.instanceId}
                  type="button"
                  data-sfx="skip"
                  className={`bench-chip ${state.pendingTargetDev && pendingTargetKind === 'oneWaiting' ? 'bench-chip-highlight' : ''} ${targetedBy.has(c.instanceId) ? 'bench-chip-targeted' : ''}`}
                  onClick={() => {
                    playFlip();
                    dispatch({ type: 'tapCastChar', instanceId: c.instanceId });
                  }}
                >
                  {displayName(def, c)}
                  {def.kind === 'character' && ` ${def.popularity + c.permanentPopularityBonus}`}
                  {targetedBy.has(c.instanceId) && ' ◀復帰'}
                </button>
              );
            })}
          </div>
        )}
        {deadChars.length > 0 && (
          <div className="bench-row">
            <span className="bench-label dead-label">死亡済み</span>
            {deadChars.map((c) => {
              const def = data.definitions.get(c.definitionId)!;
              return (
                <button
                  key={c.instanceId}
                  type="button"
                  data-sfx="skip"
                  className={`bench-chip bench-chip-dead ${state.pendingTargetDev && pendingTargetKind === 'oneDead' ? 'bench-chip-highlight' : ''} ${targetedBy.has(c.instanceId) ? 'bench-chip-targeted' : ''}`}
                  onClick={() => {
                    playFlip();
                    dispatch({ type: 'tapCastChar', instanceId: c.instanceId });
                  }}
                >
                  {displayName(def, c)}
                  {targetedBy.has(c.instanceId) && ' ◀復活'}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/*
       * v7.6: 連載メモと編集部を横並びの1行に。どちらも折りたたみ式のチップで、
       * 縦に積む理由がなかった（開いたときの中身だけ個別に下へ伸びる）
       */}
      {/*
       * v7.6b: 連載メモ・編集部はアイコンチップ→ポップアップ方式に。
       * 折りたたみだと開くたびに盤面が下へずれていたため
       */}
      <div className="status-row">
        <SerialMemo state={state} dispatch={dispatch} />

        {activeDemands.length > 0 && (
          <button
            type="button"
            className={`status-chip ${activeDemands[0]!.deadline <= run.week ? 'status-chip-urgent' : ''}`}
            onClick={() => dispatch({ type: 'toggleDemandList' })}
          >
            <span className="status-chip-icon" aria-hidden="true">
              ✉
            </span>
            <span className="status-chip-label">編集部</span>
            {/* 期限当日以降は「期限」。<= にしているのは、残り話数が負の数で出るのを防ぐため */}
            <em className="status-chip-count">
              {activeDemands[0]!.deadline <= run.week ? '期限' : `あと${activeDemands[0]!.deadline - run.week}話`}
            </em>
          </button>
        )}
      </div>

      {state.demandListOpen && (
        <div className="overlay" onClick={() => dispatch({ type: 'toggleDemandList' })}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h2 className="popup-title">編集部の要求</h2>
            <div className="demand-list">
              {run.demands.map((d) => {
                const done = d.achievedWeek !== null;
                return (
                  <div key={d.id} className={`demand-list-row ${done ? 'demand-done' : d.failed ? 'demand-lost' : ''}`}>
                    <span className="demand-list-mark">{done ? '済' : d.failed ? '×' : `第${d.deadline}話`}</span>
                    <span>{d.text}</span>
                  </div>
                );
              })}
            </div>
            <button type="button" className="primary-btn" onClick={() => dispatch({ type: 'toggleDemandList' })}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {quotaEntry.final && <EndingPicker state={state} dispatch={dispatch} />}

      {/* v7.28: 最終回は展開カードを出さないので、場と手札は出さない */}
      {!quotaEntry.final && (
      <section className="field">
        {fieldIds.length === 0 ? (
          <p className="field-empty">手札から展開カードを選んで「今週の話」を作ろう（0〜4枚）</p>
        ) : (
          <div className="field-cards">
            {fieldIds.map((id) => {
              const def = defOf(id);
              const targetId = state.selection.targets[id];
              return (
                <CardView
                  key={id}
                  instance={byId.get(id)!}
                  def={def}
                  compact
                  selected
                  permanentBuzz={run.permanentBuzzByDef[def.id] ?? 0}
                  freshness={run.freshnessByDef[def.id] ?? 1}

                  targetName={targetId ? displayName(defOf(targetId), byId.get(targetId)!) : undefined}
                  onTap={() => {
                    playFlip();
                    dispatch({ type: 'tapFieldCard', instanceId: id });
                  }}
                />
              );
            })}
          </div>
        )}
      </section>
      )}

      {preview && preview.combos.length > 0 && (
        <div className="combo-preview">
          {preview.combos.map((c) => (
            <span key={c.comboId} className={`combo-chip ${c.status !== 'applied' ? 'combo-chip-suppressed' : `combo-chip-${c.cutInTemplate}`}`}>
              {c.name}
              {c.status === 'applied' && (
                <>
                  {c.popularityAdd > 0 && ` 人気+${c.popularityAdd}`}
                  {c.buzzAdd > 0 && ` 話題+${c.buzzAdd}`}
                  {c.scoreMultiplier > 1 && ` ×${c.scoreMultiplier}`}
                  {c.charMultiplier > 1 && ` 人気×${c.charMultiplier}`}
                </>
              )}
            </span>
          ))}
        </div>
      )}

      <section className="preview">
        {preview ? (
          <div className={`preview-line ${preview.cleared ? 'preview-ok' : 'preview-ng'}`}>
            <span>
              予想スコア <strong>{preview.finalScore}</strong>
              <small>
                （人気{preview.popularityTotal} × 話題{Number.isInteger(preview.buzzApplied) ? preview.buzzApplied : preview.buzzApplied.toFixed(1)}）
              </small>
            </span>
            {/* v7.28: 最終回にノルマは無い（結末を選ぶだけの回なので打ち切られない） */}
            {!quotaEntry.final && (
              <span>{preview.cleared ? `ノルマ +${preview.finalScore - preview.quota}` : `あと${preview.quota - preview.finalScore}`}</span>
            )}
          </div>
        ) : (
          <div className="preview-line preview-hint">
            {state.pendingTargetDev
              ? '対象を選ぶとスコアが出ます'
              : state.pendingFactionChoice
                ? '陣営を選ぶとスコアが出ます'
                : validity.ok
                  ? quotaEntry.final
                    ? '結末を選ぶとスコアが出ます'
                    : 'スコア = キャスト人気 × 話題性'
                  : (validity as { reason: string }).reason}
          </div>
        )}
        <button
          type="button"
          className="confirm-btn"
          data-sfx="skip"
          disabled={!preview}
          onClick={() => {
            playWrite();
            dispatch({ type: 'confirmPlay' });
          }}
        >
          {quotaEntry.final ? 'この結末で完結させる' : '今週の話を確定'}
        </button>
      </section>

      {!quotaEntry.final && (
      <section className="hand">
        <div className="hand-toolbar">
          <span className="hand-label">手札（展開）</span>
          {state.redrawMode ? (
            <span className="redraw-controls">
              <button type="button" className="small-btn" onClick={() => dispatch({ type: 'executeRedraw' })} disabled={state.redrawPicks.length === 0}>
                {state.redrawPicks.length}枚引き直す
              </button>
              <button type="button" className="small-btn ghost" onClick={() => dispatch({ type: 'toggleRedrawMode' })}>
                やめる
              </button>
            </span>
          ) : (
            <span className="redraw-controls">
              <button
                type="button"
                className={`small-btn ${state.stockMode ? '' : 'ghost'}`}
                onClick={() => dispatch({ type: 'toggleStockMode' })}
              >
                ネーム保管{state.stockPicks.length > 0 ? `（${state.stockPicks.length}/${MAX_STOCK}）` : ''}
              </button>
              <button
                type="button"
                className="small-btn ghost"
                disabled={redrawsLeft <= 0}
                onClick={() => dispatch({ type: 'toggleRedrawMode' })}
              >
                描き直し（残り{redrawsLeft}）
              </button>
            </span>
          )}
        </div>
        {state.redrawMode && <div className="redraw-hint">戻すカードを選んで引き直し（戻したカードをまた引くこともある）</div>}
        {state.stockMode && (
          <div className="redraw-hint">今週プレイしないカードを最大{MAX_STOCK}枚選ぶと、次の話の手札に必ず入る</div>
        )}
        <div className="hand-cards">
          {handIds.map((id) => (
            <CardView
              key={id}
              instance={byId.get(id)!}
              def={defOf(id)}
              permanentBuzz={run.permanentBuzzByDef[defOf(id).id] ?? 0}
              freshness={run.freshnessByDef[defOf(id).id] ?? 1}

              picked={state.redrawMode && state.redrawPicks.includes(id)}
              stocked={state.stockPicks.includes(id)}
              onTap={() => {
                playFlip();
                dispatch({ type: 'tapHandCard', instanceId: id });
              }}
              onInspect={() => dispatch({ type: 'inspectCard', definitionId: defOf(id).id })}
            />
          ))}
          {handIds.length === 0 && <p className="hand-empty">（すべて場に出ています）</p>}
        </div>
      </section>
      )}

      {inspected && (
        <div className="overlay" onClick={() => dispatch({ type: 'inspectCard', definitionId: null })}>
          <div className="explain-box card-detail">
            <h2>
              {inspected.name}
              {inspected.rare && <span className="card-rare card-rare-inline">レア</span>}
            </h2>
            <p className="card-detail-value">
              {inspected.kind === 'character'
                ? `人気度 ${inspected.popularity}`
                : `話題性 +${inspected.buzz}${inspected.tags.length > 0 ? `　タグ: ${inspected.tags.map((t) => TAG_LABEL[t]).join('・')}` : ''}`}
            </p>
            <p className="card-detail-text">{inspected.descriptions.revealed}</p>
            {inspected.kind === 'development' && inspected.unlockWeek > 1 && (
              <p className="card-detail-note">第{inspected.unlockWeek}話以降のみプレイできる</p>
            )}
            <p className="explain-tap">タップして閉じる</p>
          </div>
        </div>
      )}

      {editingNickname &&
        (() => {
          const inst = byId.get(editingNickname.instanceId);
          const def = inst ? data.definitions.get(inst.definitionId) : undefined;
          if (!inst || !def) return null;
          return (
            <div className="overlay" onClick={() => setEditingNickname(null)}>
              <div className="popup" onClick={(e) => e.stopPropagation()}>
                <h2 className="popup-title">ニックネームを設定</h2>
                <p className="title-confirm-text">「{def.name}」の呼び方を変えられる。空にすると既定の名前に戻る</p>
                <input
                  className="setup-title-input"
                  value={editingNickname.draft}
                  maxLength={8}
                  onChange={(e) => setEditingNickname({ ...editingNickname, draft: e.target.value })}
                />
                <div className="title-confirm-buttons">
                  <button
                    type="button"
                    className="small-btn"
                    onClick={() => {
                      dispatch({
                        type: 'setNickname',
                        instanceId: editingNickname.instanceId,
                        nickname: editingNickname.draft.trim() || null,
                      });
                      setEditingNickname(null);
                    }}
                  >
                    決定
                  </button>
                  <button type="button" className="small-btn ghost" onClick={() => setEditingNickname(null)}>
                    やめる
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {state.actIntro && (
        <ActIntro acts={campaign.acts} act={state.actIntro} week={run.week} onDismiss={() => dispatch({ type: 'dismissActIntro' })} />
      )}

      {state.showHighlightTutorial && (
        <div className="overlay" onClick={() => dispatch({ type: 'dismissHighlightTutorial' })}>
          <div className="explain-box">
            <h2>今週の出演者を選ぶ</h2>
            <p className="explain-formula">
              キャストが<strong>{HIGHLIGHT_LIMIT}人</strong>を超えた。ここからは毎週、
              <strong>今週の話に出す{HIGHLIGHT_LIMIT}人</strong>を自分で選ぶ。
            </p>
            <p className="explain-formula">
              出演していないキャラも<strong>人気度の半分</strong>は得点に乗るが、役の対象にはならない。
              キャストのカードをタップして入れ替えられる。
            </p>
            <p className="explain-tap">タップして続ける</p>
          </div>
        </div>
      )}

      {state.showVoteTutorial && (
        <div className="overlay" onClick={() => dispatch({ type: 'dismissVoteTutorial' })}>
          <div className="explain-box">
            <h2>今週は人気投票</h2>
            <p className="explain-formula">
              読者は「今週の話」ではなく<strong>キャラそのもの</strong>に投票する。
              そのため今週だけ<strong>話題性は固定1</strong>——展開カードや役で積んだ話題性は点にならない。
            </p>
            <p className="explain-formula">
              点になるのは<strong>出演キャラの人気度だけ</strong>（人気度を上げる役と、週スコア倍率は有効）。
              ノルマが急に低く見えるのは、話題性を掛けないぶん桁が変わるから。
            </p>
            <p className="explain-tap">タップして続ける</p>
          </div>
        </div>
      )}

      {state.showFinaleTutorial && (
        <div className="overlay" onClick={() => dispatch({ type: 'dismissFinaleTutorial' })}>
          <div className="explain-box">
            <h2>最終回の描き方</h2>
            {/* v7.31: 「展開カードを5枚描ける」という v7.27 までの説明が残っていた。
                v7.28 で最終回は手札を配らなくなっている（run.ts の handSize）ので、実物と合わせる */}
            <p className="explain-formula">
              最終回は<strong>展開カードを出さない</strong>。人気度と話題性は
              <strong>これまでの連載の中央値</strong>になり、ノルマも無い（打ち切られない）。
            </p>
            <p className="explain-formula">
              代わりに<strong>結末カード</strong>が提示される。これまでの連載内容で
              <strong>選べる結末が変わり</strong>、1枚だけ選ぶ。週スコアの倍率や未回収の伏線の扱いも結末ごとに違う。
              <strong>再登場待ちは全員戻せる</strong>。
            </p>
            <p className="explain-formula">
              さらに、連載中に成立させた<strong>仕込み役の種類数</strong>だけ完結ボーナス倍率が上がる（最大×2.0）。
            </p>
            <p className="explain-tap">タップして続ける</p>
          </div>
        </div>
      )}

      {bossBriefing && (
        <div className="overlay" onClick={() => dispatch({ type: 'dismissBossBriefing' })}>
          <div className="explain-box">
            <h2>編集部からの通達</h2>
            <p className="explain-formula">
              <strong>
                第{bossBriefing.week}話はボス週「{bossBriefing.boss}」
              </strong>
              （あと{bossBriefing.week - run.week}話）。ノルマは<strong>{bossBriefing.quota.toLocaleString()}</strong>。
            </p>
            <p className="explain-formula">{bossBriefing.what}</p>
            <p className="explain-formula explain-prepare">
              <span className="prepare-label">備えておくこと</span>
              {bossBriefing.prepare}
            </p>
            <p className="explain-formula">
              ボス週の<strong>ノルマ未達は、警告に関係なく即打ち切り</strong>です。
            </p>
            <p className="explain-tap">タップして続ける</p>
          </div>
        </div>
      )}

      {tutorial && (
        <div className={`overlay tutorial-overlay ${tutorial.boxAt ? `tutorial-box-${tutorial.boxAt}` : ''}`}>
          <div className="explain-box tutorial-box">
            <div className="tutorial-step-count">
              {state.tutorialStep! + 1} / {TUTORIAL_STEPS.length}
            </div>
            <h2>{tutorial.title}</h2>
            {tutorial.body}
            <div className="tutorial-actions">
              <button type="button" className="small-btn ghost" onClick={() => dispatch({ type: 'dismissTutorial' })}>
                スキップ
              </button>
              <button type="button" className="primary-btn" onClick={() => dispatch({ type: 'advanceTutorial' })}>
                {state.tutorialStep! + 1 >= TUTORIAL_STEPS.length ? 'はじめる' : '次へ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {state.codexOpen && <CodexOverlay onClose={() => dispatch({ type: 'toggleCodexOverlay' })} />}
    </div>
  );
}
