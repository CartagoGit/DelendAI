# @mcp-vertex/docs

Project **documentation** plugin for
[`@mcp-vertex/core`](../../packages/core). Catalogues and serves the repo's
markdown so an agent navigates curated docs by title/path instead of grepping.

## Load it

```bash
mcp-vertex --plugins=docs
```

Registers two tools, `<prefix>_docs_list` and `<prefix>_docs_read`.

## Tools

- **`<prefix>_docs_list`** `{ roots? }` → `{ count, truncated, docs: [{path, title}] }`.
  Every markdown file under the configured roots, title taken from the first
  `# heading` (or frontmatter `title:`). Low-token index.
- **`<prefix>_docs_read`** `{ path }` → `{ path, title, content, truncated, found }`.
  Reads one doc by its workspace-relative path (from `docs_list`). Refuses paths
  outside the workspace (no `..` traversal); content capped at 256 KiB.

### Deprecated

- ~~**`<prefix>_docs_search`**~~ — superseded by
  [`search_search`](../../plugins/search/README.md) with
  `{ roots: ["docs"] }` (the docs plugin's own configured roots). The tool
  is still registered so callers learn the deprecation at runtime; it
  returns
  `{ ok: false, error: { reason: 'deprecated', replacement: 'search_search', replacementArgs: { roots: ['docs'] }, since: '0.x.y' } }`
  with `isError: true`. Removal is a follow-up once every known caller
  has migrated (f00057 S11).

## Configuration (`mcp-vertex.config.json`)

mcp-vertex is agnostic — the host owns which docs are served:

```json
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "guides"],
        "extensions": ["md", "mdx"],
        "maxResults": 300
      }
    }
  }
}
```

Default roots are `docs/` + `README.md`. Use `search` to grep across the whole
tree; use `docs` for curated, title-indexed navigation.

> **Note (f00057 S11):** `setup-github` (the CLI helper invoked as
> `mcp-vertex setup-github`) is a distinct surface from the `issues_*` MCP
> tools. `setup-github` runs **once** at install time to write
> `plugins.issues.options.repo` and verify the auth tier; the `issues_*`
> tools assume the repo is already configured and operate on that
> configuration. See [`CROSS-PROJECT-SETUP.md`](../../docs/mcp-vertex/CROSS-PROJECT-SETUP.md)
> for the full bootstrap flow.
