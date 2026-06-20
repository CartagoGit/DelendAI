---
title: حفظ واسترجاع ملاحظات الذاكرة
plugin: memory
audience: أي عميل يحتاج إلى استمرارية عبر الجلسات
order: 1
lang: ar
---

# حفظ واسترجاع ملاحظات الذاكرة

يعرض هذا الدليل الأدوات الأربعة `memory_*` أثناء العمل. الملاحظات
عبارة عن سجلات JSON صغيرة في `.cache/mcp-vertex/memory/notes.json`
— صغيرة بما يكفي للإفراغ الكامل، مُفهرسة بالمعرّف، يمكن استرجاعها
بالوسم أو استعلام النص الكامل.

## 0. النموذج الذهني

**الملاحظة** هي `{ id, title, body, tags, createdAt, updatedAt }`.
العناوين فريدة (غير حساسة لحالة الأحرف) — `memory_save` يُنفّذ upsert
بالعنوان. لا يوجد مخطط لـ `body`؛ تعامل معه كحقل نص حر قصير. تُنقّى
الأسرار تلقائيًا بواسطة `redactSecrets` قبل استمرار الملاحظة (انظر
`packages/core/src/lib/shared/redact.ts`).

## 1. حفظ ملاحظة

```json
{
  "tool": "memory_save",
  "args": {
    "title": "ترتيب نشر monorepo",
    "body": "core أولًا، ثم الإضافات بشكل متزامن. derive-version.ts يقرأ Conventional Commits منذ آخر علامة vX.Y.Z.",
    "tags": ["release", "monorepo"]
  }
}
```

الاستجابة: `{ id: "<uuid>", createdAt: "..." }`. يُعيد Save المعرّف
حتى تتمكن من `نسيانه` لاحقًا.

## 2. الاسترجاع بالاستعلام

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "ترتيب النشر",
    "limit": 5
  }
}
```

يُعيد حتى `limit` ملاحظات تطابق الاستعلام (مطابقة جزئية على العنوان +
body، مرتبة حسب الحداثة). استخدم `tags` بدلًا من (أو مع) `query`
للتضييق:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. الإدراج بتكلفة منخفضة

`memory_list` يُعيد فقط `{ id, title, tags }` — الفهرس. استخدمه
حين لا تريد جلب الـ bodies بعد:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. النسيان

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` حذف دائم — لا يوجد حذف ناعم / أرشيف. المعرّف
يختفي؛ العنوان يتحرر لـ `memory_save` مستقبلي.

## الأخطاء الشائعة

- **الأسرار في `body`**: حتى لو ينقّي الإضافة عند الحفظ، لا تلصق
  الرموز الخام أو قيم النمط `.env` — التنقية استدلالية وليست مثالية.
- **تعارض العناوين**: `memory_save` يُنفّذ upsert بالعنوان. إذا حفظ
  عميلان نفس العنوان بالتوازي، يفوز الكاتب الثاني ويضيع الأول.
  استخدم عناوين فريدة لكل slice / مشكلة.
- **الاسترجاع يُعيد نتائج كثيرة**: فضّل `tags` على `query` واسعة.
  استعلام `""` يُعيد كل شيء مرتبًا حسب الحداثة — مفيد لـ "ماذا
  حفظت في الجلسة الأخيرة؟" لكن مكلف على store كامل.

## الخطوة التالية

- [كيف يربط round_context (proposals) ملاحظات الذاكرة بالاقتراحات النشطة](../../proposals/tutorials/ar/getting-started.md)
- [عقد تنقية الأسرار](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
