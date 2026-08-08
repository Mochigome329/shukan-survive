import { COMBO_REGISTRY } from '../core/combos';
import type { GameAction } from '../state/gameReducer';
import { getDiscovered } from './discovery';

interface Props {
  dispatch: (action: GameAction) => void;
}

/** 図鑑の中身（一覧そのもの）。タイトルからの全画面表示と、連載中のオーバーレイで共有する */
function CodexBody() {
  const discovered = getDiscovered();
  return (
    <>
      <header className="play-header">
        <span className="week-badge">役図鑑</span>
        <span className="quota">
          発見 <strong>{[...discovered].filter((id) => COMBO_REGISTRY.some((c) => c.id === id)).length}</strong> / {COMBO_REGISTRY.length}
        </span>
      </header>

      <div className="codex-list">
        {COMBO_REGISTRY.map((combo) => {
          const found = discovered.has(combo.id);
          const effects: string[] = [];
          if (combo.popularityAdd > 0) effects.push(`人気度+${combo.popularityAdd}`);
          if (combo.buzzAdd > 0) effects.push(`話題性+${combo.buzzAdd}`);
          return (
            <div key={combo.id} className={`codex-item ${found ? '' : 'codex-item-hidden'}`}>
              <div className="codex-item-head">
                <span className="codex-item-name">{found ? combo.name : '？？？'}</span>
                {found && <span className="codex-item-effect">{effects.join(' / ')}</span>}
              </div>
              <p className="codex-item-desc">{found ? combo.conditionText : combo.hintText}</p>
              {found && combo.extraText && <p className="codex-item-extra">{combo.extraText}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** 役図鑑（2.2節・3.4節、v5.2前倒し）。未発見はあいまいヒントのみ表示する */
export function CodexScreen({ dispatch }: Props) {
  return (
    <div className="screen codex-screen">
      <CodexBody />
      <button type="button" className="primary-btn" onClick={() => dispatch({ type: 'backToTitle' })}>
        タイトルへ
      </button>
    </div>
  );
}

/**
 * 連載中に開く役図鑑（v7.5）。
 * `screen` を切り替えると `backToTitle` 経由でランが消えてしまうので、
 * 話づくりの画面の上に重ねる形にして、いつでも役を確認できるようにする
 */
export function CodexOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay codex-overlay" onClick={onClose}>
      <div className="codex-overlay-inner" onClick={(e) => e.stopPropagation()}>
        <CodexBody />
        <button type="button" className="primary-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
