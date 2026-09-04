---
id: a00063
title: "17-07-2026g audit — adopter agent meltdown forensics: init stamped monorepo roots into an Angular repo and search/docs died silently"
kind: audit
status: done
type: proposal
track: audit
date: 2026-07-16
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 2 commits referencing a00063 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 2-commit batch
shipped-in:
  - c9f6d2bb # fix(conventions,docs,doctor): a00064 round — zero-scan diagnostics everywhere + 
  - 7adac35d # fix(init,search,docs): a00063 — adopter agent meltdown forensics + three-layer f
---

# a00063 — 17-07-2026g claude-round-2 audit — adopter agent meltdown forensics: init stamped monorepo roots into an Angular repo and search/docs died silently

## Goal

User reported an agent "went completely crazy" in a real adopter repo (Beateam/mazinger-alfa-frontend, an Angular app) and asked for a full forensic analysis of its .cache/mcp-vertex/logs/2026-07-16.jsonl plus a fix hardened to "11/10 never again". Forensics (857 events, 13h): the meltdown burst was 301 events in ~10 minutes at 21:1x. Of 137 completed searches, 124 returned {count:0, scanned:0}; docs_read returned found:false 107 of 158 times. The agent, getting silent empties from its two primary orientation tools with zero explanation, did what any reasonable actor would: retried query variants (albaran→albaranes→fecha→delivery→linea→delivery-note), varied maxResults (200→120→100→50), tried ABSOLUTE roots pointing at other repos (28 calls, all silently skipped by containment), and degenerated into blind path probing via docs_read. The agent was not crazy — it was blind.

Root causes (all ours, compounding):
1. (fixed earlier today as a00062) dot-prefixed extensions in the init-written config never matched the engine's dot-less extensionOf() — guaranteed scanned:0.
2. (NEW) init stamped mcp-vertex's OWN monorepo layout (roots: packages/plugins/extensions/apps/tools) into the adopter's config. The Angular repo's real tree is src/libs/e2e/docs — none of the stamped roots exist, so even with fixed extensions every search scanned 0 files. Both PLUGIN_DEFAULTS copies carried this footgun, plus a NARROWER extensions list than the engine's built-ins (dropping html/scss — exactly what an Angular repo needs).
3. (NEW) both search and docs_list fail in TOTAL silence: {count:0, scanned:0} carries no reason, no hint, nothing distinguishing "no matches" from "the walk never touched a single file because your config describes a different project".

Fixes shipped (each red-first TDD):
- Immediate remediation: corrected the adopter's mcp-vertex.config.json in place (real roots src/libs/docs/e2e/tools/config, dot-less extensions incl. html/scss, dead $schema path fixed) and verified live against a freshly-spawned server: search found real hits (46 files scanned), docs listed its 200 real documents. The adopter launches the server from this repo's source, so all engine fixes apply on its next restart.
- Init derives roots from the REAL workspace: new shared `deriveSourceRoots` helper in core (extracted from f00117's derive-config, now also candidate-matching e2e/test/tests), consumed by the CLI init renderer; both PLUGIN_DEFAULTS copies stripped of the stamped monorepo roots AND the narrower-than-engine extensions/ignoreDirs blocks (the engine's richer built-ins now apply). When no known source dir exists, roots are omitted entirely — the engine walks "." (gitignore- and ignoreDirs-aware), correct for any project shape.
- Self-diagnosing zero results (the anti-meltdown rail): search results with scanned:0 and docs_list results with 0 docs now carry a `diagnostic` field naming exactly which configured roots do not exist in the workspace, which were rejected as non-workspace-relative, or which filters matched nothing — plus the config key to fix. Exposed through both tools' outputSchema (SDK types regenerated) and verified live end-to-end: a broken-config server now answers "scanned 0 files: configured roots do not exist in this workspace: packages, plugins, apps. Fix plugins.search.options.roots…" instead of a bare empty envelope.

## why

User directive, verbatim: "un agente se volvio completamente loco, y quiero que arregles y dejes perfecto este problema. Cuando termines vuelve a revisar todo lo que ha podido causarlo y dejalo en una puntuacion de que no vuelva a ocurir de 11 sobre 10." The meltdown class is systemic, not repo-specific: every adopter bootstrapped by init before today carries the same stamped-roots config, and any misconfiguration reproduces the same blind-agent spiral. The fix therefore has three layers: remediate the victim, fix the factory (init), and make the failure mode impossible to hit silently (diagnostics).

## non-goals

- No loop-detector-style rate limiting of repeated zero-result searches — the root fix (diagnostics + correct configs) removes the trigger; punishing the symptom would mask misconfigurations instead of surfacing them.
- No auto-rewrite of existing adopters' configs on server boot — too magical for a config file the user owns; the diagnostic tells the agent/user exactly what to fix, and proposal_adopt/init_config can regenerate one on request.
- No changes to the rg backend (it does its own file discovery and was unaffected).

## Slices

- global_gate: e2e

### S1 — Forensics + remediate adopter + derive real roots in init + zero-result diagnostics in search/docs
- **Status**: done
- **Files**: `packages/core/src/lib/bootstrap/derive-config.ts`, `packages/core/src/lib/plugins/plugin-defaults.ts`, `packages/core/src/public/index.ts`, `packages/cli/src/contracts/constants/plugin-defaults.constant.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/init-render.service.spec.ts`, `packages/cli/src/lib/init/init-integration.spec.ts`, `plugins/search/src/lib/services/search-engine.types.ts`, `plugins/search/src/lib/services/search-engine.in-house.ts`, `plugins/search/src/lib/tools/search.tool.ts`, `plugins/search/tests/src/lib/services/search.service.spec.ts`, `plugins/docs/src/lib/services/engine.ts`, `plugins/docs/src/lib/tools/tools.ts`, `plugins/docs/tests/src/lib/docs.spec.ts`, `packages/core/src/generated/tool-outputs.ts`
- **Gate**: e2e
- acceptance:
  - "Forensic timeline of the adopter log reconstructed with numbers (857 events; 301-event burst; 124/137 searches scanned:0; 28 absolute-root attempts; 107/158 docs_read found:false) and the root-cause chain identified as ours, not the agent's."
  - "Adopter's config remediated in place and verified live against a freshly-spawned server from this repo's source: search scanned real files (46) and returned hits; docs listed 200 real documents."
  - "deriveSourceRoots shared between the init_config MCP tool and the CLI init renderer; init in an Angular-shaped temp workspace derives roots ['src'] and omits roots entirely in a bare workspace (both specs red-first); ROOT_CANDIDATES extended with e2e/test/tests."
  - "Both PLUGIN_DEFAULTS copies no longer stamp monorepo roots or narrower-than-engine extensions; init-integration idempotency spec updated to seed stable top-level dirs (rendering is now honestly workspace-dependent)."
  - "search results with scanned:0 and docs_list results with 0 docs carry a diagnostic naming missing roots, rejected (non-relative) roots, or no-match filters + the exact config key to fix; exposed via outputSchema, SDK types regenerated; three red-first specs per engine; verified live end-to-end against a deliberately broken config."
  - "bun run typecheck clean; full bun run test 548/548 files, 4594/4594 tests green."

## acceptance

- Forensic timeline of the adopter log reconstructed with numbers (857 events; 301-event burst; 124/137 searches scanned:0; 28 absolute-root attempts; 107/158 docs_read found:false) and the root-cause chain identified as ours, not the agent's.
- Adopter's config remediated in place and verified live against a freshly-spawned server from this repo's source: search scanned real files (46) and returned hits; docs listed 200 real documents.
- deriveSourceRoots shared between the init_config MCP tool and the CLI init renderer; init in an Angular-shaped temp workspace derives roots ['src'] and omits roots entirely in a bare workspace (both specs red-first); ROOT_CANDIDATES extended with e2e/test/tests.
- Both PLUGIN_DEFAULTS copies no longer stamp monorepo roots or narrower-than-engine extensions; init-integration idempotency spec updated to seed stable top-level dirs (rendering is now honestly workspace-dependent).
- search results with scanned:0 and docs_list results with 0 docs carry a diagnostic naming missing roots, rejected (non-relative) roots, or no-match filters + the exact config key to fix; exposed via outputSchema, SDK types regenerated; three red-first specs per engine; verified live end-to-end against a deliberately broken config.
- bun run typecheck clean; full bun run test 548/548 files, 4594/4594 tests green.

## Verified State

| Verification | Value |
|---|---|
| Forensic source | `Beateam/mazinger-alfa-frontend/.cache/mcp-vertex/logs/2026-07-16.jsonl` — 857 events, 09:06→22:16 |
| Meltdown burst | 301 events in ~10 min (21:1x); secondary morning bursts 09:0x–09:4x |
| Search failure rate | 124 of 137 completed searches returned `{count:0, scanned:0}`; the 13 "non-zero" were malformed/other shapes, not real hits |
| Escalation fingerprints | query variants (albaran→albaranes→fecha→delivery→linea→delivery-note), maxResults sweeps (200→120→100→50), 28 searches with ABSOLUTE roots pointing at other repos (all silently skipped by containment), 107/158 `docs_read` probes → `found:false` |
| Adopter config (before) | `search.roots: ["packages","plugins","extensions","apps","tools"]` (mcp-vertex's own monorepo layout; NONE exist in the Angular repo whose tree is `src/libs/e2e/docs/...`), dot-prefixed extensions (a00062), dead `$schema` path |
| Adopter remediation verified live | freshly-spawned server from this repo's source: `search albaran` → 5 hits / 46 files scanned (was 0/0); `docs list` → 200 real docs (was 0) |
| Init fix verified live | `init:default` into an Angular-shaped scratch workspace writes `search.options.roots: ["src"]` / `conventions.options.roots: ["src"]` — derived, not stamped |
| Diagnostics verified live | broken-config server now answers `"scanned 0 files: configured roots do not exist in this workspace: packages, plugins, apps. Fix plugins.search.options.roots…"` and `"found 0 docs: configured roots do not exist in this workspace: handbook…"` through the real MCP envelope |
| `bun run typecheck` | clean |
| `bun run test` | 548/548 files, 4594/4594 tests green |

## Findings

### 1. `init` stamped mcp-vertex's own monorepo layout into every adopter's config (P0 · factory defect)
**File**: [`packages/core/src/lib/plugins/plugin-defaults.ts`](../../../../../packages/core/src/lib/plugins/plugin-defaults.ts) + [`packages/cli/src/contracts/constants/plugin-defaults.constant.ts`](../../../../../packages/cli/src/contracts/constants/plugin-defaults.constant.ts) (pre-fix: hardcoded `roots: ['packages','plugins','extensions','apps','tools']` for search AND conventions, plus a narrower-than-engine extensions list dropping html/scss).
**Impact**: any adopter whose tree is not shaped like this monorepo (an Angular app, a plain `src/` package, …) got a config whose search/conventions roots simply don't exist — every search walked nothing. Compounded by a00062's dot-prefix bug for a guaranteed `scanned: 0`.
**Resolution**: [RESUELTO] — `deriveSourceRoots` (shared with f00117's `init_config`) now derives roots from the target workspace's real top-level dirs at init time; no roots materialised when nothing matches (engine walks `.`); stamped defaults removed from both copies; ROOT_CANDIDATES extended with `e2e`/`test`/`tests`.

### 2. `search`/`docs_list` failed in total silence (P0 · the meltdown enabler)
**File**: [`plugins/search/src/lib/services/search-engine.in-house.ts`](../../../../../plugins/search/src/lib/services/search-engine.in-house.ts), [`plugins/docs/src/lib/services/engine.ts`](../../../../../plugins/docs/src/lib/services/engine.ts) (pre-fix: missing/rejected roots silently `continue`d; `{count:0, scanned:0}` was indistinguishable from "no matches").
**Impact**: the agent had no way to tell "nothing matches my query" apart from "the walk never touched a single file because the config describes a different project" — so it burned 300+ calls probing every hypothesis except the right one. The blindness, not the agent, caused the meltdown.
**Resolution**: [RESUELTO] — both engines now self-diagnose zero results: a `diagnostic` field names the roots that don't exist, the roots rejected as non-workspace-relative, or the filters that matched nothing, plus the exact `mcp-vertex.config.json` key to fix. Exposed through both tools' outputSchema (SDK regenerated).

### 3. The victim repo itself (P1 · remediation)
**File**: `Beateam/mazinger-alfa-frontend/mcp-vertex.config.json` (outside this repo).
**Impact**: unusable search/docs since bootstrap.
**Resolution**: [RESUELTO] — config corrected in place (real roots incl. `src`/`libs`/`e2e`, dot-less extensions incl. `html`/`scss`, `$schema` repointed); verified live. The repo launches the server from this repo's source, so every engine-side fix applies on its next restart.

## Scoreboard

| Dimension | Before | After |
|---|---|---|
| Adopter search/docs functional | 0 results always | real hits / real docs, verified live |
| Init on a non-monorepo-shaped repo | broken config guaranteed | roots derived from the real tree (or omitted → safe `.` walk) |
| Zero-result observability | total silence | self-diagnosis naming the misconfigured key |
| Recurrence risk of this exact meltdown | high (every past adopter) | closed at the factory (init), the engine (defaults), and the signal (diagnostics) — plus a00062's extension normalization |
