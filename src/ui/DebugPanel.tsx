import { useState } from 'react';
import { totalWeeksOf } from '../core/campaign';
import { type GameAction, type GameState } from '../state/gameReducer';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/**
 * 開発時だけのデバッグパネル（v6.4）。
 * 「最終回まで実プレイで到達しないと演出を目視確認できない」
 * 「特定のカードが手札に来るまで実プレイで待つしかない」という検証コストを下げるための開発者用ツール。
 * `import.meta.env.DEV`が本番ビルドで`false`に置き換わるため、App.tsx側の分岐ごとビルド時に除去され、
 * dist/uchikiri.html（配布物）には一切含まれない。
 */
export function DebugPanel({ state, dispatch }: Props) {
  const [open, setOpen] = useState(false);
  const [weekInput, setWeekInput] = useState(String(state.run?.week ?? 1));
  const [cardQuery, setCardQuery] = useState('');

  if (!state.run) return null;

  // 話数の上限は連載の長さで変わる（v7.30）
  const lastWeek = totalWeeksOf(state.data, state.run);

  const candidates = cardQuery
    ? [...state.data.definitions.values()].filter((d) => d.name.includes(cardQuery) || d.id.includes(cardQuery)).slice(0, 12)
    : [];

  return (
    <div className="debug-panel">
      <button type="button" className="debug-toggle" onClick={() => setOpen((v) => !v)}>
        🐞{open ? '' : ' DEBUG'}
      </button>
      {open && (
        <div className="debug-body">
          <div className="debug-row">
            <span>週へジャンプ</span>
            <input
              type="number"
              min={1}
              max={lastWeek}
              value={weekInput}
              onChange={(e) => setWeekInput(e.target.value)}
            />
            <button
              type="button"
              onClick={() => dispatch({ type: 'debugJumpWeek', week: Number(weekInput) || 1 })}
            >
              ジャンプ
            </button>
          </div>
          <div className="debug-row">
            <button type="button" onClick={() => dispatch({ type: 'debugJumpWeek', week: lastWeek })}>
              最終回へ
            </button>
            <button type="button" onClick={() => dispatch({ type: 'debugFillSetupCombos' })}>
              仕込み役を全部積む
            </button>
          </div>
          <div className="debug-row">
            <span>カード追加</span>
            <input
              type="text"
              placeholder="カード名で検索"
              value={cardQuery}
              onChange={(e) => setCardQuery(e.target.value)}
            />
          </div>
          {candidates.length > 0 && (
            <div className="debug-candidates">
              {candidates.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => dispatch({ type: 'debugAddCard', definitionId: d.id })}
                >
                  {d.name}（{d.kind === 'character' ? '控えへ' : '手札へ'}）
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
