# エピソード別コメント

読者がP1-1、P1-2、P1-3にそれぞれ1件ずつ投稿できる。保存キーは作品IDと画面に表示している原稿の固定ID。章・セクション単位にまとめず、表示番号を変更しても別の投稿枠にしない。

ログインは追加せず、サーバーが発行した1年間有効のHttpOnly / Secure Cookieでブラウザを識別する。D1にはCookie値そのものではなくSHA-256を保存する。同じブラウザでの重複はDBのUNIQUE制約で拒否するため、連打・同時投稿・画面の再読み込みでも2件入らない。他の読者は同じエピソードに投稿できる。Cookie削除、別ブラウザ、別端末、1年の有効期限後は別の読者として扱われる。本人認証やスパム防止を保証する方式ではない。

名前は任意（空欄は「読者」、40文字以内）、本文は必須（1,000文字以内）。表示はプレーンテキストで、HTMLやMarkdownを解釈しない。投稿は読者全員に表示される。返信・追加投稿・編集UIは設けない。下書きはページを開いている間だけエピソード別に保持する。

## 本番設定

Cloudflareの既存Gitビルドで `npm run build:reader` の後に `postbuild:reader` が実行される。main/devのWorkers Buildsだけが以下を行う。

1. コメント専用D1 `story-library-comments` を名前で確認し、初回だけ作成する。
2. APIが返した実際のdatabase IDをビルド中の `wrangler.jsonc` に設定する。リポジトリに架空のIDや認証情報を保存しない。
3. `wrangler d1 migrations apply` で未適用のmigrationを適用する。
4. コメントを取得・投稿せずにテーブルの列を確認する。失敗した場合はビルドを停止し、デプロイに進まない。

Cloudflare Worker `story-library` のSettings → Buildsで選択しているAPI tokenに **Account / D1 / Edit** が必要。標準のBuild tokenにはD1権限が含まれない場合があるため、権限エラー時は既存tokenへこの権限を追加して再実行する。token自体はチャットやGitへ貼り付けない。

`COMMENTS_PUBLIC_ORIGIN` は `wrangler.jsonc` のvarsに設定済み。`keep_vars: true` により既存のdashboard変数を保持する。別の正規ドメインへ変更する場合もHTTPS originを指定し、末尾パス・認証情報は付けない。

devのビルドでも初期設定を確認するが、private buildとoriginの両方の制限でコメントAPIには接続できない。公開はdevでのビルド成功を確認した後、通常のdev→main PRで行う。Accessと本文の公開設定は変更しない。

ローカルの `npm run build:reader -- --published` やGitHubの人工fixtureテストではDB準備をスキップし、Cloudflareへ接続しない。通常の手動デプロイ時は実際のdatabase IDを設定してmigrationを適用する。DB未接続時のAPIは503を返し、フォームを開かない。

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
