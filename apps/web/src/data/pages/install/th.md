---
title: ติดตั้งและรัน
description: ติดตั้ง mcp-vertex, เชื่อมเข้ากับ IDE ของคุณ, เลือกพรีเซ็ต และตรวจสอบเซิร์ฟเวอร์ก่อนเริ่มทำงาน
order: 1
navLabel: ติดตั้ง
---

# ติดตั้งและรัน

เพิ่ม mcp-vertex เข้าใน workflow ของคุณ ชี้ client MCP ไปยัง binary แล้วตรวจสอบชุดปลั๊กอินที่ถูก resolve ก่อนเริ่ม session แรก

## เลือกตัวจัดการแพ็กเกจ

ตัวจัดการแพ็กเกจทั้งหมดด้านล่างรันแพ็กเกจที่เผยแพร่ตัวเดียวกัน เลือกตัวที่ทีมของคุณใช้อยู่แล้ว และคงคำสั่งไว้ตามนี้ทุกตัวอักษร

### npm

Node Package Manager มากับ Node.js อยู่แล้ว จึงเป็นค่าเริ่มต้นแบบสากลที่ปลอดภัยที่สุดเมื่อคุณต้องการความเข้ากันได้กว้างที่สุดระหว่างเครื่องและ runner ของ CI

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

pnpm เร็ว ประหยัดดิสก์ และเข้มงวดกับการ resolve dependency จึงเหมาะกับ monorepo หรือทีมที่ทำ pnpm เป็นมาตรฐานอยู่แล้ว

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

Yarn ยังเป็นทางเลือกที่คุ้นเคยในหลาย codebase ของ JavaScript ดังนั้นเส้นทางนี้จึงเหมาะเมื่อ tooling และความคุ้นมือของทีมสร้างอยู่รอบ ๆ Yarn แล้ว

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

bun รวม runtime และตัวจัดการแพ็กเกจไว้ในเครื่องมือเดียว และตัว mcp-vertex เองก็ถูก build ด้วย bun ดังนั้นนี่จึงเป็นเส้นทางที่ตรงที่สุดเมื่อเครื่องมี bun อยู่แล้ว

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

Deno สามารถรันแพ็กเกจ npm ได้โดยตรง ซึ่งมีประโยชน์ถ้าคุณชอบ runtime ที่ปลอดภัยโดยปริยาย รองรับ TypeScript แบบเต็ม และเข้ากันได้กับ npm

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## เลือก IDE ของคุณ

snippet ด้านล่างใช้พรีเซ็ต standard ผ่าน bun วาง JSON ลงในไฟล์ปลายทางตามเดิม แล้วให้ IDE ของคุณลงทะเบียน stdio server เอง

### VS Code

ไฟล์: .vscode/mcp.json
ขอบเขต: project

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

ไฟล์: .cursor/mcp.json หรือ ~/.cursor/mcp.json
ขอบเขต: project / global

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

ไฟล์: ~/.codeium/windsurf/mcp_config.json
ขอบเขต: global

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

ไฟล์: .mcp.json หรือผ่าน claude mcp add
ขอบเขต: project

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

ไฟล์: claude_desktop_config.json
ขอบเขต: global

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

ไฟล์: ~/.gemini/antigravity-ide/mcp_config.json
ขอบเขต: global

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

ไฟล์: settings.json
ขอบเขต: global

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

## เลือกพรีเซ็ต

พรีเซ็ตเป็นแบบบวกเพิ่ม เริ่มจากชุดที่เล็กที่สุดก่อน แล้วค่อยขยายพื้นผิวของปลั๊กอินเมื่อ workflow ของคุณต้องการจริง ๆ

### minimal

การใช้งานที่แนะนำ: การวางตำแหน่งแบบอ่านอย่างเดียวและ smoke test ของ CI
ขนาด: 2 ปลั๊กอิน

- git
- search

### standard

การใช้งานที่แนะนำ: งานแบบ single-agent พร้อม memory, docs, ความช่วยเหลือด้าน lint, type และ dependency
ขนาด: 7 ปลั๊กอิน

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

การใช้งานที่แนะนำ: การประสานงานแบบ multi-agent พร้อม lock, notification, log และ close marker โดย audit ยังเป็น opt-in และควรโหลดแยกหลังจบรอบการทำงาน
ขนาด: 13 ปลั๊กอิน

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

การใช้งานที่แนะนำ: พรีเซ็ต swarm พร้อม integration แบบ host-only เช่น web-fetch และ issues เมื่อ host ของคุณรองรับ
ขนาด: 15 ปลั๊กอิน

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

## ตรวจสอบ

เมื่อ config อยู่ในที่แล้ว ให้รัน self-check ด้วยตัวจัดการแพ็กเกจตัวเดียวกับที่ใช้ตอนติดตั้ง หากคุณไม่ได้ใช้ bun ให้แทนที่ `bunx` ด้วย `npx`, `pnpm dlx`, `yarn dlx` หรือ `deno run -A npm:`

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

ใช้ `--exclude-plugins=` เมื่อคุณต้องการลบปลั๊กอินออกจากพรีเซ็ตโดยไม่ต้อง fork พรีเซ็ต เช่น ต้องการเก็บฐานแบบ swarm ไว้ แต่ตัด notification ออกใน session แบบ single-agent

## คำถามที่พบบ่อย

### ทำไม `deno run -A npm:@mcp-vertex/core` จึงเริ่มช้า?

Deno จะ resolve และ verify แพ็กเกจ npm ตอนใช้งานครั้งแรก การรันครั้งถัดไปจะใช้ cache ใต้ `~/.cache/deno` ซ้ำ แต่ถ้าคุณเปิดใช้งานซ้ำบนเครื่องเดิมบ่อย ๆ bun หรือ npx ก็ยังเริ่มได้เร็วกว่า

### IDE ของฉันไม่มีในรายการ ต้องทำอย่างไร?

IDE ใดก็ตามที่รับ stdio MCP server ได้ ก็สามารถรัน server ตัวเดียวกันนี้ได้ เริ่มจาก JSON ของ VS Code เปลี่ยนเฉพาะ path ของไฟล์ให้เป็นสิ่งที่ IDE ของคุณคาดหวัง แล้วคง command และ args เดิมไว้

### ฉันสามารถรันหลายพรีเซ็ตพร้อมกันได้ไหม?

ไม่ได้ หนึ่ง instance ของ server จะ resolve ได้ทีละหนึ่ง preset เท่านั้น ถ้าแต่ละ project ต้องใช้ชุดปลั๊กอินต่างกัน ให้ใส่ mcp-vertex.config.json แยกไว้ในแต่ละ project แล้วให้ loader resolve ตาม workspace นั้น