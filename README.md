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

`npm run build:reader -- --work-id kamiya-kawai --private` で神谷ベースの読書UIを生成します。`investor-life`も同じ入口です。出力は `dist/reader/<workId>/`。これは全話を含む認証付き確認用であり、一般公開用ではありません。既存Accessで保護された配信先を維持し、ビルドだけでデプロイしません。

公開済み漫画へのリンクは `MANGA_URL=https://.../works/<workId>/` をビルド時に渡します。未設定時は非表示。詳細・未完了事項は [切替記録](docs/migration/cutover.md)。
