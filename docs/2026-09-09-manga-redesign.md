# 漫画誌としての全面改修

## 実装

- タイトルを朱・墨・生成りの漫画表紙に再構成。ロゴは実テキスト。
- 全15キャラクターの肖像と8場面の漫画アトラスを制作。初期キャスト、手札、原稿、編集会議、結果で共有する。
- 原稿を4コマの盤面に変更。選択・取り消し・対象・補正後話題性・鮮度を維持。
- 得点と入稿操作を手札の後へ移し、モバイルの画面下にsticky表示。DOM順も揃える。
- リザルトを号数、大見出し、スコア、漫画、朱印、読者の声、採点台帳の誌面に再構成。
- 初回案内と担当編集の助言、重要役だけの個別演出は前回改修から継続。
- 新しい描画責務は MangaArt.tsx、workbench.css、result-screen.css に分離。採点・デッキ・保存形式は変更しない。

## 検証

- 型検査成功。
- 全体607件中606件成功。shapes.test.tsの生成器子プロセスのみ従来通りEPERM。
- 原稿UIの追加3テスト成功。選択後の数値表示、取り消しと対象解除、DOM順を確認。
- onboarding既存5テストも再成功。
- 本番ビルド・単一HTMLの外部参照チェック成功。約3.0MB。
- 独立コードレビューで数値表示・DOM順・旧案内文言を指摘され、3点とも修正。
- ブラウザ操作は前回拒否を尊重し、再許可の返答待ち。実画面・実機タッチ・画面幅ごとの表示は未検証。SSRテストは見た目の検証ではない。

## 配布

前回と同じ本人限定URL: https://shukan-survive-playtest.iwaki1111.chatgpt.site

配布用スナップショット: ../uchikiri-survivor-preview、コミット d5f34880ce558626630b95e69eb083fa208038ca。

## アート

組み込みimage_genで新規生成。原画はsrc/assets/cast-atlas.png、scene-atlas.png。
配信用はImageMagickでWebP品質85に変換し、src/assets/cast-atlas.webp、scene-atlas.webp。CSS background-positionで切り出す。人物と場面は装飾で、カード名と効果はHTMLテキスト。

生成プロンプトの指定:

> Character atlas: illustration-story; production Japanese shonen manga game character atlas; exactly 5 columns by 3 rows, equal square cells, no gutters or text; centered head-and-shoulders; bold black ink, hatching, halftones, ivory and vermilion. Row 1: black spiky-haired hero with red scarf, dark bob-haired heroine, sidekick with goggles, braided childhood friend, white-haired rival. Row 2: weathered older mentor, round black cat mascot, long-haired archvillain, warm mother, stern father with glasses. Row 3: muscular scarred villain, thin bespectacled strategist, pompadour comic relief, timid freckled youth, civilian woman with glasses and ponytail. Distinct identities, consistent scale, readable at 80px, original designs, no watermark.

> Scene atlas: illustration-story; exactly 4 columns by 2 rows, equal square cells, no gutters or lettering; original professional battle manga, ivory paper, black ink, restrained vermilion, energetic hatching and halftone. Row 1: red-scarfed hero punching toward viewer, waterfall training, hand holding red thread into darkness, friends sharing a meal. Row 2: shadowed rival and betrayal, radiant heroine awakening, hero kneeling beside a fallen comrade in rain, scarred fists bumping in friendship. Independent scenes, no objects crossing boundaries, no speech balloons or watermark, 2:1 aspect ratio.
