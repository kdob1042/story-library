# 原稿正本・小説ビューアの切替

2026-09-19のユーザー指示「旧Kamiya-Kawaiは古い。全てstory-libraryへ移行」を適用する。原稿・設定・画像・履歴の編集先と小説ビューアの保守先はstory-library。旧repoへ新しい相互リンク実装を追加しない。

## 確認と変更

- 神谷の旧mainは取込元 `5621918052faf05fc0bac245ad70d6c4f7ca1561` から変化なし。取込台帳の全パスが存在し、本文・設定・画像・履歴に追加差分なし。
- investor-lifeはstory-library側で既に原稿差替え済み。旧repoから再コピーせず、新しい本文を保持。
- `library.json` の神谷の形式を、実manifestに合わせてstory-source/v1へ修正。旧schema-4を期待して検証が落ちていた不整合を解消。
- authorityはlibrary。origin commitと取込ファイル記録は来歴として保持。verifiedは取込構造・参照の検証であり、本番配信の受入完了を意味しない。
- 神谷の既存小説UIをreader/index.htmlへ移設。新build-readerは本repo内のcatalogと共通read adapterから全作品をprivate snapshotへ束ねる。設定・変更履歴のパスも作品root基準。
- UIの目次、場面移動、書体・文字サイズ・テーマ操作を保持。任意のMANGA_URLで作品トップへの外部リンクを追加。未設定は非表示。旧/api fallbackは削除。
- 作品セレクタを追加し、`?work=<workId>` とセレクタ操作で作品を切り替えられるようにした。作品ごとの本文・設定・画像は `dist/reader/works/<workId>/` に分離する。
- 漫画の配信はlive-manga。小説本文の処理をlive-mangaへ戻さない。

## 確認用ビルド

```
npm run build:reader -- --private
```

出力は `dist/reader/`。全作品の話・設定を含むprivate snapshotであり、一般公開用のpublication gateではない。公開管理ファイルpublication.yamlを変更せず、既存Accessを維持した確認環境だけで使用する。

## Cloudflare Worker設定

新規Workerは `story-library-reader` とし、Workers BuildsのRoot directoryを `/`、Production branchを `main` に設定する。mainのBuild commandは `npm ci && npm run build:reader -- --published`、Deploy commandは `npx wrangler deploy --config wrangler.jsonc`、Nodeは22、Output directoryは空欄とする。dev/PRは `npm ci && npm run build:reader -- --private` と `npx wrangler versions upload --config wrangler.dev.jsonc` を使い、preview URLで確認する。成果物のディレクトリは各Wrangler設定の `assets.directory: ./dist/reader` で指定する。

`MANGA_URLS_JSON` は作品IDをキーにしたHTTPS URLのJSONで、未設定作品のリンクは非表示。デプロイ後にCloudflare Accessの既存ポリシーを適用してから閲覧確認する。Worker名はWrangler設定の `name` と一致させる。

## dev / main と話単位の公開

- `dev` は `wrangler.dev.jsonc` を使うAccess保護下の確認環境。`--private` でstory-libraryの全作品・全話を含むsnapshotを作る。
- `main` は `wrangler.jsonc` を使う公開環境。`--published` では各作品の `publication.yaml` を読み、`novel` の `visibility: public`、話ごとの `state: published`、`approved: true`、`transferred: true` を満たし、`releaseAt` があれば到達した話だけを生成する。未条件の本文・設定・人物画像・履歴は成果物へ入れない。
- 例：
```json
{
  "workId": "investor-life",
  "formats": {
    "novel": {
      "visibility": "public",
      "episodes": [
        {
          "episodeId": "C01-E01",
          "state": "published",
          "approved": true,
          "transferred": true
        }
      ]
    }
  }
}
```
- これにより、原稿を `main` へ反映しても `publication.yaml` に登録・承認・転送済みにしない限り公開されず、話単位で順次公開できる。
- CloudflareのGit接続、Access、Worker URL、公開開始の承認は人間設定として残す。実URLや認証情報はリポジトリへ書かない。

## 未完了の実環境作業

- story-libraryを参照する小説WorkerのGit接続、既存URL/Access保護下での閲覧確認。
- 小説・漫画双方の公開済み作品トップURLの確認と設定。リンクは作品単位であり話数を対応付けない。
- 原稿庫→公開用小説データの話単位ゲート/予約公開はIssue #1のM6/M7で管理。private snapshotをその代用としない。
- manga-macの接続・実Mac制作データ保持と本番配信の受入は既存担当Issueで継続。

旧repo・旧Workerを削除/停止していない。Access/一般公開範囲は変更していない。旧Issue Kamiya-Kawai#95の実装先は本repoへ移管する。

## 復旧

ビューア変更に問題があれば当該PRをrevertし、既存の保護済み配信を継続する。原稿を旧repoから上書きしない。以降の原稿改稿はstory-libraryへ保存し、切替前snapshotはoriginの固定commitから参照する。
