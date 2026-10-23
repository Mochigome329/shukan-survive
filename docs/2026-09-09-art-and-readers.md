# 2026-09-09 イラストの整理・読者欄の強化

人物15枚と場面8枚を組み込みimage_genで再描画。キャラクター配置と場面の対応は維持し、細かな陰影・背景・質感を減らした。

保存先: `src/assets/cast-atlas-v2.png`, `src/assets/scene-atlas-v2.png`。配信用は同名 `.webp`（ImageMagick、品質85）。旧版は比較用に保持。MangaArt.tsxの参照をv2へ更新。

読者欄を得点直下へ移動し、淡い黄の紙面、30px見出し、最初の声22〜27px、他の声16px、吹き出し形状に変更。採点表とは独立したReaderVoicesコンポーネント。声の抽選・文言・表示タイミングは維持。

型検査・ビルド・単一HTMLの外部参照チェック成功。関連22テスト成功。配布約2.2MB（旧約3.0MB）。ブラウザ操作の再許可は返答待ちのため、実画面検証は未実施。

## 人物の最終プロンプト

Edit target: the supplied 15-character portrait atlas. Redraw it in a much simpler, charming hand-drawn Japanese comic style for tiny game cards. Keep the EXACT 5-column by 3-row layout and every character's cell assignment, identity, hair silhouette, age, accessories, and clothing accent. The current image is over-rendered. Remove at least 85% of the interior marks. Use lively chunky slightly irregular pen contours, expressive simplified eyes with one black pupil and NO sparkly layered irises, very simple noses and mouths, 3 to 6 big hair shapes per head, clothing with only 2 or 3 folds, flat opaque black shapes and small flat vermilion accents on a completely uniform light ivory background. Mostly open paper: airy faces and clear silhouettes, no shading on skin except one purposeful black shape when necessary. No hatching, crosshatching, stippling, screentone, paper grain, distressed texture, tiny hair strands, gradients, glossy highlights, realistic muscles, intricate costume seams. Looks like a confident cartoonist drawing spot portraits with a felt pen for a small independent comic magazine, deliberately economical linework, mild asymmetry, warm expressive character acting, recognizable adults vs young people, not chibi, not pictograms, not corporate vector art. Preserve portrait framing and exact evenly divided square cells without gaps. This is a fundamental redraw, not a filter. Fifteen portraits, no lettering, no watermark.

## 場面の最終プロンプト

Edit target is Image 1, the eight-scene atlas. Image 2 is STYLE REFERENCE ONLY for simplified linework. Fundamentally redraw Image 1 to match Image 2's economical flat comic drawing. Keep EXACT 4 columns by 2 rows, all eight scene assignments and their clear storytelling: punch, training under waterfall, mysterious red thread, meal with friend; betrayal, awakening, mourning, fist bump. Radically simplify every panel: about 70 percent blank ivory paper overall, chunky expressive pen contours, sparse details, flat black silhouettes and ONE flat vermilion accent per scene, no gray shading, no gradients. Hero with black spiky hair and red scarf. Keep powerful poses but anatomically simple. Remove all hatching, tiny hair strands, stippling, screentones, mottled paper, fabric texture, rubble, dust, rocks, foliage, landscape panoramas, intricate lightning, realistic muscles. Waterfall becomes 5 big flowing strokes; punch gets only 5 clear speed lines; red thread scene is hand plus one simple red thread on ivory; meal just two heads and bowls, no scenery; betrayal one simple close-up face with half black shadow; awakening figure with three red radiating shapes; mourning two figures and 6 rain strokes; fist bump two clearly drawn hands against empty paper. Focus on characters and one action, small indie comic magazine pen drawing, confident expressive line with slight human irregularity, not polished splash art, not a realistic poster. NO text, captions, borders, gutters, watermark. Layout exactly equal square cells, 2:1 overall.

