import { completionBonus, offeredEndings, SETUP_COMBO_TOTAL, yumeochiCount } from '../core/finale';
import type { GameAction, GameState } from '../state/gameReducer';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

/**
 * 最終回の結末カード選択（design_finale.md 3節、v5.9）。
 * 通常の手札とは別枠で2〜3枚提示し、1枚だけ選ぶ。何も積んでいなくても「後日談」は必ず出る。
 */
export function EndingPicker({ state, dispatch }: Props) {
  const run = state.run!;
  const offered = offeredEndings(state.data, run);
  const bonus = completionBonus(run);
  const dreams = yumeochiCount(run);

  return (
    <section className="ending-picker">
      <div className="ending-head">
        <span className="hand-label">この連載の結末</span>
        <span className="ending-bonus">
          完結ボーナス <strong>×{bonus.toFixed(1)}</strong>
          <small>（仕込み役 {run.setupComboHistory.length}/{SETUP_COMBO_TOTAL}種類）</small>
        </span>
      </div>
      {dreams > 0 && (
        <p className="ending-warning">
          「夢オチ」を{dreams}回使っている。選べる結末が痩せている
        </p>
      )}
      <div className="ending-list">
        {offered.map((card) => {
          const picked = state.selectedEnding === card.id;
          return (
            <button
              key={card.id}
              type="button"
              className={`ending-card ${picked ? 'ending-picked' : ''} ${card.bad ? 'ending-bad' : ''}`}
              onClick={() => dispatch({ type: 'selectEnding', endingId: card.id })}
            >
              <span className="ending-name">
                {card.name}
                {card.bad && <em className="ending-bad-tag">バッドエンド</em>}
                {picked && <em className="ending-picked-tag">選択中</em>}
              </span>
              <span className="ending-desc">{card.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
