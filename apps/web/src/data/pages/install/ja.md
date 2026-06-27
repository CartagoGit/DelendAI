---
title: インストールと実行
description: mcp-vertex をインストールし、IDE に接続し、プリセットを選び、作業前にサーバーを検証します。
order: 1
navLabel: インストール
---

# インストールと実行

mcp-vertex をワークフローに追加し、MCP クライアントをバイナリに向け、最初のセッション前に解決されたプラグインセットを確認します。

## パッケージマネージャを選ぶ

以下のパッケージマネージャはどれも同じ公開パッケージを実行します。チームがすでに使っているものを選び、コマンドはそのまま使ってください。

### npm

Node Package Manager は Node.js と一緒に提供されるため、マシンや CI runner をまたいで最も広い互換性が必要なときの安全な共通デフォルトです。

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm は高速でディスク効率がよく、依存解決も厳格なので、monorepo や pnpm をすでに標準化しているチームに向いています。

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn は多くの JavaScript コードベースで今も馴染みのある選択肢です。チームのツールや習慣がすでに Yarn を中心にしているなら、この経路が自然です。

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun は runtime と package manager を 1 つのツールにまとめており、mcp-vertex 自体も bun でビルドされています。マシンに bun があるなら、これが最も直接的な経路です。

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno は npm パッケージを直接実行できます。secure-by-default な runtime と first-class な TypeScript サポート、npm 互換性を重視する場合に便利です。

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## IDE を選ぶ

以下のスニペットは bun 上の standard プリセットを使います。JSON を対象ファイルへそのまま貼り付け、IDE 側で stdio サーバーを登録してください。

### VS Code

ファイル: .vscode/mcp.json
スコープ: project

```json
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Cursor

ファイル: .cursor/mcp.json または ~/.cursor/mcp.json
スコープ: project / global

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Windsurf

ファイル: ~/.codeium/windsurf/mcp_config.json
スコープ: global

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Claude Code

ファイル: .mcp.json または claude mcp add 経由
スコープ: project

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Claude Desktop

ファイル: claude_desktop_config.json
スコープ: global

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Antigravity

ファイル: ~/.gemini/antigravity-ide/mcp_config.json
スコープ: global

```json
{
  "mcpServers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

### Zed

ファイル: settings.json
スコープ: global

```json
{
  "context_servers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=standard"
      ]
    }
  }
}
```

## プリセットを選ぶ

プリセットは加算型です。最小構成から始め、ワークフローで本当に必要になったときだけプラグイン面を広げてください。

### minimal

推奨用途: 読み取り専用のオリエンテーションと CI smoke test。
サイズ: 2 プラグイン。

- git
- search

### standard

推奨用途: memory、docs、lint、型、依存関係の補助を含む single-agent 作業。
サイズ: 7 プラグイン。

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

推奨用途: lock、通知、logs、close marker を伴う multi-agent 協調。audit は引き続き opt-in であり、1 ラウンド終了後に別途読み込むべきです。
サイズ: 13 プラグイン。

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions

### full

推奨用途: swarm プリセットに web-fetch や issues のような host-only 統合を加えたいとき。ホストがそれらを公開している場合に使います。
サイズ: 15 プラグイン。

- git
- search
- memory
- docs
- rules
- quality
- deps
- proposals
- notification
- logs
- status-marker
- test-convention
- conventions
- web-fetch
- issues

## 検証

設定を配置したら、インストールに使ったのと同じパッケージマネージャで self-check を実行します。bun 以外を使う場合は、`bunx` を `npx`、`pnpm dlx`、`yarn dlx`、または `deno run -A npm:` に置き換えてください。

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

`--exclude-plugins=` は、プリセットを fork せずにそこから 1 つのプラグインを差し引きたいときに使います。たとえば swarm の基線は保ちつつ、single-agent セッションでは notification を外す場合です。

## FAQ

### なぜ `deno run -A npm:@mcp-vertex/core` は起動が遅いのですか？

Deno は初回実行時に npm パッケージを解決して検証します。以後の実行では `~/.cache/deno` のキャッシュを再利用しますが、ローカルで繰り返し起動するなら bun や npx のほうが依然として速いです。

### 自分の IDE が一覧にありません。どうすればいいですか？

stdio MCP サーバーを受け入れられる IDE なら、同じサーバーを実行できます。VS Code の JSON を起点にし、ファイルパスだけ IDE が期待するものへ差し替え、同じ command と args を維持してください。

### 複数のプリセットを同時に実行できますか？

できません。1 つのサーバーインスタンスが一度に解決するプリセットは 1 つだけです。プロジェクトごとに異なるプラグインセットが必要なら、各プロジェクトに専用の mcp-vertex.config.json を置き、loader に workspace ごとに解決させてください。