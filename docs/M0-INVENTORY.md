# M0 棚卸し

作業一覧の正本は [story-library#1](https://github.com/kdob1042/story-library/issues/1)。
この文書は、この実行環境から確認できた採用元と、確認できなかった境界を記録する。

## 確定した役割

| 場所 | 役割 | この段階での正本 |
| --- | --- | --- |
| `kdob1042/story-library` | 非公開原稿庫。catalog、作品root、公開設定、雛形 | 契約・棚卸しのみ。実原稿は未複製 |
| `kdob1042/Kamiya-Kawai` | 既存原稿の1作目。manga-mac が schema 4 として接続 | **origin のまま** |
| `kdob1042/investor-life` | 既存原稿の2作目。小説ビューワー比較対象 | **origin のまま。main commitを採用** |
| `kdob1042/novel-template` | 公開スターター。実作品本文を入れない | 雛形の現行コード。M3で `templates/work/` へ移す |
| `kdob1042/manga-mac` | 制作アプリ。`story-source/v1` 契約の実装正本 | 契約を vendor。接続先切替は #157 / M4 |
| `kdob1042/live-manga` | 共通配信。本棚・公開判定 | 原稿は置かない。#44 / #46 |

## 既存2作品

### kamiya-kawai

- 表示名（導入ガイドの例）：神谷と河合
- 固定 workId：`kamiya-kawai`
- origin：`kdob1042/Kamiya-Kawai`（private）
- 確認されている構造：manifest schema 4、`episodes[].scene_ids` → `scenes[].path`、複数 `settings[].path`、VISUAL 設定内の人物基準画
- 構造確認commit：`7eed2120eb93e2964cd188b5890f0247c83de540`（manga-mac `docs/VALIDATION.md`）。**これは採用本文の版ではない**
- 採用元commit：`5621918052faf05fc0bac245ad70d6c4f7ca1561`（現行 `main`）
- `dev` は `main` より3コミット古く、原稿採用版にはしない

### investor-life

- 固定 workId：`investor-life`
- 採用元：`kdob1042/investor-life` の現行 `main` commit `cb08a589fdce05fb0bcfa91ba0b20c9c2c043fa5`
- 形式：`investor-life-source/v1`。4章12話、章ID `C01`–`C04`、話ID `C01-E01`–`C04-E12`、manifest上の順序を保持する
- `dev` 固有の差分は小説ビューアー実装であり、原稿本文の採用版へ混ぜない

## 公開テンプレート（実作品ではない）

`kdob1042/novel-template` は現在この接続から取得できないため、現行の新作雛形は `templates/work/work.json` を正本とする。旧templateの `manifest.json` は形式の来歴として扱い、investor-lifeの実本文と混ぜない。公開CIやテンプレートに実作品本文・個人情報を入れない。

## 保持する対象

移行中も、複製後も、次を保持する。

- 本文のバイト列（正規化・AI補正・再採番なし）
- 固定 workId / episodeId / sceneId / chapterId / characterId
- 人物基準画像の宣言とファイル
- 制作履歴（manga-mac の snapshot / 画像 / Undo）。古い snapshot の repo/commit を黙って書き換えない
- 旧原稿repoの git 履歴。story-library への複製は追加コピーであり、origin の置換ではない

## この環境で実施しないこと

- 旧原稿repoの削除・archive
- 旧 Cloudflare Worker の停止
- 一般公開範囲の変更、Access 解除
- 実原稿の推測復元
- 大量の漫画画像・動画・制作DBの Git 集約

## 次の入力（M2）

M1で固定した各origin commitから、本文・設定・基準画像を複製する。複製前に対象commitが現在のmain/dev運用と矛盾していないかだけ再確認し、構造確認commitだけを採用本文にしない。
