---
title: इंस्टॉल और चलाएँ
description: mcp-vertex इंस्टॉल करें, इसे अपने IDE से जोड़ें, एक प्रीसेट चुनें, और काम शुरू करने से पहले सर्वर सत्यापित करें।
order: 1
navLabel: इंस्टॉल
---

# इंस्टॉल और चलाएँ

mcp-vertex को अपने workflow में जोड़ें, अपने MCP client को binary की ओर इंगित करें, और पहली session से पहले resolved plugin set को verify करें।

## अपना package manager चुनें

नीचे दिए गए सभी package manager वही published package चलाते हैं। वही चुनें जिसे आपकी team पहले से इस्तेमाल करती है, और commands को ठीक वैसा ही रखें।

### npm

Node Package Manager, Node.js के साथ आता है, इसलिए जब आपको machines और CI runners के बीच सबसे व्यापक compatibility चाहिए तब यह सबसे सुरक्षित universal default है। 

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm तेज है, disk-efficient है, और dependency resolution में सख्त है, इसलिए यह monorepo या उन teams के लिए मजबूत विकल्प है जो पहले से pnpm standardize कर चुकी हैं।

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn अभी भी कई JavaScript codebase में एक परिचित विकल्प है, इसलिए यह रास्ता तब अच्छा बैठता है जब आपकी tooling और team habits पहले से Yarn के आसपास बनी हों।

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun runtime और package manager को एक ही tool में जोड़ता है, और mcp-vertex खुद bun से build होता है, इसलिए अगर machine पर bun पहले से है तो यह सबसे सीधा रास्ता है।

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno npm package को सीधे चला सकता है, जो तब उपयोगी है जब आप secure-by-default runtime, first-class TypeScript support, और npm compatibility चाहते हैं।

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## अपना IDE चुनें

नीचे दिए गए snippets bun पर standard preset का उपयोग करते हैं। JSON को target file में ज्यों का त्यों paste करें, फिर अपने IDE को stdio server register करने दें।

### VS Code

फ़ाइल: .vscode/mcp.json
स्कोप: project

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

फ़ाइल: .cursor/mcp.json या ~/.cursor/mcp.json
स्कोप: project / global

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

फ़ाइल: ~/.codeium/windsurf/mcp_config.json
स्कोप: global

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

फ़ाइल: .mcp.json या claude mcp add के जरिए
स्कोप: project

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

फ़ाइल: claude_desktop_config.json
स्कोप: global

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

फ़ाइल: ~/.gemini/antigravity-ide/mcp_config.json
स्कोप: global

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

फ़ाइल: settings.json
स्कोप: global

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

## एक preset चुनें

Preset additive होते हैं। सबसे छोटे set से शुरू करें, और plugin surface तभी बढ़ाएँ जब आपका workflow सचमुच उसकी माँग करे।

### minimal

अनुशंसित उपयोग: read-only orientation और CI smoke tests।
आकार: 2 plugins.

- git
- search

### standard

अनुशंसित उपयोग: memory, docs, lint, type, और dependency help के साथ single-agent काम।
आकार: 7 plugins.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

अनुशंसित उपयोग: locks, notifications, logs, और close markers के साथ multi-agent coordination। Audit अभी भी opt-in है और round खत्म होने पर अलग से load किया जाना चाहिए।
आकार: 13 plugins.

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

अनुशंसित उपयोग: swarm preset के साथ web-fetch और issues जैसी host-only integrations, जब host उन्हें expose करता हो।
आकार: 15 plugins.

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

## Verify

Config लग जाने के बाद उसी package manager से self-check चलाएँ जिसे आपने install के लिए इस्तेमाल किया था। अगर आपने bun नहीं चुना है, तो `bunx` को `npx`, `pnpm dlx`, `yarn dlx`, या `deno run -A npm:` से बदल दें।

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

`--exclude-plugins=` तब इस्तेमाल करें जब आप किसी preset से एक plugin घटाना चाहते हों, बिना preset को fork किए। उदाहरण के लिए swarm baseline रखें, लेकिन single-agent session में notification हटा दें।

## FAQ

### `deno run -A npm:@mcp-vertex/core` धीरे क्यों शुरू होता है?

Deno पहली बार चलने पर npm package को resolve और verify करता है। बाद के run `~/.cache/deno` में cache का reuse करते हैं, लेकिन बार-बार local launch के लिए bun या npx अभी भी तेज रहते हैं।

### मेरा IDE सूची में नहीं है। अब क्या?

जो भी IDE stdio MCP server स्वीकार करता है, वह वही server चला सकता है। VS Code JSON से शुरू करें, file path को अपने IDE की अपेक्षा के अनुसार बदलें, और वही command plus args रखें।

### क्या मैं एक साथ कई preset चला सकता हूँ?

नहीं। एक server instance एक समय में केवल एक preset resolve करता है। अगर अलग-अलग project को अलग plugin set चाहिए, तो हर project में अलग mcp-vertex.config.json रखें और loader को workspace के हिसाब से resolve करने दें।