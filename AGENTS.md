# story-library working rules

- 作業一覧の正本は GitHub Issue #1。関連する manga-mac / live-manga / novel-template のIssueを再利用する。
- 本文、固定ID、人物基準画像、制作履歴を保持する。移行を口実に再採番・改稿しない。
- 原稿パスは作品rootから解決する。`source/manifest.json` は入口であり、`source/` から `manuscript/` を誤解決しない。
- 新作の形式正本は vendored `contracts/story-source`（manga-mac lock）。既存作品は読取adapterで読む。
- 公開CIには人工fixtureだけを使う。新作雛形の正本は `templates/work/`。
- 原稿・設定・画像・履歴と小説ビューアの編集先は本repo。旧Kamiya-Kawai/investor-lifeは取込履歴として参照し、旧repoで新規実装・改稿しない。origin commitは来歴なので書き換えない。
- 旧repo削除、旧Worker停止、一般公開範囲の変更をしない。公開環境の受入と原稿の編集正本は区別する。
- 小説ビューアは `reader/` と `scripts/build-reader.mjs`。漫画ビューアはlive-manga。作品を指定したprivate buildは公開操作ではない。

## ブランチ運用

- 通常の変更（原稿・設定・ビューア・公開設定を含む）は、最新の `dev` から作業ブランチを作り、まず `dev` へPRを出す。
- `dev` のCI成功とプレビュー確認・必要な受入確認が済んだ後、`dev` から `main` へPRを出して公開へ昇格する。
- `dev` と `main` へ直接pushしない。作業ブランチからのPR経由にする。
- `main → dev` の同期は、復旧・緊急の履歴合わせに限る。通常の開発経路にはしない。
- `main` へのマージは公開環境への反映候補であり、話の公開可否は `publication.yaml` のゲートで別途決まる。

