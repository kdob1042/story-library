# 小説の更新通知

## 対象

更新通知は `story-library` の独立小説ビューアだけが対象です。`live-manga` は変更しません。

- `main⟧ の公開ビルドだけに登録フォームを出す
- `dev⟧、非公開話、PRビルドからの登録・配信要求は受け付けない
- 本文全文は送らず、公開済みの話へのリンクだけを送る
- 1つのメールアドレスを作品単位の Resend Segment に登録する
- Resend Broadcast の `RESEND_UNSUBSCRIBE_URL` を使って配信停止する
- 確認トークンは Worker 内で暗号化し、購読前にContactへ登録しない
- 配信済みイベントIDは `NOTIFICATION_STATE` KV に保存し、再実行時の重複を抑止する

## Resend 側の準備

作品ごとに、次のリソースをResendで作成します。

1. 送信元ドメインを検証する。
2. 作品単位の Segment を作る。
3. 必要なら作品単位の Topic も作る。
4. APIキーを作る。

現在の公開設定では `investor-life` の小説だけが公開対象です。`kamiya-kawai` は全話非公開なので、公開へ切り替えるまで配信設定へ追加しません。

## Worker の設定

本番 Worker に次を設定します。

Secret:

- `RESEND_API_KEY`
- `EMAIL_SIGNING_SECRET`（32文字以上のランダム値）
- `EMAIL_DISPATCH_TOKEN`（GitHub Actionsからの配信要求用ランダム値）

Variable:

- `EMAIL_PUBLIC_ORIGIN`（例: `https://story-library.mashstock.workers.dev`）
- `EMAIL_FROM`（Resendで検証済みの送信元）
- `RESEND_WORKS_JSON`

`RESEND_WORKS_JSON` の例:

`json
{
  "investor-life": {
    "segmentId": "Resendで作成したSegment ID",
    "topicId": "Resendで作成したTopic ID"
  }
}
`

`topicId` は任意ですが、作品ごとの購読設定をResend側でも管理するため、作成した場合は設定してください。Segment IDは必須です。

Cloudflare KVを作成し、Worker binding名 `NOTIFICATION_STATE` で本番Workerへ割り当てます。これは購読フォームの簡易レート制限、配信イベントの処理中状態、送信済みイベントIDだけを保存します。APIキーやメールアドレスは保存しません。

設定値が欠けている間は、フォームと配信APIは安全側で `503⟧ を返します。

## GitHub Actions の設定

リポジトリに次を設定します。

- Repository variable: `STORY_LIBRARY_EMAIL_ENDPOINT`
  - `https://story-library.mashstock.workers.dev/api/email/notify`
- Repository secret: `STORY_LIBRARY_EMAIL_DISPATCH_TOKEN`
  - Workerの `EMAIL_DISPATCH_TOKEN` と同じ値

`main⟧ で `works/**/publication.yaml⟧ が変更されると、`.github/workflows/email-notify.yml⟧ が前回コミットとの差分を確認し、次の話について配信要求を送ります。

- 初めて公開条件を満たした話
- `approvedRevision⟧ が変わった話
- 予約公開日時を過ぎて公開条件を満たした話

本文を改稿して更新通知を出す場合は、公開設定の `approvedRevision⟧ も更新してください。配信要求は `eventId⟧ を持ち、同じイベントを再実行してもKV上で重複を抑止します。

## 動作確認

1. `main⟧ の公開ビルドでフォームが表示されることを確認する。
2. メールアドレスと作品を選び、確認メールを受け取る。
3. メール内のリンクを押し、Resend Contactが対象Segmentへ入ることを確認する。
4. テスト用の話を公開条件へ変更して `main⟧ へ反映する。
5. Broadcastが1通だけ送られ、リンクが `?work=...&episode=...⟧ で開くことを確認する。
6. Resendの配信停止リンクが機能することを確認する。
7. `dev⟧ でフォームが表示されず、APIを直接呼んでも登録・配信できないことを確認する。

本番設定を入れるまでは、CIの通知ジョブはイベントがあっても送信をスキップします。
