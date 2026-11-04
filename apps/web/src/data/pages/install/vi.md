---
title: Cài đặt và chạy
description: Cài delendai, nối nó vào IDE của bạn, chọn một preset và kiểm tra máy chủ trước khi bắt đầu làm việc.
order: 1
navLabel: Cài đặt
---

# Cài đặt và chạy

Thêm delendai vào workflow của bạn, trỏ client MCP tới binary, rồi kiểm tra tập plugin đã được resolve trước phiên đầu tiên.

## Chọn trình quản lý gói

Mọi trình quản lý gói dưới đây đều chạy cùng một gói đã phát hành. Hãy chọn cái mà nhóm của bạn đã dùng sẵn và giữ nguyên các lệnh như bên dưới.

### npm

Node Package Manager đi kèm với Node.js, nên đây là lựa chọn mặc định an toàn nhất khi bạn cần độ tương thích rộng nhất giữa nhiều máy và runner CI.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm nhanh, tiết kiệm dung lượng đĩa và nghiêm ngặt trong việc resolve dependency, nên rất hợp với monorepo hoặc các nhóm đã chuẩn hóa pnpm.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn vẫn là lựa chọn quen thuộc trong nhiều codebase JavaScript, nên con đường này phù hợp khi tooling và thói quen của nhóm đã xoay quanh Yarn.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun gộp runtime và trình quản lý gói vào cùng một công cụ, và bản thân delendai cũng được build bằng bun, nên đây là con đường trực tiếp nhất khi máy đã có bun.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno có thể chạy trực tiếp gói npm, điều này hữu ích nếu bạn thích một runtime an toàn mặc định, có hỗ trợ TypeScript hạng nhất và tương thích npm.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## Chọn IDE của bạn

Các snippet dưới đây dùng preset solo qua bun. Hãy dán nguyên JSON vào tệp đích rồi để IDE của bạn đăng ký stdio server.

### VS Code

Tệp: .vscode/mcp.json
Phạm vi: project

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

Tệp: .cursor/mcp.json hoặc ~/.cursor/mcp.json
Phạm vi: project / global

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

Tệp: ~/.codeium/windsurf/mcp_config.json
Phạm vi: global

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

Tệp: .mcp.json hoặc qua claude mcp add
Phạm vi: project

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

Tệp: claude_desktop_config.json
Phạm vi: global

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

Tệp: ~/.gemini/antigravity-ide/mcp_config.json
Phạm vi: global

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

Tệp: settings.json
Phạm vi: global

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

## Chọn một preset

Preset là cộng dồn. Hãy bắt đầu với tập nhỏ nhất, rồi chỉ mở rộng bề mặt plugin khi workflow của bạn thực sự cần thêm.

### minimal

- git
- search

### solo

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

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

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

## Kiểm tra

Sau khi cấu hình đã vào đúng chỗ, hãy chạy self-check bằng chính trình quản lý gói mà bạn đã dùng để cài. Nếu không dùng bun, hãy thay `bunx` bằng `npx`, `pnpm dlx`, `yarn dlx` hoặc `deno run -A npm:`.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

Hãy dùng `--exclude-plugins=` khi bạn muốn bớt một plugin khỏi preset mà không cần fork preset đó, ví dụ giữ nguyên nền tảng swarm nhưng bỏ notification trong một phiên single-agent.

## Câu hỏi thường gặp

### Vì sao `deno run -A npm:@delendai/cli` khởi động chậm?

Deno sẽ resolve và verify gói npm ở lần dùng đầu tiên. Những lần sau nó tái sử dụng cache trong `~/.cache/deno`, nhưng với các lần khởi chạy lặp lại trên máy local thì bun hoặc npx vẫn nhanh hơn.

### IDE của tôi không có trong danh sách. Giờ làm sao?

Bất kỳ IDE nào chấp nhận stdio MCP server đều có thể chạy cùng server đó. Hãy bắt đầu từ JSON của VS Code, đổi đường dẫn tệp cho khớp IDE của bạn, rồi giữ nguyên command và args.

### Tôi có thể chạy nhiều preset cùng lúc không?

Không. Mỗi instance của server chỉ resolve một preset tại một thời điểm. Nếu các project khác nhau cần các tập plugin khác nhau, hãy đặt một delendai.config.json riêng trong từng project và để loader resolve theo từng workspace.