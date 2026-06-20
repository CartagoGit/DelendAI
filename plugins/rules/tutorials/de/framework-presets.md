---
title: "Framework-aware lint and type-check presets [Deutsch — needs translation]"
plugin: rules
audience: any agent that needs cross-session continuity
order: 1
lang: de
auto-translated: true
needs-human-review: true
source: plugins/rules/tutorials/en/framework-presets.md
generated: 2026-06-20T01:53:13Z
---



# Framework-aware lint and type-check presets

The `rules` plugin answers one question: "which lint and
type-check rules should I apply to this project, this file, this
folder?" The answer is derived from the **framework** the
project uses and **which project area** a file lives in. The
project's own config always wins.

## 0. The mental model

A **project area** is a top-level directory with its own
`package.json` (or equivalent). Each area gets a framework
detected from its `package.json` / `requirements.txt` /
`Cargo.toml` / `pubspec.yaml` / `go.mod` — the plugin ships a
small library of "I see X, default to Y" mappings.

A **preset** is a bundle of (lint rules, type-check config) for
a given framework. The plugin has presets for `ts-eslint`,
`ts-prettier`, `py-ruff`, `rs-clippy`, `go-vet`, `kt-detekt`, …
(only the ones that map to tools the host has installed).

The plugin can run in three modes (set with `--rules-mode=`):

| Mode | Behaviour |
|---|---|
| `strict` | Fail if the project has no rules config and no preset covers it. |
| `mixed` (default) | Apply the preset if the project has no config; never fail. |
| `advisory` | Don't write anything; only report what *would* be applied. |

## 1. Apply a preset to a project area

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react"
  }
}
```

The response is a list of files written + a summary:

```json
{
  "ok": true,
  "written": [
    "apps/web/.eslintrc.json",
    "apps/web/tsconfig.strict.json"
  ],
  "preset": "ts-eslint+ts-prettier",
  "warnings": []
}
```

If the project already has an `.eslintrc.json`, the plugin leaves
it alone and reports `preset: "user-override"`. The project's own
config **always wins** — that's the contract.

## 2. List available presets

```json
{ "tool": "rules_get_presets", "args": { "framework": "ts-react" } }
```

Returns the preset name, the files it would write, and a link to
the upstream config it inherits from. The list is what the host
has installed in `node_modules` — there is no network fetch.

## 3. Check what would be applied (dry run)

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react",
    "dryRun": true
  }
}
```

Same response shape, but the `written` array reflects what
**would** be written — nothing is. Use this in advisory mode or
to show the user a diff before committing.

## 4. Map a project to its areas (CI-friendly)

`rules_resolve_map` is the read-only tool that returns the
detected mapping of project area → framework → preset. The
plugin caches this in `.cache/mcp-vertex/rules/rules-map.json`
so a CI run doesn't re-detect on every invocation.

```json
{ "tool": "rules_resolve_map", "args": {} }
```

## Common pitfalls

- **Two `package.json` in the same area** (workspace + nested):
  the plugin picks the closest one to the file. If the
  detection is wrong, pass `area` explicitly.
- **Custom framework**: pass `framework: "<your-name>"` and the
  plugin will not apply a preset (no match in the registry).
  The tool will respond with `preset: "no-preset"` and a warning.
- **Tool not installed locally**: applying a preset that
  requires `ruff` on a machine without `ruff` will succeed
  (the plugin only writes config) but the downstream
  `quality_run_quality` will fail with `code: 127`. Run
  `rules_check` first to dry-run the full chain.

## Next step

- [How the `rules` and `quality` plugins collaborate](#)
- [Customising a preset without forking it (the user-override rule)](#)

> **TRANSLATION PENDING** — This is the EN source copied
> verbatim. A human (or your preferred translation tool) must
> replace the body above with a proper Deutsch
> translation. The `needs-human-review: true` and
> `auto-translated: true` frontmatter flags must be removed
> when the translation is finalised. See
> `scripts/translate-tutorials.sh` for the bootstrap process.
>
> Source: `plugins/rules/tutorials/en/framework-presets.md`

