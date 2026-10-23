import { useEffect, useRef } from 'react';
import type { ComboScoreDetail, CutInTemplate, Faction } from '../core/types';
import { MangaArt } from './MangaArt';
import { SfxMark } from './SfxMark';
import './combo-cutin.css';

type IllustratedCutInProps = {
  kind: CutInTemplate | 'debut' | 'bonus';
  artId: string;
  name: string;
  label: string;
  effectText: string;
  extraText?: string;
  freshnessNote?: string | null;
  payoffNote?: string | null;
  isNew?: boolean;
  sfxId?: string;
  bonusTotal?: string;
  faction?: Faction | null;
  skipLabel?: string;
  isReplay?: boolean;
  returnFocusTo?: HTMLElement | null;
  onSkip: () => void;
};

/** 絵・役名・実際の効果を独立したコマに置き、長い説明も切り捨てない。 */
export function IllustratedCutIn({ kind, artId, name, label, effectText, extraText, freshnessNote,
  payoffNote, isNew, sfxId, bonusTotal, faction, skipLabel = '演出を飛ばす', isReplay = false,
  returnFocusTo, onSkip }: IllustratedCutInProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const readingPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isReplay) return;
    const previousFocus = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isReplay, returnFocusTo]);
  return (
    <section className={`manga-cutin manga-cutin-${kind}${isReplay ? ' manga-cutin-replay' : ''}`}
      role={isReplay ? 'dialog' : undefined} aria-modal={isReplay ? true : undefined}
      aria-label={`${label} ${name}`} onKeyDown={isReplay ? (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onSkip();
        } else if (event.key === 'Tab') {
          // 再表示では閉じるボタンと、矢印キーでスクロールできる本文の間を循環する。
          event.preventDefault();
          if (document.activeElement === closeButton.current) readingPane.current?.focus();
          else closeButton.current?.focus();
        }
      } : undefined}>
      <div className="manga-cutin-toolbar">
        <span className="manga-cutin-running">{isReplay ? '見開きを読む' : '今週の見せ場'}</span>
        <button ref={closeButton} type="button" className="manga-cutin-skip" onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}>{skipLabel} <span aria-hidden="true">→</span></button>
      </div>
      <div ref={readingPane} className="manga-cutin-stage" tabIndex={isReplay ? 0 : undefined}
        aria-label={isReplay ? '見開き本文' : undefined}>
        <div className="manga-cutin-art-panel">
          <MangaArt definitionId={artId} kind={kind === 'debut' ? 'card' : 'combo'} faction={faction} />
          {sfxId && <SfxMark id={sfxId} />}
          <span className="manga-cutin-art-label" aria-hidden="true">
            {kind === 'shock' ? '衝撃' : kind === 'emotion' ? '余韻' : kind === 'setupPayoff' ? '仕込み・回収' : kind === 'debut' ? '登場' : kind === 'bonus' ? '完結' : '成立'}
          </span>
        </div>
        <div className="manga-cutin-copy">
          <span className="manga-cutin-label">{label}</span>
          <h2 className={`manga-cutin-name${name.length >= 8 ? ' manga-cutin-name-long' : ''}`}>{name}</h2>
          <div className="manga-cutin-effects">
            {effectText && <p className="manga-cutin-effect">{effectText}</p>}
            {freshnessNote && <p className="manga-cutin-freshness">{freshnessNote}</p>}
            {extraText && <p className="manga-cutin-extra">{extraText}</p>}
            {bonusTotal && <strong className="manga-cutin-bonus-total">{bonusTotal}</strong>}
          </div>
          {payoffNote && <p className="manga-cutin-payoff">{payoffNote}</p>}
          {isNew && <span className="manga-cutin-discovery">初発見 ／ 役図鑑に登録</span>}
        </div>
      </div>
    </section>
  );
}

export function ComboCutIn({ combo, effectText, freshnessNote, payoffNote, isNew, sfxId, skipLabel,
  isReplay, returnFocusTo, onSkip }: {
  combo: ComboScoreDetail;
  effectText: string;
  freshnessNote: string | null;
  payoffNote?: string | null;
  isNew: boolean;
  sfxId?: string;
  skipLabel?: string;
  isReplay?: boolean;
  returnFocusTo?: HTMLElement | null;
  onSkip: () => void;
}) {
  return <IllustratedCutIn kind={combo.cutInTemplate} artId={combo.comboId} name={combo.name}
    label={isNew ? '役 初成立' : '役 成立'} effectText={effectText} extraText={combo.extraText}
    freshnessNote={freshnessNote} payoffNote={combo.cutInTemplate === 'setupPayoff' ? payoffNote : null}
    isNew={isNew} sfxId={sfxId} skipLabel={skipLabel} isReplay={isReplay} returnFocusTo={returnFocusTo} onSkip={onSkip} />;
}
