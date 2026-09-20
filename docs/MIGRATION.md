# 移行作業（#1 の実装メモ）

正本は [story-library#1](https://github.com/kdob1042/story-library/issues/1)。
関連Issueは再利用し、同じ移行を別Issueへ再実装しない。

| 作業 | 担当 | 状態 |
| --- | --- | --- |
| M0 棚卸し | 本リポジトリ / #1 | 完了。各originの採用main commitを固定 |
| M1 catalog / 作品root / 読取adapter | 本リポジトリ / #1 | 完了。investor-life-source/v1の明示adapterを含む |
| M2 既存原稿の複製とsource-map充填 | 本リポジトリ / #1 | 完了。Kamiya-Kawai / investor-lifeを固定commitから作品別PRで取り込み、内容一致を確認 |
| M3 `templates/work/` と軽量CI | 本リポジトリ / #1 | 本PR。雛形・new-work CLI・軽量テストを追加。小説リーダー移管は novel-template#3 |
| M4 制作アプリの作品選択 | [manga-mac#157](https://github.com/kdob1042/manga-mac/issues/157) | M1契約確定後 |
| M5 小説リーダー移管 | [novel-template#3](https://github.com/kdob1042/novel-template/issues/3) → live-manga | M1契約確定後 |
| M5/M6 本棚・URL | [live-manga#46](https://github.com/kdob1042/live-manga/issues/46) | M1の後、公開判定と分担 |
| M6 公開判定・main/dev分離 | [live-manga#44](https://github.com/kdob1042/live-manga/issues/44) | 公開範囲は変更しない |
| M7 統合受入 | #1 + live-manga#46 | 未着手 |
| M8 最終増分・正本切替 | 本リポジトリ / #1 | M7完了まで origin を残す |

## 禁止

- 旧原稿repoの削除・archive
- 旧Worker停止
- 一般公開範囲の変更
- 本文・固定ID・人物基準画像・制作履歴の破棄
- 未確認originからの本文創作

## レビュー単位

1. M0–M1 契約（本PR）
2. M2 複製ツールと対応表（実ファイルは権限のある環境）
3. M3 雛形とCI
4. 以降は既存Issue先のDraft PR

## ブランチ昇格ルール

- 通常の実装・原稿変更は最新 `dev` から開始し、作業ブランチから `dev` へPRを出す。
- devでCIとプレビュー確認を行い、受入後に `dev → main` のPRで公開用ブランチへ昇格する。
- `dev` と `main` への直接push、通常運用での `main → dev` 同期は禁止する。
