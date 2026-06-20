---
title: メモリノートの保存と呼び出し
plugin: memory
audience: セッション間の継続性が必要なすべてのエージェント
order: 1
lang: ja
---

# メモリノートの保存と呼び出し

このチュートリアルでは4つの `memory_*` ツールを実際に動かします。
ノートは `.cache/mcp-vertex/memory/notes.json` 下の小さなJSONレコード
です——全体をダンプできるほど小さく、idでインデックス付けされ、タグや
全文クエリで取得できます。

## 0. メンタルモデル

**ノート**は `{ id, title, body, tags, createdAt, updatedAt }` です。
タイトルは一意です（大文字小文字を区別しない）——`memory_save` は
タイトルでupsertします。`body` にはスキーマがありません；短い自由テキスト
フィールドとして扱ってください。シークレットはノートが保存される前に
`redactSecrets` によって自動的に編集されます（`packages/core/src/lib/shared/redact.ts` 参照）。

## 1. ノートを保存する

```json
{
  "tool": "memory_save",
  "args": {
    "title": "monorepo公開順序",
    "body": "coreを最初に、次にプラグインをロックステップで。derive-version.tsは最後のvX.Y.Zタグ以降のConventional Commitsを読み取る。",
    "tags": ["release", "monorepo"]
  }
}
```

レスポンス: `{ id: "<uuid>", createdAt: "..." }`。Saveはidを返し、
後で `forget` できます。

## 2. クエリで呼び出す

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "公開順序",
    "limit": 5
  }
}
```

クエリに一致する最大 `limit` 件のノートを返します（タイトル + bodyの
部分文字列マッチ、最新順）。絞り込みに `query` の代わりに（または
一緒に）`tags` を使用：

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. 安価にリストする

`memory_list` は `{ id, title, tags }` のみを返します——インデックス。
まだbodyを取得したくない場合に使用：

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. 忘れる

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` はハード削除——ソフト削除/アーカイブはありません。
idは消えます；タイトルは将来の `memory_save` のために解放されます。

## よくある落とし穴

- **`body` のシークレット**: プラグインが保存時に編集しても、生のトークン
  や `.env` スタイルの値を貼り付けないでください——編集はヒューリスティックで
  完璧ではありません。
- **タイトルの衝突**: `memory_save` はタイトルでupsertします。2つのエージェント
  が同じタイトルを並行して保存すると、2番目の書き込みが勝ち、最初のが失われます。
  スライス/問題ごとに一意のタイトルを使用してください。
- **Recallのヒットが多すぎる**: 幅広い `query` より `tags` を優先してください。
  `""` のクエリは最新順にすべてを返します——「前のセッションで何を保存したか?」
  には便利ですが、完全なストアでは高コストです。

## 次のステップ

- [round_context (proposals) がメモリノートをアクティブな提案にリンクする方法](../../proposals/tutorials/ja/getting-started.md)
- [シークレット編集コントラクト](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
