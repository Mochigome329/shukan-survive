import { useState } from 'react';
import { buildChronicle, formatRatio, ratioToHeight } from '../core/chronicle';
import { COMBO_REGISTRY } from '../core/combos';
import { endingById } from '../core/finale';
import { detectStoryType } from '../core/storyTypes';
import { MAX_WARNINGS, UNRESOLVED_FORESHADOW_PENALTY, type WeekEvent } from '../core/types';
import type { GameAction, GameState } from '../state/gameReducer';
import { canvasToBlob, renderChroniclePages, shareText, type ShareImageInput } from './shareImage';

/** 年表に出す出来事の文言（v6.8） */
const EVENT_TEXT: Record<WeekEvent['kind'], (name: string) => string> = {
  debut: (n) => `${n} 登場`,
  death: (n) => `${n} 死亡`,
  leave: (n) => `${n} 離脱`,
  return: (n) => `${n} 復帰`,
  toEnemy: (n) => `${n} 敵対`,
  toAlly: (n) => `${n} 帰還`,
};

/**
 * 出来事の重み（v7.11）。
 * キャラの生死や離反は「連載の事件」なので、役名のチップより格上げして目立たせる。
 * 以前は役と同じ大きさのタグで横並びになっていて、年表を眺めても事件が見つからなかった
 */
const EVENT_TONE: Record<WeekEvent['kind'], 'bad' | 'good' | 'turn'> = {
  death: 'bad',
  leave: 'turn',
  toEnemy: 'turn',
  debut: 'good',
  return: 'good',
  toAlly: 'good',
};

const EVENT_MARK: Record<WeekEvent['kind'], string> = {
  death: '✝',
  leave: '↓',
  toEnemy: '↯',
  debut: '＋',
  return: '◎',
  toAlly: '◎',
};

const comboName = (id: string) => COMBO_REGISTRY.find((c) => c.id === id)?.name ?? id;

/** 幕の見出し。以前は細い破線だけで、巻の切れ目に見えなかった（v7.11） */
function ActHead({ act }: { act: { label: string; title: string } }) {
  return (
    <div className="act-head">
      <span className="act-num">{act.label}</span>
      <span className="act-title">{act.title}</span>
      <span className="act-rule" />
    </div>
  );
}

function CastGroup({ label, tone, names }: { label: string; tone: 'alive' | 'dead' | 'left'; names: string[] }) {
  return (
    <div className="cast-group">
      <span className={`cast-key cast-key-${tone}`}>{label}</span>
      <span className="cast-names">
        {names.map((n, i) => (
          <span key={`${n}${i}`} className={`cast-name ${tone === 'dead' ? 'cast-name-dead' : ''}`}>
            {n}
          </span>
        ))}
      </span>
    </div>
  );
}

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
  kind: 'cancelled' | 'clearedAll';
}

/** 終了画面と連載年表（13.5節、v6.8で年表を実装） */
export function EndScreen({ state, dispatch, kind }: Props) {
  const run = state.run!;
  // このランがどの型の物語だったかを事後判定する（得点には影響しない、v6.8）。
  // 打ち切りは「生き延びた」「勝ち取った」式の見出しと噛み合わないため、型判定はせず一律「打ち切りエンド」にする
  const storyType = kind === 'clearedAll' ? detectStoryType(state.data, run) : null;
  const chronicle = buildChronicle(state.data, run);
  const lastWeek = chronicle.lastWeek;
  const cancelReason = state.lastResult?.cancelReason;
  // 最終回で選んだ結末（v5.9）
  const ending = state.lastResult?.breakdown.finaleEnding ? endingById(state.lastResult.breakdown.finaleEnding.id) : null;

  // 連載の総合評価: 週スコアの合計 − 未回収の伏線ペナルティ（v5.3）
  const totalScore = run.log.reduce((sum, w) => sum + w.score, 0);
  const unresolved = run.foreshadowTokens;
  const penaltyMultiplier = ending?.unresolvedPenaltyMultiplier ?? 1;
  const penalty = unresolved * UNRESOLVED_FORESHADOW_PENALTY * penaltyMultiplier;
  const finalTotal = Math.max(0, totalScore - penalty + (ending?.finalScoreDelta ?? 0));

  const [shareState, setShareState] = useState<'idle' | 'working' | 'saved' | 'failed'>('idle');
  // 保存に回ったときのファイル名（v7.3）。「どこへ保存されたのか分からない」という声への対応
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  const shareInput = (): ShareImageInput => ({
    mangaTitle: run.mangaTitle,
    kind,
    totalScore,
    finalScore: finalTotal,
    storyType: storyType ? { label: storyType.label, headline: storyType.headline } : null,
    chronicle,
    ending: ending ? { name: ending.name, epilogue: ending.epilogue } : null,
    comboName,
    eventText: (e) => EVENT_TEXT[e.kind](e.name),
  });

  /**
   * 年表を画像にしてシェアする（v7.11で2枚組に）。
   *
   * 1枚目=サマリー（4:5）、2枚目=全話年表（縦長）。
   * 1枚に全部入れると縦横比が1:2.5を超えてSNSのタイムラインでほぼ切り取られてしまうため、
   * 「見せたいもの」と「詳細」で分けた。
   * Web Share API（ファイル添付）に対応していればOSのシェアシートへ、
   * 非対応（PCブラウザなど）ならPNGのダウンロードにフォールバックする
   */
  const handleShare = async () => {
    setShareState('working');
    try {
      const input = shareInput();
      const canvases = renderChroniclePages(input);
      const suffixes = ['1_サマリー', '2_年表'];
      const files: File[] = [];
      for (const [i, canvas] of canvases.entries()) {
        const blob = await canvasToBlob(canvas);
        if (!blob) throw new Error('画像を作れませんでした');
        files.push(new File([blob], `${run.mangaTitle}_${suffixes[i]}.png`, { type: 'image/png' }));
      }
      const text = shareText(input);

      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, text });
        setShareState('idle');
        return;
      }
      // 複数ファイルを渡せない環境でも、1枚ずつなら送れることがある
      if (files.length > 1 && navigator.canShare?.({ files: [files[0]!] })) {
        await navigator.share({ files: [files[0]!], text });
        setShareState('idle');
        return;
      }
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
      setSavedFileName(`${files.length}枚（${files.map((f) => f.name).join('、')}）`);
      setShareState('saved');
    } catch (e) {
      // ユーザーがシェアシートを閉じただけの場合は失敗扱いにしない
      if (e instanceof DOMException && e.name === 'AbortError') setShareState('idle');
      else setShareState('failed');
    }
  };

  return (
    <div className="screen end-screen">
      <p className="end-title">『{run.mangaTitle}』</p>
      {kind === 'cancelled' ? (
        <>
          <div className="stamp stamp-ng end-stamp">打ち切り</div>
          <p className="end-message">
            {cancelReason === 'boss'
              ? `ボス週のノルマに届かず、連載は第${lastWeek}話で幕を閉じた……`
              : cancelReason === 'noCast'
                ? `キャストを全員失い、物語を続けられなくなった。連載は第${lastWeek}話で幕を閉じた……`
                : `打ち切り警告が${MAX_WARNINGS}つたまり、連載は第${lastWeek}話で幕を閉じた……`}
          </p>
        </>
      ) : (
        <>
          <div className="stamp stamp-ok end-stamp">完結</div>
          <p className="end-message">
            全{lastWeek}話、完結。打ち切られることなく、最後まで描ききった。
          </p>
          {ending && (
            <div className={`end-ending ${ending.bad ? 'end-ending-bad' : ''}`}>
              <span className="end-ending-label">結末</span>
              <strong className="end-ending-name">{ending.name}</strong>
              <p className="end-ending-epilogue">{ending.epilogue}</p>
            </div>
          )}
        </>
      )}

      <div className="end-total">
        <div className="end-total-row">
          <span>連載スコア合計</span>
          <span>{totalScore.toLocaleString()}</span>
        </div>
        {unresolved > 0 && (
          <div className="end-total-row end-total-penalty">
            <span>未回収の伏線 {unresolved}本</span>
            <span>−{penalty.toLocaleString()}</span>
          </div>
        )}
        <div className="end-total-row end-total-final">
          <span>最終評価</span>
          <span>{finalTotal.toLocaleString()}</span>
        </div>
      </div>

      <h2 className="chronicle-heading">連載年表</h2>
      {kind === 'cancelled' ? (
        <div className="chronicle-type chronicle-type-cancelled">
          <span className="chronicle-type-label">打ち切りエンド</span>
        </div>
      ) : (
        storyType && (
          <div className="chronicle-type">
            <span className="chronicle-type-label">{storyType.label}</span>
            <span className="chronicle-type-headline">{storyType.headline}</span>
          </div>
        )
      )}
      {/* 連載の成績表（v7.11）。年表を読まなくても、そのランの輪郭がつかめるようにする */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-num">
            {lastWeek}
            <small>話</small>
          </div>
          <div className="stat-label">{kind === 'cancelled' ? 'で打ち切り' : '完結'}</div>
        </div>
        <div className="stat stat-hi">
          <div className="stat-num">{chronicle.bestWeek ? formatRatio(chronicle.bestWeek.ratio) : '—'}</div>
          <div className="stat-label">最高達成度{chronicle.bestWeek && ` 第${chronicle.bestWeek.week}話`}</div>
        </div>
        <div className="stat">
          <div className="stat-num">
            {chronicle.clearedCount}
            <small>/{chronicle.playedWeeks}</small>
          </div>
          <div className="stat-label">ノルマ達成</div>
        </div>
        <div className={`stat ${chronicle.maxWarnings > 0 ? 'stat-warn' : ''}`}>
          <div className="stat-num">
            {chronicle.maxWarnings}
            <small>/{MAX_WARNINGS}</small>
          </div>
          <div className="stat-label">最大警告</div>
        </div>
        <div className="stat">
          <div className="stat-num">{chronicle.comboKinds}</div>
          <div className="stat-label">成立した役</div>
        </div>
        <div className="stat">
          <div className="stat-num">
            {chronicle.cast.alive.length}
            <small>人</small>
          </div>
          <div className="stat-label">生き残った</div>
        </div>
      </div>

      {/*
       * 連載の起伏グラフ（v7.11）。
       * 生スコアではなく「ノルマに対する達成度」を棒にするのが肝で、
       * これなら人気投票回（ノルマが桁違いに低い）と最終回を同じ物差しで並べられる
       */}
      <div className="graph-box">
        <div className="graph-title">
          <span>連載の起伏</span>
          <em>ノルマに対する達成度</em>
        </div>
        <div className="graph">
          <div className="quota-line" style={{ bottom: `${(1 / chronicle.ratioCap) * 100}%` }} />
          {chronicle.weeks.map((w) => (
            <div
              key={w.week}
              className={`bar ${!w.cleared ? 'bar-fail' : w.final ? 'bar-final' : w.boss ? 'bar-boss' : ''}`}
              style={{ height: `${ratioToHeight(w.ratio, chronicle.ratioCap) * 100}%` }}
              title={`第${w.week}話 ${w.score.toLocaleString()} / ${w.quota.toLocaleString()}（${formatRatio(w.ratio)}）`}
            >
              {w.actStart && w.week > 1 && <span className="act-mark" />}
            </div>
          ))}
        </div>
        <div className="graph-legend">
          <span>
            <i className="swatch swatch-normal" />
            通常回
          </span>
          <span>
            <i className="swatch swatch-boss" />
            ボス週
          </span>
          <span>
            <i className="swatch swatch-fail" />
            未達
          </span>
          <span>
            <i className="swatch swatch-final" />
            最終回
          </span>
        </div>
      </div>

      <div className="chronicle">
        {chronicle.weeks.map((w) => {
          // 平凡な週は1行に畳む。役名だけは残して、何をやった週かは分かるようにする
          if (w.quiet) {
            const [head, ...rest] = w.comboIds;
            return (
              <div key={w.week}>
                {w.actStart && <ActHead act={w.actStart} />}
                <div className="w-quiet">
                  <b>第{w.week}話</b>
                  <span className="w-quiet-score">{w.score.toLocaleString()}</span>
                  <span className="w-quiet-combo">
                    {head ? comboName(head) : ''}
                    {rest.length > 0 && ` ほか${rest.length}`}
                  </span>
                  <span className="w-quiet-ratio">{formatRatio(w.ratio)}</span>
                </div>
              </div>
            );
          }
          const combos = w.comboIds.slice(0, 3);
          return (
            <div key={w.week}>
              {w.actStart && <ActHead act={w.actStart} />}
              <div className={`w-card ${w.boss ? 'w-boss' : ''} ${w.cleared ? '' : 'w-fail'}`}>
                {w.boss && <span className="w-boss-flag">ボス週 {w.boss}</span>}
                {!w.cleared && <span className="w-fail-flag">⚠ ノルマ未達 — 打ち切り警告 {w.warningsAfter}</span>}
                <div className="w-top">
                  <span className="w-no">{w.final ? `最終回・第${w.week}話` : `第${w.week}話`}</span>
                  <span className="w-score">
                    {w.score.toLocaleString()} / {w.quota.toLocaleString()}
                  </span>
                  <span className="w-ratio">{formatRatio(w.ratio)}</span>
                </div>
                <div className="w-bar">
                  <i style={{ width: `${ratioToHeight(w.ratio, chronicle.ratioCap) * 100}%` }} />
                  <span className="mark" style={{ left: `${(1 / chronicle.ratioCap) * 100}%` }} />
                </div>
                {(w.events.length > 0 || combos.length > 0) && (
                  <div className="w-tags">
                    {w.events.map((e, i) => (
                      <span key={`e${i}`} className={`ev ev-${EVENT_TONE[e.kind]}`}>
                        {EVENT_MARK[e.kind]} {EVENT_TEXT[e.kind](e.name)}
                      </span>
                    ))}
                    {combos.map((id) => (
                      <span key={id} className="tag tag-combo">
                        {comboName(id)}
                      </span>
                    ))}
                    {w.comboIds.length > combos.length && (
                      <span className="tag">ほか{w.comboIds.length - combos.length}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {ending && (
          <div className="w-card w-final-card">
            <div className="w-top">
              <span className="w-no">完</span>
            </div>
            <div className="w-final-ending">{ending.name}</div>
            <p className="w-final-epi">{ending.epilogue}</p>
          </div>
        )}
      </div>

      {/* この連載に出た者たち（v7.11）。年表を「誰の物語だったか」で閉じる */}
      {(chronicle.cast.alive.length > 0 || chronicle.cast.dead.length > 0 || chronicle.cast.left.length > 0) && (
        <div className="cast-box">
          <div className="cast-title">この連載に出た者たち</div>
          {chronicle.cast.alive.length > 0 && (
            <CastGroup label="生存" tone="alive" names={chronicle.cast.alive} />
          )}
          {chronicle.cast.dead.length > 0 && <CastGroup label="死亡" tone="dead" names={chronicle.cast.dead} />}
          {chronicle.cast.left.length > 0 && <CastGroup label="離脱" tone="left" names={chronicle.cast.left} />}
        </div>
      )}

      <div className="end-actions">
        <button type="button" className="small-btn share-btn" onClick={handleShare} disabled={shareState === 'working'}>
          {shareState === 'working' ? '画像を作成中…' : '年表を画像でシェア'}
        </button>
        {shareState === 'saved' && (
          <p className="share-note">
            端末の<strong>ダウンロードフォルダ</strong>に保存しました
            {savedFileName && <span className="share-note-file">{savedFileName}</span>}
          </p>
        )}
        {shareState === 'failed' && <p className="share-note share-note-failed">画像を作れませんでした</p>}
      </div>

      <button type="button" className="primary-btn" onClick={() => dispatch({ type: 'backToTitle' })}>
        タイトルへ
      </button>
    </div>
  );
}
