---
title: मेमोरी नोट्स सहेजना और याद करना
plugin: memory
audience: कोई भी एजेंट जिसे सत्र के बीच निरंतरता की आवश्यकता है
order: 1
lang: hi
---

# मेमोरी नोट्स सहेजना और याद करना

यह ट्यूटोरियल चार `memory_*` टूल्स को व्यवहार में दिखाता है। नोट्स
`.cache/mcp-vertex/memory/notes.json` के अंतर्गत छोटे JSON रिकॉर्ड हैं —
पूरी तरह डंप करने के लिए पर्याप्त छोटे, id द्वारा अनुक्रमित, टैग या
फुल-टेक्स्ट क्वेरी द्वारा प्राप्य।

## 0. मानसिक मॉडल

एक **नोट** है `{ id, title, body, tags, createdAt, updatedAt }`।
शीर्षक अद्वितीय हैं (केस-इनसेंसिटिव) — `memory_save` शीर्षक द्वारा
upsert करता है। `body` के लिए कोई schema नहीं है; इसे एक छोटे
फ्री-टेक्स्ट फ़ील्ड के रूप में मानें। नोट के persist होने से पहले
`redactSecrets` द्वारा secrets स्वचालित रूप से हटा दिए जाते हैं
(देखें `packages/core/src/lib/shared/redact.ts`)।

## 1. एक नोट सहेजें

```json
{
  "tool": "memory_save",
  "args": {
    "title": "monorepo प्रकाशन क्रम",
    "body": "पहले core, फिर lockstep में plugins। derive-version.ts अंतिम vX.Y.Z टैग से Conventional Commits पढ़ता है।",
    "tags": ["release", "monorepo"]
  }
}
```

प्रतिक्रिया: `{ id: "<uuid>", createdAt: "..." }`। Save id लौटाता है
ताकि आप बाद में इसे `forget` कर सकें।

## 2. क्वेरी द्वारा याद करें

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "प्रकाशन क्रम",
    "limit": 5
  }
}
```

क्वेरी से मेल खाने वाली `limit` तक नोट्स लौटाता है (शीर्षक + body पर
substring match, recency के अनुसार रैंक)। संकुचित करने के लिए `query`
के बजाय (या साथ) `tags` उपयोग करें:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. सस्ते में सूची बनाएं

`memory_list` केवल `{ id, title, tags }` — index लौटाता है। जब आप
अभी bodies नहीं लाना चाहते:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. भूल जाएं

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` हार्ड-डिलीट है — कोई soft-delete / archive नहीं। id
चला जाता है; शीर्षक भविष्य के `memory_save` के लिए मुक्त हो जाता है।

## सामान्य त्रुटियां

- **`body` में Secrets**: भले ही plugin save पर redact करता है, कच्चे
  tokens या `.env`-style values न डालें — redaction heuristic है, परफेक्ट
  नहीं।
- **शीर्षक टकराव**: `memory_save` शीर्षक द्वारा upsert करता है। यदि
  दो एजेंट समानांतर में एक ही शीर्षक सहेजते हैं, तो दूसरा लेखक जीतता
  है और पहला खो जाता है। प्रति slice / प्रति समस्या अद्वितीय शीर्षक उपयोग करें।
- **Recall बहुत अधिक hits**: व्यापक `query` के बजाय `tags` को प्राथमिकता
  दें। `""` की query recency के अनुसार सब कुछ लौटाती है — "पिछले session
  में क्या सहेजा?" के लिए उपयोगी लेकिन पूर्ण store पर महंगा।

## अगला कदम

- [round_context (proposals) memory notes को active proposals से कैसे जोड़ता है](../../proposals/tutorials/hi/getting-started.md)
- [Secrets redaction contract](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
