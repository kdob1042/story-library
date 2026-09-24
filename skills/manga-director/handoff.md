# 検証・保存・受渡し

## 保存先と契約

作品rootの `work.json` にある固定episodeIdを使い、タイトルや表示番号から推測しない。

- `manga/<episodeId>/name-plan.json`: 機械用ネーム。
- `manga/<episodeId>/director-notes.md`: 任意の短い決定メモ。
- `manga-director.md`: 任意の作品固有ルール。

新しい原稿manifest、独自ネームschema、巨大画像・動画・制作DBは追加しない。

機械契約はvendor済み[name-plan/v2](../../contracts/name-plan/schema.mjs)。由来commitと全ファイルのGit blob SHAは[lock.json](../../contracts/name-plan/lock.json)で管理する。構造は `parseNameFile` / `validatePlan`、原稿対応は `source.mjs`、座標検査は `layout.mjs` を使う。

contract更新は作品の改稿と分け、固定commit・hashを更新してテストする。アプリ側と対応版が一致しない場合、構成検討は続けられるが機械取込可能とは扱わない。

## 保存手順

1. 最終候補を対応原稿＋ネームの組で示す。原稿変更がなければネームだけでよい。
2. 保存／Draft PR作成の指示範囲で、[AGENTS.md](../../AGENTS.md)に従って原稿差分とネームを同じPRに置く。対象外原稿・publication.yaml・人物画像は変更しない。保存の指示をマージ・公開の承認に広げない。
3. `node scripts/validate-name-plan.mjs <workId> <episodeId>` を実行する。work.json・本文・設定・人物画像からsource hash、atom、作品側人物IDを再構成し、scene ID・範囲・原文hash・掲載文字・参照版を検査する。hashはコード、文字offsetは既存SourceRef変換で求める。
4. 検証環境がなければ「未検証、対応版と取込は未確認」と示す。JSONらしい出力や常時trueのvalidatorを合格扱いせず、人がJSONを直さないと通らない状態を完成にしない。
5. PR承認・マージ後、manga-macで原稿更新を取り込む。原稿・設定・人物画像・ネームは取得SHAをそろえ、候補確認後に明示採用する。

創作ループをmanga-macアプリへ往復させない。CLIは検証専用で、AIやアプリの起動は不要。追加課金を伴うLLM・画像・動画APIの試験は、通常の機械検査と分ける。

## commitと原稿対応

起点commitは来歴。name-plan自身に、それを含む未来のcommit SHAを書かせると循環する。取得commitはアプリが記録し、内容一致は本文hashと共有契約で検査する。原稿候補が変わったら共通経路で参照を再解決・再検証し、旧ネームを採用しない。

## アプリへの引継ぎ

GitHub取得と手動JSON取込は同じvalidator/importerを使う。座標計算、作画、文字配置、保存、手修正、Undoはアプリ側。取得・確認だけで作画を始めない。

v1 importerの既存コマ置換・v2拒否など、現在の制限を隠さない。v2、部分差替え、実Mac受入が未完了なら、機械による通し制作の完了とは報告しない。
