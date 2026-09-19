# M0 棚卸し

作業一覧の正本は [story-library#1](https://github.com/kdob1042/story-library/issues/1)。
この文書は、この実行環境から確認できた採用元と、確認できなかった境界を記録する。

## 確定した役割

| 場所 | 役割 | この段階での正本 |
| --- | --- | --- |
| `kdob1042/story-library` | 非公開原稿庫。catalog、作品root、公開設定、雛形 | 契約・棚卸しのみ。実原稿は未複製 |
| `kdob1042/Kamiya-Kawai` | 既存原稿の1作目。manga-mac が schema 4 として接続 | **origin のまま** |
| `investor-life`（novel-template#3） | 既存原稿の2作目。小説ビューワー比較対象 | **origin のまま。repo名は未確認** |
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
- この token では clone / API とも到達できず、本文・話ID・基準画像の実体は未取得

### investor-life

- 固定 workId：`investor-life`
- novel-template#3 が `investor-life` の latest main/dev/PR を小説リーダー移管の比較対象としている
- この token から `kdob1042/investor-life` を解決できず、正式な owner/repository・形式・話IDは未確定
- タイトルや章/話IDはこの棚卸しで発明しない

## 公開テンプレート（実作品ではない）

`kdob1042/novel-template` の `manifest.json` は `novel-source/v1`。章 `C01`–`C04`、話 `C01-E01` 形式、本文はプレースホルダー。公開CIやテンプレートに実作品本文・個人情報を入れない。

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

origin への Contents: read 権限が付いたあと、最新の main/dev/PR を再確認してから複製する。構造確認commitだけを採用本文にしない。
