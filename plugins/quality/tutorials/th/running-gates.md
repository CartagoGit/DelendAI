---
title: รัน quality gates สำหรับทุกภาษา
plugin: quality
audience: เอเจนต์ที่ต้องการตรวจสอบสถานะโครงการ
order: 1
lang: th
---

# รัน quality gates สำหรับทุกภาษา

ปลั๊กอิน `quality` **ไม่ขึ้นกับภาษา** ตามการออกแบบ: มันเรียกใช้คำสั่งใดก็ตาม
ที่ `mcp-vertex.config.json` ระบุและรายงานรหัสออก บทเรียนนี้แสดงแหล่ง
ที่มาของ scope สามแหล่ง (ตามลำดับความสำคัญ) วิธีรัน scope หนึ่ง และ
วิธียกเลิกกระบวนการที่ไม่สามารถควบคุมได้

## 0. โมเดลความคิด

**Scope** คือรายการคำสั่งที่มีชื่อ ปลั๊กอินรันคำสั่งทุกตัวใน scope ตามลำดับ
จับ stdout/stderr และส่งคืนรายงานที่มีโครงสร้าง
`{ ok, results: [{ command, ok, code, tail }] }` ฟิลด์ `ok` คือสำหรับ
scope ทั้งหมด — หากคำสั่งใดล้มเหลว scope ไม่ ok

```
┌─ plugin options.scopes (ความสำคัญสูงสุด)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ scripts package.json ที่ตรวจพบ → "all" (lint, typecheck, test, build)
```

## 1. แสดงรายการ scope ที่มีอยู่ (อ่านอย่างเดียว)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

ตัวอย่างการตอบสนอง (ตัดทอน):

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. รัน scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

การตอบสนองเป็นรายคำสั่ง:

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

อ่าน `results[N].tail` สำหรับบริบทความล้มเหลว `tail` คือ 20 บรรทัดที่
ไม่ว่างล่าสุด (จำกัดที่ 64 KiB ของเอาต์พุตทั้งหมด) — เพียงพอสำหรับการ
แก้ไขข้อบกพร่องโดยไม่ทำให้ context ของเอเจนต์ล้น

## 3. ยกเลิกกระบวนการที่ไม่สามารถควบคุมได้

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

ส่ง `SIGKILL` ไปยังกลุ่มกระบวนการของทุกการรันที่กำลังดำเนินอยู่
ส่ง `{ "pid": <number> }` เพื่อยกเลิกหนึ่งรายการ การยกเลิกไม่บล็อก:
`results` ของการเรียกครั้งถัดไปจะสะท้อน kill

## 4. ทำให้ไม่ขึ้นกับภาษา

Core รันสิ่งที่ config ของคุณบอก ตัวอย่างสำหรับโครงการหลายภาษา
(TypeScript + Python):

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` จะรัน **คำสั่งทั้งสี่** ใน scope `typecheck` / `test`
โดยไม่คำนึงถึงภาษา Exit 0 = ผ่าน; ไม่ใช่ศูนย์ = ล้มเหลว (ไม่ว่า
binary ใดจะส่งออก)

## 5. เสริมความแข็งแกร่งด้วยนโยบายคำสั่ง (M13)

`run_quality` **ดำเนินการ** สิ่งที่ config ของ host บอก เพื่อจำกัด
ไบนารีที่สามารถรันได้เมื่อเอเจนต์ที่ไม่น่าเชื่อถือเรียกใช้เครื่องมือ
ใช้ `commandPolicy`:

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

คำสั่งที่ถูกบล็อกจะถูกรายงานด้วย `code: 126` และเหตุผล ("blocked by
command policy") และ**ไม่เคยถูกเรียกใช้** `deny` มีผลเหนือกว่า `allow`;
`allow` ว่างเปล่าหมายความว่า "ไบนารีใดที่ไม่ถูกปฏิเสธ"

## ข้อผิดพลาดที่พบบ่อย

- **`run_quality` ไม่แทนที่ `bun run validate`**: script `validate` ของ
  core รันการตรวจสอบสี่รายการโดยตรง `run_quality` สำหรับการรัน
  **เฉพาะกิจ** และการตรวจสอบตาม scope จากเอเจนต์ ทั้งสองใช้ได้;
  พวกมันไม่ติดต่อกัน
- **คำสั่งที่ใช้เวลานานซึ่งเกินเวลา timeout** ถูก kill ด้วย `code: 124`
  และ `timedOut: true` Timeout เริ่มต้นคือ 600 000 ms (10 นาที)
  แทนที่ต่อ runner หากจำเป็น
- **การ polling "เสร็จหรือยัง?"**: อย่าทำ `run_quality` เป็น synchronous
  หากคุณต้องการทราบเกี่ยวกับ scope ที่ยาว ใช้ `quality_cancel` พร้อม
  `pid` จาก `activeRunPids` (ผ่าน metrics หรือการเรียกเครื่องมือ
  ติดตามผล)

## ขั้นตอนถัดไป

- [Quality gates หลายภาษา (p107)](../../p107-multilang-quality-gates.md)
- [Trust boundary & นโยบายคำสั่ง (M13)](../../p107-multilang-quality-gates.md#5-no-objetivos)
