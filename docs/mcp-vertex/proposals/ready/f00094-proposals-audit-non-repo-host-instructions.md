---
id: f00094
status: ready
type: proposal
kind: feat
track: proposals+host-discovery+cli-onboarding
date: 2026-07-01
title: proposals plugin exposes on-demand audit of non-repo host-instructions
shipped-in: []
recan: []
related:
    - f00093 # init's snapshot path — the in-repo counterpart
    - f00092 # host-hints single fragment — the canonical layout f00094 reads from
    - f00084 # `init` command (no code change here; the tool is callable independently)
    - f00089 # adoption-plan umbrella — f00094 emits a proposal of the same shape
ownership:
    - { agent: proposal_guardian,    task: 'S1: decide the scan surface (which host config paths count as "agent instructions" — 3 in-repo + N user-home). Document the include/exclude table.' }
    - { agent: implementation_runner, task: 'S2: add `scan_host_instructions(workspaceRoot, options)` in a new `plugins/proposals/src/lib/tools/scan-host-instructions.tool.ts`; reads the same 3 in-repo host files as f00093 PLUS the optional user-home files via a workspace-resolver-aware reader (no `process.cwd()`); returns a structured inventory' }
    - { agent: implementation_runner, task: 'S3: add `mcp-vertex_proposals_inherit_host_instructions { workspaceRoot, scope? }` — the tool that the proposal registry exposes; calls the scanner, allocates the next free id (mirror f00093 + f00089 U1), and emits a `ready` proposal of the same shape as f00093\'s snapshot body, with the inventory inline' }
    - { agent: delivery_verifier,    task: 'S4: e2e spec: in a tmpdir, run `scan_host_instructions` against fixtures covering in-repo only, user-home only, mixed-empty, mixed-non-canonical, and cross-host-block-content; assert (a) inventory shape is deterministic, (b) proposal lands at the next free id (not f00001), (c) the user-home reader respects `resolveWorkspaceContained` so we never escape the workspace boundary' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
    - { command: bun run catalog:check, expect: exit0 }
---

# f00094 — proposals plugin exposes on-demand audit of non-repo host-instructions

## goal

Add a single new tool to the `proposals` plugin —
`mcp-vertex_proposals_inherit_host_instructions { workspaceRoot, scope? }`
— that lets the operator (or an agent) ask: "what do my agent config
files actually say today?" and walk away with a `ready` proposal that
makes the answer diffable, allocatable, and reviewable in the same
review flow as f00093.

The tool scans two surfaces:

1. **In-repo (always)** — the three host files f00093 already covers:
   `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`.
2. **Host-specific user-home config (opt-in via `scope: 'all'`)** —
   `~/.cursorrules`, `~/.aider.conf.yml`, `~/.claude.json`,
   `~/.codex/config.toml`, `~/.continue/config.json`. These live
   outside the repo but contain instructions the previous agent was
   actually reading.

The emitted proposal mirrors f00093's body shape (frontmatter +
inventory + slices S1 classify / S2 integrate) so a reviewer who
knows f00093 already knows this file. The single, intentional
difference is the **scope tag** at the top of `## inventory`:
"in-repo" vs "user-home" vs "mixed".

## why

1. **f00093 only covers the in-repo path.** Its snapshot fires from
   inside `init`, after `hostInstructions: 'overwrite'` is set, and
   only reads the three host files in the repo. That covers the 90%
   case for `init:default` users, but operators who want to know
   "what is every host currently configured with?" have no tool
   today — they have to `cat` six files by hand across five locations.
2. **The proposals plugin already owns the ledger.** The user-home
   files are NOT proposals (they are host config — not "work"), so
   adding them to the proposals queue is wrong. f00094 mirrors f00093:
   it dumps the captured content into a `ready` proposal that the LLM
   reviews on the next `auto_work` pass. The proposal is the audit log,
   not the ruleset.
3. **Workspace containment is already solved.** The
   `resolveWorkspaceContained` primitive (f00080) is exactly what we
   need: the user-home paths are explicit opt-ins with explicit
   allow-list semantics; the workspace roots are still bounded by the
   AGENTS.md hard rule. No new safety primitive required.
4. **Same shape as f00093 = lowest cognitive load.** A reviewer who
   already knows f00093's body format can read this proposal cold.
   The slices section is byte-identical; only the inventory preamble
   and the title differ.

## why this design

- **Same body as f00093, on-demand.** The proposal format mirrors
  f00093 (frontmatter + inventory + S1/S2 slices) so a reviewer who
  knows f00093 already knows this file. The single, intentional
  difference is the `scope` switch (`'repo'` default, `'all'` opt-in)
  that gates user-home paths; everything else is identical.
- **No automatic writes to host files.** The tool only reads; the
  destination of every captured rule is decided by the LLM during
  the review slices, exactly like f00093.
- **Mirror f00089 U1's id allocation.** `allocateNextProposalId` is
  shared with f00093 and `renderAdoptionPlan`, so two `init` runs
  plus one `inherit_host_instructions` call never spawn colliding
  ids. The counter increases monotonically across all three.
- **Workspace containment is already solved.** The user-home paths
  are explicit opt-ins with a hand-maintained allow-list. The
  in-repo paths are bounded by the AGENTS.md hard rule. No new
  safety primitive required.

## non-goals

- **No automatic write to any host file.** The tool only reads. The
  destination of every captured rule is decided by the LLM during the
  review slices, exactly like f00093.
- **No detection of brand-new rules to inject back.** Captured content
  is information, not instructions.
- **No modification of `.cursorrules` / user-home files.** This is a
  scan-and-propose tool, not a migration tool.
- **No i18n**. The proposal body's `inventory` section uses the same
  English conventions f00093 uses; the rest of the proposal is
  inherited from the canonical layout.
- **No new CLI.** The proposal registry surfaces the tool; the
  `mcpv` CLI is a thin wrapper that already works for every other
  proposals tool. If we ever want a `mcpv host audit` shortcut we can
  add it in a follow-up (f00095+) without revisiting f00094.

## architecture

```
plugins/proposals/src/lib/tools/
  scan-host-instructions.tool.ts     # NEW: scan_host_instructions(reader, options)
  scan-host-instructions.spec.ts     # NEW: 8 in-memory tests
  inherit-host-instructions.tool.ts  # NEW: tool wrapper that emits the proposal

docs/mcp-vertex/proposals/ready/
  f00094-proposals-audit-non-repo-host-instructions.md   # NEW: this file
```

The orchestrator:

```ts
// inherit-host-instructions.tool.ts (~80 lines)
export const inheritHostInstructions = async (
  answers: { workspaceRoot: string; scope?: 'repo' | 'all' },
  options: { reader: IFileReader },
): Promise<readonly IProposableFile[]> => {
  const inventory = await scanHostInstructions(options.reader, {
    workspaceRoot: answers.workspaceRoot,
    scope: answers.scope ?? 'repo',
  });
  if (inventory.totalNonCanonical === 0) return [];
  const id = await allocateNextProposalId(options.reader);
  const proposalBody = renderHostInstructionsAuditProposal({
    id, inventory, ...answers,
  });
  return [{
    relPath: `docs/mcp-vertex/proposals/ready/${id}-inherit-host-instructions-${answers.workspaceRoot}.md`,
    content: proposalBody,
  }];
};
```

`scan_host_instructions` returns a structured inventory that the
proposal renderer stringifies inside `<pre>`-fenced blocks (one per
file, same shape as f00093 §inventory).

**Surface table** (S1 deliverable):

| Path | Surface | Default scope |
|---|---|---|
| `AGENTS.md` | in-repo | always read |
| `CLAUDE.md` | in-repo | always read |
| `.github/copilot-instructions.md` | in-repo | always read |
| `~/.cursorrules` | user-home | only when `scope: 'all'` |
| `~/.aider.conf.yml` | user-home | only when `scope: 'all'` |
| `~/.claude.json` | user-home | only when `scope: 'all'` |
| `~/.codex/config.toml` | user-home | only when `scope: 'all'` |
| `~/.continue/config.json` | user-home | only when `scope: 'all'` |

User-home paths are resolved through `resolveWorkspaceContained` with
an explicit allow-list (no glob, no fuzzy match — the paths are a
hand-maintained constant table). If a future version wants more paths,
it adds rows to the table; nothing else changes.

## slices

### S1 — Classify the scan surface

- **Status**: pending
- **Files**: `docs/mcp-vertex/proposals/ready/f00094-proposals-audit-non-repo-host-instructions.md`
  (this proposal)
- **Gate**: typecheck
- **Acceptance**:
  - "The proposal frontmatter documents the include/exclude table for
    both in-repo and user-home paths and explains why `scope: 'all'`
    is opt-in (user-home is outside the workspace containment boundary)."

### S2 — Implement `scan_host_instructions`

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/scan-host-instructions.tool.ts`
  (new), `plugins/proposals/src/lib/tools/scan-host-instructions.spec.ts`
  (new)
- **Gate**: typecheck
- **Acceptance**:
  - "The new module exports `scan_host_instructions(reader, { workspaceRoot, scope })`
    that returns a deterministic `IHostInstructionsInventory`."
  - "With `scope: 'repo'` (default), the function reads only the three
    in-repo files via the injected reader; user-home paths are NOT
    touched."
  - "With `scope: 'all'`, the function ALSO scans the user-home paths
    through a separate reader that respects the workspace containment
    boundary — a missing user-home file returns `undefined` (the
    catch-all from `IFileReader.readFile`), NOT a thrown error."

### S3 — Add the `inherit_host_instructions` tool

- **Status**: pending
- **Files**:
  `plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts`
  (new),
  `plugins/proposals/src/lib/tools/inherit-host-instructions.spec.ts`
  (new)
- **Gate**: typecheck
- **Acceptance**:
  - "The new tool is registered through the proposals plugin's tool
    registry and surfaces the input schema
    `{ workspaceRoot: string; scope?: 'repo' | 'all' }`."
  - "When `inventory.totalNonCanonical === 0`, the tool returns
    `{ files: [] }` (no empty proposal lands in the queue)."
  - "When at least one host file has non-canonical content, the tool
    allocates the next FREE id via the same mechanism f00089 U1 +
    f00093 use (never a hardcoded `f00001`)."
  - "Failure mode is `error: { reason, nextAction }` (the canonical
    envelope) for catastrophic failures and `ok` with `files: []`
    for soft failures (no audit trail to write means no proposal)."

### S4 — e2e + validate

- **Status**: pending
- **Files**: the 3 files above + this proposal
- **Gate**: validate
- **Acceptance**:
  - "`bun run validate` is green (typecheck + lint + 3 fragment
    lints + i18n + tests)."
  - "`bun run catalog:check` is green (the new tool is enumerated in
    the catalog artifact)."
  - "An e2e spec exercises every `scope` combination against an
    in-memory reader; the structured return shape is asserted for each."

## dependency graph

- **Upstream (already shipped)**: f00083 (anti-duplication guard),
  f00089 U1 (adoption-plan + id allocation), f00092 (single fragment),
  f00093 (in-repo snapshot — the body template this slice mirrors).
- **No new plugins / no new i18n keys / no new CLI flags.**
- **Two new tool files + two new spec files** under
  `plugins/proposals/src/lib/tools/`.
- **One new proposal stub** (this file — the registry slot is
  inherited from the existing proposals plugin bootstrap, nothing
  wires a new plugin).

## acceptance

- `bun run validate` is green.
- `mcp-vertex_proposals_inherit_host_instructions { workspaceRoot }`
  produces a `ready` proposal whose body carries every captured
  payload in fenced code blocks, with the canonical block beside
  each, exactly like f00093.
- `mcp-vertex_proposals_inherit_host_instructions { workspaceRoot, scope: 'all' }`
  ALSO captures the user-home hosts (when present) without escaping
  the workspace containment boundary.
- The new tool is enumerated in the catalog artifact and surfaces in
  `mcp-vertex_agent_catalog { section: 'tools' }`.
- The bootstrap canonical rule (rules live in
  `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, not in checked-in host files)
  is preserved: the audit proposal is information, not a second source
  of truth.

## risks and mitigations

- **Risk**: the user-home reader accidentally escapes the workspace
  boundary on symlinked home directories. **Mitigation**:
  `resolveWorkspaceContained` runs the same containment check every
  other workspace path undergoes; symlinks that escape raise a typed
  error that the tool surfaces in the `error` envelope.
- **Risk**: the proposal body grows unbounded when a user-home file
  contains a large JSON config. **Mitigation**: same posture as
  f00093 — over 16 KiB the renderer switches to a `.cache/mcp-vertex/
  legacy-host-instructions/<host>.md` link instead of inlining.
- **Risk**: the user-home file table drifts from reality
  (new IDEs ship new config paths). **Mitigation**: the table is a
  single constant in `scan-host-instructions.tool.ts`; adding a row
  is one PR. A `bun tools/scripts/lint/host-file-coverage.script.ts`
  lint (out of scope for f00094, candidate for f00095) can warn when
  a known IDE config is detected but our table does not include it.

## notes

- **Open question for the slice owners**: do we want the proposal to
  carry a `meta.scope` field (one of `repo` / `all`)? Cheap to add
  (one extra frontmatter key, easy to grep in the proposals index).
  Will commit on `yes` in S3.
- **Follow-up proposal idea (f00095)**: a `bun tools/scripts/lint/
  host-file-coverage.script.ts` lint that scans known-IDE config
  fingerprints and fails when one is found in the user's home but
  the host-file surface table does not include it. Out of scope for
  f00094.
- **Follow-up proposal idea (f00095+)**: a `mcpv host audit` CLI
  shortcut that calls `mcp-vertex_proposals_inherit_host_instructions`
  under the hood for users who don't run via the MCP server. Out of
  scope for f00094.
