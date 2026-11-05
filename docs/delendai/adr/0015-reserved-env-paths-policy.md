# ADR 0015 — Reserved paths: `.env*` policy

> Status: **Accepted** (closes FS-005 in `q00005` / third external audit).
> Date: 2026-08-25.
> Authors: q00005 orchestration.

## Context

The third external audit (FS-005) notes that `SafeWorkspaceReader`'s
reserved-paths list is implicit and undocumented. In particular, it
is not clear whether `.env.local`, `.env.production`, `.env.secret`
are treated like `.env` (block) or like ordinary files (allow).

This matters because the convention is well established across
frameworks:

- `.env` — universal default
- `.env.local` — local secrets (Next.js, Astro, Remix, Vite, SvelteKit)
- `.env.production` — production secrets (Next.js, Astro)
- `.env.development` — development secrets (Next.js, Astro)
- `.env.secret` — explicit secret marker (less universal)
- `.env.example` — onboarding placeholder, **not a secret**
- `.env.test` — fixture data, **not a secret**

A safe default is to **block** everything that looks secret-like and
**allow** the explicit non-secret variants. Allowing `.env.example`
to be read is necessary because several docs / generators in this
repo need to introspect it.

## Decision

The reserved-paths list for `SafeWorkspaceReader` is extended as
follows:

| Path                       | Action  | Rationale |
|----------------------------|---------|-----------|
| `.env`                     | Block   | Universal default; secrets by convention. |
| `.env.local`               | Block   | Local secrets (Next.js, Astro, Vite, etc.). |
| `.env.production`          | Block   | Production secrets (Next.js, Astro). |
| `.env.development`         | Block   | Symmetry with `.env.production`. |
| `.env.secret`              | Block   | Explicit secret marker. |
| `.env.example`             | Allow   | Onboarding placeholder, no secrets. |
| `.env.test`                | Allow   | Test fixtures, no secrets. |
| `.env.*` (other)           | Allow   | Conservative default; explicit opt-in by name if needed. |
| `.git/`, `node_modules/`, `.vscode/` | Block (unchanged) | Reserved from earlier audits. |

## Alternatives considered

- **Block everything matching `.env*`.** Rejected: would block
  `.env.example`, breaking docs / generators that read it as
  metadata.
- **Make the list host-configurable.** Rejected: a per-host
  reserved-paths list is exactly the kind of "configurable escape"
  that drifts across deployments. The list is global; a host that
  needs different behaviour can construct its own
  `SafeWorkspaceReader`.
- **Parse the file and redact secrets at the lexer level.** Out of
  scope: this ADR is about *containment*, not parsing. Parsing dotenv
  is a separate concern; if/when it's added, it's a separate ADR.

## Consequences

- `SafeWorkspaceReader.resolveLexical('.env.production')` returns
  `null` (blocked). Same for `.env.local`, `.env.secret`,
  `.env.development`.
- `SafeWorkspaceReader.resolveLexical('.env.example')` returns the
  absolute path (allowed).
- Test suite extends `packages/core/tests/src/lib/filesystem/safe-workspace-reader.spec.ts`
  with one assertion per row of the table above.
- `.git/`, `node_modules/`, `.vscode/` keep their existing reserved
  treatment (no regression).

## References

- `x00241` — SafeWorkspaceReader primitive
- `d00008` — proposal that produced this ADR
- FS-005 in `docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-tercera-pasada.md`
