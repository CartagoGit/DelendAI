---
id: x00604
title: "A search that narrows as you say more"
kind: fix
status: done
type: proposal
track: swarm
date: 2026-09-23
tags:
    - tool-surface
    - agents
shipped-in:
  - "f5163e015"
last-transition-id: 8c425f4b-aacf-4c95-bdb4-20387bf59084
last-correlation-id: 8c425f4b-aacf-4c95-bdb4-20387bf59084
last-transition-from: review
---

# x00604 — A search that narrows as you say more

## goal

An agent that describes what it wants finds the tool that does it.

## why

Measured live through the MCP surface, against a consumer project that
is not this one:

```
tool_search('sync_proposals'):      {"entries":[{"toolId":"sync_proposals",…}]}
tool_search('sync'):                {"entries":[{"toolId":"sync_proposals",…}]}
tool_search('sync proposals index'): {"entries":[]}
```

Every word of that third query appears in the tool's own name and its
own summary. The query was matched as **one substring**, so it found
nothing.

Which means the tool an agent is told to use to FIND tools answers
"there is no such capability" to anyone who describes it in words rather
than naming it exactly. With 148 tools behind a lazy surface — where
most are not even listed until something activates them — that is the
whole discovery path.

An agent that gets `{"entries":[]}` does not try a shorter query. It
concludes the thing does not exist and works around it, which is exactly
the behaviour this project keeps finding and calling an LLM's fault.

## non-goals

- Ranking. `scoreCandidate` already orders what matches; this changes
  only *what* matches.
- Fuzzy matching, stemming or synonyms. A token that does not appear at
  all is still not a match.

## architecture

The query splits on whitespace and **every** token must appear somewhere
in the tool's searchable text — name, id, plugin, namespace, summary,
tags.

Every, not any: adding a word must narrow the answer, which is what a
search is for. Matching any token would make a third word widen it, and
`sync proposals index` would return everything that mentions an index.

A query with no whitespace behaves exactly as before, so an exact name
still resolves to itself.

The searchable fields are joined with a space rather than concatenated:
otherwise a token could be made of the end of one field and the start of
the next, and a tool would match a word nobody wrote.

## slices

### S1 — every word must appear, and one word is still one word

- **Status**: done
- **Files**: [`packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/tests/src/lib/project/tool-surface-runtime.search.spec.ts`]
- **Gate**: `npx vitest run packages/core/tests/src/lib/project/tool-surface-runtime.search.spec.ts`
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Diff f5163e015 verificado: queryTokens separa la query en tokens (trim+lowercase+split /\s+/) y searchableText une los campos con espacio (evita tokens de dos campos); matchesFilter exige EVERY token - anadir palabra estrecha, no ensancha; query sin espacios se comporta igual (caso que ya funcionaba); query vacia/whitespace sigue devolviendo todo. No toca ranking ni fuzzy (non-goals respetados). Los 5 AC cubiertos por 11 specs del gate (sync proposals index->sync_proposals, sync_proposals a si mismo, index->2 index proposal->1, espacios repetidos irrelevantes, vacia->todo). Gate 11/11 verde. Sin cambios fuera de los 2 ficheros declarados.
- review-attribution: claude-opus-5 from Merge pull request #340 from CartagoGit/delendai/pr/claude-opus-5/x00604-S1-g1/a-search-that-narrows-as-you-say-more (refs/heads/delendai/wip/claude-opus-5/x00604-S1-g1/a-search-that-narrows-as-you-say-more) (f5163e015e3035269061037e7de6b0f1d515d916), opened by glm-5.3-max
## acceptance

- `sync proposals index` finds `sync_proposals`.
- `sync_proposals` still finds itself — the case that already worked.
- `index` finds two tools; `index proposal` finds one. Adding a word
  narrows.
- Leading, trailing and repeated spaces change nothing.
- An empty or whitespace-only query still returns everything, and so
  does no query at all.

## risks and mitigations

- **A long natural sentence now matching nothing.** It matched nothing
  before too, and for a worse reason. A query whose every word must
  appear is a stricter filter than one word, and an agent that gets
  nothing can drop words — which is the direction that works.

## notes

Found by driving the real MCP surface in a temporary consumer project:
list the router tools, activate the proposals plugin, then try to reach
a tool that activation does not expose. `resolve_capability` reached it
and ran it correctly — it returned `{"changed":true,"count":1,…}`, having
actually synced that project's registry. `tool_search` was the step that
failed, and it is the step an agent takes first.

### what is measured and what is proven

The BEFORE is measured: the probe resolves `@delendai/core/public` to
the built `dist`, which is `develop`'s code, so those empty answers are
the shipped behaviour.

The AFTER is proven by the spec, not by re-running that probe. The same
resolution means a source change does not reach it without a build, and
a probe that cannot see the fix cannot testify about it. Said plainly
rather than re-run until it agreed.
