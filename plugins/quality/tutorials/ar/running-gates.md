---
title: تشغيل gates الجودة لأي لغة
plugin: quality
audience: عميل يحتاج إلى التحقق من حالة المشروع
order: 1
lang: ar
---

# تشغيل gates الجودة لأي لغة

إضافة `quality` **محايدة للغة** بالتصميم: تُشغِّل أي أمر يُحدِّده
`mcp-vertex.config.json` وتُرسل كود الخروج. يُوضح هذا الدليل المصادر
الثلاثة للنطاقات (بترتيب الأولوية)، وكيفية تشغيل نطاق، وكيفية إلغاء
عملية خارجة عن السيطرة.

## 0. النموذج الذهني

**النطاق** قائمة أوامر مُسمَّاة. تُشغِّل الإضافة كل أمر في النطاق
بالترتيب، وتلتقط stdout/stderr، وتُعيد تقريرًا مُهيكلًا
`{ ok, results: [{ command, ok, code, tail }] }`. حقل `ok` للنطاق
كله — إذا فشل أي أمر، فالنطاق ليس ok.

```
┌─ plugin options.scopes (أعلى أولوية)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ سكريبتات package.json المكتشفة → "all" (lint, typecheck, test, build)
```

## 1. إدراج النطاقات المتاحة (للقراءة فقط)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

مثال على الاستجابة (مختصر):

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

## 2. تشغيل نطاق

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

الاستجابة لكل أمر:

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

اقرأ `results[N].tail` لسياق الفشل. `tail` هو آخر 20 سطرًا غير فارغ
(بحد أقصى 64 KiB من الإخراج الكلي) — يكفي للتصحيح دون إغراق سياق
العميل.

## 3. إلغاء عملية خارجة عن السيطرة

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

يُرسل `SIGKILL` لمجموعة العمليات لكل تشغيل جارٍ. مرِّر
`{ "pid": <number> }` لإلغاء عملية واحدة. الإلغاء غير محجوب:
سيعكس `results` الاستدعاء التالي عملية الـ kill.

## 4. جعله محايدًا للغة

يُشغِّل النواة ما تقوله التهيئة. مثال لمشروع متعدد اللغات
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

سيُشغِّل `run_quality` **الأوامر الأربعة** في نطاقَي `typecheck` /
`test`، بغض النظر عن اللغة. الخروج 0 = نجاح؛ غير صفر = فشل (أيًا كان
الثنائي الذي أصدره).

## 5. التحصين بسياسة الأوامر (M13)

`run_quality` **يُشغِّل** ما تقوله تهيئة المضيف. لتقييد الثنائيات
التي يمكن تشغيلها حين يستدعي عميل أقل ثقةً الأداة، استخدم `commandPolicy`:

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

يُبلَّغ عن أمر محجوب بـ `code: 126` وسبب ("blocked by command policy")
ولا يُشغَّل **أبدًا**. `deny` يتقدم على `allow`؛ `allow` فارغ يعني
"أي ثنائي غير مرفوض".

## الأخطاء الشائعة

- **`run_quality` لا يُعوِّض `bun run validate`**: سكريبت `validate`
  للنواة يُشغِّل الفحوصات الأربعة مباشرةً. `run_quality` للتشغيلات
  **العرضية** والاستبطان لكل نطاق من عميل. كلاهما صالح ولا يتواصلان.
- **أمر طويل يتجاوز المهلة** يُقتَل بـ `code: 124` و`timedOut: true`.
  المهلة الافتراضية 600 000 ms (10 دقائق). تجاوز لكل runner إذا لزم.
- **الاستطلاع عن "هل انتهى؟"**: لا تفعله. `run_quality` متزامن.
  إذا احتجت لمعرفة النطاقات الطويلة، استخدم `quality_cancel` مع
  `pid` من `activeRunPids` (عبر المقاييس أو استدعاء أداة تالٍ).

## الخطوة التالية

- [gates الجودة متعددة اللغات (p107)](../../p107-multilang-quality-gates.md)
- [حدود الثقة وسياسة الأوامر (M13)](../../p107-multilang-quality-gates.md#5-no-objetivos)
