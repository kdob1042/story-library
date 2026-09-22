# GitHubへの保存とmanga-macへの受け渡し

## 作品側の成果物

```text
works/<workId>/
  work.json
  manuscript/...
  settings/...
  manga-director.md                    # 任意の作品固有差分
  manga/<episodeId>/name-plan.json     # 共有契約に従う機械用ネーム
  manga/<episodeId>/director-notes.md  # 任意の短い決定メモ
```

`episodeId`はwork.jsonの固定ID。タイトルや表示番号から推測しない。新しい原稿manifest、独自のネームschema、巨大画像・動画・制作DBはここに増やさない。

## 承認・保存

1. 最終案は「対応する原稿候補＋ネーム」の組で確認する。原稿に変更がなければネームだけの差分でよい。
2. ユーザーの保存／Draft PR作成依頼がある場合、最新devから作業ブランチを用意し、原稿変更と対応ネームを同じPRに入れる。対象外原稿、publication.yaml、人物画像は変更しない。保存してよいという指示はdev/mainへのマージや公開の承認ではない。
3. 原稿とネームのscene ID、対象範囲、原文hash、掲載文字、参照画像・設定版を共有validatorで検査する。hashはコードで計算し、文字offsetも既存SourceRef変換を使う。人がJSONを修正しないと通らない状態を完成にしない。
4. 検証環境がない場合は未検証の候補として保存／提示する。存在しないschemaやvalidatorを自作の常時trueに置き換えず、「対応版と取込は未確認」と示す。
5. PR承認・マージ後、アプリで原稿更新を確認して取り込む。アプリは原稿・設定・人物画像・ネームを取得SHAに固定し、ネームは候補確認後に明示採用する。取得や確認だけで作画を開始しない。

## commitと原稿の対応

計画の起点commitは来歴。保存するname-plan自身に「このファイルを含む未来のcommit SHA」を書こうとすると循環するため要求しない。取得したcommitはアプリが記録し、原稿内容の一致は本文hashと共有契約で検査する。原稿候補が承認後に変わった場合は共通経路で参照を再解決して再検証し、旧ネームを採用しない。

## アプリ側の責務

GitHubから `manga/<episodeId>/name-plan.json` を取得し、手動JSON取込と同じvalidator/importerへ渡す。意味構造からの座標計算、作画、文字配置、保存、手修正、Undoはアプリ側。初期のv1 importerが既存コマありの置換やv2を拒否する制限は、そのまま表示する。v2・部分差替え・実Mac受入が未完了なら、機械用の通し制作が完成したと言わない。

CLIは必要な場合の検証専用。別AIを呼ぶhost adapterの用意や独自LLMインフラをユーザーへ要求しない。LLM・画像・動画生成APIの追加課金を伴う試験は、通常の機械検査とは区別する。
