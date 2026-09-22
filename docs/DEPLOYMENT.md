# 小説の確認・配信

ブランチ運用・操作範囲は[AGENTS.md](../AGENTS.md)、公開条件と予約日時は[切替記録](migration/cutover.md)を参照する。

## ローカル確認

| コマンド | 内容 |
| --- | --- |
| `npm run build:reader -- --private` | 登録済み全作品・全話を生成 |
| `npm run build:reader -- --published` | 公開条件を満たす話だけ生成 |

出力は `dist/reader/`。作品は上部セレクタか `?work=<workId>` で切り替える。`--work-id <id>` は初期表示を選ぶ互換オプション。

漫画へのリンクはビルド時に `MANGA_URLS_JSON='{"kamiya-kawai":"https://.../works/kamiya-kawai/"}'` を渡す。単一作品の確認には `MANGA_URL` も使える。未設定の作品にはリンクを出さない。

## Cloudflare

| 設定 | 値 |
| --- | --- |
| Root directory | `/` |
| Production branch | `main` |
| Build command | `npm ci && npm run build:reader` |
| Deploy command | `npx wrangler deploy --config wrangler.jsonc` |
| Non-production deploy command | `npx wrangler versions upload --config wrangler.jsonc --preview-alias dev` |
| Non-production対象 | `dev` のみ |
| Node version | `22` |
| Output directory | 空欄（Wranglerで指定） |

`WORKERS_CI_BRANCH` によりmainは公開用、devは全話確認用を自動選択する。未知・欠落したブランチ情報や矛盾するフラグは停止する。自動選択の実装を対象ブランチへ反映してから上記設定を使う。

| ブランチ | 配信先 | 内容 |
| --- | --- | --- |
| main | story-library.mashstock.workers.dev | 公開条件を満たす話 |
| dev | dev-story-library.mashstock.workers.dev | 全作品・全話・設定。Access保護必須 |

devへの原稿アップロード前に、preview URLを含む全経路をAccessで保護する。`--private`、noindex、no-storeは認証にならない。private成果物を本番へ手動デプロイしない。

Git接続、Worker名、トークン権限、全preview URLの保護は実環境で確認する。既存のAccessや公開範囲を、この設定整理に合わせて変更しない。
