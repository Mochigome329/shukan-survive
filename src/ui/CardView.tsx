import { displayName, type CardDefinition, type CardInstance, type CardTag } from '../core/types';
import { MangaArt } from './MangaArt';

interface CardViewProps {
  instance: CardInstance;
  def: CardDefinition;
  onTap: () => void;
  /** 定義ID単位の話題性恒久補正（必殺技初披露） */
  permanentBuzz?: number;
  /** 定義ID単位の鮮度（v5.2d）。既定1.0 */
  freshness?: number;
  /** 宣言ジャンル（一致タグは話題性+1表示） */
  genre?: CardTag | null;
  selected?: boolean;
  picked?: boolean;
  /** ネームストック指定（次の話へ持ち越し） */
  stocked?: boolean;
  targetHighlight?: boolean;
  targetName?: string;
  compact?: boolean;
  /** 今週の話に出ていない在籍キャラ（v6.0）。得点にも役にも関わらない */
  offStage?: boolean;
  /** 効果説明を開く（カード選択と別のボタンで表示） */
  onInspect?: () => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** カード1枚の表示。手札・場・キャストで共用する */
export function CardView({ instance, def, onTap, permanentBuzz = 0, freshness = 1, genre = null, selected, picked, stocked, targetHighlight, targetName, compact, offStage, onInspect }: CardViewProps) {
  const isChar = def.kind === 'character';
  const classes = [
    'card',
    isChar ? 'card-char' : 'card-dev',
    selected ? 'card-selected' : '',
    picked ? 'card-picked' : '',
    stocked ? 'card-stocked' : '',
    def.rare ? 'card-rare-frame' : '',
    targetHighlight ? 'card-target-highlight' : '',
    compact ? 'card-compact' : '',
    offStage ? 'card-offstage' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const genreBonus = !isChar && genre && def.tags.includes(genre) ? 1 : 0;
  const effectiveBuzz = !isChar ? def.buzz * freshness + genreBonus + permanentBuzz : 0;
  const stale = !isChar && freshness < 1;

  return (
    <div className={`card-frame ${compact ? 'card-frame-compact' : ''}`}>
    <button type="button" id={`play-card-${instance.instanceId}`} className={classes} data-faction={isChar ? instance.faction ?? undefined : undefined} data-sfx="skip" onClick={onTap}>
      <MangaArt definitionId={def.id} faction={isChar ? instance.faction : null} />
      {def.rare && <span className="card-rare">レア</span>}
      <span className="card-name">{displayName(def, instance)}</span>
      {/* v7.6b: 数値・陣営・修行フラグを1行にまとめ、カードの縦を1段ぶん詰める */}
      <span className="card-meta">
        <span className="card-value">
          {isChar ? def.popularity + instance.permanentPopularityBonus : `+${fmt(effectiveBuzz)}`}
        </span>
        {isChar && instance.faction && <span className={`card-faction faction-${instance.faction}`}>{instance.faction === 'ally' ? '仲間' : '敵'}</span>}
        {isChar && instance.flags.training > 0 && (
          <span className="card-flags">{'修'.repeat(instance.flags.training)}</span>
        )}
      </span>
      {!isChar && def.target.startsWith('one') && !targetName && <span className="card-target-required">対象を選ぶ ↗</span>}
      {stocked && <span className="card-stock-badge">保管</span>}
      {stale && <span className="card-freshness">鮮度{Math.round(freshness * 100)}%</span>}
      {targetName && <span className="card-target">{isChar ? `◀${targetName}` : `→${targetName}`}</span>}
    </button>
    {onInspect && <button type="button" className="card-inspect" aria-label={`${def.name}の効果を読む`} onClick={onInspect}>効果を読む</button>}
    </div>
  );
}
