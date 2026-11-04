# Brand contract — *DelendAI* / `delendai`

This document is the **single source of truth** for how the brand is spelled,
where, and why. Every other doc, doc-snippet, README, web page, i18n string
and CLI surface must conform. The brand-propagation script in
`tools/scripts/migrate/rebrand-propagate.script.ts` checks it.

## TL;DR — the two rules

| Surface                                              | Form          |
| ---------------------------------------------------- | ------------- |
| CLI command, binary name, npm package, file path, `namespacePrefix`, tool id, env var, JSON key, config field, identifier | `delendai` (lowercase) |
| Display name in prose, headings, hero title, web UI labels, i18n dictionaries, README lede, marketing copy | `DelendAI`   |

> **If in doubt, lowercase.** Tools, code, identifiers and CLI surfaces are
> always `delendai`. Only prose that is *written for a human reader* uses
> `DelendAI`.

The split is intentional:

- The lowercase form is the **machine surface** — a stable, unambiguous
  identifier that survives shells, JSON parsers, JSON pointers, regex
  searches and the rebrand-propagation grep. Capitalising it where a tool or
  package name is expected breaks command lines, npm imports and tool
  namespaces.
- The capitalised form is the **display name** — the way the project talks
  about itself to a human. It mirrors how `GitHub` is the company and
  `github` is the CLI, or how `Git` is the project and `git` is the binary.

## Why *DelendAI* — *AI delenda est*

The name is a deliberate echo of Cato the Elder's famous
*Carthago delenda est* — "Carthage must be destroyed" — the phrase he ended
every speech in the Roman senate with until the Third Punic War did the
thing itself.

We borrow the construction in its modern form: **AI delenda est** —
*AI must be dismantled, broken into pieces, and reassembled under
human-readable contracts*. The "AI" we are dismantling is the opaque,
chat-shaped default mode of most coding agents — a tool that needs a
human in the loop just to know what it is doing and what it has touched.
"DelendAI" is what we are building instead.

That framing drives three concrete design choices in the project:

1. **Tools replace chat.** Every capability is exposed as a named tool with
   a zod input/output schema, not as a free-form prompt. Agents compose
   the tools; they do not improvise them. (See `ARCHITECTURE.md`.)
2. **The runtime is hermetic.** Paths are injected, plugins are loaded
   deterministically, and the surface is measured in tokens — there is no
   place for the model to silently improvise a side effect. (See
   `VISION-AND-OPERATING-MODEL.md` — "the growth rule".)
3. **Errors are public, data is private.** `DelendAI reports its own bugs,
   not your data` (see `VISION-AND-OPERATING-MODEL.md` — privacy motto):
   error reporting describes our internals (plugin, tool, failure class,
   fingerprint) and never the user's files, secrets, or repository
   content. The verb in *delenda est* is destructive — we are destroying
   the grey zone between "agent failed" and "user data leaked", not
   building another one.

The Latin construction also gives us a stable canonical phrase across all
12 locales in the i18n dictionaries (see `apps/web/src/i18n/langs/*.ts`),
where every hero title ends with the same `DelendAI` token.

## Reference table — what each form looks like

| Layer                        | `delendai` (lowercase) — machine surface         | `DelendAI` — display surface             |
| ---------------------------- | -------------------------------------------------- | ----------------------------------------- |
| npm scope                    | `@delendai/core`, `@delendai/cli`, `@delendai/proposals` | n/a — npm scopes are always lowercase     |
| CLI binary / command         | `delendai __serve`, `delendai --plugins=…`        | n/a                                       |
| Tool id                      | `delendai_overview`, `delendai_status`             | n/a                                       |
| MCP server name in `.vscode/mcp.json` | `"delendai"`                                | n/a                                       |
| `namespacePrefix`            | `'delendai'`                                       | n/a                                       |
| Cache directory              | `.cache/delendai/`                                 | n/a                                       |
| Doc directory                | `docs/delendai/`                                   | n/a                                       |
| GitHub repo / npm org        | `github.com/CartagoGit/delendai`, `@delendai`      | n/a                                       |
| Hero title (web, i18n)       | n/a                                                | `DelendAI` (every locale, `apps/web/src/i18n/langs/*.ts`) |
| Narrative README / docs      | n/a                                                | `DelendAI` (lede, headings, body)         |
| Vision / North star          | n/a                                                | `DelendAI` (every prose mention)          |
| VS Code extension display name | `delendai` (package.json `displayName` follows platform convention) | `DelendAI` in the marketplace listing and website |

When a sentence mixes a code form and a prose form, **both spellings are
correct in the same sentence**:

> *DelendAI is the host-agnostic core. Launch it with `delendai __serve`
> and call `delendai_overview` to orient.*

## What you must NOT do

- ❌ `Delendai` (mixed case) in identifiers — fails the rebrand sweep.
- ❌ `DELENDAI` anywhere — that is reserved for all-caps doc-set filenames
  (`README-DELENDAI.md`, `PLUGINS-DELENDAI.md`, `ARCHITECTURE.md`,
  `VISION-AND-OPERATING-MODEL.md`) where the project uses an
  `-MD-FILENAME` convention for top-level docs. Even there, never write
  `DELENDAI` in prose.
- ❌ `mcp-vertex`, `mcp_vertex`, `McpVertex`, `vertex` as a brand noun in
  *new* surfaces — the previous brand is retired; `CHANGELOG.md`,
  historical proposals under `docs/delendai/proposals/legacy/**`, and the
  LLM-attribution rewriter retain it by design (see
  `tools/scripts/migrate/rebrand-propagate.script.ts` → `SKIP_PATHS`).
- ❌ Re-translating the hero title — the `DelendAI` token is intentionally
  not localised so the brand reads the same in every language.

## Enforcing the contract

Two gates keep it honest:

1. **`bun run migrate:rebrand:check`** — runs
   `tools/scripts/migrate/rebrand-propagate.script.ts --check`, which
   greps the live monorepo (source + bundles + `capabilities.json`) for
   any leftover brand-name strings and fails the build if it finds them.
   The script also asserts the structural pieces of this contract: the
   brand origin paragraph appears in `README-DELENDAI.md` and the
   `AI delenda est` token appears in `VISION-AND-OPERATING-MODEL.md`.
2. **`tools/scripts/migrate/rebrand-propagate.spec.ts`** — five vitest
   cases that pin the contract end-to-end (default clean, host injection,
   preserved historical sinks, and a live repo check).

If a brand change is needed (rename, new project, multi-brand fork), edit
this file first, then run **`bun run migrate:rebrand:propagate --from=<old>
--to=<new>`** to sweep source, bundles and `capabilities.json` in one
shot.

## Related

- [`README-DELENDAI.md`](./README-DELENDAI.md) — install, register, plugin resolution.
- [`PLUGINS-DELENDAI.md`](./PLUGINS-DELENDAI.md) — the plugin authoring contract.
- [`VISION-AND-OPERATING-MODEL.md`](./VISION-AND-OPERATING-MODEL.md) — north star + privacy motto.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layers, contracts, request flow.