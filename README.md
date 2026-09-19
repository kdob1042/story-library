# story-library

複数作品の小説・漫画原稿を置く非公開ライブラリです。
小説ビューアは本repoの `reader/`、漫画配信は [live-manga](https://github.com/kdob1042/live-manga)、制作は [manga-mac](https://github.com/kdob1042/manga-mac) です。

移行作業一覧の正本は [Issue #1](https://github.com/kdob1042/story-library/issues/1) です。

## 現在の状態

- catalog と作品root、読取adapter、source-map の契約を確定した
- 既存2作品（`kamiya-kawai`、`investor-life`）の編集正本は本repo。旧repoは履歴参照のみ
- M2で両作品の実原稿を固定commitから取り込み、本文・設定・固定ID・履歴・人物基準画像を保持した
- M3で新作雛形と作品作成CLIを追加した
- 公開範囲は変えない。初期の `publication` は非公開

詳細は [docs/M0-INVENTORY.md](docs/M0-INVENTORY.md) と [docs/M1-CONTRACT.md](docs/M1-CONTRACT.md)。

## 入口

| パス | 役割 |
| --- | --- |
| `library.json` | 作品一覧 |
| `migrations/source-map.json` | 旧repo/IDと新workId/rootの対応 |
| `works/{workId}/` | 作品root（取込後） |
| `contracts/` | catalog / story-source/v1 / 読取adapter |
| `fixtures/works/` | 公開CI用の人工原稿 |
| `templates/work/` | 新作雛形の正本 |

## 検査

```bash
npm test
npm run validate
node scripts/import-work.mjs --work-id <id> --from <origin-checkout> --dry-run
node scripts/new-work.mjs --work-id example-work --title "作品タイトル" --dry-run
```

実原稿や個人情報を公開CIへ入れないでください。

## やってはいけないこと

旧repoから原稿を再同期して、ここでの改稿を上書きしないでください。公開環境のM7受入は別途継続します。
旧repoの削除・archive、旧Worker停止、一般公開範囲の変更は行いません。


## 独立小説ビューア

`npm run build:reader -- --private` で登録済み全作品を含む読書UIを生成します。出力は `dist/reader/` で、ビューア上部の作品セレクタまたは `?work=<workId>` で作品を切り替えます。`--work-id <id>` は初期表示作品を指定するための互換オプションです。これは全話を含む認証付き確認用であり、一般公開用ではありません。

公開済み漫画へのリンクは、作品単位のJSONを `MANGA_URLS_JSON='{"kamiya-kawai":"https://.../works/kamiya-kawai/"}'` としてビルド時に渡します。単一作品だけ確認する場合は `MANGA_URL` も使えます。未設定の作品ではリンクを表示しません。詳細・未完了事項は [切替記録](docs/migration/cutover.md)。

## Cloudflare Worker

| 設定 | 値 |
| --- | --- |
| Root directory | `/` |
| Production branch | `main` |
| Build command（共通） | `npm ci && npm run build:reader` |
| Deploy command | `npx wrangler deploy --config wrangler.jsonc` |
| Non-production deploy command | `npx wrangler versions upload --config wrangler.dev.jsonc` |
| Non-production対象 | `dev` のみ |
| Node version | `22` |
| Output directory | 空欄（Wranglerで指定） |

Cloudflareの `WORKERS_CI_BRANCH` でmainは公開用、devは全話確認用を自動選択します。未知のブランチ・欠落したブランチ情報・矛盾するフラグは停止します。この変更を対象ブランチへ反映してから上記コマンドへ切り替えてください。

| ブランチ | 配信先 | 内容 | 閲覧 |
| --- | --- | --- | --- |
| main | story-library-reader | 公開条件を満たす話だけ | 一般公開用 |
| dev | story-library-reader-dev のpreview URL | 全作品・全話・設定 | Access保護必須 |

devへの原稿アップロード前に、preview URLを含む全経路をAccessで保護してください。`--private`、noindex、no-storeは認証ではありません。既存のAccessや公開範囲をこのPRで変更しません。Git接続・Worker名・トークン権限・preview URL保護は実環境での確認が必要です。

ローカルでは `npm run build:reader -- --private` または `npm run build:reader -- --published` を指定します。private生成物を本番へ手動デプロイしないでください。公開条件と予約日時の制約は [切替記録](docs/migration/cutover.md) を参照。
