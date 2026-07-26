---
id: f00135
kind: feat
title: env plugin — .env schema validation, missing/mistyped var detection and a "which var powers which plugin/provider" diagnostic
status: ready
date: 2026-07-23
track: plugin+config+onboarding
---

# f00135 — env plugin

## goal

An `env` plugin that validates `.env` against a declared schema (missing /
extra / mis-typed vars), and — crucially — reports **which variable each
plugin/provider needs**, so "why isn't X detected?" becomes a clear diagnostic
instead of silent failure. Secrets are reported by **presence, never value**.

## why

Environment/config misconfiguration is a top onboarding failure: a whole class
of "provider not detected", "search scanned 0", "tool inert" problems traces
back to a missing/misnamed env var or config. A diagnostic that maps vars →
capabilities turns those silent dead-ends into an actionable message — directly
serving the reliability + auto-config goals.

## why this design

A **pure schema validator** over an injected env snapshot, plus a
**requirements map** assembled from data already in the system: each plugin's
`optionsSchema` and `auto-agent-selector`'s known-providers `reach` fields
declare what they need. So the diagnostic is derived, not hand-maintained.
Values are redacted (presence only); nothing is written.

## non-goals

- No writing/overwriting `.env`; no secret **value** logging (presence only).
- No secrets-vault service; no network.
- Not a replacement for `configuration_center` — it feeds it a diagnostic.

## slices

### S1 — schema + presence/type validation

- **Status**: done
- **Files**: `plugins/env/src/lib/validate/`, `plugins/env/src/lib/tools/env-check.tool.ts`
- **Gate**: bun run validate
- **Commit**: `feat(env): add schema validation to env_check (f00135 S1)`

`env_check` validates the env snapshot against a declared schema → findings
(missing/extra/mistyped). Pure over injected env; values redacted.

Delivered:
- `env-schema.ts` — `IEnvSchema`, `IEnvVarSchema`, `EnvType`, `schemaKeys`, `schemaRequired`, `ENV_SCHEMA` zod parser.
- `check-schema.ts` — `checkSchema(parsed, schema)` + helpers `validateValue`, `validateEntry`; emits 4 normalized finding categories (`env/missing-required`, `env/missing-typed`, `env/extra-undeclared`, `env/mistyped-value`).
- `env-check.tool.ts` — accepts optional `schema` input, threads through `runEnvCheckWithSchema`.
- `IEnvEntry` extended with `value: string`; `parseEnv` populates it.
- 29 new tests (15 schema + 14 check-schema) all pass; 35/35 env tests, 1016/1016 core tests.

### S2 — requirements map (var → plugin/provider)

- **Status**: done
- **Files**: `plugins/env/src/lib/requirements/`, `plugins/env/src/lib/tools/env-explains.tool.ts`
- **Gate**: bun run validate

`env_explains` derives, from plugin `optionsSchema` + provider `reach`, which
capability each var unlocks and what is currently blocked. Pure derivation.

Delivered:
- `requirements/types.ts` — `IEnvRequirement`, `IUnlockedCapability`, `IBlockedCapability`, `IEnvExplain`.
- `requirements/extract.ts` — walks a plugin's zod `optionsSchema`, finds `.describe("...env:VAR...")` markers, emits `IEnvRequirement[]`.
- `requirements/explain.ts` — pure diff: present vs missing env vars → unlocked vs blocked capabilities.
- `tools/env-explains.tool.ts` — registers `env_explains`; takes an optional injected `requirements` catalog.
- 13 tests in `tests/src/lib/requirements/{extract,explain}.spec.ts`; 49/49 env tests pass.

### S3 — init/configuration-center surface + catalog

- **Status**: pending
- **Files**: `packages/core/src/lib/tools/configuration-center.tool.ts`, `plugins/env/README.md`
- **Gate**: bun run validate

Surface the diagnostic in `init` and `configuration_center`; catalog + wiki +
pack membership.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Flags a missing required var and a type mismatch; never prints a value.
- `env_explains` reports which provider a given key unlocks and what is blocked.

## notes

Reuses plugin `optionsSchema`, `auto-agent-selector` provider `reach`, and
`configuration_center`. Ties into r00011 (auto-config). Prior art: envalid,
dotenv-linter, znv.
