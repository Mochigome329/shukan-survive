import { useState } from 'react';
import { markPlayed } from './playHistory';
import { initialCastChoices, PROTAGONIST_ID, STARTING_CAST_PICKS } from '../core/run';
import type { Faction } from '../core/types';
import type { GameAction, GameState } from '../state/gameReducer';
import { playPico } from './audio';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const PREFIXES = ['灼熱の', '最強', '転生', '放課後', '異世界', '真夜中の', '無敵', '零時の', '嵐を呼ぶ', '常勝'];
const NOUNS = ['ブレイカーズ', '拳', '大冒険', '探偵団', 'サムライ', 'レジェンド', 'ハンター', '番長', 'マエストロ', 'ストライカー'];

function randomTitle(): string {
  return `${PREFIXES[Math.floor(Math.random() * PREFIXES.length)]}${NOUNS[Math.floor(Math.random() * NOUNS.length)]}`;
}

/** 連載開始のセットアップ（作品タイトルと初期キャスト。v5.4でジャンル選択は廃止） */
export function SetupScreen({ state, dispatch }: Props) {
  const data = state.data;
  const [title, setTitle] = useState(randomTitle);
  const choices = initialCastChoices(data);
  const protagonist = data.definitions.get(PROTAGONIST_ID);
  const [cast, setCast] = useState<string[]>(() => choices.slice(0, STARTING_CAST_PICKS));
  // flexFactionの共演者だけ、開始時の陣営を選べる（v6.7）。未選択なら既定の陣営のまま
  const [factionChoices, setFactionChoices] = useState<Record<string, Faction>>({});
  // 主人公・共演者候補のニックネーム（v7.29）。定義ID単位、空欄なら既定名のまま
  const [nicknames, setNicknames] = useState<Record<string, string>>({});

  const toggleCast = (defId: string) => {
    setCast((prev) => {
      if (prev.includes(defId)) return prev.filter((id) => id !== defId);
      if (prev.length >= STARTING_CAST_PICKS) return prev;
      return [...prev, defId];
    });
  };

  const start = () => {
    playPico();
    // 一度でも連載を始めたら記録する（次回からチュートリアルの要否を聞く。v7.5）
    markPlayed();
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    dispatch({
      type: 'startRun',
      seed,
      mangaTitle: title.trim() || '無題の新連載',
      startingCast: cast,
      startingFactions: factionChoices,
      startingNicknames: nicknames,
    });
  };

  return (
    <div className="screen setup-screen">
      <h1 className="setup-heading">新連載 打ち合わせ</h1>

      <label className="setup-label" htmlFor="manga-title">作品タイトル</label>
      <div className="setup-title-row">
        <input
          id="manga-title"
          className="setup-title-input"
          value={title}
          maxLength={20}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="button" className="small-btn ghost" onClick={() => setTitle(randomTitle())}>
          おまかせ
        </button>
      </div>

      <p className="setup-label">
        第1話の共演者（{cast.length}/{STARTING_CAST_PICKS}）
      </p>
      <p className="setup-hint">選ばなかったキャラは控えに回り、「新キャラ登場」でデビューさせられる</p>
      {protagonist?.kind === 'character' && (
        <div className="cast-choice-wrap">
          <div className="cast-choice cast-choice-fixed">
            <span className="cast-choice-name">{protagonist.name}</span>
            <span className="cast-choice-meta">人気 {protagonist.popularity} / 主人公は固定</span>
          </div>
          <input
            className="cast-nickname-input"
            placeholder="呼び名（任意）"
            maxLength={8}
            value={nicknames[PROTAGONIST_ID] ?? ''}
            onChange={(e) => setNicknames((prev) => ({ ...prev, [PROTAGONIST_ID]: e.target.value }))}
          />
        </div>
      )}
      <div className="cast-choice-list">
        {choices.map((defId) => {
          const def = data.definitions.get(defId)!;
          if (def.kind !== 'character') return null;
          const selected = cast.includes(defId);
          const faction = factionChoices[defId] ?? def.faction;
          return (
            <div key={defId} className="cast-choice-wrap">
              <button
                type="button"
                className={`cast-choice ${selected ? 'cast-choice-selected' : ''}`}
                onClick={() => toggleCast(defId)}
              >
                <span className="cast-choice-name">{def.name}</span>
                <span className="cast-choice-meta">
                  人気 {def.popularity} / {faction === 'ally' ? '仲間' : '敵'}
                </span>
              </button>
              <input
                className="cast-nickname-input"
                placeholder="呼び名（任意）"
                maxLength={8}
                value={nicknames[defId] ?? ''}
                onChange={(e) => setNicknames((prev) => ({ ...prev, [defId]: e.target.value }))}
              />
              {selected && def.flexFaction && (
                <div className="cast-choice-faction">
                  <button
                    type="button"
                    className={`small-btn ${faction === 'ally' ? 'faction-choice-ally' : 'ghost'}`}
                    onClick={() => setFactionChoices((prev) => ({ ...prev, [defId]: 'ally' }))}
                  >
                    仲間として登場
                  </button>
                  <button
                    type="button"
                    className={`small-btn ${faction === 'enemy' ? 'faction-choice-enemy' : 'ghost'}`}
                    onClick={() => setFactionChoices((prev) => ({ ...prev, [defId]: 'enemy' }))}
                  >
                    敵として登場
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="primary-btn setup-start"
        data-sfx="skip"
        disabled={cast.length !== STARTING_CAST_PICKS}
        onClick={start}
      >
        連載会議を通す
      </button>
    </div>
  );
}
