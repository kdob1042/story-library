# M3 新作雛形

雛形の正本は `templates/work/` だけです。novel-template で並行編集しないでください。

```text
templates/work/
  source/manifest.json    # story-source/v1
  manuscript/
  settings/
  assets/
  publication.yaml        # 初期 private
```

## 追加手順

```bash
node scripts/new-work.mjs --work-id example-work --title "作品タイトル"
npm test
npm run validate
```

1. 作品フォルダを作成する
2. catalog と source-map に登録する
3. 原稿を編集し、固定IDを維持する
4. 検証する
5. 制作アプリ／dev転送は既存Issue（manga-mac#157、live-manga#44/#46）
6. 本番登録と公開は別操作。初期状態は非公開

新作ごとに repo / Worker / ドメイン / CI を複製しない。
公開されている novel-template に実作品の本文・設定・個人情報を入れない。
