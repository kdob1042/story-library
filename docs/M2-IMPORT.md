# M2 原稿取込み

M1契約の上に、origin checkout から作品rootへ **追加コピー** する。origin repo は正本のまま残す。

```bash
node scripts/import-work.mjs --work-id kamiya-kawai --from /path/to/Kamiya-Kawai
```

- 本文・画像バイト列を改変しない
- 固定IDは identity 対応だけを source-map に書く
- `source/` 配下の原稿は作品rootへ flatten し、manifest パスを作品rootから解決できるようにする
- 現行の `INDEX.md` とAI補助資料は保持し、`archive/`・`revisions/`・`CHANGELOG.md` は `history/` 配下へ区別して保管する
- manifest／本文／設定／人物画像以外のビューアー、Worker、公開dist、依存物、秘密情報はコピーしない
- 取込後も `authority: origin`
- publication は private のまま新規作成する（originの公開設定を一般公開へ広げない）
- `.git` / ビューワー / Worker 設定はコピーしない
- origin の削除・archive・push は行わない
- 複製先がある場合は `--replace` が無いと失敗する

実作品の複製は、M1で固定したorigin commitと一致するcheckoutに対してだけ実行する。M2の実ファイル反映は作品ごとに分け、dry-runと検証結果を確認してから行う。
