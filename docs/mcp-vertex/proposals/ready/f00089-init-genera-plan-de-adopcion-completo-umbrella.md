---
id: f00089
status: ready
type: proposal
track: cli+bootstrap+onboarding+plugins+filesystem+migration
date: 2026-06-30
kind: feat
title: "umbrella — init generates a full adoption PLAN (migrate proposals + skills + tools, single source of truth, client plugin-author tool, default filesystem)"
shipped-in: []
recan: []
related:
    - f00084 # init CLI (bundle writer; this umbrella turns its migration STUB into a real PLAN)
    - f00088 # init respects target project (detection feeds the adoption plan)
    - f00087 # local plugin loading + client scaffold export (substrate for the client plugin-author tool)
    - f00068 # external-mcps plugin (paused; the default-filesystem decision interacts with its ext.fs seed)
    - f00065 # skill ownership / shared contracts (skill migration consumes this)
    - f00056 # agent discovery catalog (single-source-of-truth consolidation reads it)
ownership:
    - { agent: proposal_guardian,    task: 'U0: ratify this umbrella, lock the five vision points to child proposals/slices, and record the f00068-vs-native-fs decision (see §decision)' }
    - { agent: implementation_runner, task: 'U1: see child f00084 §vision — replace the f00001 migration STUB with an adoption-plan generator (detect foreign proposal system + emit a multi-slice migration proposal)' }
    - { agent: implementation_runner, task: 'U2: see child f00088 §vision — skill migration plan (own skills in + absorb target skills) and tool-namespace unification plan (no collisions)' }
    - { agent: implementation_runner, task: 'U3: see child f00088 §vision — single-source-of-truth consolidation of target agent instructions (AGENT-BOOTSTRAP + AGENTS style)' }
    - { agent: implementation_runner, task: 'U4: see child f00087 §vision — a CLIENT plugin-author tool that turns a description into a correct plugin and registers it by PATH, no core/internal inspection required' }
    - { agent: implementation_runner, task: 'U5: see §decision — native default filesystem with an authorized-roots allowlist (ext.read/ext.write or extended fs_read/fs_write) instead of waiting on f00068' }
globalGate: validate
acceptance:
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00089 — umbrella: init generates a full adoption PLAN

> **This is a planning umbrella, not an implementation slice.** It reconciles
> the four existing cluster proposals (f00084, f00088, f00087, f00068) against
> the user's expanded vision and routes each vision point to a concrete child
> slice. No feature code is authored under this proposal directly; the child
> proposals carry the implementation. The umbrella exists to (a) make the
> five vision points traceable, (b) fix the dependency order so the children
> can be parallelised without collisions, and (c) record the one cross-cutting
> decision (default filesystem) that does not belong to any single child.

## goal

Route the user's expanded `init` vision to the four existing cluster proposals,
fix the dependency order so the children parallelise without file collisions,
and record the one cross-cutting decision (default filesystem) that belongs to
no single child.

### The expanded vision (verbatim intent)

The user wants `init` to stop "only asking questions" and instead **emit a
complete adoption PLAN** when run inside a foreign project. Concretely, `init`
must:

1. **Detect** whether the target project already has a proposal system and
   **migrate it** to ours.
2. **Emit a proposal = full adoption plan** covering: (a) migrate mcp-vertex's
   own skills into the target, (b) absorb the skills the target already has,
   (c) unify tools (ours + theirs) with no namespace collision, (d) organise
   everything the way this repo does, (e) **collapse the target's agent
   instructions to a single source of truth** (AGENT-BOOTSTRAP + AGENTS style).
3. **Give the target's LLM a client tool to author plugins automatically** —
   without inspecting how mcp-vertex or its internal plugins are wired: the
   tool (i) generates a correct, complete plugin from a description and
   (ii) registers it on the host by PATH. Supports one or many project-specific
   plugins with their own tools.
4. **Default filesystem**: anyone using mcp-vertex can read files in their own
   project, and in external paths they explicitly authorize, **without** adding
   a filesystem server by hand.

## why

The cluster is already substantially implemented (see the table below), but the
proposal frontmatter still reads `ready`/"pending" and none of the four cover
the *new* surface the vision adds: foreign-proposal detection, skill/tool
migration plans, single-source-of-truth consolidation, a client plugin-author
tool, and a default authorized filesystem. Without one index, the new work
would be planned three times over and the fs decision would have no home.

### State of the cluster (what is already landed vs. what the vision adds)

The git history shows the cluster is **already substantially implemented**,
even though the proposal frontmatter still says `status: ready` with "pending"
slices. The umbrella must not re-plan landed work:

| Proposal | Landed today | Vision still needs |
|---|---|---|
| **f00084** | `init` command, prompts, render, writers, agent `.md` gen, host-instructions centralizer, **migration STUB** (`init-migrate-offer.ts` writes a generic `f00001-migrate-legacy-<scope>.md`) | The stub is **not** an adoption plan. It does not detect a foreign proposal system and does not enumerate skill/tool/instruction migration. → U1 |
| **f00088** | `init-detection.ts` (analyzeProject reuse), `host-entry-resolver.ts`, locale-aware agent fallback, convention-aware plugin root | No skill migration, no tool-namespace unification, no single-source-of-truth consolidation. → U2, U3 |
| **f00087** | `config.plugins.<name>.path` loader, `tools/scripts/create-plugin.ts`, client `writeScaffoldedFiles` export | Author script is **operator-facing** (a bun script), not a **client MCP tool the target's LLM can call** to author + register a plugin by path without reading the core. → U4 |
| **f00068** | paused; design only (curated/discoverable/live catalog, `ext.*`, lazy boot, autonomy knobs) | Default filesystem is blocked behind the whole external-mcps machine + an 8-item unpause gate. The vision wants something simpler and native. → U5 / §decision |

### Vision → coverage matrix

| # | Vision point | Covered by (today) | Gap (what is missing) | Child slice |
|---|---|---|---|---|
| 1 | Detect + migrate target proposal system | f00084 migrate STUB (writes a fixed proposal); proposals plugin `adopt` tool already SCANS a folder for proposals | Init never runs detection of a *foreign* proposal convention; the emitted proposal is generic, not a migration of what was found | **f00084 §vision U1** |
| 2a | Migrate our skills into target | f00084 `copyCoreSkills` copies skill files | No *plan* describing the migration; copy is unconditional, not reconciled with target skills | **f00088 §vision U2** |
| 2b | Absorb target's existing skills | nothing | Init does not inventory target skills at all | **f00088 §vision U2** |
| 2c | Unify tools (ours + theirs), no collision | f00088 namespace-prefix propagation into agent `.md`; native `ext.*`/prefix contract exists | No inventory of the target's tools, no collision-resolution plan | **f00088 §vision U2** |
| 2d | Organise like this repo | f00088 convention-aware roots; f00084 folder layout | Partial; the adoption-plan proposal must spell out the target layout | **f00084 §vision U1 + f00088 §vision U2** |
| 2e | Single source of truth for agent instructions | f00084 host-instructions centralizer (append/overwrite of 3 files) | Centralizer *copies fragments*; it does not *collapse the target's existing* scattered agent instructions into one canonical pair | **f00088 §vision U3** |
| 3 | Client tool: author + register a plugin by path | f00087 S2 operator script + client scaffold export; f00087 S1 `config.plugins.<name>.path` loader | No **MCP client tool** the target LLM can call; no auto-registration step that writes the `path` entry into `mcp-vertex.config.json` | **f00087 §vision U4** |
| 4 | Default filesystem with authorized-roots allowlist | native `fs_read`/`fs_write` (single root, lexical containment); f00068 `ext.fs` (paused) | Native fs is hard-pinned to one `workspaceRootAbs`; no allowlist for additional authorized roots; f00068 is the only "external path" story and it is blocked | **U5 / §decision** |

## non-goals

- No implementation in this pass — this is a planning umbrella only.
- No unpausing of f00068.
- No new runtime tool-collision resolver (the prefix contract already resolves
  collisions at runtime; U2 only plans the mapping).
- No marking of any proposal as `done`.

## architecture

### §decision — default filesystem: extend native fs vs. unpause f00068

**Recommendation: extend the native `fs_read`/`fs_write` surface with an
authorized-roots allowlist (U5). Do NOT block the "default filesystem" vision
on unpausing f00068.**

### What the native surface is today

`fsRead`/`fsWrite` (`packages/core/src/lib/shared/fs-read.ts`,
`fs-write.ts`) take a single `workspaceRootAbs` and call
`resolveWorkspaceContained(rootAbs, child)`, which is **lexical** containment:
it rejects absolute paths and `..` escapes against exactly one root. There is
**no** mechanism to authorize a second root. So today an agent can already read
its own project (vision 4, first half) — the missing half is *external,
explicitly-authorized* paths.

### Option A — extend native fs with an authorized-roots allowlist (recommended)

- **Shape**: `IFsToolOptions` grows `authorizedRoots: readonly string[]`
  (absolute, from config: `filesystem.authorizedRoots` or a CLI
  `--allow-path=<abs>` repeatable flag, default `[]`). `resolveWorkspaceContained`
  gains a variant `resolveAgainstRoots(roots, child)` that tries the workspace
  root first, then each authorized root, returning the first containment hit.
  Absolute `child` paths are permitted **only** when they fall inside an
  authorized root; everything else keeps today's reject-absolute behaviour.
- **Security posture**: external paths are off by default (`[]`). Authorization
  is *explicit and durable* — it lives in `mcp-vertex.config.json` (committed,
  reviewable) or a one-shot CLI flag. No LLM-driven path expansion, no
  subprocess, no network. Symlink-escape remains the host-sandbox's job (same
  caveat the existing helper already documents).
- **Cost**: ~1 small core module + schema field + 2 specs. Behaviour-preserving
  for every existing caller (empty allowlist == today).
- **Benefit**: satisfies vision 4 fully and *natively*, with zero new
  dependencies, zero subprocess boot, and a config surface the operator already
  edits. No 8-item unpause gate.

### Option B — unpause f00068 ext.fs

- Drags in the entire external-mcps machine (catalog tiers, lazy subprocess
  registry, autonomy knobs, ack surface, `@modelcontextprotocol/client` dep)
  and its 8-precondition unpause gate, just to get a filesystem read of an
  authorized external path.
- The `@modelcontextprotocol/server-filesystem` subprocess pays boot cost,
  needs its own allowlist *anyway*, and exposes a *parallel* tool surface
  (`ext.fs.read`) that competes with the native `fs_read` the rest of the repo
  uses.
- **Verdict**: f00068 stays paused and stays valuable for the *broad* "compose
  arbitrary third-party MCPs" story. It is the **wrong tool** for "every user
  reads their own + authorized external files by default." Decouple them.

### Recommended split

- **U5 (this cluster, now-eligible):** native authorized-roots allowlist.
  Satisfies vision 4.
- **f00068 (stays paused):** keep for the general composition story. Add a
  one-line note in f00068 §non-goals that "default filesystem" is delivered by
  the native allowlist (U5), so `ext.fs` is *additive breadth*, not the default
  path. (See the f00068 §vision-note appended by this umbrella.)

### Recommended structure

**Both**: amend the three existing init proposals with a `## vision (f00089)`
section that scopes the new slices, AND keep this umbrella as the index +
decision record. Rationale: the three children already own disjoint file trees
(see slice map), so the new work attaches cleanly to them; an umbrella avoids
duplicating five descriptions across three files and gives the orchestrator one
place to read the dependency order and the fs decision. f00068 gets only a small
non-goal note (it stays paused).

## slices

> These are **planning placeholders** routed to the child proposals; no code is
> authored under this umbrella. Each child carries the real slice scaffold.

### S1 — ratify the umbrella and route the five vision points

- **Status**: ready
- **Files**: docs/mcp-vertex/proposals/ready/f00089-init-genera-plan-de-adopcion-completo-umbrella.md, docs/mcp-vertex/proposals/ready/f00084-bunx-mcp-vertex-core-init-cli.md, docs/mcp-vertex/proposals/ready/f00088-init-respeta-el-proyecto-destino.md, docs/mcp-vertex/proposals/ready/f00087-mejorar-carga-de-plugins-locales-y-client-scaffold-export.md, docs/mcp-vertex/proposals/paused/f00068-external-mcps-plugin-paused.md
- **Gate**: bun run lint:proposals
- **Acceptance**: the coverage matrix routes all five vision points to a child
  (U1–U5); the three init children carry a `### vision (f00089 …)` note under
  their `notes` section; f00068 carries the default-filesystem non-goal note;
  `bun run lint:proposals` is green. No feature code authored.

### Slice map (file-disjoint, parallelisable AFTER U1→U2 ordering)

| Slice | Home proposal | Files (disjoint) | Depends on |
|---|---|---|---|
| **U1** detect foreign proposals + emit adoption-plan proposal | f00084 | `packages/cli/src/commands/init/init-migrate-offer.ts`, `packages/cli/src/commands/init/init-foreign-detect.ts` (new), `packages/cli/tests/commands/init/init-migrate-offer.spec.ts` | f00088 detection (landed) |
| **U2** skill migration + tool-namespace unification plan | f00088 | `packages/cli/src/commands/init/init-adoption-plan.ts` (new), `packages/cli/src/commands/init/init-skill-inventory.ts` (new), `packages/cli/tests/commands/init/init-adoption-plan.spec.ts` | U1 (the plan proposal U1 emits embeds U2's skill+tool sections) |
| **U3** single-source-of-truth consolidation | f00088 | `packages/cli/src/commands/init/init-host-instructions.ts` (extend), `packages/cli/tests/commands/init/init-host-instructions.spec.ts` | none (touches only the centralizer) |
| **U4** client plugin-author MCP tool + path auto-registration | f00087 | `packages/client/src/lib/scaffold/author-plugin.ts` (new), `packages/client/src/public/index.ts` (extend), a thin plugin tool under `plugins/<scaffold-host>/...` OR client export — pick in U4 design; `packages/client/src/tests/author-plugin.spec.ts` | f00087 S1+S2 (landed) |
| **U5** native authorized-roots filesystem allowlist | f00089 (core, owns the decision) | `packages/core/src/lib/shared/contain-path.ts` (extend), `packages/core/src/lib/shared/fs-tools-options.ts` (extend), `packages/core/src/lib/shared/fs-read.ts` + `fs-write.ts` (thread roots), `packages/core/src/lib/plugins/config-file-schema.ts` (new `filesystem.authorizedRoots`), specs | none (pure core) |

U3, U4, U5 are mutually file-disjoint and can run in parallel immediately.
U1 must land before U2 (U2's output is a *section* of the proposal U1 emits).

## dependency graph

Suggested execution order:

1. **U5** (native fs allowlist) — independent, pure core, unblocks vision 4 now.
2. **U4** (client plugin-author tool) — independent, builds on landed f00087.
3. **U3** (single source of truth) — independent, touches only the centralizer.
4. **U1** (foreign-proposal detection + adoption-plan generator) — needs landed
   f00088 detection.
5. **U2** (skill + tool unification plan) — embeds into U1's emitted proposal;
   land after U1.

Parallelism: {U3, U4, U5} fan out at once; U1 then U2 run serially after.

## acceptance

- `bun run lint:proposals` and `bun run validate` are green with this umbrella
  and the three amended children in place.
- Each of the five vision points maps to exactly one routed child slice in the
  coverage matrix, with no orphaned vision point and no duplicated ownership.
- The default-filesystem decision (Option A, native allowlist / U5) is recorded
  here and cross-noted in f00068 §non-goals.
- No proposal is marked `done`; no feature code is authored under this umbrella.

## risks and mitigations

- **Migration destructiveness.** The adoption-plan proposal (U1) must be
  *advisory output*, never an in-place rewrite of the target's existing
  proposals/skills. It emits a plan the target's own agents execute; init never
  deletes target files. Same contract f00088 set for "additive integration."
- **`f00001` id collision.** The current stub hardcodes `f00001`; if the target
  already has proposals, that id can collide. U1 must allocate the next free id
  in the target (reuse the proposals plugin id allocator or scan the target
  folder) instead of a literal `f00001`.
- **Tool-namespace unification scope creep.** U2's "no collision" is a *plan*,
  not a runtime resolver. The runtime contract (prefix-per-plugin) already
  exists; U2 only inventories and documents the mapping in the emitted proposal.
- **fs allowlist over-broad.** U5 defaults to `[]`; authorization is explicit
  and committed. Absolute paths stay rejected unless they fall inside an
  authorized root. Symlink escape remains a documented host-sandbox concern.

## notes

- This umbrella is a planning artifact for FASE 2a. It does not author feature
  code and must not be marked `done`; it closes only when its five routed child
  slices (U1–U5) have landed in their home proposals.
- The `## non-goals` section above is the canonical non-goal list for the
  umbrella; the per-child non-goals stay in each child proposal.
