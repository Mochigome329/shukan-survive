# Safari対象選択のスクロール対策 — version 6

ユーザー報告: iPhone Safariで対象指定カードを選ぶと「カードを手札に戻す」に赤枠が付き、選択画面が下に引っ込む。v5のChromiumでの390×844操作では修行と登場の対象選択に成功しており、Safari実機の失敗は未再現。

今回の対策:
- native dialog自身をautofocus対象にし、tabIndex=-1とpreventScroll付きfocusを指定。子ボタンのReact autoFocusを削除。
- useLayoutEffectで描画前に開き、bodyを現在のスクロール位置で固定。解除時に元のstyleと位置を復元。
- 下寄せ・90dvhから上側固定・100svh基準の最大高さへ変更。Safariツールバーによる表示領域変動に追従して下へ動く配置を避ける。
- 対象ボタンの押下時のtranslateを削除。キーボード操作用のfocus-visible表示は維持。

検証: 関連17テスト成功（スクロール固定・復元の単体テスト1件追加）、TypeScript noEmit、本番ビルド、単一HTML外部参照検査成功。

実機での解消は未確認。ローカルブラウザアクセスは設定表示と矛盾する保存済み拒否によりブロック中。修正と公開作業は独立して実施し、拒否されたアクセスの迂回は行わない。

Sites source SHA: 3b98722ea1370e09ffd198bb29fc996e12809a4d
