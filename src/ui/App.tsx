import { useEffect, useReducer, useState } from 'react';
import { clearSave, loadSave, saveRun, type SaveData } from '../core/save';
import type { GameData } from '../core/validate';
import { gameReducer, initialGameState } from '../state/gameReducer';
import { playClick } from './audio';
import { CodexScreen } from './CodexScreen';
import { DebugPanel } from './DebugPanel';
import { EndScreen } from './EndScreen';
import { ResultScreen } from './ResultScreen';
import { SetupScreen } from './SetupScreen';
import { ShopScreen } from './ShopScreen';
import { SoundToggle } from './SoundToggle';
import { TitleScreen } from './TitleScreen';
import { WeekPlayScreen } from './WeekPlayScreen';

export function App({ data }: { data: GameData }) {
  const [state, dispatch] = useReducer(gameReducer, data, initialGameState);
  // 起動時に一度だけセーブの有無を見る（タイトルの「続きから」の出し分けに使う）
  const [save, setSave] = useState<SaveData | null>(() => loadSave());

  // オートセーブ（v6.8）。週プレイ中と編集会議中だけ保存する。
  // リザルト演出中や終了画面は「途中」ではないので保存対象にしない
  useEffect(() => {
    if (!state.run) return;
    if (state.screen === 'play' || state.screen === 'shop') {
      saveRun(state.run, state.screen);
    } else if (state.screen === 'cancelled' || state.screen === 'clearedAll') {
      // 連載が終わったらセーブを消す（終わった連載を再開できてしまわないように）
      clearSave();
      setSave(null);
    }
  }, [state.run, state.screen]);

  // ボタン全般の「カチッ」（v7.8）。カード選択（シュッ）や確定（カッ）のように
  // 専用の音を用意した箇所は data-sfx="skip" を付けて自前で鳴らし、ここでは鳴らさない。
  // 1箇所に集約したのは、ボタンは各画面に散らばっていて全部に手で仕込むと漏れが出るため。
  // キャプチャフェーズで拾うのは、ポップアップ各所にある「背景タップで閉じる」用の
  // stopPropagation()（バブルフェーズ）より先に処理するため。バブルフェーズだと、
  // ポップアップ内のボタンで止められてこの処理まで届かない
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('button, [role="button"]');
      if (!el || el.getAttribute('data-sfx') === 'skip') return;
      playClick();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const screen = (() => {
    switch (state.screen) {
      case 'title':
        return (
          <TitleScreen
            dispatch={dispatch}
            save={save}
            onResume={() => {
              if (save) dispatch({ type: 'resumeRun', run: save.run, phase: save.phase ?? 'play' });
            }}
            onDiscardSave={() => {
              clearSave();
              setSave(null);
            }}
          />
        );
      case 'setup':
        return <SetupScreen state={state} dispatch={dispatch} />;
      case 'codex':
        return <CodexScreen dispatch={dispatch} />;
      case 'play':
        return <WeekPlayScreen state={state} dispatch={dispatch} />;
      case 'result':
        return <ResultScreen key={state.run!.week} state={state} dispatch={dispatch} />;
      case 'shop':
        return <ShopScreen state={state} dispatch={dispatch} />;
      case 'cancelled':
        return <EndScreen state={state} dispatch={dispatch} kind="cancelled" />;
      case 'clearedAll':
        return <EndScreen state={state} dispatch={dispatch} kind="clearedAll" />;
    }
  })();

  return (
    <>
      {screen}
      {/*
       * 話づくり・編集会議はヘッダー内に並べて出す（WeekPlayScreen/ShopScreen）ので、
       * ここで重ねて出すと2つ表示されて重なる。バグって一度そうなった実績があるので注記
       */}
      {state.screen !== 'play' && state.screen !== 'shop' && <SoundToggle />}
      {import.meta.env.DEV && <DebugPanel state={state} dispatch={dispatch} />}
    </>
  );
}
