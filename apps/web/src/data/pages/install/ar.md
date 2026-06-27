---
title: التثبيت والتشغيل
description: ثبّت mcp-vertex، وصِله ببيئة IDE الخاصة بك، واختر إعدادًا مسبقًا، ثم تحقّق من الخادم قبل بدء العمل.
order: 1
navLabel: التثبيت
---

# التثبيت والتشغيل

أضف mcp-vertex إلى سير العمل لديك، ووجّه عميل MCP إلى الملف التنفيذي، ثم تحقّق من مجموعة الإضافات المُحلولة قبل أول جلسة.

## اختر مدير الحزم

كل مديري الحزم أدناه يشغّلون الحزمة المنشورة نفسها. اختر ما تستخدمه فريقك بالفعل، واترك الأوامر كما هي تمامًا.

### npm

يأتي Node Package Manager مع Node.js، لذلك فهو الخيار الافتراضي العام الأكثر أمانًا عندما تحتاج إلى أوسع توافق ممكن بين الأجهزة وبيئات CI.

```bash
npx -y @mcp-vertex/core init
npx -y @mcp-vertex/core --check
```

### pnpm

يتميّز pnpm بالسرعة وكفاءة استخدام القرص والصرامة في حل التبعيات، لذلك يناسب monorepo أو الفرق التي اعتمدت pnpm بالفعل كمعيار.

```bash
pnpm dlx @mcp-vertex/core init
pnpm dlx @mcp-vertex/core --check
```

### yarn

لا يزال Yarn بديلًا مألوفًا في كثير من مشاريع JavaScript، لذا فهذا المسار مناسب عندما تكون أدوات الفريق وعاداته مبنية بالفعل حول Yarn.

```bash
yarn dlx @mcp-vertex/core init
yarn dlx @mcp-vertex/core --check
```

### bun

يجمع bun بين الـ runtime ومدير الحزم في أداة واحدة، كما أن mcp-vertex نفسه مبني باستخدام bun، لذلك فهو الطريق الأكثر مباشرة عندما يكون bun متاحًا على الجهاز.

```bash
bunx @mcp-vertex/core init
bunx @mcp-vertex/core --check
```

### deno

يمكن لـ Deno تشغيل حزمة npm مباشرة، وهذا مفيد إذا كنت تفضّل runtime آمنًا افتراضيًا مع دعم TypeScript من الدرجة الأولى وتوافق npm.

```bash
deno run -A npm:@mcp-vertex/core init
deno run -A npm:@mcp-vertex/core --check
```

## اختر بيئة IDE الخاصة بك

تستخدم المقاطع أدناه الإعداد المسبق standard عبر bun. الصق JSON كما هو في الملف المستهدف، ثم دع بيئة IDE تسجّل خادم stdio.

### VS Code

الملف: .vscode/mcp.json
النطاق: المشروع

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

الملف: .cursor/mcp.json أو ~/.cursor/mcp.json
النطاق: المشروع / عام

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

الملف: ~/.codeium/windsurf/mcp_config.json
النطاق: عام

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

الملف: .mcp.json أو عبر claude mcp add
النطاق: المشروع

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

الملف: claude_desktop_config.json
النطاق: عام

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

الملف: ~/.gemini/antigravity-ide/mcp_config.json
النطاق: عام

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

الملف: settings.json
النطاق: عام

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

## اختر إعدادًا مسبقًا

الإعدادات المسبقة تراكمية. ابدأ بأصغر مجموعة، ثم وسّع سطح الإضافات فقط عندما يحتاج سير عملك إلى ذلك فعلًا.

### minimal

الاستخدام الموصى به: التوجيه للقراءة فقط و smoke tests في CI.
الحجم: إضافتان.

- git
- search

### standard

الاستخدام الموصى به: عمل وكيل واحد مع memory و docs ومساعدة lint والأنواع والتبعيات.
الحجم: 7 إضافات.

- git
- search
- memory
- docs
- rules
- quality
- deps

### swarm

الاستخدام الموصى به: تنسيق متعدد الوكلاء مع الأقفال والإشعارات والسجلات وعلامات الإغلاق. يظل audit اختياريًا ويجب تحميله منفصلًا بعد انتهاء الجولة.
الحجم: 13 إضافة.

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

الاستخدام الموصى به: إعداد swarm مع تكاملات host-only مثل web-fetch و issues عندما يوفّرها المضيف.
الحجم: 15 إضافة.

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

## التحقّق

بعد أن تصبح الإعدادات في مكانها، شغّل self-check باستخدام مدير الحزم نفسه الذي استخدمته أثناء التثبيت. استبدل `bunx` بـ `npx` أو `pnpm dlx` أو `yarn dlx` أو `deno run -A npm:` إذا كان ذلك هو المسار الذي اخترته.

```bash
bunx @mcp-vertex/core --check
bunx @mcp-vertex/core --preset=swarm --exclude-plugins=notification --check
```

استخدم `--exclude-plugins=` عندما تريد طرح إضافة من إعداد مسبق من دون تفرّعه، مثل الاحتفاظ بقاعدة swarm لكن إزالة notification في جلسة وكيل واحد.

## الأسئلة الشائعة

### لماذا يبدأ `deno run -A npm:@mcp-vertex/core` ببطء؟

يقوم Deno بحل حزمة npm والتحقق منها عند أول استخدام. تعيد التشغيلات اللاحقة استخدام الذاكرة المخبأة تحت `~/.cache/deno`، لكن bun أو npx يظلان أسرع عند التكرار المحلي.

### بيئة IDE الخاصة بي غير موجودة في القائمة. ماذا أفعل؟

أي IDE يقبل خادم MCP عبر stdio يستطيع تشغيل الخادم نفسه. ابدأ من JSON الخاص بـ VS Code، ثم غيّر مسار الملف إلى ما تتوقعه بيئتك، مع الإبقاء على الأمر والوسائط نفسيهما.

### هل يمكنني تشغيل عدة إعدادات مسبقة في الوقت نفسه؟

لا. كل نسخة من الخادم تحل إعدادًا مسبقًا واحدًا فقط في كل مرة. إذا كانت المشاريع المختلفة تحتاج إلى مجموعات إضافات مختلفة، فضع ملف mcp-vertex.config.json مخصصًا داخل كل مشروع واترك الـ loader يحلّه لكل workspace.