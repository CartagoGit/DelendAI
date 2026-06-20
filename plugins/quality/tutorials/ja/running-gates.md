---
title: あらゆる言語のQualityゲートを実行する
plugin: quality
audience: プロジェクトの状態を検証する必要があるエージェント
order: 1
lang: ja
---

# あらゆる言語のQualityゲートを実行する

`quality` プラグインは設計上**言語非依存**です：`mcp-vertex.config.json`
に指定されたコマンドを起動し、終了コードを報告します。このチュートリアルでは
スコープの3つのソース（優先度順）、実行方法、暴走プロセスのキャンセル方法を
説明します。

## 0. メンタルモデル

**スコープ**は名前付きコマンドのリストです。プラグインはスコープ内の各
コマンドを順番に実行し、stdout/stderrをキャプチャし、構造化レポート
`{ ok, results: [{ command, ok, code, tail }] }` を返します。`ok`フィールドは
スコープ全体のものです——コマンドが1つでも失敗すると、スコープはokではありません。

```
┌─ plugin options.scopes（最高優先度）
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ 検出されたpackage.jsonスクリプト → "all"（lint, typecheck, test, build）
```

## 1. 利用可能なスコープを一覧表示（読み取り専用）

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

レスポンス例（短縮）：

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. スコープを実行する

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

レスポンスはコマンドごと：

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

失敗コンテキストに `results[N].tail` を読んでください。`tail` は最後の
20個の非空行（合計64 KiBに制限）——エージェントのコンテキストを溢れさせ
ずにデバッグするのに十分。

## 3. 暴走プロセスをキャンセルする

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

インフライトの各実行のプロセスグループに `SIGKILL` を送信します。
`{ "pid": <number> }` を渡して1つをキャンセル。キャンセルは非ブロッキング：
次の呼び出しの `results` がkillを反映します。

## 4. 言語非依存にする

コアはあなたの設定が言うことを実行します。多言語プロジェクト
（TypeScript + Python）の例：

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` は言語に関係なく `typecheck` / `test` スコープの**4つすべての
コマンド**を実行します。Exit 0 = パス；非ゼロ = 失敗（どのバイナリが
出力したかに関係なく）。

## 5. コマンドポリシーで堅牢にする（M13）

`run_quality` はホスト設定が言うことを**実行します**。信頼度の低いエージェントが
ツールを呼び出す際にどのバイナリを実行できるかを制限するには、
`commandPolicy` を使用：

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

ブロックされたコマンドは `code: 126` と理由（"blocked by command policy"）で
報告され、**決して起動されません**。`deny` は `allow` に優先します；
空の `allow` は「拒否されていないすべてのバイナリ」を意味します。

## よくある落とし穴

- **`run_quality` は `bun run validate` の代わりではない**: コアの
  `validate` スクリプトは4つのチェックを直接実行します。`run_quality`は
  **アドホック**実行とエージェントからのスコープごとのイントロスペクション用。
  両方有効；互いに通信しません。
- **タイムアウトを超える長時間実行コマンド**は `code: 124` と
  `timedOut: true` で終了します。デフォルトタイムアウトは600 000 ms
  （10分）。必要に応じてrunnerごとに上書き。
- **「完了した？」のポーリング**: しないでください。`run_quality` は
  同期的です。長いスコープについて知る必要がある場合、`activeRunPids`
  の `pid`（メトリクスまたはフォローアップツール呼び出し経由）で
  `quality_cancel` を使用してください。

## 次のステップ

- [多言語Qualityゲート（l107）](../../l107-multilang-quality-gates.md)
- [信頼境界 & コマンドポリシー（M13）](../../l107-multilang-quality-gates.md#5-no-objetivos)
