# Invariants — external MCP

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariant: every process has an owner

**Current state**: TRUE — fixed by `x00291`
(`external-mcps` `register()` now returns a `dispose` that closes
every subprocess it spawned). **Was FALSE in the audit** (`AUD-D05`):
a subprocess spawned by `external-mcps` could outlive the `dispose()`
of the plugin that created it, becoming orphaned.

**Test that guards it**:
`plugins/external-mcps/tests/src/lib/dispose.spec.ts`.

## Invariant: every owner has a teardown

**Current state**: TRUE — fixed by `r00039`
(`McpHostSession.dispose`, idempotent teardown in reverse order of
registration). **Was FALSE in the audit** (`AUD-E02`): there were
owners (sessions, lazy runtimes) without a guaranteed teardown path,
or with a path that was not idempotent under a second call.

**Test that guards it**:
`packages/core/tests/src/lib/project/create-mcp-project-dispose.spec.ts`
and `packages/core/tests/src/lib/plugins/managed-lazy-runtime.spec.ts`.

## Invariant: every execution has a timeout

**Current state**: TRUE.

**Test that guards it**:
`plugins/external-mcps/tests/src/lib/discover-gate.spec.ts` and
`plugins/external-mcps/tests/src/lib/server-registry.spec.ts`.

## Invariant: model autonomy is actually enforced

**Current state**: TRUE — fixed by `x00290`
(`llmDecidesActivation` moves to the real activation policy) and
`x00289` (`eager` becomes expressible in `ServerEntrySchema`).
**Was FALSE in the audit** (`AUD-D04`): the option that declared
"the model decides when to activate this server" was not connected
to any real activation policy.

**Test that guards it**:
`plugins/external-mcps/tests/src/lib/plugin-composition.spec.ts` and
`plugins/external-mcps/tests/src/lib/configuration-metadata.spec.ts`.
