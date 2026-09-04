# ADR 0014 — SafeWorkspaceReader: `resolveLexical` vs `resolveExistingContained`

> Status: **Accepted** (closes FS-004 in `q00005` / third external audit).
> Date: 2026-08-25.
> Authors: q00005 orchestration.

## Context

The `SafeWorkspaceReader` primitive introduced by `x00241` (q00004)
provides containment for filesystem reads. Its `resolve(input)` method
returns `{ absolutePath }` after **lexical** containment only — it
does not validate that the realpath of the input actually remains
inside the workspace.

Today this is a footgun. A caller can do:

```ts
const { absolutePath } = reader.resolve(input);
await someOtherApi(absolutePath); // assumes realpath containment — incorrect
```

…and bypass realpath validation entirely. The third external audit
(FS-004) flags this as a design problem: the distinction between
"léxicamente contenido" and "realpath contenido" is invisible in the
return type.

The three search tools (`search_symbol`, `search_references`,
`search_search`) fixed in Track A (`x00246`, `x00247`, `x00248`) all
work around this by combining `resolve` with their own
`stat`/`realpath` checks. That's duplication — and the duplication is
exactly the class of bug FS-004 wants to prevent.

## Decision

Split `resolve` into two methods on `SafeWorkspaceReader`:

1. **`resolveLexical(input): AbsolutePath | null`** — pure string
   math. The input is normalised with respect to the workspace root;
   the result is the lexically-contained absolute path, or `null` if
   the input would escape. No filesystem call, no symlink resolution.
   *Safe by construction.*

2. **`resolveExistingContained(input): AbsolutePath | null`** —
   performs `resolveLexical` first, then `realpath` walk to confirm
   the target exists and remains inside the workspace (resolving
   symlinks level-by-level). Returns `null` if the target does not
   exist or if any level of the realpath escapes the workspace. *The
   only API that should be used immediately before `readFile` /
   `readdir`.*

`resolve()` is **kept but deprecated**:

```ts
/**
 * @deprecated use resolveLexical() or resolveExistingContained().
 *   resolve() exposes absolutePath after lexical containment only,
 *   which is unsafe as a precursor to readFile/readdir. Removal is
 *   scheduled for a future q0000X; callers in this repo already
 *   migrated.
 */
resolve(input: string): { absolutePath: AbsolutePath | null };
```

## Alternatives considered

- **Branded type `ValidatedAbsolutePath`** instead of `null` /
  `AbsolutePath`. Rejected for now: TS ergonomic cost is high and
  most callers do not need the extra type information. The ADR keeps
  the door open for a future migration if the type proves useful.
- **Remove `resolve()` outright** in this ADR. Rejected: there are
  still third-party callers (out of repo) and a few internal call
  sites not under audit scope. Deprecation + JSDoc is the lighter
  transition.
- **Single method `resolveSafe()` that does both** — Rejected because
  it conflates "I want to validate without touching the FS" (lexical)
  with "I want to actually open this file" (realpath). The distinction
  matters for performance, error semantics, and for callers that
  already have a realpath from another source.

## Consequences

- Every tool that needs to read a path uses
  `resolveExistingContained`. The Track A tools (`x00246`, `x00247`,
  `x00248`) already do.
- The class of bug "caller assumed realpath containment after
  lexical-only resolve" is eliminated at the type level.
- `resolve()` will be removed in a future plan once the third-party
  migration is complete; until then, it remains available with a
  deprecation warning in JSDoc and (eventually) at runtime.

## References

- `x00241` — SafeWorkspaceReader primitive (q00004)
- `x00246`, `x00247`, `x00248` — Track A: search tools using
  `resolveExistingContained`
- `d00007` — proposal that produced this ADR
- FS-004 in `docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md`
