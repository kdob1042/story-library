# story-library

小説原稿と漫画の構成案を管理する非公開リポジトリです。新作も既存作品も、ここから制作を始めます。

## 制作を始める

1. `library.json` で作品を選び、`works/<workId>/work.json` から対象の話・場面を確認する。
2. チャットAIへ「作品名・対象・やりたい変更」を伝える。[執筆手順](docs/WRITING.md)に沿って必要な本文・設定だけを読む。
3. 漫画化は[Manga Director](skills/manga-director/SKILL.md)で構成し、対応する原稿とネームを同じ作業PRへ保存する。
4. manga-macで更新を取り込み、候補を採用して作画・文字配置・書き出しへ進む。

成果物の保存先と読む順は[制作フロー](docs/WORKFLOW.md)、共通ルールは[AGENTS.md](AGENTS.md)を参照してください。

| 場所 | 担当 |
| --- | --- |
| 本repoの `works/` | 原稿・設定・人物画像・漫画構成 |
| 本repoの `reader/` | 小説ビューア |
| [manga-mac](https://github.com/kdob1042/manga-mac) | 漫画制作・保存・書き出し |
| [live-manga](https://github.com/kdob1042/live-manga) | 完成漫画の配信 |

既存2作品の編集正本も本repoです。旧repoは履歴参照に使い、再同期で改稿を上書きしません。

## 新作と検証

`templates/work/` が新作雛形です。作品ごとにrepoやWorkerを増やす必要はありません。

```bash
npm run new-work -- --work-id example-work --title "作品タイトル" --dry-run
# 内容を確認後、--dry-runを外して作成
npm test
npm run validate
npm run validate:name-plan -- <workId> <episodeId>
```

最後のコマンドは保存したネームがある場合に使います。AIやmanga-macの起動は不要です。新作の公開設定は非公開です。

## 確認・配信

- ローカル読書確認: `npm run build:reader -- --private`
- 公開条件を満たす話だけ生成: `npm run build:reader -- --published`
- [ブランチと配信環境](docs/DEPLOYMENT.md)
- [更新メールの設定](docs/email-notifications.md)

private成果物には全話が入ります。一般公開せず、配信する場合はAccessで保護します。

## 契約と履歴

原稿形式は `contracts/story-source/`、漫画構成は `contracts/name-plan/`、旧repoとの対応は `migrations/source-map.json` で管理します。固定ID・来歴は保持します。

移行記録は[docs/MIGRATION.md](docs/MIGRATION.md)、現在の残作業は[Issue #1](https://github.com/kdob1042/story-library/issues/1)を参照してください。
