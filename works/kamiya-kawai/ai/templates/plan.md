# {{WORK_TITLE}}：場面設計

対象場面：`{{TARGET_SCENE_ID}}`（{{TARGET_SCENE_PATH}}）
話：`{{EPISODE_ID}}` {{EPISODE_TITLE}}
現行タイトル：{{TARGET_SCENE_TITLE}}

## 参照する正本

- manifest: `manifest.json`
- 対象本文: `{{TARGET_SCENE_PATH}}`
- 前後場面:
{{ADJACENT_SCENES}}
- 設定:
{{SETTING_PATHS}}

## 指示

1. 対象本文と必要な前後場面・設定だけを読む。
2. 場面の目的、開始時点の関係、転換点、終了時点の変化を分けて整理する。
3. ユーザーが明示していない設定・出来事・接触を追加しない。
4. 改稿案は対象場面のIDとパスを保持し、全文再生成ではなく差分単位で提案する。

