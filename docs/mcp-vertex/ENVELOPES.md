# Envelopes — shared result shapes (r00033)

> Track M / q00006 §46 — close the audit finding "each plugin defines its
> own ad-hoc return shape" by standardising the small set of envelopes
> that flow through MCP tool calls.

## What lives here

Six envelopes and three helpers, all defined in
`packages/core/src/lib/contracts/envelopes.contract.ts` and re-exported
from `@mcp-vertex/core/contracts` (the type-only subpath):

| Envelope          | Use                                              |
| ----------------- | ------------------------------------------------ |
| `EntityRef`       | Pointer to a typed entity (`proposal`, `plugin`, `slice`, `tool`, …) |
| `OperationResult` | Discriminated success/failure for tool returns   |
| `PagedResult`     | Cursor-paginated list                            |
| `MutationResult`  | Before/after + dryRun flag for write operations  |
| `DiagnosticResult`| Severity-tagged diagnostic (info/warn/error/fatal)|
| `ResourceResult`  | URI + MIME + text-or-bytes content               |

Plus the helper pair `success()` / `failure()` that mint **frozen**
envelopes with optional `EnvelopeMeta`.

## Why

- The LLM no longer has to memorise one shape per plugin.
- One renderer can draw every `MutationResult`.
- `f00198` / `f00199` can compute cross-plugin KPIs because every
  invocation is recognisable.

## Adoption status

- **r00033** ships the types — this proposal.
- `plugins/proposals/src/lib/returns.ts` is the pilot adoption: a
  plugin-scoped surface built on `EntityRef` / `OperationResult` /
  `success` / `failure`, narrowed to the entity kinds `proposals`
  mints (`proposal`, `slice`, `plan`). Its type aliases live in
  `plugins/proposals/src/lib/contracts/interfaces/proposal-return-envelope.interface.ts`
  per the repo's `lint:types-in-contracts` convention. No existing
  tool's wire shape was changed yet — this is the additive surface a
  future migration adopts from, not a retrofit of an existing tool.
- New plugin returns should reach for these envelopes first.
- Existing plugin returns keep working; the migration is gradual.

## Conventions

- All fields are `readonly`. Frozen at construction time by the
  `success()` / `failure()` helpers.
- `value` / `error` carry data; `envelope` carries **metadata**
  (`source`, `schemaVersion`, `emittedAt`, optional `sequenceId`).
- `Refusal.code` is namespaced (`'NOT_FOUND'`, `'AUDIT-46'`,
  `'LOAD-IO'`). Dashboards group by code.
- `ResourceResult.content` is `string | Uint8Array`. MCP resources
  keep their own `Resource` shape; this envelope is for *values*
  that contain or reference a resource.

## Examples

### `success`

```ts
import { success } from '@mcp-vertex/core/contracts';

return success(
  { changed: { kind: 'proposal', id: 'r00033' } },
  { source: 'proposals', schemaVersion: '0.1.0' },
);
// → { ok: true, value: { changed: ... }, envelope: { source, schemaVersion } }
```

### `failure`

```ts
import { failure } from '@mcp-vertex/core/contracts';

return failure(
  {
    code: 'NOT_FOUND',
    message: `proposal r00033 not found`,
    diagnostic: {
      severity: 'warn',
      code: 'PROPOSAL-MISSING',
      message: 'r00033 was archived in f00076',
      source: 'proposals',
    },
  },
  { source: 'proposals', schemaVersion: '0.1.0' },
);
```

### `PagedResult`

```ts
return success<PagedResult<EntityRef<'slice'>>>({
  items: [
    { kind: 'slice', id: 'S1' },
    { kind: 'slice', id: 'S2' },
  ],
  total: 12,
  pageSize: 2,
  cursor: 'opaque-base64',
});
```

## Privacy

The envelopes carry **shapes**, not data. Whatever the plugin puts
into `value` / `error.details` / `content` is the plugin's
responsibility to redact (R1.1–R1.10). The envelope helpers do not
log, mirror, or persist their arguments.

## Out of scope

- Envelope **versioning policy** (semver bumps, deprecation windows)
  is `f00194`.
- Envelopes do not change the MCP transport — they are values that
  live *inside* MCP results.
- No telemetry; no sink (R1.9).