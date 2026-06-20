---
title: プロジェクトドキュメントのカタログ化
plugin: docs
audience: トピックでドキュメントを見つける必要があるすべてのエージェント
order: 1
lang: ja
---

# プロジェクトドキュメントのカタログ化

`docs` プラグインは小さくて頻繁な質問に答えます：「このプロジェクトには
どんなドキュメントがあり、私が探しているのはどれか？」grepをする代わりに、
エージェントがプラグインに尋ねます。このチュートリアルでは有効化、一覧表示、
読み込みの方法を示します。

## 0. メンタルモデル

**ドキュメント**は設定された `roots` 下の任意の `.md` ファイルです。
プラグインは一度列挙し、最初の `# heading` またはfrontmatter `title:` から
タイトルを抽出し、トークン効率の良いインデックスを提供します。Bodyは
要求時のみ取得されます。

設定は `mcp-vertex.config.json` にあります：

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` はパス（ファイルまたはディレクトリ）の配列です。ディレクトリは
再帰的に走査されます。**ワークスペース外のパスは拒否されます** — `..`
トラバーサル不可。

## 1. 一覧表示（低トークンインデックス）

```json
{ "tool": "docs_list", "args": {} }
```

レスポンス（短縮）：

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/p100-…md", "title": "p100 — Web: 実際のi18n…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

リストはパスでソートされています。`roots` を渡してリストをサブセットに
限定します（例：`["docs/proposals"]` のみ）：

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. ドキュメントを読む

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

レスポンス：

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…完全なbody…",
  "truncated": false,
  "found": true
}
```

`content` は256 KiBに制限されています。ドキュメントが大きい場合、
`truncated: true` でbodyは最初の256 KiBです。パスが設定されたroots下の
ドキュメントと一致しない場合、`found: false`。

## 3. なぜ2つのツールで1つではないのか

`list` は安価です（ドキュメントあたり数百バイト、18ドキュメント ≈ 4 KiB）。
`read` は高コストです（ドキュメントあたり数メガバイトの可能性）。分離する
ことで、エージェントはまず `list` し、次に関連しそうなもののみを `read`
できます——各発見ステップでトークンを節約。

## 4. パス制限（セキュリティ）

`docs_read` は `resolveWorkspaceContained` でパスを解決します——絶対パス、
`..` トラバーサル、ワークスペース外を指すシンボリックリンクはすべて拒否
されます。`found: false` レスポンスはパスが拒否されたエージェントへの
シグナルです；プラグインは意図的に「存在しない」と「ワークスペース外」を
区別しません（ファイルシステムのレイアウトを漏らさないため）。

## よくある落とし穴

- **Rootが存在しない**: `docs_list` は `{ count: 0, truncated: false,
  docs: [] }` を返します。プラグインは警告しません。
- **ドキュメントがまだコミットされていない**: 未追跡ファイルも提供されます
  （プラグインはgitではなくファイルシステムから読みます）。返される `path`
  はワークスペース相対です。
- **タイトル推論が失敗する**: 最初のheadingが `# ` でない（スペースなし、
  レベルが違う）かつfrontmatter `title:` がない場合、プラグインはファイル
  名のbasenameを使います（例：`CHANGELOG.md` → `CHANGELOG.md`）。
  headingを修正した後に再実行してください。

## 次のステップ

- [`docs_list` が `memory_recall` と「保存したこと + どこに文書化されていたか」のために統合される方法](#)
- [`knowledge` プラグインで知識インデックスをキュレーションする](#)
