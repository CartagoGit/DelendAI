# ADR 0007 — `@delendai/core/contracts` (subpath) vs a separate package

> Status: **Accepted**.
> Date: 2026-08-25.
> Authors: q00006 Track C orchestration + ChatGPT-5.6-Sol (fourth external
> audit pass, rectification).

## Context

The fourth external audit (`docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md`,
Track C / `r00029`) originally proposed extracting the type-only
surface of `@delendai/core` into a brand-new workspace package,
`@delendai/contracts`, so that consumers who only need types
(client, plugins, external tooling) would not have to import the
full runtime barrel.

The orchestrating agent implemented `r00028` first: an `exports` map
on `packages/core/package.json` adding `./contracts`, `./plugin`,
`./runtime` and `./node` subpaths, each backed by a dedicated barrel
under `packages/core/src/{contracts,plugin,runtime,node}/index.ts`.
`@delendai/core/contracts` re-exports pure interfaces and the
shared envelope helpers (`OperationResult`, `EntityRef`, …) with no
Node-only imports, and became the de-facto answer to the audit's
concern — without a second package existing yet.

The external reviewer (ChatGPT-5.6-Sol) flagged the mismatch on the
next pass: `r00029`'s prose still said "create the
`@delendai/contracts` package," but the agent had shipped a
subpath instead, and the divergence was recorded nowhere except
`git log`:

```
$ git log --oneline | grep contracts
a89a68b feat(core): expose @delendai/core/contracts subpath ...
```

An unrecorded architecture decision is exactly the kind of drift a
future refactor (human or agent) can silently re-litigate — "extract
`@delendai/contracts`" reads like new work, when in fact it was
already evaluated and answered.

Separately, `packages/contracts/` also exists on disk today, as a
small pure-TypeScript package (`routes.ts`, `safety.ts`, `plugin.ts`,
`envelopes.ts`, `capabilities.ts`, `primitives.ts` — zod schemas and
constants, no `@delendai/core` dependency, no Node imports). It
predates this ADR and is not superseded by it: nothing in
`packages/client`, the plugins, or the apps imports from
`@delendai/contracts` today (`grep -rln "from '@delendai/contracts'"`
outside the package itself returns zero hits) — every consumer of
pure types imports `@delendai/core/contracts`. `packages/contracts`
is a narrower, standalone home for schema-validated primitives that
have not yet been asked to cross the package boundary; it is not the
audit's proposed "extract everything to a package" outcome. This
ADR's decision is scoped to that broader question — where does the
*general* type-only surface of `core` live — not to the narrower
existence of `packages/contracts`.

## Decision

The general type-only surface of `@delendai/core` lives at the
**subpath** `@delendai/core/contracts`, not at a separate,
independently versioned package. Pure types live under
`packages/core/src/contracts/` (as a re-export barrel over
`packages/core/src/lib/contracts/interfaces/**` and the shared
envelope contracts) and are exposed via the `exports` field in
`packages/core/package.json`.

Reasons:

1. **Minimize package fragmentation while preserving the boundary.**
   A subpath gives the same import-time isolation (no runtime code
   pulled in when only types are needed) without adding a second
   `package.json` to version, build, and keep in sync with `core`.
2. **Avoid a premature independent `npm publish` surface.** Nothing
   outside `@delendai/{core,client,vscode,web}` consumes these
   types yet. Publishing a standalone package is a commitment
   (semver, changelog, a public API surface distinct from `core`)
   that has no consumer to justify it today.
3. **One CI/build graph instead of two.** A separate package adds a
   build step, a lint config, and a dependency edge that the
   monorepo's task graph has to keep current. The subpath reuses
   `core`'s existing build.

## Consequences

### Positive

- A single `package.json` to version; no drift between `core` and a
  sibling `contracts` package's declared dependencies or TypeScript
  target.
- Cross-subpath tests stay local to `packages/core/tests/**`; no
  package needs to be published (even to a local registry) for tests
  to exercise the contract.
- Build and CI do not gain an additional package to schedule,
  cache-key, or fan out to.

### Negative

- A consumer outside `@delendai/{core,client,vscode,web}` that
  wants only the pure types cannot depend on them without also
  depending on `@delendai/core` (even if bundlers tree-shake the
  runtime away, the `node_modules` graph still names `core`).
- The subpath's versioning is bound to `core`'s. There is no
  independent semver for the contracts surface — a breaking type
  change ships in the same release as unrelated runtime changes.
- `packages/contracts` (the standalone zod/primitives package
  described in Context) and `@delendai/core/contracts` (this
  subpath) are two related but distinct surfaces. A newcomer who
  finds both can reasonably ask "why two homes for pure types?" —
  this ADR is the answer, and the "Trigger for reversal" table below
  is what would fold them together.

## Trigger for reversal

If **two or more** of these move to "blocking" on a quarterly
architecture review, open a proposal
(`r000NN-extraer-contracts-paquete-segundo-ciclo`) to extract
`@delendai/core/contracts` into its own published package (or to
merge it into the existing `packages/contracts`):

| # | Condition | Metric | Status |
|---|-----------|--------|--------|
| 1 | `core/contracts` is imported from outside `@delendai/{core,client,vscode,web}` by more than 3 external packages | importer count via `grep -rl '@delendai/core/contracts'` outside the monorepo's own apps/packages | measure quarterly |
| 2 | A consumer needs to `npm publish @delendai/contracts` independently of `core`'s release cadence | npm publish runbook exists and is requested | blocking |
| 3 | The `core/contracts` subpath starts pulling in Node-only transitive dependencies (violates R1.x purity) | `tsc --noEmit` against a Node-free tsconfig for the subpath fails | blocking |
| 4 | The public contract surface (exported types) grows past a size where a single barrel is unreviewable | exported-symbol count in `packages/core/src/contracts/index.ts` | measure quarterly |

## References

- `r00028` — subpath exports implementation (predecessor).
- `r00029` — original "extract `@delendai/contracts` package"
  proposal; superseded by this ADR (subpath, not package).
- `r00030` — client import-path realignment (predecessor).
- `c00146` — Track C realignment that points `r00029`/`r00030` at
  this ADR.
- `b00237` — deprecates `nodeDynamicImport` from `core/public`
  (predecessor, still valid; cites this ADR for the subpath model).
- `d00012` — proposal that produced this ADR.
- Fourth external audit, Track C / `r00028`–`r00030`:
  `docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md`.
