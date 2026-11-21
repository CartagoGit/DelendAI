---
name: delendai-quality-and-rules-gates
appliesTo: ['@delendai/quality', '@delendai/rules']
description: Use before run_quality or apply_rules, or when a command is blocked: scope precedence, commandPolicy, enforcement modes.
tools: ['delendai_quality_run_quality', 'delendai_quality_quality_run_all', 'delendai_quality_get_quality_scopes', 'delendai_rules_apply_rules']
---

# delendai quality + rules gates

## Decision tree

1. Wondering which commands `run_quality` will execute for a scope? -> check
   precedence: `options.scopes` > `delendai.config.json` `validationMatrix.scopes`
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
2. **`delendai.config.json` `validationMatrix.scopes`** — host-level config.
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

## Running checks

- Run only what the change touched: the changed specs, the mirror spec of a changed file, specs that import it directly. Reach through a barrel is not "touched". Lints take the changed files; the typecheck covers the touched packages and their dependents. The full suite belongs to promotion, not to a pull request.
- Keep the machine usable: `nice -n 19`, `vitest --maxWorkers=2` on named spec files, never whole directories or projects, one proof at the end.
- A failure that appears "sometimes" has a cause (a race, an unawaited operation, an open handle, ordering, environment). Find it, fix the product or the spec, and state the cause; repeating the run proves nothing.
- A spec must give the same result for any runner: stub the agent markers it asserts on (`vi.stubEnv`) and use the test-kit clock instead of real timers. A spec declares its time budget in its name and is never made to pass by raising it.
- A spec that opens real `bun:sqlite` databases is skipped by `vitest run`; after touching a SQLite store or reader, run the project's `test:sqlite`.
- A file you edit is judged by the changed-file coverage thresholds, including paths that were untested before you came: add their tests in the same change.
- Before saying a client or extension works, load the built artefact and exercise its own path; a fake client answers any name.

## Checks that only fail in CI

Run the matching one before you publish; the local chain does not.

- New CLI command: add its help summary, then `lint:cli:i18n` and `lint:cli-coverage`.
- Spec fixture in another language: `lint:i18n-english-prose` lists exclusions; add the file next to its closest sibling.
- Fixture spelling a retired product name: it needs the legacy-path exemption of the rebrand check.
- Edited `outputSchema` of a tool: `types:generate`, then `gen:all`, and commit the generated files.
- Source comments: describe behaviour and reason, never a proposal id (`lint:no-proposal-id-comments-in-source`).
- Spec that checks a file's mode and then reads it by path: open once, use `fstat` and `readFile` on the descriptor (CodeQL).
- A package that starts importing a runtime value from another workspace package: alias it to source in both vitest configs; a local `dist` hides the gap CI will show.
- A CI job that `needs` scoped jobs starts its `if:` with `!cancelled() &&`, else it silently skips.
- A `.baseline.json` written by a lint must already be in the formatter's shape (tab-indented); write it through the lint's `--update`, never `JSON.stringify` with spaces.
- Shortening a tool description or a skill to save tokens never weakens a contract: the ceiling is judged on the compact form, not by deleting required fields.

## Rebaseline with `--update`

When a lint fails because a **baselined historical value** drifted (for example,
an already-closed proposal still cites an old path or an old orphan commit), do
not hand-edit the baseline JSON unless the script explicitly tells you to. First
check whether the lint supports `--update` and re-run the lint through that
entrypoint so the script itself rewrites its canonical baseline format. Manual
edits are the fallback only when no `--update` mode exists.

| Lint / script                                             | `--update` support | Use case                                                                                                                                                      |
| --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun tools/scripts/lint/proposal-files-exist.script.ts`   | Yes                | Rebaseline known dangling `Files:` references in historical `done/`, `review/` or `in-progress` proposals after an intentional rename or archived path drift. |
| `bun tools/scripts/lint/proposal-cited-commits.script.ts` | Yes                | Rebaseline known orphan commit citations in historical `done/*` proposals when the commit was intentionally rebased away or documented as legacy debt.        |
