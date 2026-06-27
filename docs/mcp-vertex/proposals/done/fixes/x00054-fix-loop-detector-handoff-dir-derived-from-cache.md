---
id: x00054
status: done
type: proposal
track: plugins/proposals+orchestration
date: 2026-06-27
kind: fix
title: `loop-detector.handoffDir` is hardcoded to `.cache/mcp-vertex/handoff` and bypasses the host-configured `cacheDir` — agents that relocate the cache end up writing handoffs to a stray path
runner: copilot
model: minimax-m3
scope: plugin-infrastructure
related:
    - f00054 # declutter + centralized cache — the same "one source of truth" line; this proposal closes a remaining drift point
    - x00052 # the previous move that exposed how many paths the host-cache contract is silently assumed in
recan: []
ownership:
    - { agent: implementation_runner, task: 'S1: in `plugins/proposals/src/lib/agents/loop-detector-config.ts`, replace the hardcoded `handoffDir: ".cache/mcp-vertex/handoff"` with a function `defaultHandoffDir(cacheDir: string)` that returns `joinRel(cacheDir, "handoff")`. Wire it from `index.ts` so the loop detector receives the host-resolved `ctx.cacheDir` (or, for tests that do not pass a cache dir, fall back to `DEFAULT_CORE_PATHS.cacheDir`). Add a unit test that constructs `AgentLoopDetectorService` with a workspace where `cacheDir` is `.cache/custom-cache` and asserts `handoffDirAbs` ends in `.cache/custom-cache/handoff/stuck-agent.json` (not `.cache/mcp-vertex/...`).' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,        expect: exit0 }
    - { command: bun run test,             expect: exit0 }
    - { command: bun run lint:tools,       expect: exit0 }
    - { command: bun run validate,         expect: exit0 }
---

# x00054 — `loop-detector.handoffDir` is hardcoded to `.cache/mcp-vertex/handoff`

## goal

`LOOP_DETECTOR_DEFAULTS.handoffDir` in
`plugins/proposals/src/lib/agents/loop-detector-config.ts:113` is
hardcoded to the string `'.cache/mcp-vertex/handoff'`. The loop
detector service resolves this against the workspace at
`loop-detector-service.ts:87` and `loop-detector-service.ts:102`:

```ts
this.handoffDirAbs = ctx.workspace.resolve(this.options.handoffDir);
// …
this.handoffDirAbs = this.ctx.workspace.resolve(options.handoffDir);
```

The path is **always** relative to the workspace root, **not** to
`ctx.cacheDir`. A host that reconfigures the cache via
`--cacheDir=.cache/custom-cache` (or `cacheDir:` in
`mcp-vertex.config.json`) gets:

- locks under `.cache/custom-cache/agents.lock.json` (correct,
  wired via `buildSwarmPaths(ctx.cacheDir, ctx.docsDir)` in
  `index.ts:127`),
- task queue under `.cache/custom-cache/agent-queue/queue.json`
  (correct, same wiring),
- registry under `.cache/custom-cache/subagent-registry.json`
  (correct, same),
- but the loop-detector handoff under `.cache/mcp-vertex/handoff/`
  — **stranded outside the configured cache root**.

The drift is silent: the loop detector still writes the handoff,
the orchestrator can still read it back, the agent still sees the
"stuck-detected" stop. The only symptom is a stray cache directory
that survives the host's cache cleanup, accumulates stuck-agent
files over time, and is invisible to any cache lifecycle
housekeeping. The pattern is the same family as x00052 (the
proposals index used to live at a hardcoded path that the host
cache contract was silently assumed to satisfy) — an implicit
invariante that holds only because nobody reconfigures the cache.

## why

Two reasons the bug exists:

1. **`LOOP_DETECTOR_DEFAULTS` is a `const` of literals** — there
   is no factory to inject the cache dir into. Every other
   configurable artifact (locks, queue, registry, counters, the
   proposal index) is built by `buildSwarmPaths(cacheDir, docsDir)`
   from the host's resolved `ctx.cacheDir` / `ctx.docsDir`. The
   handoff is the only one that does not flow through that
   function.
2. **`AgentLoopDetectorService` is constructed in `index.ts:120`
   with just `ctx`** — no `layout` or `cacheDir` is passed. The
   constructor reads `this.options.handoffDir` and resolves it
   against the workspace, never against the cache dir.

A host that changes the cache today is **inconsistently relocated**:
8 of 9 cache artefacts follow the new cache dir, the 9th
(handoff) goes to the default. The fix is to (a) make the default
factory accept a `cacheDir` argument, and (b) thread `ctx.cacheDir`
through the constructor.

## non-goals

- **No change to the public contract** of `LOOP_DETECTOR_DEFAULTS`
  for the fields that are not path-bearing. Only `handoffDir`
  changes type (`string` → `(cacheDir: string) => string`); the
  other 11 fields stay as-is.
- **No change to the loop detector's detection logic** — the
  in-tool `consecutiveIdle` streak, the ring buffer, the handoff
  TTL, the git diff check, etc. all stay as they are.
- **No migration of strays** — a host that already has
  `.cache/mcp-vertex/handoff/` from before this fix can delete it
  manually; the new handoff will live under their configured
  `cacheDir`. The strays are read-only orphan directories, no
  active tool will read them.

## slices

### S1 — derive `handoffDir` from `cacheDir`

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/agents/loop-detector-config.ts`
  - `plugins/proposals/src/lib/agents/loop-detector-service.ts`
  - `plugins/proposals/tests/src/lib/agents/loop-detector-config.spec.ts`
- **Command**: `bun run validate`
- **Expect**: exit0

Three small changes:

1. In `loop-detector-config.ts`, change the type of `handoffDir` in
   `ILoopDetectorOptions` from `string` to
   `(cacheDir: string) => string`, and add a
   `defaultHandoffDir(cacheDir: string): string` helper that
   returns `joinRel(cacheDir, 'handoff')`. The default export
   `LOOP_DETECTOR_DEFAULTS` becomes a function:
   `LOOP_DETECTOR_DEFAULTS(cacheDir: string): ILoopDetectorOptions`.
2. In `loop-detector-service.ts`, update the constructor and the
   `ensureConfigLoaded` path to call `LOOP_DETECTOR_DEFAULTS(ctx.cacheDir
   ?? DEFAULT_CORE_PATHS.cacheDir)`. Add a `readonly cacheDir: string`
   field so the test can assert on it.
3. In `index.ts`, the construction
   `new AgentLoopDetectorService(ctx)` already has `ctx.cacheDir`
   in scope (it is the value the layout was just built from); pass
   it explicitly to the constructor (signature change:
   `constructor(ctx, opts?: { cacheDir?: string })`).

Test coverage:

- New unit test in
  `plugins/proposals/tests/src/lib/agents/loop-detector-service.spec.ts`:
  construct the service with a workspace where `ctx.cacheDir` is
  `'.cache/custom-cache'`, force the detector into the stuck state
  (existing fixture pattern), and assert that
  `service.handoffDirAbs` ends in
  `.cache/custom-cache/handoff/stuck-agent.json` — **not** the
  legacy `.cache/mcp-vertex/handoff/...` path. This pins the
  regression: if a future refactor reintroduces the hardcoded
  default, the assertion fails.

- Existing test that resolves `mockCtx.workspace.resolve('.cache/mcp-vertex/handoff')`
  at lines 101, 127, 329 is the **legacy default fixture** — it
  builds the mock by hand and did not set `cacheDir` in
  `ctx.options`. After this fix, the service should still produce
  `.cache/mcp-vertex/handoff/...` when the host does not override
  the default. The test must be updated to either (a) explicitly
  inject `cacheDir: '.cache/mcp-vertex'` in the mock ctx, or
  (b) read it from `mockCtx.options?.cacheDir ?? DEFAULT_CORE_PATHS.cacheDir`.
  Both are one-line edits; neither changes the test's *assertion*.

## acceptance criteria

- `bun run validate` is green.
- The new test in `loop-detector-service.spec.ts` passes; a
  companion "regression pin" test (cache dir set to
  `.cache/mcp-vertex` ⇒ handoff lands under the default) also
  passes.
- A host that sets `cacheDir: '/tmp/alt'` in
  `mcp-vertex.config.json` gets the handoff at
  `/tmp/alt/handoff/stuck-agent.json`, not at
  `/tmp/mcp-vertex/handoff/...`.

## risks

- **Constructor signature change**: any host plugin that subclasses
  `AgentLoopDetectorService` and calls `super(ctx)` will keep
  working (the second arg is optional). A host that explicitly
  passes a `cacheDir` and expects the legacy hardcoded path would
  need to be updated — but the only in-tree consumer is
  `plugins/proposals/src/index.ts:120` which is updated in this
  slice.
- **Stray directories**: a host upgrading from a previous build
  will leave a `.cache/mcp-vertex/handoff/` on disk. The new code
  never reads it; it is dead weight. The repo does not auto-clean
  (the `lint:cache` rule only forbids `.cache` directories
  *outside* the root, not orphan files inside it); users can
  delete the directory manually if they care.
