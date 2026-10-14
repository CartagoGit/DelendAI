---
id: f00152
title: "self-host compat evolution — pin + compat window + feature flags + stable facade"
kind: feat
status: done
type: proposal
track: core+plugins+self-host
date: 2026-07-26
---

# f00152 — Self-host compat evolution

## Goal

Give `@mcp-vertex/core` a **four-layer compatibility contract** so the project can keep consuming itself across a moving HEAD without self-host agents (and any future external consumer) ever breaking in flight. The layers are:

1. **L1 — Version pin.** A `coreVersion` field in `mcp-vertex.config.json` declares the released `@mcp-vertex/core` version a self-host agent is wired against. A lint gate refuses CI merges whose pin does not resolve to a real published tag.
2. **L2 — Compat window.** Every `inputSchema` / `outputSchema` in the canonical facade accepts the **union of current + previously-released** shapes for one full release. Old shapes are translated to new at the handler boundary and emit a structured `deprecatedShapeUsed` warning into the response, so consumers migrate on their own clock.
3. **L3 — Feature flags.** Every behavior change that is not strictly required lands behind `ctx.options.featureFlags.<name>: boolean` (default off). Flags ship deprecated on the next minor and removed on the major that follows, so the canonical path stays stable and opt-in is the only path to risky behavior.
4. **L4 — Stable facade.** A small, named subset of tools (`proposal_transition`, `proposal_create`, `auto_work`, `agent_lock`, `agent_worktree`, `proposal_review`, `task_queue_enqueue`, `state_repair`, `proposal_force_transition`) is published as the **Stable API Surface** with explicit semver guarantees: no field rename, no removal without two-release deprecation, and a 100% schema-coverage matrix test. Plugins can change freely *outside* this set.

Together these four layers mean: a self-host agent pinned to `@mcp-vertex/core@0.4.x` keeps working while `0.5.x` and `0.6.x` land breaking-but-bounded changes on HEAD; opt-in flags let a peer agent try the new shape early; and a small, fenced facade guarantees the operations everyone actually depends on never break without loud, structured warning.

## Why

Today the project is in the worst possible configuration for self-consumption:

- `AGENTS.md`, `.github/copilot-instructions.md`, `CLAUDE.md` and the generated host hints all consume **HEAD**, not a tag.
- `proposal_transition`, `auto_work` and `agent_lock` — the three tools every swarm relies on — change shape every other slice. There is no compat window, no deprecation note, no warning at the call site. A consumer that worked in the previous slice can be wrong in the next.
- Every plugin owns its own `optionsSchema` and there is no global "is this consumer compatible with this server?" probe. The only integrity check is `bun run validate`, which catches problems **before** they ship, not while a session is in flight.
- Convention `@deprecated` is mentioned in plugin-contract comments but never enforced; consumers don't even know a field is going away.
- The MCP wire format gives us `outputSchema` per tool, but the schema-to-handler coverage check (`verify:tools`) is one-shot — there is no "old caller shape" coverage.

Self-host consumers fail in three distinct ways, and today none of them has a barrier:

| Failure mode | Today | With f00152 |
| --- | --- | --- |
| Consumer sends old shape → MCP rejects at the wire | Caller crashes mid-session | Compat window translates; caller sees a `deprecatedShapeUsed` warning and a hint to migrate |
| Plugin removed a tool with no replacement | Caller crashes; agent retries forever | Stable facade guarantees the named tools cannot be removed in ≤1 release |
| Behavior changed silently (new state-machine guard, new required arg) | Caller's branch logic drifts off | Feature flag defaults to old behavior; new path opt-in |
| HEAD changes break self-host boot | Whole repo blocked | Self-host agents pin `coreVersion`; lint refuses pins that drift from released tags |
| Discovery: "what's the API of `proposal_transition` *right now*?" | Read source | Stable facade publishes a machine-readable manifest (`docs/mcp-vertex/api/stable.json`) |

## Why this design

Four orthogonal guarantees, each at a different layer:

- **L1 (version pin)** solves the *discovery* problem — "what version am I talking to?" — without any runtime cost. The pin is a string, the lint is a script (`tools/scripts/lint/core-version-pin.script.ts`) that `bun run validate` runs.
- **L2 (compat window)** solves the *shape-drift* problem at the cost of one extra union per tool and one translation block per deprecated shape. It is the layer that buys us the actual "works while in flight" property.
- **L3 (feature flags)** solves the *behavior-drift* problem — when the new logic is risky or has not stabilized, the flag means the canonical behavior is the old one until the next major. It also gives peers a way to dogfood the new path early.
- **L4 (stable facade)** solves the *no-replacement* problem — the operations every consumer needs to keep working forever are explicitly fenced off. Everything outside the fence is fair game.

The four layers map onto the four roles a release needs to play:

| Layer | When it activates | When it deactivates |
| --- | --- | --- |
| L1 — pin | At host boot, before plugin load | Pin is bumped on consumer upgrade |
| L2 — compat window | When a tool's `inputSchema` adds/renames a field | Two releases later, on the major bump |
| L3 — feature flag | When a behavior change is non-trivial | On the major bump following deprecation |
| L4 — stable facade | Forever (the named tools are stable) | Never |

A single, monolithic "we just don't break things" promise is impossible — the project intentionally ships fast, and a00032-style compaction churn on the proposals plugin already happens. Splitting the contract into four independently-evolving layers is the only way to keep the fast path *and* the stable path at the same time.

## Non-goals

- It does **not** promise that non-facade tools are stable — anything not in L4's named list may change shape, name or vanish on a minor release. That is the point: stable work is fenced, free work stays free.
- It does **not** introduce an internal adapter layer for every tool — only the facade gets the full union + translation; non-facade tools get a single `inputSchema` and ship the way they always have.
- It does **not** try to be wire-compatible across MCP transports — the compat window is at the *handler* boundary, not at the MCP transport. If the transport itself changes, that is a separate MCP-level concern.
- It does **not** give consumers a "use old API forever" escape hatch — the compat window is exactly one release wide. After that, old shapes hard-fail so callers migrate on a clock.
- It does **not** auto-rewrite `mcp-vertex.config.json` pins — the user (or the release script) bumps the pin on upgrade; the lint refuses broken pins but does not heal them.
- It does **not** add a runtime feature-flag UI — flags are config-only, edited by the user when they consciously opt in. No remote toggle, no telemetry, no server-pushed flag flip.

## Slices

- global_gate: validate

### S1 — L1: `coreVersion` config field + pin lint

- **Status**: done
- **Files**: `packages/core/schema/mcp-vertex.config.schema.json`, `packages/core/src/lib/plugins/config-file-schema.ts`, `mcp-vertex.config.json`, `tools/scripts/lint/core-version-pin.script.ts`, `tools/scripts/lint/core-version-pin.spec.ts`, `package.json#scripts` (add `lint:core-version-pin` + wire into `validate`)
- **Gate**: type + lint
- **Implementation**: Added the root `coreVersion` pin to the committed config and aligned the schema mirror. The lint now validates the pin against a 24h registry cache, enforces offline stale-cache failures, and resolves omitted pins through `latest-published`.
- **Acceptance**:
  - `coreVersion` is an optional semver string at the root of `mcp-vertex.config.json`. Default when omitted is `"latest-published"` (no pin → use latest).
  - `tools/scripts/lint/core-version-pin.script.ts` reads `coreVersion` and `npm view @mcp-vertex/core versions --json` (offline cache via `.cache/mcp-vertex/registry-versions.json` with TTL), and fails if the pin does not match a published version. `--offline` mode reads the cache only.
  - `mcp-vertex.config.json` is updated with `coreVersion: <latest published tag>` as part of this slice.
  - `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` are **not** modified here (the bootstrap pointer model already handles self-host updates via `bun run catalog:generate`).
  - Lint spec exercises: pinned-to-existing-version, pinned-to-nonexistent, omitted (default), offline mode with stale cache.

### S2 — L4: Stable facade declaration + manifest

- **Status**: done
- **Files**: `packages/core/src/lib/api/stable-facade.ts`, `packages/core/src/lib/api/stable-manifest.ts`, `packages/core/tests/src/lib/api/stable-facade.spec.ts`, `docs/mcp-vertex/api/stable.json` (generated, committed), `tools/scripts/build/stable-manifest.script.ts`, `package.json#scripts` (add `build:stable-manifest` + `verify:stable-manifest`)
- **Gate**: type + verify
- **Acceptance**:
  - `packages/core/src/lib/api/stable-facade.ts` declares `STABLE_API_TOOLS: readonly StableToolDescriptor[]` for: `proposal_transition`, `proposal_create`, `auto_work`, `agent_lock`, `agent_worktree`, `proposal_review`, `task_queue_enqueue`, `state_repair`, `proposal_force_transition`. Each entry has `name`, `plugin`, `sinceVersion`, `semverGuarantee: 'additive-only'`, `inputSchemaRef` (the zod schema), `outputSchemaRef`.
  - `tools/scripts/build/stable-manifest.script.ts` introspects the descriptors and emits `docs/mcp-vertex/api/stable.json` — a deterministic, machine-readable manifest with `inputs`/`outputs` JSON Schemas per tool, version, and a `stableSince` timestamp.
  - `verify:stable-manifest` checks that (a) every descriptor's referenced schema still exists, (b) the published `sinceVersion` matches the package's `package.json#version`, (c) the manifest's JSON-Schema output matches the live `outputSchema.safeParse` on a synthetic canonical input.
  - `release.script.ts` runs `build:stable-manifest` after `bun run release` so the manifest is regenerated on every release.
  - Initial descriptors for all nine tools with `sinceVersion: <current>`.

### S3 — L2: Compat-window union for the facade tools

- **Status**: done
- **Files**: `plugins/proposals/src/lib/contracts/compat-window.ts`, `plugins/proposals/src/lib/tools/proposal-transition.compat.ts`, `plugins/proposals/tests/src/lib/contracts/compat-window.spec.ts`. (Decision: ship the infrastructure + the proposal_transition wrapper as seed; the remaining 8 facade tools are exercised through the `lint:compat-window` guard which prevents leaks outside the fence.)
- **Gate**: type + verify
- **Acceptance**:
  - For each facade tool: `inputSchema = z.union([v2Schema, v1Schema])`; the handler runs `parseLatest(input)` first and falls back to a `translateV1toV2` adapter that lives next to `v1Schema` and is exported from the plugin's `public/index.ts`.
  - On a v1 call, the response **always** includes a `deprecatedShapeUsed: { version: 'v1', sinceVersion: '<coreVersion where v1 was deprecated>', removedIn: '<coreVersion where v1 hard-fails>', migrationHint: '<one-line>' }` field (and a top-level `[WARNING]`-prefixed console line for human sessions).
  - `verify:tools` is extended to assert: for every facade tool, both `v1` and `v2` synthetic inputs parse cleanly through `outputSchema` and reach the handler.
  - Initial union: every facade tool ships with `v1` = current schema (the one in HEAD at slice time) and `v2` = a future-projected schema that the next release will move to. `v2` is the **only** path the release script accepts as "stable" once v1 is removed.
  - This slice ships **only** the wiring + the first tool's v1/v2 split (proposal_transition, since it is the most-edited). The other eight tools are split in S4/S5.

### S4 — L2: Compat-window for the remaining facade tools

- **Status**: done
- **Files**: the eight remaining facade tools (mirrors of S3).
- **Gate**: type + verify
- **Acceptance**:
  - Each remaining facade tool ships v1 (current) + v2 (next-release-projected) union, with `translateV1toV2` adapter and `deprecatedShapeUsed` warning.
  - One compat spec per tool (8 specs total).
  - `verify:tools` runs the v1+v2 round-trip on all nine facade tools.
  - The compat-window lint (`lint:compat-window`) walks `plugins/**/src/lib/tools/*.tool.ts` and fails if a non-facade tool accidentally imports `v1Schema`/`translateV1toV2` (compat-window is a facade-only affordance — leaking it elsewhere is a signal that the tool should be promoted to the facade, not the union extended).

### S5 — L3: Feature-flag framework + first three flags

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/feature-flags.ts`, `packages/core/tests/src/lib/plugins/feature-flags.spec.ts`, `packages/core/src/lib/plugins/config-file-schema.ts` (add `featureFlags: Record<string, boolean>`), `tools/scripts/lint/feature-flags.script.ts`, `tools/scripts/lint/feature-flags.spec.ts`, `packages/core/src/public/index.ts`, `docs/mcp-vertex/api/feature-flags.md`.
- **Gate**: type
- **Acceptance**:
  - `ctx.options.featureFlags: Record<string, boolean>` is added to the plugin context (mirroring `options`). A `coreFeatureFlag(key): boolean` helper in `@mcp-vertex/core/public` returns the flag value or `false` when absent — **strict default-off** so legacy behavior is the canonical path.
  - `lint:feature-flags` enforces: every flag used in a plugin has a `feature-flags.md` entry (committed under `docs/mcp-vertex/api/feature-flags.md`) with `name`, `sinceVersion`, `defaultValue`, `removalVersion`, `description`. Missing entries fail the gate.
  - First three flags seeded (default off everywhere):
    - `proposals.peerReviewBypass` — when true, allows same-process peer review approvals (a00074 S2 lands behind this flag; the lint pins `defaultValue: false`).
    - `proposals.legacyProposalMigration` — when true, allows the legacy pNNN→new-state migration scripts (today the migration is opt-in via the `--migrate` flag on the boot script — feature flag replaces that).
    - `core.driftAutoRepair` — when true, runs `state_repair` automatically on boot (proposals plugin's `autoRepairOrphans` becomes this flag).
  - The seed entries in `docs/mcp-vertex/api/feature-flags.md` ship with `removalVersion` set to the next major (so every flag has a planned death).

### S6 — Documentation: stable API + feature-flags + deprecation policy

- **Status**: done
- **Files**: `docs/mcp-vertex/STABLE-API.md`, `docs/mcp-vertex/FEATURE-FLAGS.md`, `docs/mcp-vertex/DEPRECATION-POLICY.md`, `docs/mcp-vertex/api/feature-flags.md`, `docs/mcp-vertex/api/stable.json` (generated).
- **Gate**: docs + lint
- **Acceptance**:
  - `STABLE-API.md` lists the nine facade tools with the same shape as `docs/mcp-vertex/api/stable.json`, plus a one-paragraph "what stable means here" preamble.
  - `FEATURE-FLAGS.md` lists every flag in `feature-flags.md` with `sinceVersion`, `defaultValue`, `removalVersion`, `description`, plus the opt-in recipe.
  - `DEPRECATION-POLICY.md` codifies the project's deprecation contract: (a) one-release compat window on shape changes, (b) feature flags default off and removed on next major, (c) stable facade tools need two-release deprecation before removal, (d) every deprecation must carry a `migrationHint` string surfaced via `deprecatedShapeUsed`.
  - `READY_AUTHORING.md` adds a "Breaking change checklist" subsection listing the four layers and what the slice author must touch when their change crosses one.
  - `lint:host-instructions` is extended to ensure AGENTS.md / CLAUDE.md / `.github/copilot-instructions.md` keep pointing at the bootstrap (they should not enumerate facade tools themselves — the bootstrap is the source of truth).

### S7 — Wire facade + compat window + flags into `release.script.ts`

- **Status**: done
- **Files**: `tools/scripts/release/release.script.ts` (`applyPlan` + new `bumpConfigCoreVersion` helper).
- **Gate**: type + verify
- **Acceptance**:
  - After `bun run release` finishes, the script:
    1. Bumps `coreVersion` in `mcp-vertex.config.json` to the new version.
    2. Runs `build:stable-manifest` and commits the regenerated `docs/mcp-vertex/api/stable.json`.
    3. Promotes every `v2` schema in each facade tool to `v1` (the new "current") and **resets** the union to `[v1]` — the compat window is now closed for the new v1, and `translateV1toV2` becomes a no-op exported as `@deprecated` (kept for one more release for stragglers).
    4. Marks any feature flags whose `removalVersion` equals the new version as `@deprecated` in `docs/mcp-vertex/api/feature-flags.md` with a `sinceVersion` bump, and removes the runtime flag default-on path.
  - The release script is idempotent: a re-run after a failed commit does not duplicate the promotion.
  - `release.spec.ts` covers: dry-run promotes schemas but does not commit; full-run commits; flag-removal sets default correctly.

## Acceptance

- `bun run validate` → exit 0; new lints wired and green: `lint:core-version-pin`, `lint:compat-window`, `lint:feature-flags`, `verify:stable-manifest`.
- `docs/mcp-vertex/api/stable.json` is committed and lists all nine facade tools with `sinceVersion: <current>`.
- A self-host agent pinned to `coreVersion: 0.4.2` boots successfully while HEAD moves forward — verified by a synthetic test that loads the `@mcp-vertex/core` package from the registry, applies a v1-shaped call against a HEAD-built plugin, and asserts the handler runs without throwing.
- A v1-shaped call to `proposal_transition` (the busiest facade tool) returns a normal response **plus** `deprecatedShapeUsed` with a non-empty `migrationHint` — verified by `proposal-transition.compat.spec.ts`.
- A consumer that opts into `featureFlags.proposals.peerReviewBypass: true` sees the new behavior; a consumer that does not sees the old behavior — verified by two spec runs against the same plugin.
- `release.script.ts` runs end-to-end on a dry-run tag without committing and exits with a diff showing exactly which files would change.

## Notes

### Migration cost

The compat-window split (S3 + S4) is the only slice that touches every facade tool. The split is mechanical and one-shot per tool:

1. Rename current `inputSchema` to `v1Schema`, export it from `public/index.ts`.
2. Define `v2Schema` (one rename or one field addition).
3. Define `translateV1toV2(input): v2Input` next to the schemas.
4. Set `inputSchema = z.union([v2Schema, v1Schema])`.
5. Handler calls `parseLatest(input)`, falls back to translation.
6. Emit `deprecatedShapeUsed` whenever `v1` branch was taken.
7. Add `compat.spec.ts` with one v1 case + one v2 case.

Estimated cost: ~30 minutes per tool on the proposal tools (most editing); ~15 minutes per tool on the lock/state tools (simpler shapes).

### Why this is not overkill

The project already pays the cost of `verify:tools` (196 tool invocations per CI), the `metric-budget` and the `no-internal-core-imports` lint. Those are *retrospective* safety nets. f00152 is the *prospective* contract: it makes "self-host stays working while HEAD moves" a property the project tests for, not a hope.

### Prior art

- **`@deprecated` in TypeScript** — what L2 leans on at the type level.
- **`@aws-sdk/client-xxx` versioning policy** — versioned clients with explicit compat windows.
- **Stripe API versioning** — pin-the-API-version pattern, slightly adapted (L1).
- **GitHub Actions `actions/checkout@v3` pinning** — concrete example of `coreVersion` semantics in the wild.
- **OpenTelemetry semantic conventions** — feature-flag-style behavior evolution; the `core.driftAutoRepair` flag mirrors the OTel SDK convention of opting into new behavior.

### Out-of-scope (called out so they don't sneak into S6)

- A new MCP transport or a wire-level compat layer — MCP itself owns that.
- Auto-bumping `coreVersion` on every release — the release script bumps it (S7), but a separate "auto-bump on every push to develop" is intentionally absent.
- A remote feature-flag server — the project already has `config-center` for declarative config; feature flags live next to it, not on top of it.
- Deprecation warnings in `bun run lint` output — the `deprecatedShapeUsed` response field is the canonical channel; CLI lint warnings would be a second source of truth and would drift.

### Carry-over

This proposal is the structural complement to a00074 (which only fixes the *same-process* peer review gap in `proposal_review`). a00074 protects one corner case; f00152 protects the whole contract. The two together mean: peer review cannot be bypassed accidentally AND the facade stays stable while the implementation churns.

### Future proposal seeds (do not land in this one)

- `f001XX — plugin author guide for facade promotion` — how to decide when a plugin's tool graduates to the facade.
- `f001XX — auto-bump coreVersion when self-host agents detect HEAD drift` — a one-shot CI job that opens a PR; intentionally not in f00152 to keep the surface small.
- `f001XX — runtime compat-window check in `<prefix>_agent_catalog`** — surface the consumer's pinned `coreVersion` vs the server's `coreVersion` in the catalog payload so an agent notices drift before the first failed call.