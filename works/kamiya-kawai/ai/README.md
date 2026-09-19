# AI作業テンプレート

このディレクトリのテンプレートは、`manifest.json` の固定IDから対象場面を解決するための作業入口です。本文全体を再生成せず、対象場面と必要な前後・設定だけを読んで局所的な差分を作ります。

```bash
node scripts/ai-context.mjs P04-03 --template plan
node scripts/ai-context.mjs P04-03 --template revise
node scripts/ai-context.mjs P04-03 --template review
```

テンプレートが参照するのはIDと正本パスです。場面の追加・移動・削除では、先にmanifestとファイル名を構造操作として更新し、AIテンプレートに古い番号を手書きで残さないでください。

## テンプレートの使い分け

- `plan.md`: 変更目的、前後の変化、設定との整合を整理する。
- `revise.md`: 指定場面だけを改稿し、本文以外の正本へ勝手に波及させない。
- `review.md`: 台詞、人物、時系列、専門動作、関係の進展をレビューする。

テンプレートの出力は提案であり、確定設定へ自動保存しません。明示された変更だけを正本へ反映し、アーカイブは編集しません。

