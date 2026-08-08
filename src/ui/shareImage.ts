/**
 * 連載年表のシェア画像を描く（v7.0 / v7.11で2枚組に）。
 *
 * DOMのスクリーンショット（html2canvas等）は使わない。外部依存が増えるうえCSSの再現が不安定で、
 * そもそも画面のレイアウトはSNSに貼るのに適した比率ではないため、
 * **年表の構造化データからSNS向けのカードを専用に描く**方針にした。
 *
 * v7.11で2枚に分割:
 * - 1枚目 サマリー（1080×1350の4:5）… 成績表・起伏グラフ・結末・キャスト。これ単体で自慢が完結する
 * - 2枚目 全話年表（縦長）… 詳細を見たい人向け
 * 1枚に全部入れると縦横比が1:2.5を超え、SNSのタイムラインでほとんど切り取られてしまうため。
 *
 * 将来ここに絵を差し込めるよう、次の2か所をスロットとして空けてある:
 * - サマリーのヘッダー右側 … タイトル画面の表紙絵（改修①）
 * - 年表の各行の左端 … キャラアイコン（改修③）
 */
import { formatRatio, ratioToHeight, type Chronicle, type ChronicleWeek } from '../core/chronicle';
import { MAX_WARNINGS, type WeekEvent } from '../core/types';

const FONT = "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', sans-serif";

const COLOR = {
  ink: '#1a1613',
  paper: '#f7f3ea',
  paperDark: '#eae4d5',
  accent: '#c0392b',
  ok: '#1e7d4f',
  sub: '#6b6152',
  gold: '#a87b12',
  goldBg: '#fdf3d4',
  white: '#ffffff',
};

const WIDTH = 1080;
const SUMMARY_HEIGHT = 1350;
const PAD = 56;
const FOOTER_H = 96;
const HEADER_H = 92;

export interface ShareImageInput {
  mangaTitle: string;
  kind: 'cancelled' | 'clearedAll';
  totalScore: number;
  finalScore: number;
  /** 完結したランの型見出し。打ち切りならnull（一律「打ち切りエンド」を出す） */
  storyType: { label: string; headline: string } | null;
  chronicle: Chronicle;
  ending: { name: string; epilogue: string } | null;
  /** 役IDから表示名を引く */
  comboName: (id: string) => string;
  eventText: (e: WeekEvent) => string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 幅に収まるまで末尾を切って「…」を付ける */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

/** 幅で折り返して行に分ける（最大 maxLines 行、あふれたら末尾を「…」に） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const ch of text) {
    if (ctx.measureText(current + ch).width > maxWidth) {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      current += ch;
    }
  }
  const consumed = lines.join('').length;
  const rest = text.slice(consumed);
  lines.push(lines.length === maxLines - 1 ? ellipsize(ctx, rest, maxWidth) : current);
  return lines.filter((l) => l.length > 0);
}

/** 背景（本文と同じ紙色＋ドット） */
function paintBackground(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = 'rgba(26, 22, 19, 0.05)';
  for (let y = 0; y < height; y += 16) {
    for (let x = 0; x < WIDTH; x += 16) ctx.fillRect(x, y, 2, 2);
  }
}

function paintHeaderBand(ctx: CanvasRenderingContext2D, right: string): void {
  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, 0, WIDTH, HEADER_H);
  ctx.fillStyle = COLOR.paper;
  ctx.font = `700 30px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('週刊サバイブ', PAD, HEADER_H / 2);
  ctx.font = `500 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(right, WIDTH - PAD, HEADER_H / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // ※ここのヘッダー右側が、将来の表紙絵スロット（改修①）
}

function paintFooter(ctx: CanvasRenderingContext2D, height: number, note: string): void {
  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(0, height - FOOTER_H, WIDTH, FOOTER_H);
  ctx.fillStyle = COLOR.paper;
  ctx.font = `700 28px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('週刊サバイブ', PAD, height - FOOTER_H / 2);
  ctx.font = `400 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(note, WIDTH - PAD, height - FOOTER_H / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** タグ（役・ほかN）を1つ描いて、次のx座標を返す */
function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colors: { bg: string; border: string; fg: string },
): number {
  ctx.font = `500 20px ${FONT}`;
  const w = ctx.measureText(text).width + 20;
  const h = 30;
  ctx.fillStyle = colors.bg;
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colors.fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 10, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return x + w + 8;
}

/** 出来事のバッジ。役のタグより太く濃く描いて、事件として目立たせる（v7.11） */
function drawEventBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, kind: WeekEvent['kind']): number {
  const tone = EVENT_TONE[kind];
  ctx.font = `900 21px ${FONT}`;
  const w = ctx.measureText(text).width + 24;
  const h = 34;
  ctx.fillStyle = tone.bg;
  ctx.strokeStyle = tone.border;
  ctx.lineWidth = 3;
  roundRect(ctx, x, y - 2, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tone.fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 12, y - 2 + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return x + w + 8;
}

const EVENT_TONE: Record<WeekEvent['kind'], { bg: string; border: string; fg: string }> = {
  death: { bg: COLOR.accent, border: COLOR.ink, fg: '#ffffff' },
  toEnemy: { bg: COLOR.ink, border: COLOR.ink, fg: COLOR.paper },
  leave: { bg: COLOR.ink, border: COLOR.ink, fg: COLOR.paper },
  debut: { bg: '#dff0e3', border: COLOR.ok, fg: '#14532d' },
  return: { bg: '#dff0e3', border: COLOR.ok, fg: '#14532d' },
  toAlly: { bg: '#dff0e3', border: COLOR.ok, fg: '#14532d' },
};

const EVENT_MARK: Record<WeekEvent['kind'], string> = {
  death: '✝',
  leave: '↓',
  toEnemy: '↯',
  debut: '＋',
  return: '◎',
  toAlly: '◎',
};

/** 週の棒の色 */
function barColor(w: ChronicleWeek): string {
  if (!w.cleared) return COLOR.accent;
  if (w.final) return COLOR.ok;
  if (w.boss) return COLOR.gold;
  return COLOR.ink;
}

/* ============================================================
 * 1枚目: サマリー（4:5）
 * ============================================================ */
function renderSummary(input: ShareImageInput): HTMLCanvasElement {
  const { chronicle: c } = input;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = SUMMARY_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  paintBackground(ctx, SUMMARY_HEIGHT);
  paintHeaderBand(ctx, '連載年表');

  // ===== 作品タイトル =====
  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 56px ${FONT}`;
  ctx.fillText(ellipsize(ctx, `『${input.mangaTitle}』`, WIDTH - PAD * 2), PAD, 168);

  // ===== 判定スタンプ・話数・最終評価 =====
  const cancelled = input.kind === 'cancelled';
  ctx.font = `900 34px ${FONT}`;
  const stampText = cancelled ? '打ち切り' : '完結';
  const stampW = ctx.measureText(stampText).width + 36;
  ctx.strokeStyle = cancelled ? COLOR.accent : COLOR.ok;
  ctx.lineWidth = 4;
  roundRect(ctx, PAD, 196, stampW, 52, 6);
  ctx.stroke();
  ctx.fillStyle = cancelled ? COLOR.accent : COLOR.ok;
  ctx.textBaseline = 'middle';
  ctx.fillText(stampText, PAD + 18, 196 + 27);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = COLOR.sub;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(`全${c.lastWeek}話`, PAD + stampW + 20, 232);

  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 44px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(input.finalScore.toLocaleString(), WIDTH - PAD, 232);
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = COLOR.sub;
  ctx.fillText('最終評価', WIDTH - PAD, 198);
  ctx.textAlign = 'left';

  // ===== 型見出し =====
  const bandY = 262;
  ctx.fillStyle = cancelled ? '#f2ece2' : COLOR.paperDark;
  ctx.strokeStyle = cancelled ? '#8a7f70' : COLOR.ink;
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, bandY, WIDTH - PAD * 2, 54, 5);
  ctx.fill();
  ctx.stroke();
  ctx.textBaseline = 'middle';
  if (cancelled) {
    ctx.fillStyle = COLOR.sub;
    ctx.font = `900 28px ${FONT}`;
    ctx.fillText('打ち切りエンド', PAD + 18, bandY + 28);
  } else if (input.storyType) {
    ctx.fillStyle = COLOR.ink;
    ctx.font = `900 28px ${FONT}`;
    ctx.fillText(input.storyType.label, PAD + 18, bandY + 28);
    const labelW = ctx.measureText(input.storyType.label).width;
    ctx.fillStyle = '#4a4335';
    ctx.font = `400 22px ${FONT}`;
    ctx.fillText(ellipsize(ctx, input.storyType.headline, WIDTH - PAD * 2 - labelW - 44), PAD + 30 + labelW, bandY + 29);
  }
  ctx.textBaseline = 'alphabetic';

  // ===== 成績表（3列×2行） =====
  const stats: { num: string; unit?: string; label: string; tone?: 'hi' | 'warn' }[] = [
    { num: String(c.lastWeek), unit: '話', label: cancelled ? 'で打ち切り' : '完結' },
    { num: c.bestWeek ? formatRatio(c.bestWeek.ratio) : '—', label: c.bestWeek ? `最高達成度 第${c.bestWeek.week}話` : '最高達成度', tone: 'hi' },
    { num: String(c.clearedCount), unit: `/${c.playedWeeks}`, label: 'ノルマ達成' },
    { num: String(c.maxWarnings), unit: `/${MAX_WARNINGS}`, label: '最大警告', tone: c.maxWarnings > 0 ? 'warn' : undefined },
    { num: String(c.comboKinds), label: '成立した役' },
    { num: String(c.cast.alive.length), unit: '人', label: '生き残った' },
  ];
  const statGap = 12;
  const statW = (WIDTH - PAD * 2 - statGap * 2) / 3;
  const statH = 96;
  const statTop = 342;
  stats.forEach((s, i) => {
    const sx = PAD + (i % 3) * (statW + statGap);
    const sy = statTop + Math.floor(i / 3) * (statH + statGap);
    ctx.fillStyle = s.tone === 'hi' ? COLOR.goldBg : s.tone === 'warn' ? '#f7e0e0' : COLOR.white;
    ctx.strokeStyle = s.tone === 'hi' ? COLOR.gold : s.tone === 'warn' ? COLOR.accent : COLOR.ink;
    ctx.lineWidth = 3;
    // 影（ネオブルータリズムのハード影）
    ctx.fillStyle = COLOR.ink;
    ctx.fillRect(sx + 5, sy + 5, statW, statH);
    ctx.fillStyle = s.tone === 'hi' ? COLOR.goldBg : s.tone === 'warn' ? '#f7e0e0' : COLOR.white;
    ctx.fillRect(sx, sy, statW, statH);
    ctx.strokeRect(sx, sy, statW, statH);

    ctx.textAlign = 'center';
    ctx.fillStyle = s.tone === 'hi' ? '#6b4a06' : s.tone === 'warn' ? COLOR.accent : COLOR.ink;
    ctx.font = `900 44px ${FONT}`;
    const numW = ctx.measureText(s.num).width;
    let unitW = 0;
    if (s.unit) {
      ctx.font = `900 22px ${FONT}`;
      unitW = ctx.measureText(s.unit).width;
    }
    ctx.textAlign = 'left';
    const numX = sx + statW / 2 - (numW + unitW) / 2;
    ctx.font = `900 44px ${FONT}`;
    ctx.fillText(s.num, numX, sy + 54);
    if (s.unit) {
      ctx.font = `900 22px ${FONT}`;
      ctx.fillText(s.unit, numX + numW, sy + 54);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR.sub;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(ellipsize(ctx, s.label, statW - 12), sx + statW / 2, sy + 82);
    ctx.textAlign = 'left';
  });

  // ===== 起伏グラフ =====
  const gx = PAD;
  const gy = 566;
  const gw = WIDTH - PAD * 2;
  const gh = 300;
  ctx.fillStyle = COLOR.ink;
  ctx.fillRect(gx + 6, gy + 6, gw, gh);
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = COLOR.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText('連載の起伏', gx + 18, gy + 36);
  ctx.fillStyle = COLOR.sub;
  ctx.font = `700 18px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('ノルマに対する達成度', gx + gw - 18, gy + 36);
  ctx.textAlign = 'left';

  const plotX = gx + 18;
  const plotY = gy + 56;
  const plotW = gw - 36;
  const plotH = gh - 56 - 46;
  const barGap = 3;
  const barW = (plotW - barGap * (c.weeks.length - 1)) / Math.max(1, c.weeks.length);

  const quotaY = plotY + plotH - plotH / c.ratioCap;

  c.weeks.forEach((w, i) => {
    const bh = ratioToHeight(w.ratio, c.ratioCap) * plotH;
    const bx = plotX + i * (barW + barGap);
    ctx.fillStyle = barColor(w);
    ctx.fillRect(bx, plotY + plotH - bh, barW, bh);
    // 幕の切り替わりに縦の点線
    if (w.actStart && w.week > 1) {
      ctx.strokeStyle = '#8a7f70';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(bx - barGap / 2 - 1, plotY);
      ctx.lineTo(bx - barGap / 2 - 1, plotY + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // ノルマ線は棒より後に描く。先に描くと棒に覆われて、肝心の基準線がほとんど見えない
  ctx.strokeStyle = COLOR.accent;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(plotX, quotaY);
  ctx.lineTo(plotX + plotW, quotaY);
  ctx.stroke();
  ctx.setLineDash([]);
  // 線の右端に「ノルマ」と添える
  ctx.font = `900 16px ${FONT}`;
  const qLabel = 'ノルマ';
  const qLabelW = ctx.measureText(qLabel).width + 10;
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(plotX + plotW - qLabelW, quotaY - 19, qLabelW, 18);
  ctx.fillStyle = COLOR.accent;
  ctx.fillText(qLabel, plotX + plotW - qLabelW + 5, quotaY - 5);

  // 凡例
  const legend: { color: string; text: string }[] = [
    { color: COLOR.ink, text: '通常回' },
    { color: COLOR.gold, text: 'ボス週' },
    { color: COLOR.accent, text: '未達' },
    { color: COLOR.ok, text: '最終回' },
  ];
  let lx = plotX;
  const ly = plotY + plotH + 28;
  ctx.font = `700 18px ${FONT}`;
  for (const l of legend) {
    ctx.fillStyle = l.color;
    ctx.fillRect(lx, ly - 12, 16, 16);
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx, ly - 12, 16, 16);
    ctx.fillStyle = COLOR.sub;
    ctx.fillText(l.text, lx + 23, ly + 2);
    lx += 23 + ctx.measureText(l.text).width + 26;
  }

  // ===== 結末 =====
  let y = 900;
  if (input.ending) {
    const eh = 118;
    ctx.fillStyle = COLOR.ink;
    ctx.fillRect(PAD, y, WIDTH - PAD * 2, eh);
    ctx.fillStyle = COLOR.paper;
    ctx.font = `900 32px ${FONT}`;
    ctx.fillText(`完　${ellipsize(ctx, input.ending.name, WIDTH - PAD * 2 - 60)}`, PAD + 22, y + 46);
    ctx.fillStyle = '#cdc4b4';
    ctx.font = `400 22px ${FONT}`;
    const lines = wrapText(ctx, input.ending.epilogue, WIDTH - PAD * 2 - 44, 2);
    lines.forEach((line, i) => ctx.fillText(line, PAD + 22, y + 82 + i * 30));
    y += eh + 26;
  }

  // ===== キャスト名鑑 =====
  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 24px ${FONT}`;
  ctx.fillText('この連載に出た者たち', PAD, y + 26);
  y += 46;

  const groups: { label: string; names: string[]; tone: 'alive' | 'dead' | 'left' }[] = [
    { label: '生存', names: c.cast.alive, tone: 'alive' },
    { label: '死亡', names: c.cast.dead, tone: 'dead' },
    { label: '離脱', names: c.cast.left, tone: 'left' },
  ];
  for (const g of groups) {
    if (g.names.length === 0) continue;
    // 見出しラベル
    ctx.fillStyle = g.tone === 'alive' ? '#dff0e3' : g.tone === 'dead' ? COLOR.ink : COLOR.paperDark;
    ctx.fillRect(PAD, y, 78, 34);
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(PAD, y, 78, 34);
    ctx.fillStyle = g.tone === 'dead' ? COLOR.paper : COLOR.ink;
    ctx.font = `900 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.label, PAD + 39, y + 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 名前チップ
    let nx = PAD + 92;
    ctx.font = `700 21px ${FONT}`;
    for (const name of g.names) {
      const nw = ctx.measureText(name).width + 22;
      if (nx + nw > WIDTH - PAD) {
        ctx.fillStyle = COLOR.sub;
        ctx.fillText('…', nx + 4, y + 24);
        break;
      }
      ctx.fillStyle = g.tone === 'dead' ? COLOR.paperDark : COLOR.white;
      ctx.fillRect(nx, y, nw, 34);
      ctx.strokeStyle = g.tone === 'dead' ? '#b3a894' : COLOR.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(nx, y, nw, 34);
      ctx.fillStyle = g.tone === 'dead' ? COLOR.sub : COLOR.ink;
      ctx.fillText(name, nx + 11, y + 24);
      if (g.tone === 'dead') {
        // 死亡は取り消し線
        ctx.strokeStyle = COLOR.sub;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(nx + 7, y + 17);
        ctx.lineTo(nx + nw - 7, y + 17);
        ctx.stroke();
      }
      nx += nw + 8;
    }
    y += 44;
  }

  paintFooter(ctx, SUMMARY_HEIGHT, '詳しい年表は2枚目へ');
  return canvas;
}

/* ============================================================
 * 2枚目: 全話年表
 * ============================================================ */
const QUIET_H = 44;
const ACT_HEAD_H = 56;
const CARD_GAP = 10;
/** これを超える話数は2段組にする（縦に伸びすぎるとSNSでほぼ潰れるため） */
const TWO_COLUMN_FROM = 14;

function cardHeight(w: ChronicleWeek): number {
  let h = 88;
  if (w.boss || !w.cleared) h += 32;
  if (w.events.length > 0 || w.comboIds.length > 0) h += 44;
  return h;
}

/** 1週ぶんが縦に使う高さ（幕の見出しを含む） */
function blockHeight(w: ChronicleWeek): number {
  return (w.actStart ? ACT_HEAD_H : 0) + (w.quiet ? QUIET_H : cardHeight(w) + CARD_GAP);
}

/** 幕の見出しを描く */
function drawActHead(ctx: CanvasRenderingContext2D, act: { label: string; title: string }, x: number, y: number, colW: number): void {
  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 21px ${FONT}`;
  const labelW = ctx.measureText(act.label).width + 26;
  ctx.fillRect(x, y + 8, labelW, 32);
  ctx.fillStyle = COLOR.paper;
  ctx.textBaseline = 'middle';
  ctx.fillText(act.label, x + 13, y + 25);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 21px ${FONT}`;
  const title = ellipsize(ctx, act.title, colW - labelW - 60);
  ctx.fillText(title, x + labelW + 12, y + 32);
  const titleW = ctx.measureText(title).width;
  ctx.strokeStyle = COLOR.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + labelW + 22 + titleW, y + 25);
  ctx.lineTo(x + colW, y + 25);
  ctx.stroke();
}

/** 1週ぶんを描いて、消費した高さを返す */
function drawWeekBlock(ctx: CanvasRenderingContext2D, w: ChronicleWeek, x: number, y: number, colW: number, input: ShareImageInput): number {
  const c = input.chronicle;
  let cursor = y;

  if (w.actStart) {
    drawActHead(ctx, w.actStart, x, cursor, colW);
    cursor += ACT_HEAD_H;
  }

  // --- 平凡な週は1行 ---
  if (w.quiet) {
    ctx.strokeStyle = '#cfc6b4';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 2, cursor + 5);
    ctx.lineTo(x + 2, cursor + QUIET_H - 7);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    const midY = cursor + QUIET_H / 2 - 1;
    ctx.fillStyle = COLOR.ink;
    ctx.font = `900 21px ${FONT}`;
    ctx.fillText(`第${w.week}話`, x + 16, midY);
    ctx.fillStyle = COLOR.sub;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(w.score.toLocaleString(), x + 108, midY);

    ctx.font = `900 21px ${FONT}`;
    const ratioText = formatRatio(w.ratio);
    const ratioW = ctx.measureText(ratioText).width;

    const [head, ...rest] = w.comboIds;
    if (head) {
      const label = `${input.comboName(head)}${rest.length > 0 ? ` ほか${rest.length}` : ''}`;
      ctx.fillStyle = COLOR.sub;
      ctx.font = `400 19px ${FONT}`;
      const comboX = x + 210;
      ctx.fillText(ellipsize(ctx, label, colW - 210 - ratioW - 24), comboX, midY);
    }

    ctx.fillStyle = COLOR.ink;
    ctx.font = `900 21px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(ratioText, x + colW - 6, midY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return cursor + QUIET_H - y;
  }

  // --- 出来事のあった週はカード ---
  const ch = cardHeight(w);
  ctx.fillStyle = 'rgba(26, 22, 19, 0.22)';
  ctx.fillRect(x + 5, cursor + 5, colW, ch);
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(x, cursor, colW, ch);
  ctx.strokeStyle = w.boss ? COLOR.gold : w.cleared ? COLOR.ink : COLOR.accent;
  ctx.lineWidth = w.boss || !w.cleared ? 4 : 3;
  ctx.strokeRect(x, cursor, colW, ch);

  let iy = cursor + 14;

  if (w.boss) {
    ctx.font = `900 18px ${FONT}`;
    const t = `ボス週 ${w.boss}`;
    const tw = ctx.measureText(t).width + 20;
    ctx.fillStyle = COLOR.gold;
    ctx.fillRect(x + 14, iy, tw, 26);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x + 24, iy + 14);
    ctx.textBaseline = 'alphabetic';
    iy += 32;
  } else if (!w.cleared) {
    ctx.fillStyle = COLOR.accent;
    ctx.font = `900 18px ${FONT}`;
    ctx.fillText(ellipsize(ctx, `⚠ ノルマ未達 — 打ち切り警告 ${w.warningsAfter}`, colW - 28), x + 14, iy + 19);
    iy += 32;
  }

  // 話数・スコア・達成度
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 25px ${FONT}`;
  const weekLabel = w.final ? `最終回・第${w.week}話` : `第${w.week}話`;
  ctx.fillText(weekLabel, x + 14, iy + 15);
  const weekW = ctx.measureText(weekLabel).width;

  ctx.font = `900 25px ${FONT}`;
  const ratioText = formatRatio(w.ratio);
  const ratioW = ctx.measureText(ratioText).width;

  ctx.fillStyle = COLOR.sub;
  ctx.font = `500 19px ${FONT}`;
  ctx.fillText(
    ellipsize(ctx, `${w.score.toLocaleString()} / ${w.quota.toLocaleString()}`, colW - weekW - ratioW - 52),
    x + 28 + weekW,
    iy + 16,
  );

  ctx.fillStyle = w.cleared ? COLOR.ink : COLOR.accent;
  ctx.font = `900 25px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(ratioText, x + colW - 14, iy + 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  iy += 34;

  // 達成度バー（赤い印がノルマの位置）
  const barX = x + 14;
  const barW = colW - 28;
  ctx.fillStyle = COLOR.paperDark;
  ctx.fillRect(barX, iy, barW, 10);
  ctx.strokeStyle = '#b3a894';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX, iy, barW, 10);
  ctx.fillStyle = w.cleared ? COLOR.ink : COLOR.accent;
  ctx.fillRect(barX, iy, barW * ratioToHeight(w.ratio, c.ratioCap), 10);
  ctx.fillStyle = COLOR.accent;
  ctx.fillRect(barX + barW / c.ratioCap - 1.5, iy - 3, 3, 16);
  iy += 22;

  // 出来事（格上げ）→ 役（チップ）。入りきらないぶんは切る
  if (w.events.length > 0 || w.comboIds.length > 0) {
    let tx = x + 14;
    const limit = x + colW - 12;
    for (const e of w.events) {
      const text = `${EVENT_MARK[e.kind]} ${input.eventText(e)}`;
      ctx.font = `900 21px ${FONT}`;
      if (tx + ctx.measureText(text).width + 24 > limit) break;
      tx = drawEventBadge(ctx, text, tx, iy, e.kind);
    }
    for (const id of w.comboIds) {
      const text = input.comboName(id);
      ctx.font = `500 20px ${FONT}`;
      if (tx + ctx.measureText(text).width + 20 > limit) break;
      tx = drawTag(ctx, text, tx, iy + 2, { bg: COLOR.goldBg, border: COLOR.gold, fg: '#6b4a06' });
    }
  }

  return cursor + ch + CARD_GAP - y;
}

function renderChronicleList(input: ShareImageInput): HTMLCanvasElement {
  const { chronicle: c } = input;
  const twoCol = c.weeks.length > TWO_COLUMN_FROM;
  const colGap = 24;
  const colW = twoCol ? (WIDTH - PAD * 2 - colGap) / 2 : WIDTH - PAD * 2;

  // 各週の高さを先に測り、2段組なら左右がだいたい同じ高さになる位置で折り返す
  const heights = c.weeks.map(blockHeight);
  const total = heights.reduce((a, b) => a + b, 0);
  let splitAt = c.weeks.length;
  if (twoCol) {
    let acc = 0;
    for (let i = 0; i < heights.length; i++) {
      if (acc + heights[i]! > total / 2) {
        splitAt = i;
        break;
      }
      acc += heights[i]!;
    }
    splitAt = Math.max(1, Math.min(c.weeks.length - 1, splitAt));
  }
  const leftH = heights.slice(0, splitAt).reduce((a, b) => a + b, 0);
  const rightH = heights.slice(splitAt).reduce((a, b) => a + b, 0);
  const bodyH = twoCol ? Math.max(leftH, rightH) : total;

  const topH = 168;
  const height = Math.round(topH + bodyH + 40 + FOOTER_H);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  paintBackground(ctx, height);
  paintHeaderBand(ctx, '全話年表');

  ctx.fillStyle = COLOR.ink;
  ctx.font = `900 38px ${FONT}`;
  ctx.fillText(ellipsize(ctx, `『${input.mangaTitle}』全${c.lastWeek}話`, WIDTH - PAD * 2), PAD, 148);

  let y = topH;
  let x = PAD;
  c.weeks.forEach((w, i) => {
    if (twoCol && i === splitAt) {
      x = PAD + colW + colGap;
      y = topH;
    }
    y += drawWeekBlock(ctx, w, x, y, colW, input);
  });

  paintFooter(ctx, height, 'きみの連載は、何話まで生き残れるか。');
  return canvas;
}

/** 年表をシェア用の2枚のcanvasにする（1枚目=サマリー、2枚目=全話年表） */
export function renderChroniclePages(input: ShareImageInput): HTMLCanvasElement[] {
  return [renderSummary(input), renderChronicleList(input)];
}

/** シェア時に本文として添える文章 */
export function shareText(
  input: Pick<ShareImageInput, 'mangaTitle' | 'kind' | 'finalScore' | 'storyType' | 'chronicle'>,
): string {
  const lastWeek = input.chronicle.lastWeek;
  const head =
    input.kind === 'clearedAll'
      ? `『${input.mangaTitle}』全${lastWeek}話、完結しました。`
      : `『${input.mangaTitle}』は第${lastWeek}話で打ち切りになりました。`;
  const type = input.kind === 'clearedAll' && input.storyType ? `\n${input.storyType.label}${input.storyType.headline}` : '';
  return `${head}${type}\n最終評価 ${input.finalScore.toLocaleString()}\n#週刊サバイブ`;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
