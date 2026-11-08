---
title: ติดตั้งและรัน
description: ติดตั้ง delendai, เชื่อมเข้ากับ IDE ของคุณ, เลือกพรีเซ็ต และตรวจสอบเซิร์ฟเวอร์ก่อนเริ่มทำงาน
order: 1
navLabel: ติดตั้ง
---

# ติดตั้งและรัน

เพิ่ม delendai เข้าใน workflow ของคุณ ชี้ client MCP ไปยัง binary แล้วตรวจสอบชุดปลั๊กอินที่ถูก resolve ก่อนเริ่ม session แรก

## เลือกตัวจัดการแพ็กเกจ

ตัวจัดการแพ็กเกจทั้งหมดด้านล่างรันแพ็กเกจที่เผยแพร่ตัวเดียวกัน เลือกตัวที่ทีมของคุณใช้อยู่แล้ว และคงคำสั่งไว้ตามนี้ทุกตัวอักษร

### npm

Node Package Manager มากับ Node.js อยู่แล้ว จึงเป็นค่าเริ่มต้นแบบสากลที่ปลอดภัยที่สุดเมื่อคุณต้องการความเข้ากันได้กว้างที่สุดระหว่างเครื่องและ runner ของ CI

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

pnpm เร็ว ประหยัดดิสก์ และเข้มงวดกับการ resolve dependency จึงเหมาะกับ monorepo หรือทีมที่ทำ pnpm เป็นมาตรฐานอยู่แล้ว

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

Yarn ยังเป็นทางเลือกที่คุ้นเคยในหลาย codebase ของ JavaScript ดังนั้นเส้นทางนี้จึงเหมาะเมื่อ tooling และความคุ้นมือของทีมสร้างอยู่รอบ ๆ Yarn แล้ว

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

bun รวม runtime และตัวจัดการแพ็กเกจไว้ในเครื่องมือเดียว และตัว delendai เองก็ถูก build ด้วย bun ดังนั้นนี่จึงเป็นเส้นทางที่ตรงที่สุดเมื่อเครื่องมี bun อยู่แล้ว

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

Deno สามารถรันแพ็กเกจ npm ได้โดยตรง ซึ่งมีประโยชน์ถ้าคุณชอบ runtime ที่ปลอดภัยโดยปริยาย รองรับ TypeScript แบบเต็ม และเข้ากันได้กับ npm

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## เลือก IDE ของคุณ

snippet ด้านล่างใช้พรีเซ็ต solo ผ่าน bun วาง JSON ลงในไฟล์ปลายทางตามเดิม แล้วให้ IDE ของคุณลงทะเบียน stdio server เอง

### VS Code

ไฟล์: .vscode/mcp.json
ขอบเขต: project

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

ไฟล์: .cursor/mcp.json หรือ ~/.cursor/mcp.json
ขอบเขต: project / global

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

ไฟล์: ~/.codeium/windsurf/mcp_config.json
ขอบเขต: global

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

ไฟล์: .mcp.json หรือผ่าน claude mcp add
ขอบเขต: project

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

ไฟล์: claude_desktop_config.json
ขอบเขต: global

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

ไฟล์: ~/.gemini/antigravity-ide/mcp_config.json
ขอบเขต: global

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

ไฟล์: settings.json
ขอบเขต: global

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

## เลือกพรีเซ็ต

พรีเซ็ตเป็นแบบบวกเพิ่ม เริ่มจากชุดที่เล็กที่สุดก่อน แล้วค่อยขยายพื้นผิวของปลั๊กอินเมื่อ workflow ของคุณต้องการจริง ๆ

### minimal

การใช้งานที่แนะนำ: การวางตำแหน่งแบบอ่านอย่างเดียวและ smoke test ของ CI
ขนาด: 2 ปลั๊กอิน · 42 เครื่องมือ · ~11805 โทเค็นตอนเริ่มต้น

- git
- search

### solo

การใช้งานที่แนะนำ: นักพัฒนาหนึ่งคนกับเอเจนต์หนึ่งตัวในงานประจำวัน เป็นค่าเริ่มต้นของ `init`
ขนาด: 10 ปลั๊กอิน · 79 เครื่องมือ · ~19037 โทเค็นตอนเริ่มต้น

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

การใช้งานที่แนะนำ: ทีมที่ทำงานผ่าน pull request พร้อมแนวปฏิบัติด้าน commit และการทดสอบ
ขนาด: 18 ปลั๊กอิน · 116 เครื่องมือ · ~25446 โทเค็นตอนเริ่มต้น

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

การใช้งานที่แนะนำ: เอเจนต์หลายตัวที่ใช้ checkout ร่วมกัน พร้อมข้อเสนอ บันทึก และตัวบ่งชี้การปิดงาน
ขนาด: 19 ปลั๊กอิน · 125 เครื่องมือ · ~26802 โทเค็นตอนเริ่มต้น

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

การใช้งานที่แนะนำ: การรีวิวและตรวจสอบแบบอ่านอย่างเดียว
ขนาด: 15 ปลั๊กอิน · 89 เครื่องมือ · ~21955 โทเค็นตอนเริ่มต้น

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

การใช้งานที่แนะนำ: เอกสารและเว็บไซต์
ขนาด: 8 ปลั๊กอิน · 61 เครื่องมือ · ~15696 โทเค็นตอนเริ่มต้น

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

การใช้งานที่แนะนำ: การวินิจฉัยด้วยปลั๊กอินที่เผยแพร่ทั้งหมด รวมถึงตัวที่ใช้เครือข่ายหรือข้อมูลรับรอง
ขนาด: 58 ปลั๊กอิน · 236 เครื่องมือ · ~59122 โทเค็นตอนเริ่มต้น

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

## ตรวจสอบ

เมื่อ config อยู่ในที่แล้ว ให้รัน self-check ด้วยตัวจัดการแพ็กเกจตัวเดียวกับที่ใช้ตอนติดตั้ง หากคุณไม่ได้ใช้ bun ให้แทนที่ `bunx` ด้วย `npx`, `pnpm dlx`, `yarn dlx` หรือ `deno run -A npm:`

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

ใช้ `--exclude-plugins=` เมื่อคุณต้องการลบปลั๊กอินออกจากพรีเซ็ตโดยไม่ต้อง fork พรีเซ็ต เช่น ต้องการเก็บฐานแบบ swarm ไว้ แต่ตัด notification ออกใน session แบบ single-agent

## คำถามที่พบบ่อย

### ทำไม `deno run -A npm:@delendai/cli` จึงเริ่มช้า?

Deno จะ resolve และ verify แพ็กเกจ npm ตอนใช้งานครั้งแรก การรันครั้งถัดไปจะใช้ cache ใต้ `~/.cache/deno` ซ้ำ แต่ถ้าคุณเปิดใช้งานซ้ำบนเครื่องเดิมบ่อย ๆ bun หรือ npx ก็ยังเริ่มได้เร็วกว่า

### IDE ของฉันไม่มีในรายการ ต้องทำอย่างไร?

IDE ใดก็ตามที่รับ stdio MCP server ได้ ก็สามารถรัน server ตัวเดียวกันนี้ได้ เริ่มจาก JSON ของ VS Code เปลี่ยนเฉพาะ path ของไฟล์ให้เป็นสิ่งที่ IDE ของคุณคาดหวัง แล้วคง command และ args เดิมไว้

### ฉันสามารถรันหลายพรีเซ็ตพร้อมกันได้ไหม?

ไม่ได้ หนึ่ง instance ของ server จะ resolve ได้ทีละหนึ่ง preset เท่านั้น ถ้าแต่ละ project ต้องใช้ชุดปลั๊กอินต่างกัน ให้ใส่ delendai.config.json แยกไว้ในแต่ละ project แล้วให้ loader resolve ตาม workspace นั้น