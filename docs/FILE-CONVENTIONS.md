# File conventions

> Companion to `AGENTS.md` and the `f00037` proposal. Canonical reference
> for the suffix + folder layout used by every TypeScript surface in
> the `@mcp-vertex/core` monorepo (packages, plugins, extensions,
> apps, examples, tools). Downstream consumers can opt in to the same
> rules through the `mcpv conventions check --profile=typescript`
> command (see `f00037` S3).

## Why this exists

Naming must be mechanical. If `foo.service.ts` means service everywhere,
agents and humans can navigate by extension alone — no need to open the
file to guess its role. The convention removes a whole class of
"where does this go?" decisions and keeps the lint rules small.

The convention is **language-aware**: TypeScript gets a strict profile,
non-TS consumer projects are detected and left untouched unless the
user explicitly selects a compatible profile.

## The table

The suffix is **singular** (it describes the file role). The folder is
**plural** (it groups many contracts).

| Role | Folder | Suffix | Example |
|---|---|---|---|
| Interfaces / exported structural types | `contracts/interfaces/` | `*.interface.ts` | `tool-descriptor.interface.ts` |
| Constants (durable, frozen, shared) | `contracts/constants/` | `*.constant.ts` | `proposal-glossary.constant.ts` |
| Services (stateful business logic) | `services/` | `*.service.ts` | `search-service.ts` |
| MCP tools | `tools/` | `*.tool.ts` | `git-commit.tool.ts` |
| Registries (collections + lookup) | `registries/` or `registry/` | `*.registry.ts` | `tool-registry.ts` |
| Registration glue (wires deps) | `register/` or local feature folder | `*.register.ts` | `plugin.register.ts` |
| Factories (constructors + DI graphs) | `factories/` | `*.factory.ts` | `client-factory.ts` |
| Builders (fluent / step-wise construction) | `builders/` | `*.builder.ts` | `query-builder.ts` |
| Generated outputs | `generated/` | documented generator-owned suffix | `api.generated.ts` |
| Public barrels | `public/` | `index.ts` (no role suffix) | `src/public/index.ts` |

### Hyphen vs dot

**Always dot, never hyphen.** The repository used to mix
`-service.ts`, `-tool.ts`, etc. Hyphens collide with package
boundaries (`mcp-vertex-tool.ts`) and break glob deduplication. Every
file with a role carries exactly one dot between the basename and the
role suffix.

### Co-location rules

- A `*.service.ts` may live next to its `*.types.ts` companions if the
  service is small and feature-scoped; the type companion keeps the
  bare `*.types.ts` form and is *not* classified as `interface` (it is
  feature-private glue).
- A `*.tool.ts` MUST live under a `tools/` folder, even when there is
  only one tool in the package.
- A `*.interface.ts` and a `*.constant.ts` MUST live under the
  matching `contracts/` subfolder. No top-level `*.interface.ts`.

### Exceptions (do not rename)

These categories are exempt from the role-suffix rule:

1. **Public barrels** — `src/public/index.ts` and the `src/index.ts`
   entrypoint. They exist to re-export the package surface; carrying a
   role suffix would mislead callers into importing from a non-public
   path.
2. **Generated outputs** — anything under `generated/` or matching the
   `*.generated.ts` shape. The owner is the generator, not a human.
3. **Type companions** — `*.types.ts` (plural). These are feature-private
   structural helpers, not contracts. They do not move into
   `contracts/interfaces/`.
4. **Test files** — `*.spec.ts` and `*.e2e.spec.ts`. Test suffix wins
   over role suffix when both would apply.
5. **Configuration** — `*.config.ts`, `package.json`, `tsconfig.json`.
   These are read by tooling; renaming them breaks the tooling.

## The classifier

`tools/scripts/lint/file-conventions.ts` exports a pure
`classifyPath(relPath)` that maps any repo-relative path to one of:

```
'interface' | 'constant' | 'service' | 'tool' | 'registry'
| 'register' | 'factory' | 'builder' | 'generated' | 'barrel'
| 'other'
```

The classifier is the single source of truth — both this document and
the lint script derive their tables from it. Adding a new role means
adding one entry to the rules array; nothing else.

## SOLID rationale

- **Single responsibility** — the classifier only maps paths to roles;
  the lint script only walks the tree and prints findings.
- **Open/closed** — new roles are added by appending a rule; no edit
  to the classifier core.
- **Liskov** — every rule satisfies the same `IRoleRule` contract and
  is interchangeable in the rule chain.
- **Interface segregation** — `IRoleRule` only requires
  `match(path): boolean` and a `name`. No god-objects.
- **Dependency inversion** — the script depends on the abstract
  classifier + rule list; both can be replaced in tests with fakes.

## Migration order

Drift will be reported in **report mode** until the per-package
migrations land (S4–S6). After S7 the linter becomes strict for
non-generated files. Migration slices use `git mv` and run the local
package tests before promoting to `bun run validate`.

## See also

- `AGENTS.md` — repo-wide invariants and the `*.script.ts` tooling rule.
- `f00037` proposal — the canonical source of truth for this convention.
- `f00020` (`docs/proposals/ready/f00020-skills-and-tools-coverage.md`)
  — the broader skills + tools coverage work that depends on this
  naming being stable.