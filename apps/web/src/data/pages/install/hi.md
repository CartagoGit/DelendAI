---
title: इंस्टॉल और चलाएँ
description: delendai इंस्टॉल करें, इसे अपने IDE से जोड़ें, एक प्रीसेट चुनें, और काम शुरू करने से पहले सर्वर सत्यापित करें।
order: 1
navLabel: इंस्टॉल
---

# इंस्टॉल और चलाएँ

delendai को अपने workflow में जोड़ें, अपने MCP client को binary की ओर इंगित करें, और पहली session से पहले resolved plugin set को verify करें।

## अपना package manager चुनें

नीचे दिए गए सभी package manager वही published package चलाते हैं। वही चुनें जिसे आपकी team पहले से इस्तेमाल करती है, और commands को ठीक वैसा ही रखें।

### npm

Node Package Manager, Node.js के साथ आता है, इसलिए जब आपको machines और CI runners के बीच सबसे व्यापक compatibility चाहिए तब यह सबसे सुरक्षित universal default है। 

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm तेज है, disk-efficient है, और dependency resolution में सख्त है, इसलिए यह monorepo या उन teams के लिए मजबूत विकल्प है जो पहले से pnpm standardize कर चुकी हैं।

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn अभी भी कई JavaScript codebase में एक परिचित विकल्प है, इसलिए यह रास्ता तब अच्छा बैठता है जब आपकी tooling और team habits पहले से Yarn के आसपास बनी हों।

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun runtime और package manager को एक ही tool में जोड़ता है, और delendai खुद bun से build होता है, इसलिए अगर machine पर bun पहले से है तो यह सबसे सीधा रास्ता है।

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno npm package को सीधे चला सकता है, जो तब उपयोगी है जब आप secure-by-default runtime, first-class TypeScript support, और npm compatibility चाहते हैं।

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## अपना IDE चुनें

नीचे दिए गए snippets bun पर solo preset का उपयोग करते हैं। JSON को target file में ज्यों का त्यों paste करें, फिर अपने IDE को stdio server register करने दें।

### VS Code

फ़ाइल: .vscode/mcp.json
स्कोप: project

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

फ़ाइल: .cursor/mcp.json या ~/.cursor/mcp.json
स्कोप: project / global

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

फ़ाइल: ~/.codeium/windsurf/mcp_config.json
स्कोप: global

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

फ़ाइल: .mcp.json या claude mcp add के जरिए
स्कोप: project

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

फ़ाइल: claude_desktop_config.json
स्कोप: global

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

फ़ाइल: ~/.gemini/antigravity-ide/mcp_config.json
स्कोप: global

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

फ़ाइल: settings.json
स्कोप: global

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

## एक preset चुनें

Preset additive होते हैं। सबसे छोटे set से शुरू करें, और plugin surface तभी बढ़ाएँ जब आपका workflow सचमुच उसकी माँग करे।

### minimal

अनुशंसित उपयोग: केवल-पढ़ने वाला ओरिएंटेशन और CI smoke tests।
आकार: 2 प्लगइन · 42 टूल · ~11805 शुरुआती टोकन

- git
- search

### solo

अनुशंसित उपयोग: रोज़मर्रा की कोडिंग में एक डेवलपर और एक एजेंट; `init` का डिफ़ॉल्ट।
आकार: 10 प्लगइन · 79 टूल · ~19037 शुरुआती टोकन

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

अनुशंसित उपयोग: pull requests के ज़रिए काम करने वाली टीम, commit और test conventions के साथ।
आकार: 18 प्लगइन · 116 टूल · ~25446 शुरुआती टोकन

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

अनुशंसित उपयोग: एक checkout साझा करने वाले कई एजेंट, proposals, logs और close markers के साथ।
आकार: 19 प्लगइन · 125 टूल · ~26802 शुरुआती टोकन

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

अनुशंसित उपयोग: केवल-पढ़ने वाली समीक्षा और ऑडिट।
आकार: 15 प्लगइन · 89 टूल · ~21955 शुरुआती टोकन

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

अनुशंसित उपयोग: दस्तावेज़ और वेब साइटें।
आकार: 8 प्लगइन · 61 टूल · ~15696 शुरुआती टोकन

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

अनुशंसित उपयोग: सभी प्रकाशित प्लगइन के साथ डायग्नोस्टिक्स, नेटवर्क या क्रेडेंशियल वाले प्लगइन सहित।
आकार: 58 प्लगइन · 236 टूल · ~59122 शुरुआती टोकन

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

## Verify

Config लग जाने के बाद उसी package manager से self-check चलाएँ जिसे आपने install के लिए इस्तेमाल किया था। अगर आपने bun नहीं चुना है, तो `bunx` को `npx`, `pnpm dlx`, `yarn dlx`, या `deno run -A npm:` से बदल दें।

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

`--exclude-plugins=` तब इस्तेमाल करें जब आप किसी preset से एक plugin घटाना चाहते हों, बिना preset को fork किए। उदाहरण के लिए swarm baseline रखें, लेकिन single-agent session में notification हटा दें।

## FAQ

### `deno run -A npm:@delendai/cli` धीरे क्यों शुरू होता है?

Deno पहली बार चलने पर npm package को resolve और verify करता है। बाद के run `~/.cache/deno` में cache का reuse करते हैं, लेकिन बार-बार local launch के लिए bun या npx अभी भी तेज रहते हैं।

### मेरा IDE सूची में नहीं है। अब क्या?

जो भी IDE stdio MCP server स्वीकार करता है, वह वही server चला सकता है। VS Code JSON से शुरू करें, file path को अपने IDE की अपेक्षा के अनुसार बदलें, और वही command plus args रखें।

### क्या मैं एक साथ कई preset चला सकता हूँ?

नहीं। एक server instance एक समय में केवल एक preset resolve करता है। अगर अलग-अलग project को अलग plugin set चाहिए, तो हर project में अलग delendai.config.json रखें और loader को workspace के हिसाब से resolve करने दें।