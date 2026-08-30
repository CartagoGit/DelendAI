# ADR d00014 — Core/plugin boundary for workflow domains

> Status: Accepted.
> Date: 2026-08-30.
> Authors: r00043 S5.

## Context

`@mcp-vertex/core` had accumulated direct knowledge of the `proposals` domain in several forms:

- concrete imports and subpaths,
- docs/store paths such as `docs/.../proposals/...`,
- host-facing workflow literals and tool ids.

That coupling made the runtime boundary ambiguous. The core package is supposed to provide reusable contracts and composition seams, while plugin domains remain optional. The `r00043` slices already removed the hard behavioral coupling from adoption, stable facade and skill assembly. What remained was the compatibility/documentation edge: some host-composition strings and legacy compat paths still mention `proposals`, but they are no longer allowed to grow silently.

## Decision

The dependency direction is fixed as:

```text
core contracts → plugin adapters → host composition
```

Applied to this repo, that means:

1. `packages/core/src/lib/contracts` carries neutral contracts and stable seams.
2. Plugin adapters own domain behavior, domain vocabulary and compatibility shims.
3. Host composition may describe loaded plugins, but only as a composition concern, never as core runtime knowledge.
4. Any residual `proposals` literal/import/path that still lives under `packages/core/src` must be explicitly classified, time-boxed and reviewable.

To enforce point 4, the repo adds the permanent lint `tools/scripts/lint/core-proposals-boundary.script.ts`. The lint is distinct from the S0 inventory script:

- `inspect/core-proposals-boundary.script.ts` explains and inventories the boundary.
- `lint/core-proposals-boundary.script.ts` blocks regressions in the live source tree.

## Consequences

- New `proposals` imports, path literals or workflow strings cannot enter `packages/core/src` unnoticed.
- Existing compatibility cases stay visible because each one carries an `until` date and a reason.
- Host-composition surfaces can still explain loaded plugin behavior, but that exception is auditable rather than implicit.
- Future extraction work has a stable rule of motion: move reusable vocabulary toward contracts, keep domain behavior in adapters, and keep orchestration text in host composition only.

## Alternatives considered

- Keep using only the S0 inventory script. Rejected: it inventories the state but does not act as a permanent regression gate.
- Ban every `proposals` literal in `packages/core/src` immediately. Rejected: that would break current compatibility/help surfaces before their owning adapters or host composition seams are fully migrated.
- Allow broad directory-level waivers. Rejected: too coarse; the accepted model requires reviewable exceptions with explicit retirement dates.

## References

- `r00043` — core no longer knows the `proposals` domain.
- `tools/scripts/inspect/core-proposals-boundary.script.ts` — executable inventory.
- `tools/scripts/lint/core-proposals-boundary.script.ts` — permanent regression guard.