---
title: "Cataloguing project docs [Italiano — needs translation]"
plugin: docs
audience: any agent that needs cross-session continuity
order: 1
lang: it
auto-translated: true
needs-human-review: true
source: plugins/docs/tutorials/en/cataloging-project-docs.md
generated: 2026-06-20T01:53:12Z
---



# Cataloguing project docs

The `docs` plugin answers a small, frequent question: "what docs
does this project have, and which one am I looking for?" Instead
of grepping, the agent asks the plugin. This walkthrough shows
how to enable, list, and read.

## 0. The mental model

A **doc** is any `.md` file under the configured `roots`. The
plugin enumerates them once, extracts the title (from the first
`# heading` or frontmatter `title:`), and serves a low-token
index. The body is only fetched on demand.

Configuration lives in `mcp-vertex.config.json`:

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

`roots` is an array of paths (files or directories). Directories
are walked recursively. **Paths outside the workspace are
refused** — no `..` traversal.

## 1. List (low-token index)

```json
{ "tool": "docs_list", "args": {} }
```

Response (truncated):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/p100-…md", "title": "p100 — Web: i18n real…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

The list is sorted by path. Pass `roots` to scope the list to a
subset (e.g. just `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Read one doc

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Response:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…full body…",
  "truncated": false,
  "found": true
}
```

`content` is capped at 256 KiB. If the doc is bigger, `truncated:
true` and the body is the first 256 KiB. If the path doesn't
match any doc under the configured roots, `found: false`.

## 3. Why two tools and not one

`list` is cheap (a few hundred bytes per doc, 18 docs ≈ 4 KiB).
`read` is expensive (potentially megabytes per doc). Splitting
them means the agent can `list` first, then `read` only the ones
that look relevant — saving tokens on every discovery step.

## 4. Path containment (security)

`docs_read` resolves the path with `resolveWorkspaceContained` —
absolute paths, `..` traversal, and symlinks pointing outside the
workspace are all refused. The `found: false` response is the
agent's signal that the path was rejected; the plugin does not
distinguish "missing" from "outside-workspace" on purpose (to
avoid leaking filesystem layout).

## Common pitfalls

- **Root doesn't exist**: `docs_list` returns `{ count: 0,
  truncated: false, docs: [] }`. The plugin does not warn.
- **Doc not yet committed**: untracked files are still served
  (the plugin reads from the filesystem, not from git). The
  `path` you get back is workspace-relative.
- **Title inference fails**: if the first heading is not `# ` (no
  space, wrong level) and there's no frontmatter `title:`, the
  plugin uses the filename basename (e.g. `CHANGELOG.md` →
  `CHANGELOG.md`). Re-run after fixing the heading.

## Next step

- [How `docs_list` integrates with `memory_recall` for "what
  did I save last session + where was it documented?"](#)
- [Curating a knowledge index with the `knowledge` plugin](#)

> **TRANSLATION PENDING** — This is the EN source copied
> verbatim. A human (or your preferred translation tool) must
> replace the body above with a proper Italiano
> translation. The `needs-human-review: true` and
> `auto-translated: true` frontmatter flags must be removed
> when the translation is finalised. See
> `scripts/translate-tutorials.sh` for the bootstrap process.
>
> Source: `plugins/docs/tutorials/en/cataloging-project-docs.md`

