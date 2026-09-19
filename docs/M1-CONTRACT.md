# M1 共通仕様

確定した契約。制作側（manga-mac#157）と配信側（live-manga#44/#46、novel-template#3）は、このcatalog / 作品root / 読取adapterを共有する。同じ契約を別実装しない。

## 入口

| ファイル | 役割 |
| --- | --- |
| `library.json` | 作品一覧。workId、root、原稿形式、採用元、正本、取込状態 |
| `migrations/source-map.json` | 旧repo/commit/path/ID → 新workId/root/path/ID |
| `works/{workId}/source/manifest.json` | その作品の原稿入口 |
| `works/{workId}/publication.yaml` | 原稿側の公開設定。読者向け配信manifestではない |

`library.json` を読者へ配らない。production/dev の配信manifestは live-manga が公開判定から派生する。

## 作品rootとパス解決

```text
works/{workId}/
  source/manifest.json
  manuscript/
  settings/
  assets/
  publication.yaml
```

- 固定識別子は `workId`。表示名や配列位置ではない
- manifestの場所は `{root}/source/manifest.json`
- 原稿・設定・画像の相対パスは **作品root** から解決する
- `source/` を基準に `manuscript/` を足して誤解決しない
- 作品rootの外、`..`、絶対パス、他作品領域への参照は拒否する
- 新作の原稿形式正本は `story-source/v1`（manga-mac `contracts/story-source`、lock `601d5fa5cb076dd53a55a38c64f22083c5a6a64e`）
- 既存作品は形式が同じとは限らない。保存されているmanifestを format 文字列だけで書き換えない

## 読取adapter

| 形式 | 用途 | 保持するもの |
| --- | --- | --- |
| `story-source/v1` | 新規・場面付き原稿の正本 | `episodes[].scenes[]` の配列順と固定ID |
| `novel-source/v1` | 小説テンプレート互換 | `chapters[].episodes[]` の章/話IDと読書順 |
| `schema-1` / `schema-4` | Kamiya-Kawai など旧manga-mac原稿 | `scene_ids` 順、場面ID、宣言パス。schema 4 は構造化人物宣言を優先 |

adapterは読取専用である。本文を正規化せず、固定IDを付け替えず、欠損IDを名前から推測しない。

## 正本と切替

- `authorityUntil` は `M8`
- 取込前・取込後も `authority: origin`
- `authority: library` は `importStatus: verified` のあとだけ許可する
- 旧repoは最終増分同期・M7受入・明示切替まで原稿正本として残す
- 旧repo削除、旧Worker停止、一般公開範囲の変更はこの契約の範囲外であり、実装してよい操作ではない

## 公開設定

`publication.yaml` は JSON互換YAML。初期値は novel/manga とも `private`。
タイムゾーン標準は `Asia/Tokyo`。公開キーは `workId × format × episodeId`。
原稿を main へ保存したこと、catalog へ載せたこと、dev へ転送したことを公開にしない。

## 制作履歴

manga-mac の snapshot / 画像 / Undo / job は Git に集約しない。
source-map は旧 repo/commit/path を残し、既存制作物の接続先移行（#157）が追跡できるようにする。

## 公開CI

公開検査は人工fixtureだけを使う。実原稿・個人情報・originの本文をCIへ持ち込まない。
