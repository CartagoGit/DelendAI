---
name: mcp-vertex-quality-and-rules-gates
appliesTo: ['@mcp-vertex/quality', '@mcp-vertex/rules']
description: How the quality plugin resolves which commands to run (scope precedence), the commandPolicy trust boundary, and how the rules plugin's enforcement mode (strict/mixed/none/proposal) shapes the plan apply_rules returns. Use before calling run_quality or apply_rules, or when a command is unexpectedly blocked.
---

# mcp-vertex quality + rules gates

## Decision tree

1. Wondering which commands `run_quality` will execute for a scope? -> check
   precedence: `options.scopes` > `mcp-vertex.config.json` `validationMatrix.scopes`
   > detected `package.json` scripts (folded into one `all` scope).
2. A command got blocked (`code 126` / policy reason)? -> that's
   `commandPolicy` (trust boundary), not a bug — deny always wins over
   allow; adjust the host's policy, don't try to bypass it.
3. About to bring code into compliance with `apply_rules`? -> read the
   project's `mode` first (`get_rules`), then expect the plan it returns to
   match that mode exactly — `apply_rules` always RETURNS A PLAN, it never
   edits files itself.
4. Mode is `proposal`? -> the plan tells you to create a proposal describing
   the fix; it never tells you to edit in place, regardless of how trivial
   the fix looks.

## Scope precedence (quality plugin)

From `plugins/quality/src/lib/scopes.ts` `resolveScopes`, highest wins:

1. **`options.scopes`** — explicit plugin config (`{ scope: [cmd, ...] }`).
2. **`mcp-vertex.config.json` `validationMatrix.scopes`** — host-level config.
3. **`package.json` scripts** — auto-detected `lint`/`typecheck`/`test`/`build`
   scripts, folded into a single `all` scope with the right package manager
   prefix (`bun run`/`pnpm`/`yarn`/`npm run`, detected from the lockfile).

If `options.scopes` is non-empty, the other two are never consulted.

## Trust boundary: `commandPolicy`

Commands executed by `run_quality` come from the HOST's own config (scripts,
validation matrix), never from agent-supplied strings — there is no tool
parameter that lets an agent specify an arbitrary shell command to spawn.
`commandPolicy` (`{ allow?, deny? }`, `plugins/quality/src/lib/command-policy.ts`)
is an additional opt-in restriction a host can layer on top:

- **`deny` always wins** — a binary on `deny` is blocked even if it is also
  on `allow`.
- An empty/absent `allow` list means "any binary not denied" — `allow` is a
  positive list, only consulted when non-empty.
- The binary checked is the command's first whitespace-delimited token
  (`commandBinary`), e.g. `bun run typecheck` checks `bun`.

A block here is a deliberate trust-boundary decision by the host, not a
quality-plugin bug — never try to reformulate the command to dodge it;
escalate to adjusting `commandPolicy` instead.

## Enforcement modes (rules plugin)

`IRulesMode` = `'strict' | 'mixed' | 'none' | 'proposal'` (default `mixed`,
`plugins/rules/src/lib/frameworks/types.ts`):

| Mode | `apply_rules` plan |
|---|---|
| `strict` | run the fix command, then manually resolve what's left, then re-run check until clean |
| `mixed` | only fix/align the files you created or touched (`files` param); leave the rest as-is |
| `none` | run the check command and report violations only — never edit |
| `proposal` | run the check command to collect violations, then create a proposal (proposals plugin) describing the fix — never edit directly |

## When `apply_rules` creates a proposal vs returns an edit plan

`apply_rules` **never edits a file itself** in any mode — it is read-only and
returns a `steps` array the agent executes. The distinguishing question is
whether those steps say "edit" or "create a proposal":

- `mode: 'proposal'` -> steps always end in "create a proposal", regardless
  of how small the fix looks.
- `mode: 'strict'` -> steps say "run the fixer, then edit manually" — direct
  in-place edits are expected.
- `mode: 'mixed'` -> same as strict but scoped to `files` you pass (or the
  area's own files you touched); untouched files are explicitly left alone.
- `mode: 'none'` -> steps say "report only, do not edit" — even a trivial
  one-line fix stays unapplied.

The project's own ESLint/typecheck config always wins over the plugin's
cache-default config (`get_rules`/`check_rules` list project config first).

## Never do

- Never assume `run_quality` will pick up a new scope from `package.json`
  alone if `options.scopes` or `validationMatrix.scopes` is already set —
  the higher-precedence source fully overrides, it does not merge.
- Never try to work around a `commandPolicy` deny by rewording the command —
  the binary check is on the first token, but the intent is a hard boundary.
- Never edit files directly when `mode` is `none` or `proposal` — the plan
  explicitly does not authorise it, no matter how small the diff.
- Never invent a 5th rules mode — the type is closed to the 4 listed.

## Smoke

```
get_rules {}
```
Returns `{ mode, modeGuidance, supported, areas, conventions }` — read
`mode` before calling `apply_rules`, then confirm the returned `steps` match
the table above for that mode.
