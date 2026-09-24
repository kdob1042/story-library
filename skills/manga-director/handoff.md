# 検証・保存・受渡し

## 保存先と契約

作品rootの `work.json` にある固定episodeIdを使い、タイトルから推測しない。

- `manga/<episodeId>/name-001.json`, `name-002.json` …: 原文入りの機械用ネーム。前半・後半など任意範囲を番号別に作る。番号は1〜999999。
- `manga/<episodeId>/director-notes.md`: 任意の短い決定メモ。
- `manga-director.md`: 任意の作品固有ルール。

機械契約はvendor済み[name-plan/v2](../../contracts/name-plan/schema.mjs)。由来commitとGit blob SHAは[lock.json](../../contracts/name-plan/lock.json)で管理する。アプリとは同じ共有契約を使い、新しい原稿manifestや独自schemaは作らない。

## 作成・保存手順

1. `node scripts/name-plan.mjs prepare <workId> <episodeId> /tmp/context.json` で原文とatom一覧を固定する。人物画像の欠落はネーム作成を止めない。必要な前後話は `loadDirectorContext` のsceneIdsへ加え、contextAtomIdsとして参照する。
2. チャットAIは対象範囲について `{title, provenance, plan}` のdraft JSONを作る。原文やhashをAIに生成させない。plan.coverageには今回漫画化するatomだけを原文順に含める。
3. `node scripts/name-plan.mjs write <workId> <episodeId> /tmp/context.json /tmp/draft.json <番号>` を実行する。コードが読込済みの原文を `source.scenes[].text` へ入れ、固定人物ID・掲載文字・構造・配置を検証して番号付きファイルを書く。最新原稿を再読込みして一致判定しない。同じ番号を更新する場合だけ `--replace` を付ける。
4. `node scripts/validate-name-plan.mjs <workId> <episodeId> <ファイル>` で保存ネーム単独を再検証できる。旧 `name-plan.json` は読取互換で、新規作成には使わない。
5. 保存指示に従い最新devからDraft PRへ保存する。原稿も変更する場合は同じPRへ置く。対象外原稿・画像・publication.yamlは変えない。保存はマージ・公開の承認ではない。
6. アプリで番号付きネームを開き、確認して採用する。原稿の別途取込みは不要。画像は `yumi` など固定人物IDの欄へ取り込む。画像の差し替えや順序変更は自由で、過去の画像hashと一致させない。

創作ループをmanga-macアプリへ往復させない。CLIは原文のコピー・組立て・検証専用で、別AIやAPI接続を必要としない。機械検証できなければ「未検証」と示す。

## 検証の範囲とタイミング

原稿・設定・画像だけの更新で、過去のネームを検証し直して更新を止めない。一般の原稿構造検証とネーム検証は分離し、CIはその変更で追加・更新した番号付きネームだけを検証する。ネーム内の原文とatomの対応、人物ID、台詞、ページ構造が対象。最新原稿・設定・画像のhashとの照合は行わない。

`source.commit` は任意の読込来歴。自分自身を含む未来のcommitを書く循環を避ける。内包原文は後日の改稿で書き換わらない。アプリは保存ネーム内の原文と今登録された画像を使う。画像がない人物は、その人物を描くコマの作画時に知らせる。

原文入り形式に対応するアプリ版を必要とする。ファイル作成、候補採用、作画・文字配置完了、実Macでの受入を分けて報告する。
