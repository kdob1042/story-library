# story-library

複数作品の小説・漫画原稿を置く非公開ライブラリです。
読者配信は [live-manga](https://github.com/kdob1042/live-manga)、制作は [manga-mac](https://github.com/kdob1042/manga-mac) です。

移行作業一覧の正本は [Issue #1](https://github.com/kdob1042/story-library/issues/1) です。

## 現在の状態（M0–M1）

- catalog と作品root、読取adapter、source-map の契約を確定した
- 既存2作品（`kamiya-kawai`、`investor-life`）は旧原稿repoを正本のまま残している
- 実本文はまだ複製していない。この環境から private 原稿repoへは到達できない
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

## 検査

```bash
npm test
npm run validate
```

実原稿や個人情報を公開CIへ入れないでください。

## やってはいけないこと

M7の検証と最終増分反映が終わるまで、旧原稿repoを正本として残します。
旧repoの削除・archive、旧Worker停止、一般公開範囲の変更は行いません。
