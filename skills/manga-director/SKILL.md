---
name: manga-director-loop
description: Run bounded script and virtual manga-plan improvement for works stored in story-library, without launching manga-mac.
---

# Manga Director

このSkillは、作品Repoを正本として `脚本 → 仮想ネーム → 漫画としてレビュー → 脚本改善案 → 再ネーム` を反復するための作品側ルールです。

## 責務

- 原稿・人物設定・前後文脈は `works/<workId>/` の同一版から読む。
- 原稿正本を直接改稿せず、反復中はworking manuscriptを使う。
- コマの見せ方だけで解決する変更は `direction_only`、新しい行動・会話・出来事・伏線・因果補完が必要な変更は `script_change` として分ける。
- script_changeには挿入位置、具体内容、理由、期待効果、ページ／コマへの影響を持たせる。
- 仮想ネームはmanga-macの共有 `name-plan/v2` 契約に従い、座標を直接生成しない。
- 反復は上限付きで行い、改善なし・同一提案の反復・本文／ページ増の上限・schema不整合で停止する。
- AIの提案を正本採用済み、読者評価済み、漫画品質保証済みとして扱わない。

## 実行手順

1. 対象workの `work.json` と既存story-source契約から、対象scene、人物設定、前後文脈を同一commitで取得する。
2. manga-mac側の共通Manga Director実行器を呼ぶ。実行器は `tools/manga-director/` にあり、Tauri、manga-mac GUI、SQLite、画像／動画生成を必要としない。
3. #255相当の1回ネーム生成能力で、意味ネームを作る。
4. ページ／コマ列を通読し、感情、因果、間、テンポ、開示順、ページめくりをレビューする。
5. `direction_only` は次のネームへ反映する。原稿は変えない。
6. `script_change` はworking manuscriptにだけ適用し、再度ネームを作る。
7. 最大反復数、改善量、重複提案、本文／ページ増、契約不整合を確認して停止する。
8. 最終的に、working manuscript、name-plan、script suggestions、iteration report、原稿差分を候補成果物として保持する。
9. 原稿正本への反映は別の明示操作で行う。反映後はSourceRefを正本に対して再解決し、共有validatorを通してからmanga-macの外部ネーム取込へ渡す。

## 境界

- 本Skillは作品側の制作方針と実行手順を所有する。
- manga-macは共通実行エンジン、name-plan契約、validator、レイアウトcompiler、制作UIを所有する。
- 作品固有の設定は本Repo側に置き、manga-macへ作品名分岐や作品固有プロンプトを追加しない。
- manga-mac内の `tools/manga-director/SKILL.md` を正本にしない。
- 原稿の自動commit/push、別providerへの無断fallback、無制限再試行、画像／動画生成はこのSkillの責務外。

## 作品固有ルール

必要なら `works/<workId>/manga-director.md` を追加し、その作品だけの演出方針・禁止事項・優先事項を記載する。共通Skillを複製せず、作品固有差分だけを書く。

## 検証の区別

次を混同しない。

- 反復エンジンの人工fixture試験
- 共通name-plan/v2 validatorへの適合
- 実LLMでの反復
- 漫画としての品質評価
- manga-macへの取込・制作E2E

どれか一つの成功を他の完了として扱わない。
