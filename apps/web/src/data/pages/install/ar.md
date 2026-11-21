---
title: التثبيت والتشغيل
description: ثبّت delendai، وصِله ببيئة IDE الخاصة بك، واختر إعدادًا مسبقًا، ثم تحقّق من الخادم قبل بدء العمل.
order: 1
navLabel: التثبيت
---

# التثبيت والتشغيل

أضف delendai إلى سير العمل لديك، ووجّه عميل MCP إلى الملف التنفيذي، ثم تحقّق من مجموعة الإضافات المُحلولة قبل أول جلسة.

## اختر مدير الحزم

كل مديري الحزم أدناه يشغّلون الحزمة المنشورة نفسها. اختر ما تستخدمه فريقك بالفعل، واترك الأوامر كما هي تمامًا.

### npm

يأتي Node Package Manager مع Node.js، لذلك فهو الخيار الافتراضي العام الأكثر أمانًا عندما تحتاج إلى أوسع توافق ممكن بين الأجهزة وبيئات CI.

```bash
npx -y @delendai/cli init
npx -y @delendai/cli validate
```

### pnpm

يتميّز pnpm بالسرعة وكفاءة استخدام القرص والصرامة في حل التبعيات، لذلك يناسب monorepo أو الفرق التي اعتمدت pnpm بالفعل كمعيار.

```bash
pnpm dlx @delendai/cli init
pnpm dlx @delendai/cli validate
```

### yarn

لا يزال Yarn بديلًا مألوفًا في كثير من مشاريع JavaScript، لذا فهذا المسار مناسب عندما تكون أدوات الفريق وعاداته مبنية بالفعل حول Yarn.

```bash
yarn dlx @delendai/cli init
yarn dlx @delendai/cli validate
```

### bun

يجمع bun بين الـ runtime ومدير الحزم في أداة واحدة، كما أن delendai نفسه مبني باستخدام bun، لذلك فهو الطريق الأكثر مباشرة عندما يكون bun متاحًا على الجهاز.

```bash
bunx @delendai/cli init
bunx @delendai/cli validate
```

### deno

يمكن لـ Deno تشغيل حزمة npm مباشرة، وهذا مفيد إذا كنت تفضّل runtime آمنًا افتراضيًا مع دعم TypeScript من الدرجة الأولى وتوافق npm.

```bash
deno run -A npm:@delendai/cli init
deno run -A npm:@delendai/cli validate
```

## اختر بيئة IDE الخاصة بك

تستخدم المقاطع أدناه الإعداد المسبق solo عبر bun. الصق JSON كما هو في الملف المستهدف، ثم دع بيئة IDE تسجّل خادم stdio.

### VS Code

الملف: .vscode/mcp.json
النطاق: المشروع

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

الملف: .cursor/mcp.json أو ~/.cursor/mcp.json
النطاق: المشروع / عام

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

الملف: ~/.codeium/windsurf/mcp_config.json
النطاق: عام

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

الملف: .mcp.json أو عبر claude mcp add
النطاق: المشروع

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

الملف: claude_desktop_config.json
النطاق: عام

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

الملف: ~/.gemini/antigravity-ide/mcp_config.json
النطاق: عام

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

الملف: settings.json
النطاق: عام

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

## اختر إعدادًا مسبقًا

الإعدادات المسبقة تراكمية. ابدأ بأصغر مجموعة، ثم وسّع سطح الإضافات فقط عندما يحتاج سير عملك إلى ذلك فعلًا.

### minimal

الاستخدام الموصى به: التوجيه للقراءة فقط و smoke tests في CI.
الحجم: 2 إضافة · 42 أداة · ~11805 رمز عند البدء

- git
- search

### solo

الاستخدام الموصى به: مطوّر واحد ووكيل واحد في العمل اليومي؛ وهو الافتراضي في `init`.
الحجم: 10 إضافة · 79 أداة · ~19037 رمز عند البدء

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

الاستخدام الموصى به: فريق يعمل عبر pull requests مع اصطلاحات للـ commits والاختبارات.
الحجم: 18 إضافة · 116 أداة · ~25446 رمز عند البدء

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

الاستخدام الموصى به: عدة وكلاء يتشاركون checkout واحدًا، مع المقترحات والسجلات وعلامات الإغلاق.
الحجم: 19 إضافة · 125 أداة · ~26802 رمز عند البدء

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

الاستخدام الموصى به: مراجعات وتدقيقات للقراءة فقط.
الحجم: 15 إضافة · 89 أداة · ~21955 رمز عند البدء

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

الاستخدام الموصى به: التوثيق ومواقع الويب.
الحجم: 8 إضافة · 61 أداة · ~15696 رمز عند البدء

- git
- search
- memory
- docs
- i18n
- link-check
- web-fetch
- env

### everything

الاستخدام الموصى به: تشخيص بكل الإضافات المنشورة، بما فيها التي تستخدم الشبكة أو بيانات الاعتماد.
الحجم: 58 إضافة · 236 أداة · ~59122 رمز عند البدء

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

## التحقّق

بعد أن تصبح الإعدادات في مكانها، شغّل self-check باستخدام مدير الحزم نفسه الذي استخدمته أثناء التثبيت. استبدل `bunx` بـ `npx` أو `pnpm dlx` أو `yarn dlx` أو `deno run -A npm:` إذا كان ذلك هو المسار الذي اخترته.

```bash
bunx @delendai/cli validate
bunx @delendai/cli --preset=swarm --exclude-plugins=notification validate
```

استخدم `--exclude-plugins=` عندما تريد طرح إضافة من إعداد مسبق من دون تفرّعه، مثل الاحتفاظ بقاعدة swarm لكن إزالة notification في جلسة وكيل واحد.

## الأسئلة الشائعة

### لماذا يبدأ `deno run -A npm:@delendai/cli` ببطء؟

يقوم Deno بحل حزمة npm والتحقق منها عند أول استخدام. تعيد التشغيلات اللاحقة استخدام الذاكرة المخبأة تحت `~/.cache/deno`، لكن bun أو npx يظلان أسرع عند التكرار المحلي.

### بيئة IDE الخاصة بي غير موجودة في القائمة. ماذا أفعل؟

أي IDE يقبل خادم MCP عبر stdio يستطيع تشغيل الخادم نفسه. ابدأ من JSON الخاص بـ VS Code، ثم غيّر مسار الملف إلى ما تتوقعه بيئتك، مع الإبقاء على الأمر والوسائط نفسيهما.

### هل يمكنني تشغيل عدة إعدادات مسبقة في الوقت نفسه؟

لا. كل نسخة من الخادم تحل إعدادًا مسبقًا واحدًا فقط في كل مرة. إذا كانت المشاريع المختلفة تحتاج إلى مجموعات إضافات مختلفة، فضع ملف delendai.config.json مخصصًا داخل كل مشروع واترك الـ loader يحلّه لكل workspace.