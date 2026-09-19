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

リポジトリ直下の `wrangler.jsonc` が `dist/reader/` を Workers Static Assets として配信します。Cloudflare Workers の Git 連携は次の値で設定します。

```text
Root directory: /
Production branch: main
Build command:  npm ci && npm run build:reader -- --published
Deploy command: npx wrangler deploy --config wrangler.jsonc
Non-production deploy: npx wrangler versions upload --config wrangler.dev.jsonc
Node version:   22
Output directory: (空欄)
Worker name: story-library-reader
```

`MANGA_URLS_JSON` は必要な場合だけビルド環境変数に設定してください。Worker のデプロイ後に Cloudflare Access の既存ポリシーをこのWorkerへ適用し、原稿を一般公開しないでください。ローカル確認は `npx wrangler dev`、デプロイ前の成果物確認は `npm run build:reader -- --private` です。

Workers Builds の production branch は `main` にします。`dev` やPull Requestは non-production branch build として `npx wrangler versions upload` を使い、preview URLで確認します。本番Workerを更新するのは `main` のみです。

## dev / main の公開経路

- `dev`：`wrangler.dev.jsonc` を使い、`npm ci && npm run build:reader -- --private` で全作品を含むAccess保護下の確認用Previewを作る。
- `main`：`wrangler.jsonc` を使い、`npm ci && npm run build:reader -- --published` で `publication.yaml` の承認済み・転送済み・公開日時到達済みの話だけを生成する。
- Cloudflareのnon-production branch commandは `npx wrangler versions upload --config wrangler.dev.jsonc`、production commandは `npx wrangler deploy --config wrangler.jsonc` とする。
- どちらもWorker URLには既存のCloudflare Accessを適用し、原稿Git自体を直接公開しない。
