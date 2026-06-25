---
name: mcp-vertex-audit-playbook
appliesTo: ['@mcp-vertex/audit']
description: >
  Complete operational playbook for running an exhaustive qualitative audit of
  the mcp-vertex monorepo. Read this skill BEFORE creating any audit proposal.
  It defines what to read, in which order, what constitutes a valid finding, and
  how to format the output. Automated commands alone are NEVER sufficient — this
  skill mandates LLM code reading as the primary analytical method.
---

# Audit Playbook — mcp-vertex exhaustive audit

> **Read this in full before opening a single source file.** The playbook is
> sequential: complete each phase before moving to the next.

---

## Why qualitative analysis is non-negotiable

Automated tools (`bun run validate`, `biome ci`, test counts) answer
*"does the existing code compile and pass tests?"* — they cannot answer:

- Is the design agnostic, or is host vocabulary leaking into generic contracts?
- Are durable writes atomic, or do they risk torn reads under concurrency?
- Is a file doing too many things, making future changes dangerous?
- Do skills reference tools or paths that have since been renamed?
- Is there dead code that creates false expectations?

These questions require the LLM to *read and reason* about the code. Every audit
in `docs/mcp-vertex/proposals/done/audits/a00001` through `a00003` used this approach and
produced actionable P0 findings that automated tools missed entirely. Every audit
that skipped this step produced nothing of value.

---

## Phase 0 — Pre-flight

Before reading any source file:

1. Run `git log --oneline -10` — note the HEAD commit to include in `## Goal`.
2. Run `bun run test 2>&1 | tail -5` — capture test count and pass/fail.
3. Run `bun run build 2>&1 | tail -10` — capture build output.
4. Run `biome ci . 2>&1 | tail -20` — capture warning/error count.
5. Count approximate LOC: `find packages plugins extensions apps tools scripts -name '*.ts' | xargs wc -l | tail -1`.

Record all numbers — they become the `## Verified State` table. **Do not stop here.**

---

## Phase 1 — Core packages

### `packages/core/src/lib/`

Open and read every subdirectory. Key things to check in each:

| Subdirectory | Check for |
|---|---|
| `contracts/` | Interfaces complete? `constants/` directory populated or dead? |
| `plugins/` | `load-plugins.ts` — resilient? Any `process.cwd()` fallback? `plugin-contract.ts` — clean injection, no globals? |
| `cli/` | `assemble.ts` — does `--check` mode double-read config? Any `process.cwd()` usage? `parse-cli-args.ts` — presets up to date? |
| `bootstrap/` | `analyze-project.ts` — pure function with injected `IFileReader`? No direct I/O? |
| `scaffold/` | `scaffold-host.ts` — any hardcoded model names specific to original author? |
| `tools/` | `overview-tool.ts` — does it declare `outputSchema`? Budget-safe? |
| `project/` | `create-mcp-project.ts` — `coreToolRegistrations` empty placeholder or real? |
| `shared/` | Are shared utilities (`joinRel`, etc.) actually here or duplicated across plugins? |

For every problem found: **quote the exact lines** and note the file + line number.

### `packages/client/src/`

Read service layer, stdio client, connection health, notification bridge.
Check: any leaked `process.cwd()`? Services missing teardown? Unhandled promise rejections?

---

## Phase 2 — Every plugin (`plugins/*`)

For **each plugin directory** (proposals, memory, rules, quality, search, docs,
deps, git, notification, status-marker, test-convention…):

1. Read the plugin's `src/index.ts` (or equivalent entry) — does it implement
   `IMcpPlugin.register(ctx)` cleanly? Any side-effecting globals?
2. Read every engine file (`*-engine.ts`, `*-runner.ts`, `*-context.ts`):
   - **Durable writes**: does every `writeFile` go through `withFileMutex` +
     `writeFileAtomic`? Any bare `fs.writeFile` is a finding.
   - **`process.cwd()`**: any direct call or defaulted parameter?
   - **Sync I/O** (`readFileSync`, `existsSync`) in hot paths (tool handlers)?
   - **`outputSchema`**: every tool registration must declare one.
   - **`@ts-ignore` / `@ts-nocheck`**: find and cite.
   - **`console.log`** in production paths (not test-only): find and cite.
3. Check for host-domain vocabulary in generic contracts (track names like
   `'ui-demo'`, `'game-demo'`; hardcoded subfolder paths like `paused/demos`).
4. For the `proposals` plugin specifically, also read:
   - `persistent-task-queue.ts` — lock schema migration debt, sync I/O, backpressure correctness.
   - `agent-lock-engine.ts` — write atomicity, fallback path resolution.
   - `sync-proposal-registry.ts` — `process.cwd()` default, write atomicity.
   - `round-context.ts` — SHA-256 digest correctness, size (>500 lines is a refactor candidate), hardcoded paths.
   - `continuity-enforcer.ts` — loop detection thresholds still sensible?
   - `zombie-reconcile.ts` — GC classification complete?
   - `proposal-parallelism.ts` — `IProposalTrack` open or closed union?
   - `proposal-scaffold-linter.ts` — ID format enforced (5-digit `\d{5}`)?

---

## Phase 3 — Extensions (`extensions/*`)

### `extensions/vscode/src/`

Read activation, extension host, webview bridge, service wiring. Check:

- Does activation clean up all disposables in `deactivate()`?
- Are webview messages validated before acting on them?
- Is there any `vscode.*` import outside `extensions/vscode/`?
- Are status bar items disposed on deactivation?
- Any `process.cwd()` in extension code (should use workspace URIs)?

---

## Phase 4 — UI extension (`packages/ui-extension`)

Read panels, command palette, brand assets, CSS. Check:

- Any hardcoded UI strings that should be i18n keys?
- Any `import` from a host package (e.g., `vscode`)? This violates the
  host-agnostic contract.
- Missing ARIA attributes on interactive elements?
- CSS custom properties consistent with the design token system?

---

## Phase 5 — Apps (`apps/web`)

Read Astro pages, `src/i18n/ui.ts`, Pagefind config, generated content scripts.

- Every user-visible string must have entries in **every** language defined in `ui.ts`.
  Run `bun run site:strict` mentally: what would it complain about?
- Pages with `data-pagefind-body` — is the annotation correct and consistent?
- Generated tool/plugin docs — do they match the live tool registry, or are they stale?

---

## Phase 6 — Tools and scripts (`tools/`, `scripts/`)

- List all files: any `.py`, `.sh`, `.bash`, `.zsh`, `.pl`, `.rb`? Cite them — they violate hard rule 10.
- Read each `*.script.ts` entrypoint — does it use `process.cwd()` where it
  shouldn't? Does it handle errors gracefully (no uncaught promise rejections)?
- Is there logic duplicated between a script and an existing core utility?

---

## Phase 7 — Test suite

Read the spec files for the highest-risk engines:

- `persistent-task-queue.spec.ts` — concurrency paths covered?
- `agent-lock-engine.spec.ts` — atomic write path tested?
- `sync-proposal-registry.spec.ts` — concurrent sync tested?
- `proposal-scaffold-linter.spec.ts` — 5-digit ID constraint tested?
- `round-context.spec.ts` — digest staleness tested?

Flag any engine with >300 LOC that has <3 spec files — that is an undertest risk.

---

## Phase 8 — Cross-cutting concerns

### Concurrency table (REQUIRED in every full-repo audit)

For every identified concurrent-write scenario, fill in:

| Scenario | Risk | Mitigation | Gap |
|---|---|---|---|
| Two agents write `index.json` simultaneously | Torn JSON | `writeFileAtomic`? | ✅ / ❌ |
| Agent dies mid-lock-write | Corrupt `agents.lock.json` | `writeFileAtomic`? | ✅ / ❌ |
| Log reader reads while writer writes | Torn read | Mutex covers reads? | ✅ / ❌ |

### Token-efficiency check

- Confirm `overview { compact: true }` stays under the measured budget
  (see `docs/mcp-vertex/TOKEN-BUDGETS.md`).
- Any tool description prose that is redundant (explains the same thing the
  parameter name already makes obvious)?

### Skills alignment

Open each file in `docs/mcp-vertex/skills/*/SKILL.md`:
- Do tool names referenced still exist?
- Do file paths referenced still exist?
- Are there new tools that should be mentioned but aren't?

### `AGENTS.md` hard-rules compliance scan

Go through hard rules 1–10. For each one, cite any violation found:
1. Core agnostic? (no plugin imports in `packages/core`)
2. No `process.cwd()` in engines?
3. No `*Sync` in hot paths?
4. Durable writes through primitives?
5. Workspace-scoped paths use `resolveWorkspaceContained`?
6. `redactSecrets` before persisting user text?
7. Token budget invariant guarded?
8. Every public tool has `outputSchema`?
9. i18n complete for all web copy changes?
10. No `.py`/`.sh` in `tools/`/`scripts/`?

---

## Phase 9 — Synthesize findings

Only now, write the audit document. For **every finding**:

```
### N. [Short title]
**File**: [`filename#LNN`](file:///absolute/path/to/file#LNN)

```typescript
// paste the exact problematic lines
```

**Problem**: [precise explanation of what is wrong and why]
**Impact**: [what breaks, corrupts, or degrades if left unfixed]
**Resolution Track**: [Resolved in slice `sN`] | [Deferred to proposal `xNNNNN`]
```

Findings without a code quote are **rejected**. Do not write "it appears that"
or "possibly" — either you read the code and saw it, or you didn't find it.

---

## Phase 10 — Scoreboard and verdict

Fill the `## Scoreboard` table after you have all findings. Scores must be
justified by the findings table — a dimension with a P0 finding cannot score
above 6/10. The overall score is the unweighted average, rounded to one decimal.

---

## Anti-patterns to avoid

| Anti-pattern | Why it's wrong |
|---|---|
| "The tests pass, so the code is correct" | Tests don't catch design violations, atomicity gaps, or host-coupling |
| Citing a finding without a file+line reference | Unverifiable — leaves future auditors unable to confirm whether it was fixed |
| Running only `bun run validate` and calling it done | This is the pre-flight baseline, not the audit |
| Repeating findings from a previous audit without re-checking them | The code may have been fixed; citing stale findings wastes the reader's time |
| Listing "potential" or "possible" issues without code evidence | Speculation is noise |

---

## Output checklist

Before marking the audit slice as `done`, verify:

- [ ] `## Goal` includes the HEAD commit hash.
- [ ] `## Verified State` table is filled with real numbers from Phase 0.
- [ ] `## Findings` table has at least one entry per Phase 2 plugin read.
- [ ] Every finding row links to a real file with a line number.
- [ ] Every finding row has a Resolution Track.
- [ ] `## Scoreboard` scores are justified by findings.
- [ ] `bun run lint:proposals` exits 0 on the audit file.
- [ ] `bun run validate` exits 0 (all tests still green).
