import { useLayoutEffect, useId, useRef } from 'react';
import { displayName, type CardInstance, type Zone } from '../core/types';
import { pendingTargetCandidates, type GameAction, type GameState } from '../state/gameReducer';
import { playFlip } from './audio';
import { MangaArt } from './MangaArt';
import { lockPageScroll } from './lockPageScroll';
import './target-picker.css';

interface Props {
  state: GameState;
  dispatch: (action: GameAction) => void;
}

const ZONE_NAMES: Record<Zone, string> = {
  field: '場', bench: '控え', dead: '死亡', waiting: '再登場待ち',
  hand: '手札', activeDeck: 'デッキ', selected: '選択中',
};

function CharacterPortrait({ instance, data }: { instance: CardInstance; data: GameState['data'] }) {
  const def = data.definitions.get(instance.definitionId);
  if (def?.kind !== 'character') return null;
  const faction = instance.faction ?? def.faction;
  return <>
    <span className="target-picker-face"><MangaArt definitionId={def.id} kind="card" faction={faction} /></span>
    <span className="target-picker-character-info">
      <strong className="target-picker-character-name">{displayName(def, instance)}</strong>
      <span className="target-picker-character-popularity">人気 <b>{def.popularity + instance.permanentPopularityBonus}</b></span>
      <span className="target-picker-character-status">
        <span className={`target-picker-faction target-picker-faction-${faction}`}>{faction === 'enemy' ? '敵' : '仲間'}</span>
        <span>{ZONE_NAMES[instance.zone]}</span>
      </span>
    </span>
  </>;
}

/** 対象指定と陣営指定を同じnative dialogで進め、原稿確定は元画面に任せる。 */
export function TargetPickerDialog({ state, dispatch }: Props) {
  const devId = state.pendingTargetDev ?? state.pendingFactionChoice;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!devId || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockPageScroll();
    if (!dialog.open) dialog.showModal();
    dialog.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      unlockScroll();
      const trigger = document.getElementById(`play-card-${devId}`);
      if (trigger) trigger.focus({ preventScroll: true });
      else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
    // 同じ展開の対象→陣営切替では再openせず、native modalの状態を保つ。
  }, [devId]);

  const run = state.run;
  const development = run?.cards.find(card => card.instanceId === devId);
  const def = development ? state.data.definitions.get(development.definitionId) : undefined;
  if (!devId || !run || def?.kind !== 'development') return null;

  const choosingFaction = state.pendingTargetDev === null && state.pendingFactionChoice === devId;
  const selectedCharacter = choosingFaction
    ? run.cards.find(card => card.instanceId === state.selection.targets[devId]
      && state.data.definitions.get(card.definitionId)?.kind === 'character')
    : undefined;
  const candidates = choosingFaction ? [] : pendingTargetCandidates(state)
    .filter(card => state.data.definitions.get(card.definitionId)?.kind === 'character');
  const cancel = () => dispatch({ type: 'tapFieldCard', instanceId: devId });

  return (
    <dialog ref={dialogRef} tabIndex={-1} autoFocus className="target-picker-dialog" aria-labelledby={headingId}
      aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <header className="target-picker-header">
        <div className="target-picker-toolbar">
          <span className="target-picker-step">{choosingFaction ? '陣営を指定' : '対象を指定'}</span>
          <button type="button" className="target-picker-cancel" onClick={cancel}>
            カードを手札に戻す <span aria-hidden="true">×</span>
          </button>
        </div>
        <h2 id={headingId}>「{def.name}」の{choosingFaction ? '陣営' : '対象'}を選ぶ</h2>
      </header>

      <div className="target-picker-content">
        <p id={descriptionId} className="target-picker-description">{def.descriptions.revealed}</p>
        {choosingFaction && selectedCharacter ? (
          <section className="target-picker-faction-step" aria-label="登場する陣営">
            <div className="target-picker-selected-character">
              <CharacterPortrait instance={selectedCharacter} data={state.data} />
            </div>
            <p className="target-picker-instruction">このキャラを、どちら側で登場させますか？</p>
            <div className="target-picker-faction-options">
              <button type="button" className="target-picker-faction-choice target-picker-choose-ally"
                onClick={() => { playFlip(); dispatch({ type: 'chooseFaction', devId, faction: 'ally' }); }}>
                <span>仲間</span><small>仲間として登場</small>
              </button>
              <button type="button" className="target-picker-faction-choice target-picker-choose-enemy"
                onClick={() => { playFlip(); dispatch({ type: 'chooseFaction', devId, faction: 'enemy' }); }}>
                <span>敵</span><small>敵として登場</small>
              </button>
            </div>
          </section>
        ) : !choosingFaction && candidates.length > 0 ? (
          <>
            <p className="target-picker-instruction">効果を受けるキャラを1人選んでください。</p>
            <div className="target-picker-grid">
              {candidates.map((instance) => (
                <button key={instance.instanceId} type="button" className="target-picker-candidate"
                  onClick={() => { playFlip(); dispatch({ type: 'tapCastChar', instanceId: instance.instanceId }); }}>
                  <CharacterPortrait instance={instance} data={state.data} />
                  <span className="target-picker-pick">このキャラを選ぶ <span aria-hidden="true">→</span></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="target-picker-empty">
            <strong>対象にできるキャラがいません</strong>
            <p>このカードを手札に戻して、別の展開を選んでください。</p>
            <button type="button" className="target-picker-empty-back" onClick={cancel}>カードを手札に戻す</button>
          </div>
        )}
      </div>
    </dialog>
  );
}
