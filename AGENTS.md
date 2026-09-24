# 作業ルール

## 正本と入口

- 原稿・設定・人物画像・履歴・小説ビューアの編集先は本repo。旧Kamiya-Kawai / investor-lifeは履歴参照のみ。origin commitは来歴として保持する。
- 作品は `library.json`、話・場面・宣言パスは `works/<workId>/work.json` から特定する。パスの基準は作品root。旧 `source/manifest.json` は読取互換のみ。
- [制作フロー](docs/WORKFLOW.md)で必要な資料を選ぶ。執筆・改稿は[執筆手順](docs/WRITING.md)、漫画化・コマ割り・脚本フィードバックは[Manga Director Skill](skills/manga-director/SKILL.md)を読む。
- 移行の作業一覧は[Issue #1](https://github.com/kdob1042/story-library/issues/1)。関連repoの既存Issueも再利用する。M0〜M3・MIGRATIONは移行当時の記録で、現行作業の指示ではない。

## 保持する境界

- 本文・固定ID・人物基準画像・制作履歴を保持する。移行や整理を理由に再採番・改稿しない。
- 新作雛形は `templates/work/`、原稿契約はvendor済み `contracts/story-source/`。既存形式は読取adapterを使い、独自契約を増やさない。
- 公開CIは人工fixtureだけを使う。`works/**/market-data.json` は内部資料で、privateを含むreader buildで読まず、成果物へコピーしない。
- 旧repoの削除・archive、旧Worker停止、一般公開範囲の変更は行わない。公開ビルドへSkill・検討メモ・作業用原稿を追加しない。

## 保存と公開

最新devから作業ブランチを作り、devへPRを出す。CI・プレビュー・必要な受入確認後、devからmainへPRで昇格する。dev/mainへ直接pushしない。main→devの同期は復旧・緊急の履歴合わせに限る。

保存、正本へのマージ、公開は別操作として、ユーザーが指定した範囲を実行する。原稿候補と対応ネームは同じPRに置く。mainへマージしても、話の公開可否は `publication.yaml` で判定する。環境設定は[配信手順](docs/DEPLOYMENT.md)を参照する。
