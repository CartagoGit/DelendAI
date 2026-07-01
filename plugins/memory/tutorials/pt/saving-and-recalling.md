---
title: "Saving and recalling memory notes [Português — needs translation]"
plugin: memory
audience: any agent that needs cross-session continuity
order: 1
lang: pt
auto-translated: true
needs-human-review: true
source: plugins/memory/tutorials/en/saving-and-recalling.md
generated: 2026-06-25T16:38:00Z
---

# Saving and recalling memory notes

This walkthrough shows the four `memory_*` tools in action. Notes
are tiny JSON records under `.cache/mcp-vertex/memory/notes.json`
— small enough to dump in full, indexed by id, retrievable by
tag or full-text query.

## 0. The mental model

A **note** is `{ id, title, body, tags, createdAt, updatedAt }`.
Titles are unique (case-insensitive) — `memory_save` upserts by
title. There is no schema for `body`; treat it as a short
free-text field. Secrets are auto-redacted by `redactSecrets`
before the note is persisted (see
`packages/core/src/lib/shared/redact.ts`).

## 1. Save a note

```json
{
  "tool": "memory_save",
  "args": {
    "title": "monorepo publish order",
    "body": "core first, then plugins in lockstep. derive-version.ts reads Conventional Commits since the last vX.Y.Z tag.",
    "tags": ["release", "monorepo"]
  }
}
```

Response: `{ id: "<uuid>", createdAt: "..." }`. Save returns the id
so you can `forget` it later.

## 2. Recall by query

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "publish order",
    "limit": 5
  }
}
```

Returns up to `limit` notes that match the query (substring match
on title + body, ranked by recency). Use `tags` instead of (or
alongside) `query` to narrow:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. List cheaply

`memory_list` returns just `{ id, title, tags }` — the index. Use
it when you don't want to fetch the bodies yet:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Forget

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` is hard-delete — there is no soft-delete / archive.
The id is gone; the title is freed for a future `memory_save`.

## Common pitfalls

- **Secrets in `body`**: even though the plugin redacts on save,
  do not paste raw tokens or `.env`-style values — the redaction
  is heuristic, not perfect.
- **Title collisions**: `memory_save` upserts by title. If two
  agents save the same title in parallel, the second writer wins
  and the first is lost. Use unique titles per slice / per
  problem.
- **Recall gets too many hits**: prefer `tags` over a broad
  `query`. A query of `""` returns everything sorted by recency
  — useful for "what did I save last session?" but expensive on a
  full store.

## Next step

- [How round_context (proposals) links memory notes to active proposals](../../proposals/tutorials/en/getting-started.md)
- [Secrets redaction contract](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)


> **TRANSLATION PENDING** — This is the EN source copied
> verbatim. A human (or your preferred translation tool) must
> replace the body above with a proper Português
> translation. The `needs-human-review: true` and
> `auto-translated: true` frontmatter flags must be removed
> when the translation is finalised. See
> `tools/scripts/i18n/translate-tutorials.script.ts` for the bootstrap process.
>
> Source: `plugins/memory/tutorials/en/saving-and-recalling.md`
