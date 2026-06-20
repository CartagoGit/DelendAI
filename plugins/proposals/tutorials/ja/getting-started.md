---
title: proposalsプラグインを始める
plugin: proposals
audience: オーケストレーター / エージェント
order: 1
lang: ja
---

# proposalsプラグインを始める

このチュートリアルは空のワークスペースから始まり、提案 → スライス →
実装 → クローズの完全なサイクルで終わります。ファイルミューテックスの
規律が保たれます。`proposals` プラグインが有効になっていることを前提と
します（JSONスニペットは `plugins/proposals/README.md` を参照）。

## 0. メンタルモデル

**提案**はfrontmatterヘッダー付きのmarkdownファイルです。**スライス**は
その中の番号付きセクションです。プラグインはスライスごとに2人のライターを
調整します：一方がクレーム、他方がリリースします。`auto_work` は高レベルの
エントリーポイント「次に何をすべきか？」です。

```
docs/mcp-vertex/proposals/
├─ index.json          （sync_proposalsによって再生成）
├─ p<N>-<タイトル>.md （提案）
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. `auto_work` から始める

`auto_work` は提案ストア全体にわたって次の実行可能なスライスを返し、
コンパクトな順序付きプランを提供します。プランは逐語的に実行する
必要があります——ステップを即興で変えないでください。

```json
// MCPツール呼び出し
{ "tool": "proposals_auto_work", "args": {} }

// 典型的なレスポンス（短縮）
{
  "state": "work",
  "proposalId": "p110",
  "sliceId": "s1-claim",
  "steps": [
    "docs/mcp-vertex/proposals/p110-…md を開いて次のアトミックスライスを選択する。",
    "ファイルをクレームする: proposals_agent_lock { action: \"claim\", … }。",
    "そのスライスだけを実装する——クレームされたファイル以外は何もしない。",
    "プロジェクトのゲートで検証する（あれば get_validation_matrix を参照）。",
    "提案に進捗をマークし、proposals_sync_proposals を呼び出す。",
    "リリース: proposals_agent_lock { action: \"release\", task_id }。"
  ]
}
```

## 2. スライスのファイルをクレームする

`proposals_agent_lock` ツールはスライスの期間中、誰がどのパスを
所有するかを記録します。クレームなしでは、`sync_proposals` はスライスを
完了としてマークすることを拒否します。

```json
{
  "tool": "proposals_agent_lock",
  "args": {
    "action": "claim",
    "files": [
      "apps/web/src/components/PluginPage.astro",
      "apps/web/src/data/capabilities.json"
    ]
  }
}
```

レスポンスにはリリースまで保持する必要がある `task_id` が含まれます。
同じファイルをクレームする2つのエージェント ⇒ 競合、進捗なし。ミューテックスは
fs-バックアップ（非アドバイザリー）で、プロセス再起動後も存続します。

## 3. スライスを実装してから検証する

クレームされたファイルのみを編集します。プロジェクトのゲートを実行：

```bash
bun run validate
```

ゲートが失敗した場合、スライスを修正してください——クレームを黙って
広げないでください。

## 4. 進捗をマークして同期する

`sync_proposals` は提案ファイルを読み取り、frontmatter + スライス
プランを検証し、`index.json` を再構築します。安価でべき等です。

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. スライスをクローズする

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "p110",
    "sliceId": "s1-claim"
  }
}
```

これにより提案内のスライスステータスが `done` に書き換えられ、ロックが
削除され、インデックスが再同期されます。その後 `auto_work` を再度
呼び出してください——次のスライスを返します（ストアが枯渇した場合は
`state: "idle"`）。

## よくある落とし穴

- **クレーム外のファイルを編集する**：`sync_proposals` はスライスを
  完了とマークすることを拒否します。独自のクレームで2番目のスライスを
  使用するか、提案を分割してください。
- **`sync_proposals` をスキップする**：インデックスが古くなります。
  次のエージェントは「次のスライス」を求めて間違ったものを受け取ります。
- **リリースを忘れる**：古いロックは次のオーケストレーターを `staleMs`
  （デフォルト30秒）まで阻止します。クリーンアップするために
  `proposals_agent_lock { action: "gc" }` を呼び出してください。

## 次のステップ

- [agent_worktreeプラグインが並行エージェントを分離する方法](#)
- [auto_workの永続化モード (p109)](../../p109-feat-auto-work-persist-modes.md)
- [再開されたワークのラウンドコンテキスト](#)
