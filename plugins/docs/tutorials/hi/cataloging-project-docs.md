---
title: प्रोजेक्ट डॉक्स कैटलॉग करना
plugin: docs
audience: कोई भी एजेंट जिसे विषय के अनुसार दस्तावेज़ खोजना है
order: 1
lang: hi
---

# प्रोजेक्ट डॉक्स कैटलॉग करना

`docs` प्लगइन एक छोटे, बार-बार आने वाले सवाल का जवाब देता है: "इस
प्रोजेक्ट में कौन से docs हैं, और मैं कौन सा ढूंढ रहा हूं?" grep करने
के बजाय, एजेंट प्लगइन से पूछता है। यह ट्यूटोरियल दिखाता है कि कैसे
सक्षम करें, सूचीबद्ध करें और पढ़ें।

## 0. मानसिक मॉडल

एक **doc** कॉन्फ़िगर की गई `roots` के अंतर्गत कोई भी `.md` फ़ाइल है।
प्लगइन उन्हें एक बार गणना करता है, शीर्षक निकालता है (पहले `# heading`
या frontmatter `title:` से), और एक low-token इंडेक्स प्रस्तुत करता है।
Body केवल मांग पर प्राप्त की जाती है।

कॉन्फ़िगरेशन `mcp-vertex.config.json` में है:

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` paths (फ़ाइलें या directories) का array है। Directories
recursively चलाई जाती हैं। **workspace के बाहर के paths अस्वीकार किए
जाते हैं** — कोई `..` traversal नहीं।

## 1. सूचीबद्ध करें (low-token index)

```json
{ "tool": "docs_list", "args": {} }
```

प्रतिक्रिया (संक्षिप्त):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/p100-…md", "title": "p100 — Web: वास्तविक i18n…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

सूची path के अनुसार क्रमबद्ध है। सूची को एक subset तक सीमित करने के
लिए `roots` पास करें (जैसे सिर्फ `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. एक doc पढ़ें

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

प्रतिक्रिया:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…पूर्ण body…",
  "truncated": false,
  "found": true
}
```

`content` 256 KiB तक सीमित है। यदि doc बड़ा है, तो `truncated: true`
और body पहले 256 KiB है। यदि path कॉन्फ़िगर की गई roots के अंतर्गत
किसी doc से मेल नहीं खाता, तो `found: false`।

## 3. दो tools क्यों, एक क्यों नहीं

`list` सस्ता है (प्रति doc कुछ सौ bytes, 18 docs ≈ 4 KiB)। `read` महंगा
है (प्रति doc संभावित megabytes)। उन्हें अलग करने से एजेंट पहले `list`
कर सकता है, फिर केवल relevant लगने वाले `read` कर सकता है — प्रत्येक
discovery step पर tokens बचाते हुए।

## 4. Path containment (सुरक्षा)

`docs_read` path को `resolveWorkspaceContained` से resolve करता है —
absolute paths, `..` traversal, और workspace के बाहर pointing symlinks
सभी अस्वीकार हैं। `found: false` प्रतिक्रिया एजेंट का संकेत है कि path
अस्वीकार किया गया; प्लगइन जानबूझकर "गुम" और "workspace के बाहर" में
अंतर नहीं करता (filesystem layout leak से बचने के लिए)।

## सामान्य त्रुटियां

- **Root मौजूद नहीं है**: `docs_list` `{ count: 0, truncated: false,
  docs: [] }` लौटाता है। प्लगइन चेतावनी नहीं देता।
- **Doc अभी committed नहीं**: untracked files फिर भी serve की जाती हैं
  (प्लगइन filesystem से पढ़ता है, git से नहीं)। वापस किया गया `path`
  workspace-relative है।
- **Title inference विफल**: यदि पहला heading `# ` नहीं है (कोई space
  नहीं, गलत level) और कोई frontmatter `title:` नहीं है, तो प्लगइन
  फ़ाइल का basename उपयोग करता है (जैसे `CHANGELOG.md` →
  `CHANGELOG.md`)। heading ठीक करने के बाद पुनः चलाएं।

## अगला कदम

- [`docs_list` `memory_recall` के साथ "मैंने क्या सहेजा + यह कहाँ documented था?" के लिए कैसे integrate होता है](#)
- [`knowledge` plugin के साथ knowledge index क्यूरेट करना](#)
