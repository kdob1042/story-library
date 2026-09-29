# エピソード別コメント

読者がP1-1、P1-2、P1-3にそれぞれ1件ずつ投稿できる。保存キーは作品IDと画面に表示している原稿の固定ID。章・セクション単位にまとめず、表示番号を変更しても別の投稿枠にしない。

ログインは追加せず、サーバーが発行した1年間有効のHttpOnly / Secure Cookieでブラウザを識別する。D1にはCookie値そのものではなくSHA-256を保存する。同じブラウザでの重複はDBのUNIQUE制約で拒否するため、連打・同時投稿・画面の再読み込みでも2件入らない。他の読者は同じエピソードに投稿できる。Cookie削除、別ブラウザ、別端末、1年の有効期限後は別の読者として扱われる。本人認証やスパム防止を保証する方式ではない。

名前は任意（空欄は「読者」、40文字以内）、本文は必須（1,000文字以内）。表示はプレーンテキストで、HTMLやMarkdownを解釈しない。投稿は読者全員に表示される。返信・追加投稿・編集UIは設けない。下書きはページを開いている間だけエピソード別に保持する。

## 本番設定

**コードのPRと本番設定は別。D1を設定・初期化するまでAPIは503を返し、フォームを開かない。**

1. CloudflareでD1 `story-library-comments` を作成する（既存DBや通知用KVを流用しない）。
2. 発行された実際のdatabase IDで、`wrangler.jsonc`に以下を追加する。架空のIDを設定しない。

```json
"d1_databases": [{
  "binding": "COMMENTS_DB",
  "database_name": "story-library-comments",
  "database_id": "作成したD1の実際のID",
  "migrations_dir": "migrations/comments"
}]
```

3. 初回のスキーマ作成を行う。

```sh
npx wrangler d1 migrations apply story-library-comments --remote --config wrangler.jsonc
```

4. WorkerのVariable `COMMENTS_PUBLIC_ORIGIN` に `https://story-library.mashstock.workers.dev` を設定する。別の正規ドメインを使う場合はそちらを指定する。末尾パス・認証情報は付けない。
5. 通常のdev PR、CI、プレビュー受入、main PRの順で反映する。

初回はD1作成と設定値の追記が必要。Secretは追加しない。既存メール設定・Access・本文の公開設定は変更しない。

## 公開範囲とプレビュー

- `data/comment-works.json` はpublished buildに実際に収録した原稿IDだけを許可する。本文と同じ公開ゲートを使う。
- private buildはコメントUIを出さず、許可リストも空。正規本番originとpublished buildの両方が揃わない要求は拒否する。devやバージョンURLから本番コメントを読み書きできない。
- 公開を取り消した原稿への読み書きも拒否する。保存済みコメントは消さず、再公開時は同じ枠に戻る。
- GETはCookie別にno-store、POSTは同一originのJSONだけを受け付ける。Cookieを保存できないブラウザでは投稿を拒否する。
- APIは50件ずつ新しい順に取得し、投稿済み判定は全件から行う。

通常devはprivate buildのため投稿の受入には使わない。自動テストは人工fixtureとローカルworkerd/D1で、公開用ビルド→API→保存までを確認する。ブラウザ受入も人工fixtureの公開ビルドを使用する。本番有効化後は公開作品の表示・APIの読取りとdevからの拒否を確認する。テストコメントを本番に投稿しない。

ローカル開発・テストはCloudflare Build/CIと同じNode.js 22以上を使う（Miniflareの要件）。`npm ci && npm test`でコメントの統合テストも実行する。

## 管理

荒らし等の本文を取り下げる際はCloudflare D1コンソールで対象の`id`を確認してから、`body`を「管理者により非表示になりました。」へ更新する。行を削除すると同じ読者が再投稿できるため、投稿済みの枠を保持したい場合は削除しない。氏名も非表示にする必要がある場合は`name`を「非表示」へ更新する。
