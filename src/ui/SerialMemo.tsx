import { COMBO_REGISTRY } from '../core/combos';
import { returnableCharacters } from '../core/run';
import { displayName } from '../core/types';
import type { GameAction, GameState } from '../state/gameReducer';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const MODIFIER_NAMES: Record<string, string> = {
  tournament: 'トーナメント',
  flashback: '回想',
  deep_thought: '熟考',
  closed_stage: '閉ざされた舞台',
  quest: 'キーアイテム探し',
};

/** 連載メモ（仕込み一覧、13.2節）。折り畳みで仕込みの状態をいつでも確認できる */
export function SerialMemo({ state, dispatch }: Props) {
  const run = state.run!;
  const data = state.data;
  const nameOf = (instanceId: string) => {
    const instance = run.cards.find((c) => c.instanceId === instanceId)!;
    const def = data.definitions.get(instance.definitionId);
    return def ? displayName(def, instance) : instanceId;
  };

  const flagged = run.cards.filter((c) => c.flags.love || c.flags.training > 0);
  const waiting = run.cards.filter((c) => c.zone === 'waiting');
  const dead = run.cards.filter((c) => c.zone === 'dead');
  const returnable = returnableCharacters(data, run);
  const lastCombos = run.log[run.log.length - 1]?.comboIds ?? [];

  const rows: { label: string; value: string }[] = [];
  if (run.foreshadowTokens > 0) rows.push({ label: '伏線トークン', value: `${run.foreshadowTokens}個（「伏線回収」で消費）` });
  if (flagged.length > 0) {
    rows.push({
      label: 'フラグ',
      value: flagged
        .map((c) => {
          const marks = [
            c.flags.love ? '恋愛' : '',
            c.flags.training > 0 ? `修行${c.flags.training}` : '',
          ].filter(Boolean);
          return `${nameOf(c.instanceId)}(${marks.join('・')})`;
        })
        .join(' / '),
    });
  }
  if (waiting.length > 0) {
    rows.push({
      label: '再登場待ち',
      value: waiting
        .map((c) => {
          const ready = returnable.some((r) => r.instanceId === c.instanceId);
          return `${nameOf(c.instanceId)}${ready ? '（再登場可）' : `（第${(c.leftWeek ?? 0) + 2}話から）`}`;
        })
        .join(' / '),
    });
  }
  if (dead.length > 0) rows.push({ label: '死亡済み', value: dead.map((c) => nameOf(c.instanceId)).join(' / ') });
  if (run.modifiers.length > 0) {
    rows.push({
      label: '期間効果',
      value: run.modifiers.map((m) => `${MODIFIER_NAMES[m.modifierId] ?? m.modifierId}（残り${m.remaining}週）`).join(' / '),
    });
  }
  if (run.pendingFreshnessPenalty > 0) {
    rows.push({ label: '来週の反動', value: `全展開の鮮度-${Math.round(run.pendingFreshnessPenalty * 100)}%（夢オチ）` });
  }
  if (lastCombos.length > 0) {
    rows.push({
      label: '前週の役',
      value: lastCombos.map((id) => COMBO_REGISTRY.find((c) => c.id === id)?.name ?? id).join('・'),
    });
  }
  if (run.setupComboHistory.length > 0) {
    rows.push({
      label: '仕込み回収',
      value: run.setupComboHistory.map((id) => COMBO_REGISTRY.find((c) => c.id === id)?.name ?? id).join('・'),
    });
  }

  // 再登場させられる相手がいるときは、開かなくても分かるよう印を出す
  const actionable = returnable.length > 0 && !run.returnUsedThisWeek;

  return (
    <>
      <button
        type="button"
        className={`status-chip ${actionable ? 'status-chip-action' : ''}`}
        onClick={() => dispatch({ type: 'toggleMemo' })}
      >
        <span className="status-chip-icon" aria-hidden="true">
          📋
        </span>
        <span className="status-chip-label">連載メモ</span>
        {rows.length > 0 && <em className="status-chip-count">{rows.length}</em>}
      </button>

      {/*
       * v7.6b: 折りたたみで画面を押し下げるのをやめ、ポップアップで見せる。
       * 内容が縦に伸びても盤面のレイアウトが動かない
       */}
      {state.memoOpen && (
        <div className="overlay" onClick={() => dispatch({ type: 'toggleMemo' })}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <h2 className="popup-title">連載メモ</h2>
            <div className="memo-body">
              {rows.length === 0 && <p className="memo-empty">まだ仕込みはない</p>}
              {rows.map((r) => (
                <div key={r.label} className="memo-row">
                  <span className="memo-row-label">{r.label}</span>
                  <span className="memo-row-value">{r.value}</span>
                </div>
              ))}
              {actionable && (
                <div className="memo-actions">
                  {returnable.map((c) => (
                    <button
                      key={c.instanceId}
                      type="button"
                      className="small-btn"
                      onClick={() => dispatch({ type: 'returnCharacter', instanceId: c.instanceId })}
                    >
                      「{nameOf(c.instanceId)}」を再登場させる
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="primary-btn" onClick={() => dispatch({ type: 'toggleMemo' })}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
