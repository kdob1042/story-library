# story-library working rules

- 作業一覧の正本は GitHub Issue #1。関連する manga-mac / live-manga / novel-template のIssueを再利用する。
- 本文、固定ID、人物基準画像、制作履歴を保持する。移行を口実に再採番・改稿しない。
- 原稿パスは作品rootから解決する。`work.json` が正本入口で、旧 `source/manifest.json` は読み取り互換だけにする。`source/` から `manuscript/` を誤解決しない。
- 新作の形式正本は vendored `contracts/story-source`（manga-mac lock）。既存作品は読取adapterで読む。
- 公開CIには人工fixtureだけを使う。新作雛形の正本は `templates/work/`。
- 原稿・設定・画像・履歴と小説ビューアの編集先は本repo。旧Kamiya-Kawai/investor-lifeは取込履歴として参照し、旧repoで新規実装・改稿しない。origin commitは来歴なので書き換えない。
- 旧repo削除、旧Worker停止、一般公開範囲の変更をしない。公開環境の受入と原稿の編集正本は区別する。
- 小説ビューアは `reader/` と `scripts/build-reader.mjs`。漫画ビューアはlive-manga。作品を指定したprivate buildは公開操作ではない。
- `works/**/market-data.json` は内部ファクトチェック用資料であり、private preview を含む小説ビューワーのビルド成果物へ含めない。reader build はこのファイルを読まず、配信データへコピーしない。

## ブランチ運用

- 通常の変更（原稿・設定・ビューア・公開設定を含む）は、最新の `dev` から作業ブランチを作り、まず `dev` へPRを出す。
- `dev` のCI成功とプレビュー確認・必要な受入確認が済んだ後、`dev` から `main` へPRを出して公開へ昇格する。
- `dev` と `main` へ直接pushしない。作業ブランチからのPR経由にする。
- `main → dev` の同期は、復旧・緊急の履歴合わせに限る。通常の開発経路にはしない。
- `main` へのマージは公開環境への反映候補であり、話の公開可否は `publication.yaml` のゲートで別途決まる。

## 漫画構成・脚本フィードバック

漫画化、コマ割り、ネーム、漫画からの脚本改善は [Manga Director Skill](skills/manga-director/SKILL.md) を読む。同じチャットAIが原稿理解・漫画構成・レビュー・改稿候補を担当し、別のCLI型AIや推論サーバーを起動することを主経路にしない。対象workの任意の `manga-director.md` は作品固有の差分だけとする。

原稿候補と対応ネームは同じ作業ブランチ／PRで管理する。GitHubへの保存、正本へのマージ、公開は別の操作であり、ユーザーから指定された範囲だけを実行する。既存の公開ビルドへSkill・検討メモ・作業用原稿を追加しない。
