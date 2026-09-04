---
id: x00165
title: "Pasada f00050 S-B — remove mcp-vertex vocabulary/path leaks from the audit plugin's agnostic contract"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-07-29
shipped-in:
    - 936ecffe # S1-S6 — remove mcp-vertex vocabulary/path leaks from the audit plugin
---

# x00165 — Pasada f00050 S-B — remove mcp-vertex vocabulary/path leaks from the audit plugin's agnostic contract

## Goal

The audit plugin documents itself as project-agnostic ("does not know the mcp-vertex proposal-lint rules — it only knows the universal shape"), but a live re-scan (2026-07-29) found seven concrete leaks in its production code path that contradict that contract — this is the S-B trigger from f00050's parking lot ("A specific finding in a post-f00049 audit calls out a remaining mcp-vertex-vocabulary leak in the audit plugin"), confirmed via direct source inspection. Fix all seven: (1) index.ts hardcodes auditDir/proposalsDir defaults to the literal docs/mcp-vertex/proposals/... instead of deriving them from ctx.docsDir, the mechanism IMcpPluginContext exists for and that plugins/proposals itself already uses; (2) proposal-scaffolder.service.ts embeds "Alcance B (f00077)" (an mcp-vertex-internal roadmap slice + proposal id) into every scaffolded proposal's generated body, and its JSDoc still cites deprecated Spanish severity tokens MUY_MAL/MEJORABLE though the code beneath already checks canonical FATAL/BAD/MINOR; (3) that file's public scaffoldProposals() defaults outputDir to the same hardcoded literal when a direct caller omits it; (4) audit-consolidate.tool.ts's MCP description hardcodes "Default dir: docs/mcp-vertex/proposals/done/audits" as static prose instead of interpolating the defaultAuditDir parameter it already receives; (5) audit-run.tool.ts's summary + header comments read "Alcance B" and the deprecated Spanish severity tokens, surfaced verbatim to every host via overview/agent_catalog; (6) audit-run.schemas.ts's proposalPrefix enum is a stale, diverged duplicate of the canonical proposal-kind-prefix taxonomy (missing b/v/i/s, includes a nonexistent 'u') that f00114 already centralized elsewhere — it is actively wrong today, not just stylistically coupled; (7) audit-plan.tool.ts's dead dimensions fallback array is a stale Spanish translation of the canonical SCORE_DIMENSIONS constant instead of reusing it directly.

## why

The audit plugin's own module doc explicitly commits to being usable by any host ("does not know the mcp-vertex proposal-lint rules — it only knows the universal shape"). A plugin that claims this contract but silently defaults to mcp-vertex's own paths, vocabulary, and a stale proposal-kind taxonomy breaks that promise for the first non-mcp-vertex host that ever loads it: audit reports would land in a directory that doesn't exist in their repo, generated proposals would carry meaningless internal jargon, and a legitimate proposal-prefix choice (`b`, `v`, `i`, `s`) would be silently rejected by a schema nobody thought to keep in sync. f00050 explicitly parks this class of fix behind the trigger "a specific finding ... calls out a remaining mcp-vertex-vocabulary leak"; a direct source re-scan found that trigger has fired.

## non-goals

- Rewriting parse-audit.service.ts's legacy-format acceptance (MUY MAL / MEJORABLE headings in INPUT audit markdown) — that is deliberate backward-compat parsing of historical reports, not a vocabulary leak, and stays untouched.
- Changing the f00114 canonical proposal-kind-prefix taxonomy itself — this proposal only stops audit from duplicating a stale copy of it.
- Making the audit plugin import from @mcp-vertex/proposals — that would violate the SAME agnostic-contract this proposal restores; proposalPrefix is relaxed to a generic shape validator instead of importing the proposals plugin's specific enum.

## Slices

- global_gate: type

### S1 — Derive auditDir/proposalsDir defaults from ctx.docsDir instead of a hardcoded mcp-vertex literal
- **Status**: done
- **Implementation**: `DEFAULT_OPTIONS.auditDir` (a static literal) removed; `register(ctx)` now computes `auditDir`/`defaultProposalsDir` via `joinRel(ctx.docsDir, 'proposals/done/audits')` / `joinRel(ctx.docsDir, 'proposals/ready')` — the exact pattern `plugins/proposals` already uses (`buildSwarmPaths(ctx.cacheDir, ctx.docsDir)`), and the reason `IMcpPluginContext` exposes `docsDir` in the first place ("everything it needs is here, already resolved, so the same plugin behaves identically under any agent, model or host"). Updated the two adjacent `OptionsSchema` doc comments to describe the same `<docsDir>/proposals/...` shape instead of the old literal.
- **New test**: `plugin-options.spec.ts` — a host with `ctx.docsDir: 'docs/my-other-project'` now gets `auditDir` defaulting to `docs/my-other-project/proposals/done/audits`, not `docs/mcp-vertex/proposals/...`.
- **Files**: `plugins/audit/src/index.ts`
- **Gate**: type
- acceptance:
  - "DEFAULT_OPTIONS.auditDir/proposalsDir removed as static literals; register(ctx) derives them via joinRel(ctx.docsDir, 'proposals/done/audits') / joinRel(ctx.docsDir, 'proposals/ready') so a host with a custom --docsDir gets a matching audit/proposals path without needing a second override."
  - "Existing plugin-options.spec.ts suite stays green unchanged (its fake ctx.docsDir already equals 'docs/mcp-vertex', so the derived value matches today's literal byte-for-byte)."

### S2 — Generalize the scaffolder's generated output + stale severity vocabulary
- **Status**: done
- **Implementation**: the generated proposal body's trailing comment changed from `` Sourced by `audit_run` (alcance B, f00077). `` to `` Sourced by `audit_run`. ``. Module JSDoc and the pre-`scaffoldProposals` docstring now say `FATAL | BAD | MINOR` (matching what the code actually checks) instead of `FATAL | MUY_MAL | MEJORABLE`. `outputDir`'s omitted-default changed from `docs/mcp-vertex/proposals/ready` to `docs/proposals/ready` (production is unaffected — `auto-scaffold-proposals.service.ts` always forwards the host's real resolved `proposalsDir` as `outputDir`; this default is a dead-in-production public-API fallback that no longer bakes in mcp-vertex's own name). Added an optional `IScaffoldOptions.inferTrack` callback threaded through `renderProposalBody`; default behavior (the existing folder-name heuristic) is unchanged for every existing caller.
- **New tests**: `proposal-scaffolder.service.spec.ts` (new file) — default `outputDir` has no `mcp-vertex` literal; `inferTrack` override is honored; built-in heuristic still applies when no override is passed; generated body has zero `Alcance B`/`f00077`/`MUY_MAL`/`MEJORABLE` occurrences. `auto-scaffold-proposals.service.spec.ts` gained one case asserting the same, exercised through the real `resolveAutoScaffold` → file-write path.
- **Files**: `plugins/audit/src/lib/services/proposal-scaffolder.service.ts`
- **Gate**: type
- acceptance:
  - "The generated proposal body's trailing HTML comment no longer cites 'Alcance B'/'f00077'; reads as a generic 'Sourced by `audit_run`.' note."
  - "Module JSDoc and the scaffoldProposals() doc comment no longer cite MUY_MAL/MEJORABLE; they name the canonical FATAL | BAD | MINOR bands that the code beneath already checks."
  - "outputDir's fallback-when-omitted default drops the 'mcp-vertex' literal (generic 'docs/proposals/ready' shape) since it is a public function callable by any direct consumer."
  - "inferTrack() becomes overridable via an optional IScaffoldOptions.inferTrack callback (default: today's existing heuristic, unchanged behavior) so a non-monorepo host can supply its own track-mapping without forking the module."

### S3 — Interpolate the real configured auditDir into audit_consolidate's tool description
- **Status**: done
- **Implementation**: the registered tool's `description` string now interpolates `options.defaultAuditDir` (already a constructor parameter) instead of a hardcoded literal. Also tightened the three adjacent doc comments (input-schema `auditDir`/`proposalsDir`, `IConsolidateToolOptions.defaultAuditDir`) to describe the `<docsDir>/proposals/...` shape rather than the old literal, for consistency with S1.
- **Files**: `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`
- **Gate**: type
- acceptance:
  - "The registered tool's `description` string interpolates options.defaultAuditDir (already a constructor parameter) instead of the hardcoded 'docs/mcp-vertex/proposals/done/audits' literal."
  - "audit-consolidate.tool.spec.ts stays green (its fixtures already pass defaultAuditDir: 'docs/mcp-vertex/proposals/done/audits', so the interpolated text matches byte-for-byte)."

### S4 — Rewrite audit_run's summary/description vocabulary to canonical English, no mcp-vertex-internal jargon
- **Status**: done
- **Implementation**: `summary` and the file-header comment no longer say "Alcance B (f00077)" or `MUY_MAL`/`MEJORABLE`; both now describe the tool in plain English using the canonical `FATAL/BAD/MINOR` band names. (The registered `description` string was already generic; only `summary` and the header needed the change.)
- **Files**: `plugins/audit/src/lib/tools/audit-run.tool.ts`
- **Gate**: type
- acceptance:
  - "summary field and file-header comment no longer say 'Alcance B'/'f00077' or MUY_MAL/MEJORABLE; describe scope/behavior in plain English using the canonical FATAL/BAD/MINOR band names."
  - "audit-run.tool.spec.ts stays green (assertions target JSON output fields, not the summary/description prose)."

### S5 — Relax proposalPrefix from a stale hardcoded enum to a generic shape validator
- **Status**: done
- **Implementation**: `proposalPrefix` changed from `z.enum(['f','x','c','r','d','a','t','n','q','u','l'])` to `z.string().regex(/^[a-z]$/)`. Confirmed the old enum was genuinely wrong, not just coupled: the canonical, current `PROPOSAL_KINDS` taxonomy (`@mcp-vertex/proposals`, shipped via f00114) has 14 prefixes (`f,b,x,r,v,a,c,d,t,i,s,l,n,q`) — the audit copy was missing `b`, `v`, `i`, `s` entirely and included a nonexistent `u`. Per this proposal's own non-goals, the fix does NOT import the canonical enum from `@mcp-vertex/proposals` (that would create the same kind of cross-plugin coupling this proposal removes elsewhere) — it validates shape only, staying decoupled from any specific host's taxonomy. Also dropped the stale "(alcance B, f00077)" from the file's own header comment.
- **New tests**: new file `audit-run.schemas.spec.ts` — every prefix the old enum allowed still validates; `b` (previously rejected) now validates; multi-character and uppercase/non-letter values are rejected; omitting the field is still valid.
- **Files**: `plugins/audit/src/lib/tools/audit-run.schemas.ts`
- **Gate**: type
- acceptance:
  - "proposalPrefix accepts any single lowercase letter (z.string().regex(/^[a-z]$/)) instead of the closed, stale 11-letter enum that is missing real current prefixes (b, v, i, s) and includes a nonexistent one ('u')."
  - "A prefix outside today's specific enum (e.g. 'b') now validates successfully; the scaffolder's own allocateId() is prefix-agnostic already so no downstream change is needed."

### S6 — Replace the dead Spanish dimensions fallback with the canonical SCORE_DIMENSIONS constant
- **Status**: done
- **Implementation**: `defaultDimensions ?? [9-item Spanish array]` replaced with `defaultDimensions ?? SCORE_DIMENSIONS`, importing the same canonical constant every other code path already uses. This fallback is unreachable via `index.ts` (which always supplies real `dimensions`) but was a real footgun for any direct caller of the exported `buildPlanRegistration` — and `IPlanToolOptions.dimensions`'s own doc comment already promised "falls back to `SCORE_DIMENSIONS` (canonical)", so the old array was a documented-vs-actual-behavior bug, not just a style issue.
- **New test**: new file `audit-plan.tool-registration.spec.ts` — calling `buildPlanRegistration` directly with no `dimensions` option now returns the canonical English `SCORE_DIMENSIONS`, not the old Spanish array.
- **Files**: `plugins/audit/src/lib/tools/audit-plan.tool.ts`
- **Gate**: type
- acceptance:
  - "The `defaultDimensions ?? [...]` fallback array (Spanish, stale translation) is replaced with `defaultDimensions ?? SCORE_DIMENSIONS`, matching the single canonical source every other code path already uses."
  - "audit-plan.tool.spec.ts stays green; a new spec case confirms calling buildPlanRegistration without a dimensions option yields the canonical English SCORE_DIMENSIONS, not the old Spanish array."

## acceptance

- DEFAULT_OPTIONS.auditDir/proposalsDir removed as static literals; register(ctx) derives them via joinRel(ctx.docsDir, 'proposals/done/audits') / joinRel(ctx.docsDir, 'proposals/ready') so a host with a custom --docsDir gets a matching audit/proposals path without needing a second override.
- Existing plugin-options.spec.ts suite stays green unchanged (its fake ctx.docsDir already equals 'docs/mcp-vertex', so the derived value matches today's literal byte-for-byte).
- The generated proposal body's trailing HTML comment no longer cites 'Alcance B'/'f00077'; reads as a generic 'Sourced by `audit_run`.' note.
- Module JSDoc and the scaffoldProposals() doc comment no longer cite MUY_MAL/MEJORABLE; they name the canonical FATAL | BAD | MINOR bands that the code beneath already checks.
- outputDir's fallback-when-omitted default drops the 'mcp-vertex' literal (generic 'docs/proposals/ready' shape) since it is a public function callable by any direct consumer.
- inferTrack() becomes overridable via an optional IScaffoldOptions.inferTrack callback (default: today's existing heuristic, unchanged behavior) so a non-monorepo host can supply its own track-mapping without forking the module.
- The registered tool's `description` string interpolates options.defaultAuditDir (already a constructor parameter) instead of the hardcoded 'docs/mcp-vertex/proposals/done/audits' literal.
- audit-consolidate.tool.spec.ts stays green (its fixtures already pass defaultAuditDir: 'docs/mcp-vertex/proposals/done/audits', so the interpolated text matches byte-for-byte).
- summary field and file-header comment no longer say 'Alcance B'/'f00077' or MUY_MAL/MEJORABLE; describe scope/behavior in plain English using the canonical FATAL/BAD/MINOR band names.
- audit-run.tool.spec.ts stays green (assertions target JSON output fields, not the summary/description prose).
- proposalPrefix accepts any single lowercase letter (z.string().regex(/^[a-z]$/)) instead of the closed, stale 11-letter enum that is missing real current prefixes (b, v, i, s) and includes a nonexistent one ('u').
- A prefix outside today's specific enum (e.g. 'b') now validates successfully; the scaffolder's own allocateId() is prefix-agnostic already so no downstream change is needed.
- The `defaultDimensions ?? [...]` fallback array (Spanish, stale translation) is replaced with `defaultDimensions ?? SCORE_DIMENSIONS`, matching the single canonical source every other code path already uses.
- audit-plan.tool.spec.ts stays green; a new spec case confirms calling buildPlanRegistration without a dimensions option yields the canonical English SCORE_DIMENSIONS, not the old Spanish array.
