# 2026-09-09 役成立の見開き・陣営・場面の拡張

## 内容

- 既存8場面に、展開用12場面・役成立用8場面を追加。場面絵は計28種類、人物15種類は継続。
- artCatalog.tsが全83カードと全役の対応表を持つ。カードと役でIDが同じでも別の絵を割り当てる。
- MangaArt.tsxはアトラス描画に責務を限定。実際のCardInstance.factionを渡し、改心・寝返りで絵の明暗とカードの紙色を変更。陣営は文字でも表示する。
- カットインを漫画絵と役名・効果のコマに分離。衝撃・情感・仕込み回収・通常・人物登場・完結ボーナスで構成を切り替える。
- 個別演出は1.05秒、早送り可能。結果画面から見開きを再表示してゆっくり読める。
- 非正方形パネルでもアトラスの縦横比を保ち、中央を切り出して表示。

## 新規アートの保存先

組み込みimage_genを使用。既存の簡素な線画をスタイル参照として新規制作。
`src/assets/expansion-atlas.png`、`src/assets/combo-atlas.png`。
配布用は同名.webp（ImageMagick品質85）。従来アートは残している。

## 展開用プロンプト

Use case illustration-story. Create a NEW production manga game sprite atlas with exactly FOUR columns by THREE rows, twelve equal SQUARE panels with no gaps. Supplied image is STYLE REFERENCE ONLY. Match its simple Japanese comic pen line, flat black and vermilion on clean ivory, sparse details and lots of blank paper. Avoid hatching, paper texture, gradients, tiny detail, dense backgrounds. Distinct expressive staging at thumbnail size, original black spiky-haired hero with red scarf. Row1 left to right: (1) huge tournament arena archway and two small fighters facing off, simple flags (2) hero holds aloft a new broad sword, blade and determined face (3) hero fires one bold vermilion energy wave from open palm, energetic diagonal (4) imposing enemy organization silhouettes of three different villains, central tall black-caped leader. Row2: (5) two young friends in profile shyly facing each other, small red heart between, romantic confession (6) hero embraces an old friend returning through a doorway, emotional reunion (7) closeup of old childhood photo showing two children, adult hand holds its edge, memory (8) lone cloaked newcomer stands in doorway, confident mysterious debut. Row3: (9) hero leaps to catch a falling friend's outstretched hand, rescue (10) older mentor shielding a youth with one outstretched arm, sacrifice, no injury detail (11) boy's silhouette and grown-up silhouette side by side linked by a simple red arc, time skip (12) circular empty stage bounded by two black doors, one red key at center, mystery sealed setting. Flat consistent line weights, iconic clear action, max 2-3 background marks per cell, do not reuse reference scenes. No letters numbers speech bubbles logos watermark. Exact 4x3 regular grid, landscape4:3.

## 役用プロンプト

Use case illustration-story. NEW illustrated combo reward atlas for an original manga-making game. Reference image gives STYLE ONLY: economical confident black pen, large flat black and vermilion shapes, clean ivory negative space, no texture no hatching no gradients. Create exact 4 columns by 2 rows with eight equal SQUARE separate scenes, no gutters, no text. These are satisfying dramatic manga moments, with a clear central composition and peripheral space for UI title overlays; keep subjects in middle 75% of each cell. Original hero black spiky hair red scarf, rival white spiky hair dark high collar, heroine dark bob haircut. Row1 left to right: (1) hero and rival clash their fists at center, opposing mirrored poses, one strong red impact shape (2) old mentor's large hand passing a red-glowing simple sword into young hero's smaller hand, mentor silhouette behind, inheritance (3) scattered memory panels joined by ONE red thread forming a complete circle around the hero's focused eye, revelation payoff (4) hero and heroine joyfully embrace after long separation, minimal two figures and one red scarf arc. Row2: (5) three heroes charge together side by side, hero, heroine, goggle-wearing sidekick, determined faces, bold forward diagonal (6) hero turned away into pitch black silhouette with one red eye and torn red scarf, betrayal/dark hero (7) old mentor walks away with back to viewer, young hero reaching out, a single red leaf between, quiet emotional farewell on abundant empty ivory (8) hero stands atop simple black hill holding red scarf aloft, two friends beside, broad ivory sun, triumphant finale. No dense backgrounds, only expressive faces, simplified clear hands and decisive silhouettes. No airbrushed glow; flat vermilion only. No typography numbers logos watermark. Exact2:1 overall4x2 grid.

## 検証

全体テスト617件中616件成功（新規対応表7件を含む）。従来のshapes.test.tsの子プロセス起動のみEPERM。追加の陣営・カード/役イラスト分離2件も成功。最終の再表示機能検査とビルド結果は配布ログに追記。ブラウザ操作の再許可は返答待ちであり、実画面検証は未実施。

最終追記: 再表示の関連14件（新規3件含む）成功、型検査noEmit成功。本番ビルド約2.9MB、外部参照なし単一HTML確認。再表示のフォーカス・Escape・通常演出との分離を独立ソースレビューし重大指摘なし。全116役の対応表。Sites version4 / 配布元コミット a61f3b838ddfff22f336397d84cbd7182347302e。
