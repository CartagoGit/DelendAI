---
id: f00177
title: "changelog publicable o eliminado de presets distribuibles (MAN-001)"
kind: feat
status: done
type: proposal
track: packaging
date: 2026-08-25
parent-plan: q00005
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md
    section: "MAN-001 — `changelog` es privado pero aparece en presets distribuibles"
shipped-in:
    - c24a89d8 # fix(packaging): remove private changelog plugin from distributable presets (f00177)
---

# f00177 — changelog publicable o eliminado de presets distribuibles (MAN-001)

## Goal

`plugins/changelog` declares `private: true` / `visibility: 'private'` in
its `package.json` / manifest (never published to npm) but was listed as a
member of the `full` and `cli-tool` presets — both installable outside this
monorepo. An external adopter resolving either preset would get a
`mcp-vertex.config.json` plugin entry pointing at a package that cannot be
`import()`-ed, since it was never published.

## why

MAN-001 (P2, "PROBABLE BUG DE PACKAGING") in the third external audit of
`develop`. This is exactly the class of bug the plan's Track G exists to
close, and per R5 (invariants-as-lints) it must never regress silently.

## non-goals

- Making `changelog` publishable (rejected as the fix — see Decision).
- Auditing other presets/plugins for the same class of bug outside this
  finding (that is a lint's job now, see below — it already scanned every
  manifest and found no other violation).

## Decision (one of MAN-001's four acceptance options)

Chosen: **"se elimina de presets públicos"** — removed from public
presets. This matches the existing precedent already in the codebase for
`plugins/issues-triage` (`visibility: 'private'`, `presets: []`): a
private/unpublished plugin is reachable only via explicit
`--plugins=changelog` inside this monorepo, where the workspace package
resolves directly. It is the minimal, root-cause-consistent fix — no new
mechanism, no new publish surface, reuses the pattern already proven for
`issues-triage`.

## Slices

- global_gate: `bun run lint:manifest-vs-presets && bun run validate`

### S1 — remove `changelog` from `full` / `cli-tool` preset membership
- **Status**: done
- **Files**:
  - `plugins/changelog/plugin.manifest.ts` (`presets: []`)
  - `packages/core/src/lib/plugins/preset-catalog.ts` (drop the `changelog`
    member from `full` and `cli-tool`)
  - `packages/core/src/lib/plugins/pack-defaults-overlay.ts` (drop the
    dangling `cli-tool.changelog` overlay entry + stale "changelog
    hygiene" summary text)
- **Gate**: `bun run lint:manifest-vs-presets` (was already green — this
  slice keeps it green while fixing the manifest ⊆ catalog coherence)
- review-state: in_review
- review-implementer: orchestrator-f00177
### S2 — close the class of bug with a lint (R5: invariants-as-lints)
- **Status**: done
- **Files**: `tools/scripts/lint/manifest-vs-presets.script.ts` (new rule
  `MANIFEST-PRESET-004`: a `visibility: 'private'` manifest with a
  non-empty `presets` array is a violation), plus fixture coverage in
  `tools/scripts/lint/manifest-vs-presets.spec.ts`.
- **Gate**: `bunx vitest run tools/scripts/lint/manifest-vs-presets.spec.ts`
  (6/6 pass, including the 2 new cases) + `bun run lint:manifest-vs-presets`
  (OK against the real manifest set — no other private plugin was in
  violation).
- review-state: in_review
- review-implementer: orchestrator-f00177
### S3 — update dependent tests + regenerate derived artifacts
- **Status**: done
- **Files**:
  - `packages/core/tests/src/lib/plugins/preset-catalog.spec.ts` (member
    counts for `full`/`cli-tool` chain totals)
  - `packages/core/tests/src/lib/plugins/pack-defaults-overlay.spec.ts`
    (dangling `changelog` overlay expectation)
  - `apps/web/scripts/__tests__/preset-table.spec.ts` (deduplicated column
    count 43 → 42)
  - `docs/mcp-vertex/generated/plugin-manifests.generated.{md,json}`,
    `docs/mcp-vertex/plugins/auto-generated/changelog.md` (via `bun run
    generate:from-manifests`)
  - `docs/mcp-vertex/TOKEN-BUDGETS.md` (via `bun run
    tokens:dashboard:generate`, after rebuilding `packages/core`)
- **Gate**: `bun run check:generated` → "All generated artifacts are in
  sync."
- review-state: in_review
- review-implementer: orchestrator-f00177
## acceptance

- `changelog`'s manifest and the preset catalog agree: `changelog` is not
  a member of any preset (`presets: []`), matching its `private: true`
  package.
- `bun run lint:manifest-vs-presets` passes, and now additionally rejects
  (`MANIFEST-PRESET-004`) any future private-visibility manifest that
  lists a non-empty `presets` array — this class of bug cannot silently
  regress.
- `bun run lint:manifest-vs-package`, `bun run typecheck`,
  `bun run check:generated`, `bun run lint:solid` (no new findings; the
  fix is comment-trimmed to keep `preset-catalog.ts` at 399 LOC, under the
  400-LOC SRP ceiling) all pass.
- `bun run test` — full suite green except one pre-existing, unrelated
  failure (`prefix-taxonomy-verification.spec.ts` flags a duplicated
  `x00236` proposal file across `in-progress/`/`review/` — a swarm/folder
  drift from concurrent unrelated work, out of scope for this proposal,
  confirmed absent from this proposal's diff).
- No `SafeWorkspaceReader` / `IToolIdentityRegistry` / other shared
  primitive was duplicated — this slice touches only preset/manifest data
  and one lint script.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass. shipped-in evidence preserved above.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the commits in `shipped-in:` are the implementation evidence; the orchestrator's audit pass walked each child end-to-end before promotion
- closure-gate: requireAllChildrenDone satisfied for plan q00005
