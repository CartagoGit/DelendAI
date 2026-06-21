---
title: "Running quality gates for any language [Português — needs translation]"
plugin: quality
audience: any agent that needs cross-session continuity
order: 1
lang: pt
auto-translated: true
needs-human-review: true
source: plugins/quality/tutorials/en/running-gates.md
generated: 2026-06-21T13:53:45Z
---

# Running quality gates for any language

The `quality` plugin is **language-agnostic** by design: it spawns
whatever command your `mcp-vertex.config.json` says and reports
the exit code. This walkthrough shows the three sources of
scopes (in precedence order), how to run one, and how to cancel a
runaway.

## 0. The mental model

A **scope** is a named list of commands. The plugin runs every
command in the scope, in order, captures stdout/stderr, and
returns a structured `{ ok, results: [{ command, ok, code, tail }]
}` report. The `ok` field is the whole scope — if any command
fails, the scope is not ok.

```
┌─ plugin options.scopes (highest priority)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ detected package.json scripts → "all" (lint, typecheck, test, build)
```

## 1. List the available scopes (read-only)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Response example (truncated):

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. Run a scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

The response is per-command:

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

Read `results[N].tail` for the failure context. The `tail` is the
last 20 non-empty lines (capped at 64 KiB total output) — enough
to debug without flooding the agent's context.

## 3. Cancel a runaway

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Sends `SIGKILL` to the process group of every in-flight run. Pass
`{ "pid": <number> }` to cancel one. Cancellation is non-blocking:
the next call's `results` will reflect the kill.

## 4. Make it language-agnostic

The core runs whatever your config says. Example for a polyglot
project (TypeScript + Python):

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` will run **all four commands** in `typecheck` /
`test` scopes, regardless of language. Exit 0 = pass; non-zero =
fail (regardless of which binary emitted it).

## 5. Harden with a command policy (M13)

`run_quality` **executes** whatever the host config says. To
restrict which binaries may run when a less-trusted agent calls
the tool, use `commandPolicy`:

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

A blocked command is reported as `code: 126` with a reason
("blocked by command policy") and is **never spawned**. `deny`
wins over `allow`; an empty `allow` means "any binary not denied".

## Common pitfalls

- **`run_quality` doesn't replace `bun run validate`**: the core's
  `validate` script runs the four checks directly. `run_quality`
  is for **ad-hoc** runs and per-scope introspection from an
  agent. Both are valid; they don't talk to each other.
- **A long-running command that exceeds the timeout** is killed
  with `code: 124` and `timedOut: true`. Default timeout is
  600 000 ms (10 minutes). Override per runner if needed.
- **Polling for "is it done yet?"**: don't. `run_quality` is
  synchronous. If you need to know about long scopes, use
  `quality_cancel` with the `pid` from `activeRunPids` (via
  metrics or a follow-up tool call).

## Next step

- [Multi-language quality gates (l107)](../../l107-multilang-quality-gates.md)
- [Trust boundary & command policy (M13)](../../l107-multilang-quality-gates.md#5-no-objetivos)


> **TRANSLATION PENDING** — This is the EN source copied
> verbatim. A human (or your preferred translation tool) must
> replace the body above with a proper Português
> translation. The `needs-human-review: true` and
> `auto-translated: true` frontmatter flags must be removed
> when the translation is finalised. See
> `tools/scripts/i18n/translate-tutorials.script.ts` for the bootstrap process.
>
> Source: `plugins/quality/tutorials/en/running-gates.md`
