---
title: किसी भी भाषा के लिए quality gates चलाना
plugin: quality
audience: एजेंट जिसे प्रोजेक्ट की स्थिति मान्य करनी है
order: 1
lang: hi
---

# किसी भी भाषा के लिए quality gates चलाना

`quality` प्लगइन डिज़ाइन से **भाषा-अज्ञेयवादी** है: यह जो भी कमांड
आपका `mcp-vertex.config.json` निर्दिष्ट करे उसे चलाता है और exit code
रिपोर्ट करता है। यह ट्यूटोरियल scopes के तीन स्रोत (प्राथमिकता क्रम में),
एक को कैसे चलाएं, और एक बेकाबू प्रक्रिया को कैसे रद्द करें दिखाता है।

## 0. मानसिक मॉडल

एक **scope** कमांड की एक नामित सूची है। प्लगइन scope में हर कमांड क्रम
में चलाता है, stdout/stderr कैप्चर करता है, और एक संरचित
`{ ok, results: [{ command, ok, code, tail }] }` रिपोर्ट लौटाता है।
`ok` field पूरे scope के लिए है — यदि कोई कमांड विफल होती है, scope
ok नहीं है।

```
┌─ plugin options.scopes (उच्चतम प्राथमिकता)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ detected package.json scripts → "all" (lint, typecheck, test, build)
```

## 1. उपलब्ध scopes सूचीबद्ध करें (read-only)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

उदाहरण प्रतिक्रिया (संक्षिप्त):

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

## 2. एक scope चलाएं

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

प्रतिक्रिया प्रति-कमांड है:

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

विफलता संदर्भ के लिए `results[N].tail` पढ़ें। `tail` अंतिम 20 non-empty
lines हैं (कुल 64 KiB output सीमित) — एजेंट के context को overflow
किए बिना debug के लिए पर्याप्त।

## 3. बेकाबू प्रक्रिया रद्द करें

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

हर in-flight run के process group को `SIGKILL` भेजता है। एक को रद्द
करने के लिए `{ "pid": <number> }` पास करें। रद्दीकरण non-blocking है:
अगले call का `results` kill को reflect करेगा।

## 4. भाषा-अज्ञेयवादी बनाएं

Core जो आपकी config कहती है वही चलाता है। बहुभाषी प्रोजेक्ट
(TypeScript + Python) के लिए उदाहरण:

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

`run_quality` `typecheck` / `test` scopes में **सभी चार कमांड** चलाएगा,
चाहे भाषा कोई भी हो। Exit 0 = पास; non-zero = विफल (चाहे किसी भी
binary ने emit किया हो)।

## 5. एक command policy से मजबूत करें (M13)

`run_quality` host config जो कहती है वही **execute** करता है। जब
कम-विश्वसनीय एजेंट tool को call करे तो कौन से binaries चल सकते हैं
इसे प्रतिबंधित करने के लिए `commandPolicy` उपयोग करें:

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

एक blocked कमांड `code: 126` और एक कारण ("blocked by command policy")
के साथ रिपोर्ट की जाती है और **कभी नहीं चलाई जाती**। `deny` `allow`
पर हावी होता है; एक खाली `allow` का मतलब "कोई भी binary जो deny नहीं
की गई"।

## सामान्य त्रुटियां

- **`run_quality` `bun run validate` की जगह नहीं लेता**: core का
  `validate` script सीधे चार checks चलाता है। `run_quality` **ad-hoc**
  runs और एजेंट से per-scope introspection के लिए है। दोनों मान्य हैं;
  वे एक-दूसरे से communicate नहीं करते।
- **एक long-running कमांड जो timeout exceed करे** `code: 124` और
  `timedOut: true` के साथ kill की जाती है। डिफ़ॉल्ट timeout 600 000 ms
  (10 मिनट) है। यदि जरूरी हो तो per-runner override करें।
- **"क्या यह हो गया?" के लिए polling**: न करें। `run_quality` synchronous
  है। यदि लंबे scopes के बारे में जानना हो, तो `activeRunPids` से
  `pid` के साथ `quality_cancel` उपयोग करें।

## अगला कदम

- [बहु-भाषा quality gates (l107)](../../l107-multilang-quality-gates.md)
- [Trust boundary & command policy (M13)](../../l107-multilang-quality-gates.md#5-no-objetivos)
