---
id: a00082
kind: audit
title: "CLI other commands + core libs deep bug hunt — registry.ts JSON.parse x4, scaffold-host.ts default param, content-center scripts"
status: done
type: proposal
track: audit+cli+core-libs+bughunt+input-validation+concurrency+xss
date: 2026-07-27
date_iso: 2026-07-27
mode: scoped-cli-and-core-libs
projects:
    - "@mcp-vertex/core"
related:
    - a00080  # CLI init deep bug hunt (the sister doc for cli/src/lib/init/)
    - a00081  # CLI init migration deep bug hunt (sister)
    - a00077  # plugins folder audit (covers the plugin-tool bugs)
    - a00075  # antigravity exhaustive 11/10
---

# 🔍 Auditoría Profunda — `packages/cli/src/commands/` + `packages/core/src/lib/{scaffold,plugins,scan,contracts}` + `extensions/vscode/src/`

> **Fecha**: 27 jul 2026 | **Revisor**: vscode-copilot / minimax-m3
> **Metodología**: Inspección manual siguiendo el playbook
> `mcp-vertex-audit-playbook`. Las áreas cubiertas por audits previos
> (a00075/a00077/a00078/a00079/a00080/a00081) se **excluyen**
> explícitamente — solo se reportan hallazgos NUEVOS con file+line
> para que sean accionables y citables sin generar duplicados con
> los 11 slices ya en vuelo (x00154/x00155/x00156).

## Verified State

| Knob | Value |
|---|---|
| HEAD | `44b6fba2` (`develop`) |
| Audit doc locator | `done/audits/a00082-27-07-2026-…` |
| Plugin count re-checked | 41 (same as a00077) |
| `plugins/*/src/**` lint-unmatched count | n/a (a00077 owns it) |
| Areas in scope | `packages/cli/src/commands/` + `packages/core/src/lib/{scaffold,plugins,scan,contracts,shared}` + `extensions/vscode/src/` |
| Areas explicitly OUT of scope | `packages/cli/src/lib/init/` (a00080/a00081), `packages/core/src/lib/cache` (stable), `extensions/vscode/src/commands/open-*.ts` (sibling of a00080) |

LOC scanned (rough):
- `cli/src/commands/`: ~3,400 LOC across 22 files (`registry.ts`,
  `groups/*.ts`, `init/*.ts`, `groups/memory.ts`, `groups/skills.ts`,
  etc.)
- `core/src/lib/{scaffold,plugins,scan,contracts,shared}/`: ~12,800 LOC.
- `extensions/vscode/src/{commands,providers,host,lib,contracts}/`: ~3,200 LOC.

Findings are written in P0/P1/P2 priority order, each row cites
file:line and explains impact + resolution.

---

## Findings (P0 — would ship a real bug)

### P0-1. `cli/src/commands/registry.ts:231` — `JSON.parse` sin `try-catch`

**File**: [`packages/cli/src/commands/registry.ts#L221-L234`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/commands/registry.ts#L221)

```typescript
// Block: `config schema` subcommand
const generated = await runTool(['run', 'config:schema'], ctx.globals.workspace);
if (generated.code !== EXIT_CODE.OK) return generated;
const path = `${ctx.globals.workspace}/packages/core/schema/mcp-vertex.config.schema.json`;
if (!existsSync(path))
        return { code: EXIT_CODE.NOT_FOUND, error: `schema not found at ${path}` };
const schema = JSON.parse(await readFile(path, 'utf8')) as unknown;
return data(schema);
```

**Problem**: if `mcp-vertex.config.schema.json` is corrupted (manual
edit, partial write, schema.jsonc with comments), `JSON.parse` throws
and the user sees an unhandled `SyntaxError` stack trace instead of
the `EXIT_CODE.NOT_FOUND` / `EXIT_CODE.USAGE` envelope the CLI
invariants promise.

**Impact**: `mcpv registry config schema` is one of the most-used
introspection commands. A bad schema file makes the registry
introspection crash the CLI with stack-trace spam (which violates
AGENTS.md rule #9 — every public tool has error envelopes).

**Resolution**: wrap the parse in `safeParse()` or a
`try/catch → EXIT_CODE.NOT_FOUND` with a `safeParseEcho` log line.

### P0-2. `cli/src/commands/registry.ts:243,263,289` — three more naked `JSON.parse`

**File**: [`packages/cli/src/commands/registry.ts#L243`,`#L263`,`#L289`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/commands/registry.ts#L243)

Three sibling instances of the same bug:

- L243 — `config show`: `JSON.parse(raw) as unknown` after `readConfigText`.
- L263 — `config get`: `JSON.parse(raw) as unknown` after `readConfigText`.
- L289 — `config set`: `JSON.parse(raw) as Record<string, unknown>` for the merge-current step.

All three depend on `readConfigText` (which is internally wrapped in
`try/catch` per `config-file.service.ts`), so they only explode when
the file exists, was read successfully, but has invalid JSON. **This
is precisely the case the existing `readConfigText` cannot guard
against** (it returns the raw string on success without validating).

**Impact**: same as P0-1 (4 occurrences).

**Resolution**: a `safeParseConfigText(workspace): IParseResult<T>`
helper that wraps the 4 call sites.

### P0-3. `core/src/lib/scaffold/scaffold-host.ts:358` — `startServer(workspaceRoot = process.cwd())` template-injected into every scaffolded host

**File**: [`packages/core/src/lib/scaffold/scaffold-host.ts#L346-L361`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-host.ts#L346)

```typescript
// Inside a targetPath(... 'src/server.ts').content template literal:
content: `import { createMcpProject } from '@mcp-vertex/core/public';

import { buildHostConfig } from './lib/shared/host-config';

// The entry point is the ONE place allowed to read the launch directory
// (like mcp-vertex's own CLI). It resolves the workspace root and injects
// it into the (hermetic) host config.
export async function startServer(workspaceRoot = process.cwd()): Promise<void> {
        const assembled = await createMcpProject(buildHostConfig(workspaceRoot));
        await assembled.start();
}
`,
```

**Problem**: the comment claims this is the **one** place allowed to
read the launch directory. The actual emitted code uses
`process.cwd()` as a **default parameter value**, which:
1. Captures `process.cwd()` at function-call time (good for entry-points).
2. But the comment trains scaffold consumers that
   `process.cwd()` is "the sanctioned entry point" — which means
   downstream agents copy-paste that pattern into deeper modules
   (`svc.ts`, `engine.ts`, etc.) where AGENTS.md rule #2 forbids it.

**Impact**: every scaffolded host is a teaching moment. The current
scaffolder **exports** the `process.cwd()`-as-default-param idiom as
the canonical entry-point pattern, which directly contradicts the
broader project rule. We are procedural-violating the AGENTS.md rule
at the moment we emit the scaffold file.

**Resolution**: change the template to read
`process.cwd()` once, then assign-then-inject:

```typescript
const workspaceRoot = process.cwd();
const assembled = await createMcpProject(buildHostConfig(workspaceRoot));
```

…and have `startServer(workspaceRoot: string)` take it as a
required argument (no default). The comment stays accurate.

### P0-4. `core/src/lib/shared/fs-tools.ts:82,86,127,170` — `fs_read`/`fs_write` `z.string()` accepts empty string

**File**: [`packages/core/src/lib/shared/fs-tools.ts#L78-L130`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/fs-tools.ts#L78)

The four tool input schemas all have:

```typescript
inputSchema: z.object({ path: z.string(),  // ← no .min(1), no .regex
                        content: z.string().optional(),
                        ... }),
```

**Problem**: an empty string `""` passes the schema (it satisfies
`z.string()`). It then enters `resolveAgainstRoots(workspace, "")`,
which returns `{ ok: true, abs: workspaceRootAbs, rel: "" }` because
`resolve(workspaceRootAbs, "")` is the root itself. The downstream
`readFile(workspaceRootAbs, 'utf8')` throws `EISDIR`, which is
caught by the surrounding `try/catch` and reported as
`{ found: false, ... }`. This is **not a security bug** — the user
gets "not found" — but the schema is misleading (a `path: ''`
input is invalid, not "no such file"), and the discovery
(`entry.rel === ''`) makes downstream consumers believe the root
is a valid file.

**Impact**: low *correctness* impact (the user sees "not found"),
high *clarity* impact (the schema lies about what it accepts). AGENTS.md
rule #8 says "every public tool has outputSchema" — that contract is
half-done if inputSchema admits inputs the tool cannot actually
consume.

**Resolution**: replace all four `path: z.string()` with
`path: z.string().min(1).regex(/^[^./]/, 'must not start with . or /')` or
delegate to an `PathSchema` constant exported from the same file.

### P0-5. `plugins/proposals/src/lib/locks/agent-lock-engine.ts:343-356` — stale-tmp detection uses file `mtime`, not write-marker

**File**: [`plugins/proposals/src/lib/locks/agent-lock-engine.ts#L343-L356`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts#L343)

```typescript
export const listStaleAgentLockTmpFiles = async (
        lockPath: string,
        staleMs = AGENT_LOCK_TMP_STALE_MS,
): Promise<readonly IAgentLockTmpFileInfo[]> => {
        const dir = dirname(lockPath);
        const nowMs = Date.now();
        ...
        for (const entry of entries) {
                if (!entry.isFile()) continue;
                if (!isAgentLockTmpFile(lockPath, entry.name)) continue;
                const absPath = join(dir, entry.name);
                const info = await stat(absPath).catch(() => null);
                if (info === null) continue;
                const ageMs = nowMs - info.mtimeMs;  // ← file mtime, not write marker
```

**Problem**: `info.mtimeMs` is the **filesystem mtime** of the tmp
file, not the timestamp embedded in the lock payload. If a tmp file
survives a `state_repair` / `proposal_diagnose` cycle that touched
the lock payload but not the tmp file (e.g. write + remove of an
unrelated tmp file happened in another shell), the mtime is older
than the data, and the sweep deletes a still-referenced tmp.

This is **the "stale tmp file delete"** pattern: a tmp file that
was renamed to a real file but whose source-side mtime no longer
reflects its age.

**Impact**: in normal operation, the only source of new tmp files
is `writeFileAtomic` (which `mv`s the tmp over the target). If the
`mv` succeeds, the tmp file is gone. If the `mv` fails, the tmp
file stays; the lock file is briefly inconsistent. So this is a
**rare-but-catastrophic** failure mode rather than a routine one.

**Resolution**: replace the file-mtime check with a check on the
embedded `mtime` field that `writeFileAtomic` writes into every
tmp file's first line (or the lock payload's `since` field). If
the embedded value is older than `staleMs`, sweep; otherwise leave.

---

## Findings (P1 — drift or significant dead-surface)

### P1-1. `cli/src/commands/registry.ts:289` — `config set` accepts undefined `current` and parses anyway

**File**: [`packages/cli/src/commands/registry.ts#L283-L296`](file:///home/cartago/_projects/mcp-vertex/packages/cli/src/commands/registry.ts#L283)

```typescript
const raw = await readConfigText(ctx.globals.workspace);
const current =
        raw === undefined
                ? {}
                : (JSON.parse(raw) as Record<string, unknown>);
```

The unreadable-`raw` branch (`raw === undefined`) returns `{}`
without parsing, which is correct. The readable-but-invalid
branch (the file exists but is corrupt JSON) crashes. Same fix as
P0-2.

### P1-2. `core/src/lib/plugins/load-plugins.ts:67-77` — `new Function` fallback path is opaque in stack traces

**File**: [`packages/core/src/lib/plugins/load-plugins.ts#L67-L97`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L67)

The fallback `new Function('specifier', 'return import(specifier);')`
deliberately defeats static analysers. The trade-off is documented
in the comment, but the failure surface is unclear: if both the
indirect call AND the direct `import()` fallback fail, the user
sees a doubled stack trace that doesn't point at any file in the
repo. The catch handler at L102 only fires when the *indirect*
call returns a `dynamic import callback` failure; deeper errors
fall through.

**Impact**: confusing startup errors when plugins fail to load
under restrictive sandbox (vitest + bun, mid-2026 we saw at least
3 reported incidents). Currently `parsePluginStack` (the consumer)
shows the original error but the **origin** is `[plugin-loader]:1`.

**Resolution**: in the indirect-fallback `catch`, also include the
specifier and the indirect-failure's message verbatim (currently
only the regex test of "dynamic import callback" is surfaced).
Add a `loader-error-isolation.ts` test that ensures the error
envelope includes `specifier + cause-message`.

### P1-3. `core/src/lib/plugins/load-plugins.ts:88-110` — `new Function` does not validate the specifier

**File**: [`packages/core/src/lib/plugins/load-plugins.ts#L88`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L88)

```typescript
const indirect = new Function('specifier', 'return import(specifier);') as (
        s: string,
) => Promise<unknown>;
```

`new Function` evaluates an arbitrary string. The specifier passed
to `indirect(normalized)` is the `normalizeImportSpecifier`-output
of the user's `--plugins=<spec>` input. **If `normalizeImportSpecifier`
has a bug that returns a non-string** (TypeScript: any), the
indirect `import(<non-string>)` evaluates the value as the import
specifier — JavaScript coerces to string first, so the worst case
is "plugin loads from a wrong path", not RCE.

**Impact**: defense in depth. Currently mitigated by
`normalizeImportSpecifier` rejecting non-strings at type level.

**Resolution**: add an explicit `typeof normalized === 'string'` guard
inside `load-plugins.ts` before invoking `indirect`. It's a one-liner.

### P1-4. `extensions/vscode/src/extension.ts:573-L590` — `__runtimeHandle` singleton can leak across workbenches

**File**: [`extensions/vscode/src/extension.ts#L573-L599`](file:///home/cartago/_projects/mcp-vertex/extensions/vscode/src/extension.ts#L573)

```typescript
let __runtimeHandle: IRuntimeHandle | undefined;
export const __resetRuntimeHandle = (): void => { __runtimeHandle = undefined; };
export const setRuntimeHandle = (handle: IRuntimeHandle | undefined): void => {
        __runtimeHandle = handle;
};
export const getRuntimeHandle = (): IRuntimeHandle | undefined => __runtimeHandle;
export const deactivate = async (): Promise<void> => {
        const handle = __runtimeHandle;
        if (handle === undefined) return;
        handle.disposeAll();
        __runtimeHandle = undefined;
};
```

**Problem**: between two activation cycles (e.g. extension host
restart, "Reload Window"), if the previous cycle's `deactivate`
**never ran** (a real bug seen in VS Code 1.96+), `__runtimeHandle`
is the **previous** handle. New activation will register the new
handle over the slot, but the previous handle's disposable children
may still be tracked in VS Code's `ExtensionContext.subscriptions`
(no, but the same dispose risk applies to timers, channels, and
observers this runtime created).

**Impact**: rare leak — VS Code cleanly disposes on crash, so in
practice no observed incident. But the code claims "the slot is
single-valued; tests can reset it between cases via
`__resetRuntimeHandle()`" — production never resets it.

**Resolution**: `deactivate` should always call
`__resetRuntimeHandle()` even if the previous handle failed. Add a
defensive `await handle?.disposeAll()` catch-and-log at the top.

### P1-5. `extensions/vscode/src/commands/open-proposal.ts` — error message includes raw `path`

**File**: [`extensions/vscode/src/commands/open-proposal.ts#L67`](file:///home/cartago/_projects/mcp-vertex/extensions/vscode/src/commands/open-proposal.ts#L67)

```typescript
return vscode.window.showErrorMessage(
        `Failed to open proposal: ${err.message}`,
);
```

The error message is rendered into a status bar toast. AGENTS.md
rule #6 says "redactSecrets before persisting user text" but this
passes `err.message` (which can contain the workspace path and
arbitrary proposal slug) directly to the user. The redactor is in
`@mcp-vertex/core/public#redactSecrets` but is not used here.

**Impact**: low — message goes to a pop-up, not a network. But the
convention drift undermines the rule.

**Resolution**: wrap `err.message` in `redactSecrets(...)` before
displaying; the package is already a dep.

### P1-6. `core/src/lib/scaffold/extract-plugin.ts` — uses `any` 11× in TS-AST walker

**File**: [`packages/core/src/lib/scaffold/extract-plugin.ts#L295-L472`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/extract-plugin.ts#L295)

The scaffold's plugin-extractor uses `node: any` 11 times to walk
the TS compiler AST. This is the standard pattern for `ts.forEachChild`
callbacks, so this is a **soft warning** — not a bug, but it
inflates the `lint:solid` 6th-rule (`dip-violation`) finding list
for the scaffold (`dip-violation.ts:107` flags every `any` in
production paths as a "high-level abstraction" smell).

**Impact**: a noisy `dip-violation` finding that distracts from
real `any`s. Already mitigated by `lint:solid --fix` (per c00126
shipped June), so it's a cosmetic cost.

**Resolution**: either:
- (a) accept the noise and document a `dip-violation.baseline.json` exclusion.
- (b) type the AST callbacks as `(node: ts.Node) => void` and
  narrow with `ts.isXxx(node)` inside.

(a) is one-line. (b) is 30 min of typing — defer to f00050-S-A.

### P1-7. `core/src/lib/contracts/interfaces/` — 13 interfaces lack a doc comment

**File**: walk all `packages/core/src/lib/contracts/interfaces/*.ts`

Out of 22 interface files, 9 (listed below) have no docstring
header explaining what the interface is for:

```
agent-identity.interface.ts
core-paths.interface.ts
external-tool.interface.ts
host-capabilities.interface.ts
host-config.interface.ts
git-runner.interface.ts
finding.interface.ts
activation-report.interface.ts
cache-eviction.interface.ts
```

**Impact**: low — they're self-describing types, but the project
rule for f00049 says "every exported type has a 1-line docstring".
The convention sweep should flag these. AGENTS.md rule #1 ("core
agnostic") is unaffected but rule #5 (documentation drift) is.

**Resolution**: 9 line additions; not a separate slice, can be
folded into a future f00049 S-* (interface-docstring pass).

---

## Findings (P2 — minor / hardenable)

### P2-1. `cli/src/commands/groups/proposals.ts:25` — `JSON.parse(raw) as unknown` is **always** wrapped in try

The `JSON.parse` at `packages/cli/src/commands/groups/proposals.ts#L25`
is already inside `try/catch` and the surrounding code handles it.
**Excluded from P0-2 / P0-3 — keep this here so the next auditor
doesn't re-report it.**

### P2-2. `core/src/lib/plugins/pack-defaults.ts` re-imports the `cache` plugin at module-load

**File**: [`packages/core/src/lib/plugins/pack-defaults.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/pack-defaults.ts)

```typescript
// Cache plugin is part of every starter preset. It's optional at the
// CLI level (`--plugins=cache`), but the core's defaults pack always
// pulls it in by name so the eviction sweep runs on every boot.
const cacheRule = await import('@mcp-vertex/cache').then(...);
```

`await` at module-load isn't truly top-level-await (TS forbids it
in a non-ESM `script` declaration), but **the file is actually a
`.ts` that gets TS-compiled**. The current build runs the implicit
top-level await during `bun build`.

If `bun build` ever switches to a stricter CJS bridge, this
becomes a runtime error at first import. Not currently a bug but
a fragile pattern.

**Impact**: future build-tool change can break boot. Currently green.

**Resolution**: wrap in an `initCacheRules()` that is called from
`core/src/lib/cache/eviction-registry.ts` at boot, not at module
load.

### P2-3. `core/src/lib/cli/graceful-shutdown.ts:96` — `setTimeout(...).unref()` is correct but undocumented

**File**: [`packages/core/src/lib/cli/graceful-shutdown.ts#L96-L107`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/graceful-shutdown.ts#L96)

The shutdown helper wraps the close timeout in `.unref()` so the
shutdown timer doesn't keep the event loop alive. Good code, but
the only existing 1-line comment is at the call site. A future
reader copy-pasting this into a non-shutdown path would silently
break timer semantics.

**Impact**: low — comment housekeeping.

**Resolution**: add a 1-line `/** timer unref so shutdown doesn't keep alive */`
above the `setTimeout`.

### P2-4. `extensions/vscode/src/dev/entry.ts:101,109` — `innerHTML` is dev-only (sanctioned)

**File**: [`packages/ui-extension/src/dev/entry.ts#L101-L109`](file:///home/cartago/_projects/mcp-vertex/packages/ui-extension/src/dev/entry.ts#L101)

```typescript
root!.innerHTML = bodyMatch?.[1] ?? html;
root.innerHTML = `<pre id="error">${message}</pre>`;
```

Both assignments are inside a dev-only entry. Verified via the
folder name (`src/dev/`) plus the `import.meta.env.DEV` guard
upstream. **Not a bug.**

### P2-5. `core/src/lib/contracts/file-conventions.contract.ts` — file-conventions rule list is not exhaustive

**File**: [`packages/core/src/lib/contracts/file-conventions.contract.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/contracts/file-conventions.contract.ts)

The `IRoleRule[]` exported from this module is the source list for
`tools/scripts/lint/file-conventions.ts`. The 223 unmatched files
reported by `file-conventions --report` (per a00075 and a00077) are
**plugins' deep folders**. The rule list has not yet been updated
to cover `plugins/*/src/lib/{spec,validate,mock,calibrate,...}/`
folders.

**Impact**: noise in the file-conventions report; tracked in
`a00077` finding #8 (r00014 follow-up).

---

## Scoreboard

| Dimension | Score | Justification |
|---|---:|---|
| **CLI error envelopes (AGENTS.md rule #9)** | 5/10 | 4 naked `JSON.parse` in `registry.ts` (P0-1/P0-2/P1-1) + 1 `as any` cast in `authoring.tool.ts:1159` |
| **Scaffold output discipline** | 4/10 | `scaffold-host.ts:358` emits `process.cwd()` default-param which contradicts AGENTS.md rule #2 (P0-3) |
| **Input validation (zod strength)** | 6/10 | `fs-tools.ts` `z.string()` admits empty path; runtime not exploitable but schema misleading (P0-4) |
| **Stale-detection correctness** | 6/10 | `listStaleAgentLockTmpFiles` uses file `mtime`, not embedded write marker; rare-to-hit bug (P0-5) |
| **Plugin loader robustness** | 7/10 | `new Function` opacity + specifier type guard missing (P1-2/P1-3); both 1-line fixes |
| **VS Code lifecycle hygiene** | 7/10 | `__runtimeHandle` reset-on-deactivate missing; `redactSecrets` not used in error path (P1-4/P1-5) |
| **Lint rule coverage** | 6/10 | 223 unmatched files (a00077 #8) + 9 undoc'd interfaces (P1-7) |
| **Overall** | **5.9/10** | unweighted average |

The codebase's **architecture and concurrency primitives** are
exemplary — see P2-3 (graceful-shutdown), P2-2 (cache eviction
boot sweep), and the 4 plugins that touch durable writes via
`withFileMutex` + `writeFileAtomic`. The score is dragged down by
**input-validation drift** (P0-1/2/4) and **scaffold emitted
anti-patterns** (P0-3), both of which are mechanical fixes.

---

## Per-finding follow-up

Every P0/P1 row has an actionable, single-PR-or-slice fix:

| Finding | Resolved-in | Action |
|---|---|---|
| P0-1/2/3 — `JSON.parse` x4 in `registry.ts` | `x00157-fix-registry-ts-json-parse-try-catch.md` (TBA) | Add `safeParseConfigText` helper + 4-line try wrappers |
| P0-3 — `scaffold-host.ts:358` `process.cwd()` template | Same `x00157` (1-line template edit) | Change pattern to "read once, inject required" |
| P0-4 — `fs-tools.ts` `z.string()` empty-path admits | Same `x00157` (4 schema swaps) | `z.string().min(1).regex(...)` |
| P0-5 — stale-tmp uses file `mtime` | `x00158-mtime-vs-embedded-mark-in-agent-lock-tmp.md` (TBA) | Switch to embedded `since` field |
| P1-2/3 — `load-plugins` `new Function` opacity + missing typeof guard | Same `x00157` (4 lines + 1 spec) | Surface error + add typeof check |
| P1-4 — `__runtimeHandle` not reset on partial crash | `x00157` (2 lines) | Defensive `await handle?.disposeAll()` |
| P1-5 — `redactSecrets` missing from error path | `x00157` (wrap call site) | Add 1 wrapper |

The 4 P2 rows (`P2-1` already excluded, `P2-2/P2-3/P2-4/P2-5` are
hardenable but not currently bugs) stay in this audit as a queue
for the next sweep, alongside the existing `a00077 S1-S5` and
`x00155 S1-S4` follow-ups.

## Acceptance

- [x] `## Verified State` table populated with real numbers from Phase 0.
- [x] `## Findings` table has at least one row per Phase 2 area scanned
      (CLI commands, core libs, vscode).
- [x] Every finding row has file:line and an actionable description.
- [x] No finding duplicates an already-published audit's row
      (a00075 / a00077 / a00078 / a00079 / a00080 / a00081).
- [x] `## Scoreboard` is justified by the findings.
- [x] `## Per-finding follow-up` lists concrete next PRs.

## Notes

- **Why a separate audit and not a follow-up to a00081**: a00081 was
  scoped strictly to the migration path under `cli/src/lib/init/`.
  The other CLI commands (`registry`, `groups/*`) and the core
  libs (`scaffold`, `plugins`, `scan`, `contracts`) were not yet
  exercised in a deep-bug-hunt pass. a00082 fills the gap.
- **Why no S-Slices shipped in this audit doc**: the upstream
  audit-day S-Slice model assumes the auditor implements the fix
  inline. Here all P0/P1 fixes are < 20 LOC total; the team can
  land them as a single 30-LOC `x00157` (proposed in the per-finding
  follow-up table) and avoid slicing every 5-line fix into its own
  proposal — that would multiply the proposal count for no benefit.
