# ページネームの保存と受渡し

作品の固定workIdとepisodeIdを `library.json` / `work.json` から選ぶ。新規のネームは、話の共通情報 `manga/<episodeId>/episode.json` と、1ページずつ `manga/<episodeId>/pages/<pageId>.json` に保存する。前半・後半は選んだページ範囲であり、番号付きの複数ページネームは新規には作らない。旧 `name-001.json` / `name-plan.json` は既存データの読取互換に限る。

1. `node scripts/name-plan.mjs prepare <workId> <episodeId> /tmp/context.json` で作成時の原文・人物宣言・前後文脈を固定する。参照画像はなくてもよい。
2. 対象ページを決め、AIが `{title, provenance, plan}` のdraftを作る。選択した原文の範囲と既存IDをAIへ示す。原文そのものやIDを推測で創作しない。
3. `node scripts/name-plan.mjs write-pages <workId> <episodeId> /tmp/context.json /tmp/draft.json` で、作成時の原文を含むページとepisode索引を出力する。同じpageIdを明示改訂する場合だけ `--replace` を付ける。追加するページの位置は `--insert-at=N` で指定でき、省略時は末尾。話の既存ページと共通設定は保持する。
4. `node scripts/validate-name-plan.mjs <workId> <episodeId> <作品root>/manga/<episodeId>/episode.json` で話索引と全ページを確認する。CIは変更したページか、索引更新時の当該話だけを確認する。最新の原稿・設定・参照画像とのhash一致は調べない。
5. 開発devからのPRへ保存する。アプリではepisode索引を先に取得し、同じGit commitから選択ページだけを読み、現在のページと見比べて採用する。既存の他ページはそのまま保持する。話の版保存と復元はアプリ側で管理する。

原文は各ページのsourceExcerptsへ実文字列として含める。contextExcerptsとboundaryContextは参考情報であり、自動的に台詞へ変換しない。scene/appearanceは固定IDを持つ話の共通設定。AIや手動によるページ編集は、現在のネームに有限の操作を適用する。任意の画像・動画・3D、APIキーやJobは受渡しJSONへ入れない。保存、マージ、公開は別の操作とする。

創作とレビューは同じチャット内で完結させ、アプリへ往復させない。CLIは原文の読取・出力・検証専用。原稿改稿を伴う場合は原稿候補を同じPRへ置く。検証できない場合は「未検証」と報告する。読込commitは来歴に残せるが、まだ存在しない出力後のcommitを埋める循環を作らない。

継続用の決定メモを保存する場合は、同じ保存承認の範囲で `works/<workId>/manga/<episodeId>/review-notes.md` を同じPRへ置く。対象IDごとの採否・承認状態・固定・未解決を保ち、次の周回の結果で更新する。これは内部制作メモであり、name-planの機械契約、アプリ採用、公開成果物へ自動的に含めない。保存指定がなければ会話内で短い引継ぎを返すだけにする。
