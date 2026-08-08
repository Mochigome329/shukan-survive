/**
 * カード・役の一覧HTML（Artifact用）を生成する（`npm run cards` の後半）。
 * 手で書き写さず、cards.json と combos.ts のセクション区切りをそのまま反映する。
 * 使い方: node scripts/card-reference-render.mjs <dump.json> <out.html>
 */
import fs from 'node:fs';

const [dumpPath, outPath] = process.argv.slice(2);
if (!dumpPath || !outPath) throw new Error('使い方: node scripts/card-reference-render.mjs <dump.json> <out.html>');

const { cards, combos, endings = [] } = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const comboSrc = fs.readFileSync('src/core/combos.ts', 'utf8');

// combos.ts の「// ===== 見出し =====」からカテゴリを復元する
const sections = [];
for (const line of comboSrc.split('\n')) {
  const head = line.match(/\/\/ =====\s*(.+?)\s*=====/);
  if (head) sections.push({ title: head[1].replace(/（.*?）/g, '').trim(), ids: [] });
  const id = line.match(/^\s*id: '([^']+)'/);
  if (id && sections.length > 0) sections.at(-1).ids.push(id[1]);
}
const comboById = new Map(combos.map((c) => [c.id, c]));

const TARGET = {
  none: '対象なし',
  onePlayed: '場のキャラ1人',
  allPlayed: '場のキャラ全員',
  oneDead: '死亡済み1人',
  oneBench: '控え1人',
  oneWaiting: '再登場待ち1人',
  oneEnemy: '場の敵キャラ1人',
};
const TAG = { battle: 'バトル', lovecome: 'ラブコメ', mystery: 'ミステリー' };
const ACT = { jo: '序', ha: '破', kyu: '急' };
const ACT_FULL = {
  jo: { label: '序', note: '第1〜5話。出会いと世界の提示', weeks: '1〜5話' },
  ha: { label: '破', note: '第6〜16話。試練と裏切り、仕込み', weeks: '6〜16話' },
  kyu: { label: '急', note: '第17〜24話。決着と回収', weeks: '17〜24話' },
  none: { label: '汎用', note: '幕タグなし。どの話数帯でも同じ重みで出る', weeks: '全話' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function comboEffect(c) {
  const parts = [];
  if (c.popularityAdd) parts.push(`人気+${c.popularityAdd}`);
  if (c.buzzAdd) parts.push(`話題+${c.buzzAdd}`);
  if (c.scoreMultiplier) parts.push(`週スコア×${c.scoreMultiplier}`);
  if (c.charMultiplier) parts.push(`人気×${c.charMultiplier}`);
  return parts.length > 0 ? parts.join(' / ') : '効果は動的';
}

function comboFlags(c) {
  const f = [];
  if (c.isSetupCombo) f.push('仕込み');
  if (c.oncePerRun) f.push('1ラン1回');
  if (c.oncePerCharacter) f.push('1キャラ1回');
  if (c.layer > 1) f.push(`第${c.layer}層`);
  if (c.suppresses?.length) f.push(`${c.suppresses.map((s) => comboById.get(s)?.name ?? s).join('・')}を抑制`);
  return f;
}

/**
 * 編集できるテキスト（v7.3）。
 * data-edit のキーがそのまま書き戻し先になる（`npm run cards:apply` が解釈する）。
 * 効果に関わる数値は編集対象にしない——あくまでフレーバーだけを直せるようにする。
 */
const field = (key, text) => `<span class="f" data-edit="${key}">${esc(text)}</span>`;
const altField = (label, key, text) =>
  `<span class="frow alt"><span class="flabel">${esc(label)}</span>${field(key, text)}</span>`;

function descCell(kind, c, extra = '') {
  return `<td class="c-desc">${field(`${kind}:${c.id}:revealed`, c.descriptions.revealed)}
    ${extra}
    ${altField('未公開', `${kind}:${c.id}:hidden`, c.descriptions.hidden)}
    ${altField('内部', `${kind}:${c.id}:internal`, c.descriptions.internal)}
  </td>`;
}

function charRow(c) {
  return `<tr${c.rare ? ' class="is-rare"' : ''}>
    <td class="c-name">${esc(c.name)}${c.rare ? '<span class="rare">レア</span>' : ''}</td>
    <td class="c-num">${c.popularity}</td>
    <td><span class="faction f-${c.faction}">${c.faction === 'ally' ? '仲間' : '敵'}</span></td>
    ${descCell('char', c)}
  </tr>`;
}

function devRow(c) {
  const meta = [];
  if (c.unlockWeek > 1) meta.push(`第${c.unlockWeek}話〜`);
  if (c.maxCopies > 1) meta.push(`最大${c.maxCopies}枚`);
  if (c.soloOnly) meta.push('単独プレイのみ');
  for (const t of c.tags) meta.push(TAG[t] ?? t);
  const chips = meta.length
    ? `<span class="meta">${meta.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</span>`
    : '';
  return `<tr${c.rare ? ' class="is-rare"' : ''}>
    <td class="c-name">${esc(c.name)}${c.rare ? '<span class="rare">レア</span>' : ''}</td>
    <td class="c-num">+${c.buzz}</td>
    <td class="c-target">${TARGET[c.target] ?? c.target}</td>
    ${descCell('dev', c, chips)}
  </tr>`;
}

function endingEffect(c) {
  const parts = [];
  if (c.buzzAdd) parts.push(`話題+${c.buzzAdd}`);
  if (c.scoreMultiplier && c.scoreMultiplier !== 1) parts.push(`週スコア×${c.scoreMultiplier}`);
  if (c.charMultiplier && c.charMultiplier !== 1) parts.push(`人気×${c.charMultiplier}`);
  if (c.finalScoreDelta) parts.push(`最終評価${c.finalScoreDelta > 0 ? '+' : ''}${c.finalScoreDelta}`);
  if (c.unresolvedPenaltyMultiplier && c.unresolvedPenaltyMultiplier !== 1) {
    parts.push(`未回収ペナルティ×${c.unresolvedPenaltyMultiplier}`);
  }
  return parts.length > 0 ? parts.join(' / ') : '—';
}

const endingSection =
  endings.length === 0
    ? ''
    : `<section>
    <h2>結末カード（最終回）</h2>
    <p class="lede">第25話でだけ提示される。連載でやってきたことによって<b>選べる結末が変わり</b>、最大3枠のうち1枚を選ぶ。定義は <code>finale.ts</code>。</p>
    <div class="act-block">
      <h3 class="act-head"><span class="act-mark act-ending">結</span>結末の選択肢<em>${endings.length}種</em></h3>
      <div class="tablewrap"><table class="grid">
        <thead><tr><th>結末</th><th>提示条件</th><th>効果</th></tr></thead>
        <tbody>${endings
          .map((c) => {
            const flags = [];
            if (c.unconditional) flags.push('受け皿枠');
            if (c.bad) flags.push('バッドエンド');
            return `<tr${c.bad ? ' class="is-bad"' : ''}>
              <td class="c-name">${esc(c.name)}${c.bad ? '<span class="rare bad">バッド</span>' : ''}</td>
              <td class="c-desc">${esc(c.conditionText ?? '—')}
                ${flags.length ? `<span class="meta">${flags.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</span>` : ''}
                <span class="frow alt"><span class="flabel">締めの一行</span>${field(`ending:${c.id}:epilogue`, c.epilogue)}</span>
              </td>
              <td class="c-eff">${esc(endingEffect(c))}</td>
            </tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </div>
  </section>`;

const byAct = (act) => cards.developments.filter((d) => (d.act ?? 'none') === act);

const devSections = ['jo', 'ha', 'kyu', 'none']
  .map((act) => {
    const list = byAct(act);
    if (list.length === 0) return '';
    const a = ACT_FULL[act];
    return `<div class="act-block" data-act="${act}">
      <h3 class="act-head"><span class="act-mark act-${act}">${a.label}</span>${esc(a.note)}<em>${list.length}枚</em></h3>
      <div class="tablewrap"><table class="grid">
        <thead><tr><th>カード</th><th>話題</th><th>対象</th><th>効果</th></tr></thead>
        <tbody>${list.map(devRow).join('')}</tbody>
      </table></div>
    </div>`;
  })
  .join('');

const comboSections = sections
  .map((s) => {
    const list = s.ids.map((id) => comboById.get(id)).filter(Boolean);
    if (list.length === 0) return '';
    return `<div class="act-block">
      <h3 class="act-head"><span class="act-mark act-combo">役</span>${esc(s.title)}<em>${list.length}種</em></h3>
      <div class="tablewrap"><table class="grid">
        <thead><tr><th>役名</th><th>成立条件</th><th>効果</th></tr></thead>
        <tbody>${list
          .map((c) => {
            const flags = comboFlags(c);
            return `<tr>
              <td class="c-name">${esc(c.name)}</td>
              <td class="c-desc">${esc(c.conditionText)}
                ${flags.length ? `<span class="meta">${flags.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</span>` : ''}
                ${c.hintText ? `<span class="frow alt"><span class="flabel">ヒント</span>${field(`combo:${c.id}:hintText`, c.hintText)}</span>` : ''}
              </td>
              <td class="c-eff">${esc(comboEffect(c))}</td>
            </tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </div>`;
  })
  .join('');

const counts = {
  chars: cards.characters.length,
  devs: cards.developments.length,
  combos: combos.length,
  rare: [...cards.characters, ...cards.developments].filter((c) => c.rare).length,
};

const html = `<title>週刊サバイブ カード・役 一覧</title>
<style>
:root {
  --paper: #f7f3ea;
  --panel: #ffffff;
  --ink: #1a1613;
  --ink-soft: #5c5347;
  --ink-faint: #8a7f70;
  --rule: #d8d0be;
  --accent: #c0392b;
  --accent-soft: #fbe6e2;
  --gold: #a87b12;
  --gold-soft: #fdf3d4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #17130f;
    --panel: #201b16;
    --ink: #f0e9dc;
    --ink-soft: #b9ae9c;
    --ink-faint: #8b8172;
    --rule: #3a3128;
    --accent: #ef7060;
    --accent-soft: #3a201c;
    --gold: #e0b346;
    --gold-soft: #362b13;
  }
}
:root[data-theme='dark'] {
  --paper: #17130f;
  --panel: #201b16;
  --ink: #f0e9dc;
  --ink-soft: #b9ae9c;
  --ink-faint: #8b8172;
  --rule: #3a3128;
  --accent: #ef7060;
  --accent-soft: #3a201c;
  --gold: #e0b346;
  --gold-soft: #362b13;
}
:root[data-theme='light'] {
  --paper: #f7f3ea;
  --panel: #ffffff;
  --ink: #1a1613;
  --ink-soft: #5c5347;
  --ink-faint: #8a7f70;
  --rule: #d8d0be;
  --accent: #c0392b;
  --accent-soft: #fbe6e2;
  --gold: #a87b12;
  --gold-soft: #fdf3d4;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', sans-serif;
  font-size: 15px;
  line-height: 1.7;
}
.wrap { max-width: 900px; margin: 0 auto; padding: 28px 16px 72px; display: flex; flex-direction: column; gap: 26px; }

header { display: flex; flex-direction: column; gap: 10px; border-bottom: 3px solid var(--ink); padding-bottom: 14px; }
.masthead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.badge {
  font-size: 11px; font-weight: 700; letter-spacing: .3em;
  border: 2px solid var(--ink); padding: 2px 8px;
}
h1 {
  margin: 0;
  font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
  font-size: clamp(24px, 6vw, 36px); font-weight: 900; letter-spacing: .02em;
  text-wrap: balance;
}
.lede { margin: 0; color: var(--ink-soft); font-size: 13px; }
.tally { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--ink-soft); }
.tally b { font-size: 19px; font-weight: 900; color: var(--ink); font-variant-numeric: tabular-nums; margin-right: 3px; }

.tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; position: sticky; top: 0; background: var(--paper); padding: 10px 0; z-index: 5; border-bottom: 1px solid var(--rule); }
#q {
  flex: 1; min-width: 180px; padding: 9px 12px; font: inherit; font-size: 14px;
  border: 2px solid var(--ink); border-radius: 4px; background: var(--panel); color: var(--ink);
}
#q:focus-visible { outline: 3px solid var(--accent); outline-offset: 1px; }
.hits { font-size: 12px; color: var(--ink-faint); font-variant-numeric: tabular-nums; }

section { display: flex; flex-direction: column; gap: 14px; }
h2 {
  margin: 0;
  font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
  font-size: 21px; font-weight: 900;
  border-left: 6px solid var(--accent); padding-left: 10px;
}
.act-block { display: flex; flex-direction: column; gap: 6px; }
.act-head {
  margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 13px; font-weight: 700; color: var(--ink-soft);
}
.act-head em { font-style: normal; color: var(--ink-faint); font-size: 11px; font-variant-numeric: tabular-nums; }
.act-mark {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 26px; height: 22px; padding: 0 6px;
  background: var(--ink); color: var(--paper);
  font-weight: 900; font-size: 12px; border-radius: 3px;
}
.act-jo { background: #3a6b8a; color: #fff; }
.act-ha { background: #b0682a; color: #fff; }
.act-kyu { background: var(--accent); color: #fff; }
.act-none, .act-combo { background: var(--ink-soft); color: var(--paper); }

.tablewrap { overflow-x: auto; }
table.grid { width: 100%; border-collapse: collapse; background: var(--panel); border: 2px solid var(--ink); }
.grid th {
  text-align: left; font-size: 11px; letter-spacing: .06em; font-weight: 700;
  color: var(--paper); background: var(--ink); padding: 5px 9px; white-space: nowrap;
}
.grid td { padding: 8px 9px; border-top: 1px solid var(--rule); vertical-align: top; font-size: 13px; }
.grid tr.is-rare { background: var(--gold-soft); }
.c-name { font-weight: 800; white-space: nowrap; }
.c-num { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--accent); }
.c-target, .c-eff { white-space: nowrap; font-size: 12px; color: var(--ink-soft); }
.c-eff { font-weight: 700; color: var(--accent); }
.c-desc { line-height: 1.6; }
.meta { display: block; margin-top: 4px; }
.chip {
  display: inline-block; margin: 2px 4px 0 0; padding: 0 6px;
  font-size: 10px; font-weight: 700; color: var(--ink-soft);
  border: 1px solid var(--rule); border-radius: 10px; background: var(--paper);
}
.rare {
  margin-left: 5px; padding: 0 5px; border-radius: 3px;
  font-size: 9px; font-weight: 900; letter-spacing: .08em;
  color: #4a3000; background: linear-gradient(135deg, #ffe89a, #d9a520); border: 1px solid var(--gold);
}
.faction { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
.f-ally { color: #1e7d4f; border: 1px solid #1e7d4f; }
.f-enemy { color: var(--accent); border: 1px solid var(--accent); }

.notes { background: var(--accent-soft); border: 2px solid var(--accent); padding: 14px 16px; }
.notes h2 { border: 0; padding: 0; font-size: 18px; }
.notes ul { margin: 10px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 7px; }
.notes li { font-size: 13px; line-height: 1.65; }
.notes b { color: var(--accent); }
.empty { display: none; color: var(--ink-faint); font-size: 13px; padding: 8px 0; }
tr[hidden], .act-block[hidden] { display: none; }
.act-ending { background: var(--gold); color: var(--paper); }
.rare.bad { background: var(--ink-soft); }
tr.is-bad .c-name { color: var(--ink-faint); }

/* ===== フレーバーテキストの編集（v7.3） =====
   .alt は .frow より後に置くこと。どちらも単一クラス＝同じ詳細度なので、
   先に書くと .frow の display:block に打ち消されて編集中でなくても出てしまう */
.frow { display: block; font-size: 12px; color: var(--ink-soft); }
.alt { display: none; }
body.editing .alt { display: block; margin-top: 5px; }
.flabel {
  display: inline-block; min-width: 4.5em; margin-right: 6px;
  font-size: 10px; letter-spacing: 0.08em; color: var(--ink-faint);
}
body.editing .f {
  display: inline-block; min-width: 4em;
  border-bottom: 1px dashed var(--rule); padding: 1px 2px; border-radius: 3px;
}
body.editing .f:focus { outline: 2px solid var(--accent); background: var(--panel); }
.f.dirty { background: var(--gold-soft); border-bottom-color: var(--gold); }
.editbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.editbar button {
  font: inherit; font-size: 12px; padding: 6px 12px; cursor: pointer;
  background: var(--panel); color: var(--ink); border: 1px solid var(--rule); border-radius: 6px;
}
.editbar button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.editbar .dirtycount { font-size: 12px; color: var(--ink-faint); }
.exportbox {
  display: flex; flex-direction: column; gap: 8px;
  background: var(--panel); border: 2px solid var(--rule); border-radius: 8px; padding: 12px 14px;
}
.exportbox[hidden] { display: none; }
.exportnote { margin: 0; font-size: 12px; color: var(--ink-soft); line-height: 1.6; }
.exportbox textarea {
  width: 100%; box-sizing: border-box; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--paper); color: var(--ink); border: 1px solid var(--rule); border-radius: 6px;
  padding: 8px; resize: vertical;
}
</style>

<div class="wrap">
  <header>
    <div class="masthead"><span class="badge">週刊</span><h1>週刊サバイブ 全カード・全役</h1></div>
    <p class="lede">v5.9 時点の実装（第1〜25話・最終回まで）。<code>cards.json</code> と <code>combos.ts</code> から自動生成。</p>
    <div class="tally">
      <span><b>${counts.chars}</b>キャラ</span>
      <span><b>${counts.devs}</b>展開</span>
      <span><b>${counts.combos}</b>役</span>
      <span><b>${counts.rare}</b>レア</span>
    </div>
  </header>

  <div class="tools">
    <input id="q" type="search" placeholder="カード名・効果・条件で絞り込む" aria-label="絞り込み">
    <span class="hits" id="hits"></span>
  </div>

  <div class="tools editbar">
    <button type="button" id="editToggle">フレーバーを編集</button>
    <button type="button" id="exportBtn">変更をJSONで書き出す</button>
    <button type="button" id="resetBtn">編集を破棄</button>
    <span class="dirtycount" id="dirtyCount"></span>
  </div>

  <div class="exportbox" id="exportBox" hidden>
    <p class="exportnote">
      このJSONを <code>card-text-edits.json</code> として保存し、
      <code>npm run cards:apply card-text-edits.json</code> でソースへ書き戻す。
    </p>
    <textarea id="exportText" readonly rows="10" spellcheck="false"></textarea>
    <div class="editbar">
      <button type="button" id="copyBtn">コピー</button>
      <button type="button" id="downloadBtn">ファイルで保存</button>
      <button type="button" id="closeExport">閉じる</button>
      <span class="dirtycount" id="copyState"></span>
    </div>
  </div>

  <section>
    <h2>キャラ</h2>
    <div class="act-block">
      <div class="tablewrap">
        <table class="grid">
          <thead><tr><th>カード</th><th>人気</th><th>陣営</th><th>効果・説明</th></tr></thead>
          <tbody>${cards.characters.map(charRow).join('')}</tbody>
        </table>
      </div>
    </div>
  </section>

  <section>
    <h2>展開カード</h2>
    <p class="lede">幕タグ（序／破／急）は編集会議での提示重みに使う。同じ幕は3倍、隣は1倍、遠い幕は0.3倍。</p>
    ${devSections}
  </section>

  <section>
    <h2>役</h2>
    <p class="lede">成立条件は <code>combos.ts</code> のレジストリが唯一の正。上位役は下位役を抑制し、週スコア乗算は最高倍率1つだけが適用される。</p>
    ${comboSections}
  </section>

  ${endingSection}

  <p class="empty" id="empty">該当なし</p>

</div>

<script>
(function () {
  var q = document.getElementById('q');
  var hits = document.getElementById('hits');
  var empty = document.getElementById('empty');
  var rows = Array.prototype.slice.call(document.querySelectorAll('.grid tbody tr'));
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.act-block'));
  rows.forEach(function (r) { r.dataset.t = r.textContent.toLowerCase(); });

  function run() {
    var term = q.value.trim().toLowerCase();
    var n = 0;
    rows.forEach(function (r) {
      var show = !term || r.dataset.t.indexOf(term) !== -1;
      r.hidden = !show;
      if (show) n++;
    });
    blocks.forEach(function (b) {
      b.hidden = b.querySelectorAll('.grid tbody tr:not([hidden])').length === 0;
    });
    hits.textContent = term ? n + '件' : '';
    empty.style.display = term && n === 0 ? 'block' : 'none';
  }
  q.addEventListener('input', run);

  /* ===== フレーバーテキストの編集（v7.3） =====
     効果に関わる数値は触らせない。編集はlocalStorageに残り、
     「変更をJSONで書き出す」で出したファイルを npm run cards:apply で
     cards.json / combos.ts / finale.ts へ書き戻す。 */
  var KEY = 'uchikiri-card-text-edits';
  var fields = Array.prototype.slice.call(document.querySelectorAll('.f[data-edit]'));
  var original = {};
  fields.forEach(function (el) { original[el.dataset.edit] = el.textContent; });

  var edits = {};
  try { edits = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { edits = {}; }

  var editToggle = document.getElementById('editToggle');
  var exportBtn = document.getElementById('exportBtn');
  var resetBtn = document.getElementById('resetBtn');
  var dirtyCount = document.getElementById('dirtyCount');

  function paint() {
    fields.forEach(function (el) {
      var k = el.dataset.edit;
      if (Object.prototype.hasOwnProperty.call(edits, k)) {
        if (el.textContent !== edits[k]) el.textContent = edits[k];
      }
      el.classList.toggle('dirty', Object.prototype.hasOwnProperty.call(edits, k));
    });
    var n = Object.keys(edits).length;
    dirtyCount.textContent = n ? n + '件の変更あり（未書き出し）' : '';
    exportBtn.disabled = n === 0;
    resetBtn.disabled = n === 0;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch (e) { /* 保存できなくても編集は続けられる */ }
  }

  fields.forEach(function (el) {
    el.addEventListener('input', function () {
      var k = el.dataset.edit;
      var text = el.textContent.replace(/\\s+/g, ' ').trim();
      if (text === original[k] || text === '') delete edits[k];
      else edits[k] = text;
      el.classList.toggle('dirty', Object.prototype.hasOwnProperty.call(edits, k));
      var n = Object.keys(edits).length;
      dirtyCount.textContent = n ? n + '件の変更あり（未書き出し）' : '';
      exportBtn.disabled = n === 0;
      resetBtn.disabled = n === 0;
      save();
    });
    /* 改行を入れさせない（1行のフレーバーとして扱う） */
    el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') ev.preventDefault(); });
  });

  editToggle.addEventListener('click', function () {
    var on = document.body.classList.toggle('editing');
    editToggle.classList.toggle('on', on);
    editToggle.textContent = on ? '編集をやめる' : 'フレーバーを編集';
    fields.forEach(function (el) { el.contentEditable = on ? 'true' : 'false'; });
  });

  /* Artifactは sandbox 付きiframeで表示されるためダウンロードが黙って落ちる。
     常に本文を画面に出し、コピー／保存は「できたら使う」補助にする */
  var exportBox = document.getElementById('exportBox');
  var exportText = document.getElementById('exportText');
  var copyBtn = document.getElementById('copyBtn');
  var downloadBtn = document.getElementById('downloadBtn');
  var closeExport = document.getElementById('closeExport');
  var copyState = document.getElementById('copyState');

  exportBtn.addEventListener('click', function () {
    exportText.value = JSON.stringify(edits, null, 2);
    exportBox.hidden = false;
    copyState.textContent = '';
    exportText.focus();
    exportText.select();
  });

  closeExport.addEventListener('click', function () { exportBox.hidden = true; });

  copyBtn.addEventListener('click', function () {
    exportText.focus();
    exportText.select();
    function ok() { copyState.textContent = 'コピーしました'; }
    function ng() { copyState.textContent = '自動コピー不可。上のテキストを選んでコピーしてください'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(exportText.value).then(ok, function () {
        try { document.execCommand('copy') ? ok() : ng(); } catch (e) { ng(); }
      });
    } else {
      try { document.execCommand('copy') ? ok() : ng(); } catch (e) { ng(); }
    }
  });

  downloadBtn.addEventListener('click', function () {
    try {
      var blob = new Blob([exportText.value], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'card-text-edits.json';
      /* 切り離したままだとクリックが無視される環境があるので、DOMに入れてから押す */
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      copyState.textContent = '保存を試みた（ブロックされる環境ではコピーを使ってください）';
    } catch (e) {
      copyState.textContent = '保存できない環境です。コピーを使ってください';
    }
  });

  resetBtn.addEventListener('click', function () {
    edits = {};
    save();
    fields.forEach(function (el) { el.textContent = original[el.dataset.edit]; });
    paint();
  });

  paint();
})();
</script>
`;

fs.writeFileSync(outPath, html);
console.log(`一覧HTMLを ${outPath} に書き出しました（${Math.round(html.length / 1024)} KB）`);
