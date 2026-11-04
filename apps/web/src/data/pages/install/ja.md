---
title: インストールと実行
description: delendai をインストールし、IDE に接続し、プリセットを選び、作業前にサーバーを検証します。
order: 1
navLabel: インストール
---

# インストールと実行

delendai をワークフローに追加し、MCP クライアントをバイナリに向け、最初のセッション前に解決されたプラグインセットを確認します。

## パッケージマネージャを選ぶ

以下のパッケージマネージャはどれも同じ公開パッケージを実行します。チームがすでに使っているものを選び、コマンドはそのまま使ってください。

### npm

Node Package Manager は Node.js と一緒に提供されるため、マシンや CI runner をまたいで最も広い互換性が必要なときの安全な共通デフォルトです。

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm は高速でディスク効率がよく、依存解決も厳格なので、monorepo や pnpm をすでに標準化しているチームに向いています。

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn は多くの JavaScript コードベースで今も馴染みのある選択肢です。チームのツールや習慣がすでに Yarn を中心にしているなら、この経路が自然です。

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun は runtime と package manager を 1 つのツールにまとめており、delendai 自体も bun でビルドされています。マシンに bun があるなら、これが最も直接的な経路です。

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno は npm パッケージを直接実行できます。secure-by-default な runtime と first-class な TypeScript サポート、npm 互換性を重視する場合に便利です。

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## IDE を選ぶ

以下のスニペットは bun 上の solo プリセットを使います。JSON を対象ファイルへそのまま貼り付け、IDE 側で stdio サーバーを登録してください。

### VS Code

ファイル: .vscode/mcp.json
スコープ: project

```json
{
  "servers": {
    "delendai": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
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
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
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
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
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
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
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
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
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
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
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
    "delendai": {
      "command": "bunx",
      "args": [
        "--package",
        "@delendai/cli",
        "delendai",
        "__serve",
        "--workspace",
        ".",
        "--preset",
        "solo"
      ]
    }
  }
}
```

## プリセットを選ぶ

プリセットは加算型です。最小構成から始め、ワークフローで本当に必要になったときだけプラグイン面を広げてください。

### minimal

推奨用途: 読み取り専用のオリエンテーションと CI smoke test。
サイズ: 2 プラグイン · 42 ツール · ~11805 コールドスタート時のトークン

- git
- search

### solo

推奨用途: 日常のコーディングを行う開発者 1 人とエージェント 1 つ。`init` の既定値。
サイズ: 10 プラグイン · 79 ツール · ~19037 コールドスタート時のトークン

- git
- search
- memory
- docs
- quality
- rules
- deps
- test-policy
- env
- refactor

### team-pr

推奨用途: pull request で進めるチーム。コミットとテストの規約付き。
サイズ: 18 プラグイン · 116 ツール · ~25446 コールドスタート時のトークン

- git
- search
- memory
- docs
- quality
- rules
- deps
- test-policy
- env
- refactor
- forge
- commit-policy
- conventions
- test-convention
- security
- web-fetch
- status-marker
- error-reporting

### swarm

推奨用途: 1 つの checkout を共有する複数のエージェント。提案、ログ、クローズマーカー付き。
サイズ: 19 プラグイン · 125 ツール · ~26802 コールドスタート時のトークン

- git
- search
- memory
- docs
- quality
- test-policy
- proposals
- error-reporting
- logs
- agent-orchestrator
- auto-agent-selector
- notification
- completion
- status-marker
- forge
- commit-policy
- conventions
- test-convention
- usage-tracking

### audit

推奨用途: 読み取り専用のレビューと監査。
サイズ: 15 プラグイン · 89 ツール · ~21955 コールドスタート時のトークン

- git
- search
- docs
- audit
- security
- web-fetch
- deps
- tech-debt
- link-check
- project-health
- impact-analysis
- refactor
- quality
- test-policy
- logs

### docs-web

推奨用途: ドキュメントと Web サイト。
サイズ: 8 プラグイン · 61 ツール · ~15696 コールドスタート時のトークン

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

推奨用途: ネットワークや認証情報を使うものを含む、公開済みの全プラグインによる診断。
サイズ: 58 プラグイン · 236 ツール · ~59122 コールドスタート時のトークン

- adaptive-optimizer
- agent-orchestrator
- api
- audit
- audit-orchestrator
- auto-agent-selector
- auto-plugin-selector
- browser
- cache
- commit-policy
- completion
- container
- context-for-change
- conventions
- database
- deps
- diagram
- docs
- env
- error-reporting
- execution-env
- external-mcps
- forge
- framework-knowledge
- git
- github
- gitlab
- i18n
- impact-analysis
- issues
- link-check
- logs
- memory
- notification
- observability
- orchestrator-runner
- perf
- project-health
- project-kpis
- prompt-eval
- prompts-pack
- proposals
- quality
- quality-policy
- refactor
- remote-provider-core
- rules
- search
- security
- self-learning
- skills-pack
- status-marker
- style-convention
- tech-debt
- test-convention
- test-policy
- usage-tracking
- web-fetch

## 検証

設定を配置したら、インストールに使ったのと同じパッケージマネージャで self-check を実行します。bun 以外を使う場合は、`bunx` を `npx`、`pnpm dlx`、`yarn dlx`、または `deno run -A npm:` に置き換えてください。

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

`--exclude-plugins=` は、プリセットを fork せずにそこから 1 つのプラグインを差し引きたいときに使います。たとえば swarm の基線は保ちつつ、single-agent セッションでは notification を外す場合です。

## FAQ

### なぜ `deno run -A npm:@delendai/cli` は起動が遅いのですか？

Deno は初回実行時に npm パッケージを解決して検証します。以後の実行では `~/.cache/deno` のキャッシュを再利用しますが、ローカルで繰り返し起動するなら bun や npx のほうが依然として速いです。

### 自分の IDE が一覧にありません。どうすればいいですか？

stdio MCP サーバーを受け入れられる IDE なら、同じサーバーを実行できます。VS Code の JSON を起点にし、ファイルパスだけ IDE が期待するものへ差し替え、同じ command と args を維持してください。

### 複数のプリセットを同時に実行できますか？

できません。1 つのサーバーインスタンスが一度に解決するプリセットは 1 つだけです。プロジェクトごとに異なるプラグインセットが必要なら、各プロジェクトに専用の delendai.config.json を置き、loader に workspace ごとに解決させてください。