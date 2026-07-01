---
title: Cài đặt và chạy
description: Cài mcp-vertex, nối nó vào IDE của bạn, chọn một preset và kiểm tra máy chủ trước khi bắt đầu làm việc.
order: 1
navLabel: Cài đặt
---

# Cài đặt và chạy

Thêm mcp-vertex vào workflow của bạn, trỏ client MCP tới binary, rồi kiểm tra tập plugin đã được resolve trước phiên đầu tiên.

## Chọn trình quản lý gói

Mọi trình quản lý gói dưới đây đều chạy cùng một gói đã phát hành. Hãy chọn cái mà nhóm của bạn đã dùng sẵn và giữ nguyên các lệnh như bên dưới.

### npm

Node Package Manager đi kèm với Node.js, nên đây là lựa chọn mặc định an toàn nhất khi bạn cần độ tương thích rộng nhất giữa nhiều máy và runner CI.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm nhanh, tiết kiệm dung lượng đĩa và nghiêm ngặt trong việc resolve dependency, nên rất hợp với monorepo hoặc các nhóm đã chuẩn hóa pnpm.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn vẫn là lựa chọn quen thuộc trong nhiều codebase JavaScript, nên con đường này phù hợp khi tooling và thói quen của nhóm đã xoay quanh Yarn.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun gộp runtime và trình quản lý gói vào cùng một công cụ, và bản thân mcp-vertex cũng được build bằng bun, nên đây là con đường trực tiếp nhất khi máy đã có bun.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno có thể chạy trực tiếp gói npm, điều này hữu ích nếu bạn thích một runtime an toàn mặc định, có hỗ trợ TypeScript hạng nhất và tương thích npm.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## Chọn IDE của bạn

Các snippet dưới đây dùng preset standard qua bun. Hãy dán nguyên JSON vào tệp đích rồi để IDE của bạn đăng ký stdio server.

### VS Code

Tệp: .vscode/mcp.json
Phạm vi: project

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

Tệp: .cursor/mcp.json hoặc ~/.cursor/mcp.json
Phạm vi: project / global

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

Tệp: ~/.codeium/windsurf/mcp_config.json
Phạm vi: global

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

Tệp: .mcp.json hoặc qua claude mcp add
Phạm vi: project

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

Tệp: claude_desktop_config.json
Phạm vi: global

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

Tệp: ~/.gemini/antigravity-ide/mcp_config.json
Phạm vi: global

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

Tệp: settings.json
Phạm vi: global

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

## Chọn một preset

Preset là cộng dồn. Hãy bắt đầu với tập nhỏ nhất, rồi chỉ mở rộng bề mặt plugin khi workflow của bạn thực sự cần thêm.

### minimal

Cách dùng khuyến nghị: định hướng chỉ đọc và smoke test cho CI.
Kích thước: 2 plugin.

- git
- search

### standard

Cách dùng khuyến nghị: làm việc single-agent với memory, docs, hỗ trợ lint, kiểu và dependency.
Kích thước: 7 plugin.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

Cách dùng khuyến nghị: phối hợp multi-agent với lock, notification, log và close marker. Audit vẫn là opt-in và nên được nạp riêng sau khi một vòng làm việc kết thúc.
Kích thước: 13 plugin.

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

Cách dùng khuyến nghị: preset swarm cộng thêm các tích hợp host-only như web-fetch và issues khi host của bạn có hỗ trợ chúng.
Kích thước: 15 plugin.

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

## Kiểm tra

Sau khi cấu hình đã vào đúng chỗ, hãy chạy self-check bằng chính trình quản lý gói mà bạn đã dùng để cài. Nếu không dùng bun, hãy thay `bunx` bằng `npx`, `pnpm dlx`, `yarn dlx` hoặc `deno run -A npm:`.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

Hãy dùng `--exclude-plugins=` khi bạn muốn bớt một plugin khỏi preset mà không cần fork preset đó, ví dụ giữ nguyên nền tảng swarm nhưng bỏ notification trong một phiên single-agent.

## Câu hỏi thường gặp

### Vì sao `deno run -A npm:@mcp-vertex/core` khởi động chậm?

Deno sẽ resolve và verify gói npm ở lần dùng đầu tiên. Những lần sau nó tái sử dụng cache trong `~/.cache/deno`, nhưng với các lần khởi chạy lặp lại trên máy local thì bun hoặc npx vẫn nhanh hơn.

### IDE của tôi không có trong danh sách. Giờ làm sao?

Bất kỳ IDE nào chấp nhận stdio MCP server đều có thể chạy cùng server đó. Hãy bắt đầu từ JSON của VS Code, đổi đường dẫn tệp cho khớp IDE của bạn, rồi giữ nguyên command và args.

### Tôi có thể chạy nhiều preset cùng lúc không?

Không. Mỗi instance của server chỉ resolve một preset tại một thời điểm. Nếu các project khác nhau cần các tập plugin khác nhau, hãy đặt một mcp-vertex.config.json riêng trong từng project và để loader resolve theo từng workspace.