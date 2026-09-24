# 小説から漫画まで

## 工程と成果物

| 工程 | 操作・担当 | 保存先／次の入口 |
| --- | --- | --- |
| 新作 | 本repoのnew-workで雛形を作成 | `library.json` と `works/<workId>/work.json` |
| 執筆・改稿 | チャットAIと対象の話・変更目的を決める | `manuscript/`。必要な設定変更は同じPRで対応 |
| 漫画構成 | 同じチャットAIが原稿理解→構成→レビュー | `manga/<episodeId>/name-001.json`。任意の短い決定メモ |
| 候補確認 | 原稿差分と対応ネームを確認・検証 | 同じ作業PR。マージと公開は別操作 |
| 漫画制作 | manga-macで更新を取り込み、候補を採用 | コマ、作画、文字、動画、手修正、Undo、制作DBはアプリ側 |
| 配信 | 完成漫画を書き出し、公開先で確認 | 漫画はlive-manga、小説は本repoのreader |

ネーム生成、機械検証、アプリ採用、作画完了を区別します。アプリへの取込可否は現在の契約・実装と実際の検証結果で判断します。取得だけで作画を開始しません。

## 最初に読むもの

1. [AGENTS.md](../AGENTS.md): 共通の作業境界と保存経路。
2. 対象の `work.json`: 固定ID、読書順、本文・設定・画像の宣言。
3. 作業に必要な資料だけを下表から読む。履歴・全作品・全フェーズを毎回読む必要はない。

| 作業 | 読むもの |
| --- | --- |
| 執筆・改稿・部分レビュー | [執筆手順](WRITING.md)、対象本文、必要な前後場面・設定 |
| 漫画構成・脚本フィードバック | [Manga Director](../skills/manga-director/SKILL.md)、存在する場合だけ作品の `manga-director.md` |
| 配信・環境修正 | [配信手順](DEPLOYMENT.md)、必要なら[更新メール](email-notifications.md) |
| 移行の経緯確認 | [移行記録](MIGRATION.md)。過去の正本・進捗を現行指示にしない |

## 設定文書の分担

| 文書 | 記載する内容 |
| --- | --- |
| `settings/story.md` | 出来事、時系列、転換点、巻・話の到達点 |
| `settings/characters.md` | 人物の初期状態、性格、能力、来歴、平常時の関係 |
| `settings/world.md`（任意） | 舞台、制度、学校・部活動 |
| `settings/writing.md` | 語り、会話、描写、表現上の基準 |
| `settings/character-design.md`（任意） | 外見・基準画・作画時の判断 |
| `manga-director.md`（任意） | 作品固有の漫画演出。共通Skillやschemaを複製しない |

同じ事実は担当文書へ置き、他の文書から参照します。場面順・固定ID・パスは `work.json`、本文は `manuscript/`、公開条件は `publication.yaml` が担当します。要約やメモを本文の代わりに使いません。

漫画アプリには原文入りの番号付きネームと固定人物ID別の参照画像を渡す。原稿の別途取込みは不要。前半・後半など複数番号で作成でき、最新原稿や画像とのhash一致を要求しない。書出しと変更ネームだけの検証はManga Directorの[handoff](../skills/manga-director/handoff.md)に従う。
