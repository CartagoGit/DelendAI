---
id: t00020
title: "AUD-CP-003 — Plugin lifecycle: reload/dispose no duplica listeners"
kind: test
status: in-progress
type: proposal
track: commit-policy
date: 2026-08-25
priority: P1
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / t00020"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-003
related:
    - q00006
    - x00261 # dispose que se prueba
    - f00182 # timers del engine bajo dispose
last-transition-id: 1f989f5e-7f5a-445b-b0b5-865ca756a0cc
last-correlation-id: 1f989f5e-7f5a-445b-b0b5-865ca756a0cc
last-transition-from: ready
---

# t00020 — Plugin lifecycle: reload/dispose no duplica listeners

## Goal

Verificar que el plugin `commit-policy` cumple su contrato de
lifecycle:

1. `register()` deja **exactamente 1** listener slice activo y
   **exactamente 1** timer (si está activo el interval/scheduler).
2. `register()` llamado N veces seguidas deja exactamente 1
   listener tras cada `dispose()` intermedia.
3. `dispose()` deja 0 listeners activos.
4. Si `register()` falla a mitad, `dispose()` igual puede
   invocarse y limpia los recursos iniciados.
5. Errores durante dispose no dejan timers zombies ni rompen el
   best-effort cleanup.

Pieza de aceptación para `x00261`.

## Why

- AUD-CP-003 detectado en la auditoría: el plugin expone
  lifecycle-clean en su `KnowledgeType` pero la implementación
  no para listeners/timers al reload, dejando zombies en cada
  carga.
- `x00266` introduce scheduler de push; sin esta cobertura,
  cualquier reload duplica pushes y rompe idempotencia.
- Sin reloads deterministas, los tests E2E (cross-agent) son
  flaky.

## Non-goals

- No testear concurrencia cross-agent (eso es `t00018`).
- No testear integración con orchestrator; solo unit del plugin.
- No introducir timers mockeados (usar `vi.useFakeTimers()` de
  vitest, ya disponible).

## Architecture

### 1. Ubicación

`plugins/commit-policy/tests/src/index.spec.ts`

### 2. Detección de listeners

Helper que introspecta:

```ts
function countSliceListeners(pluginCtx: any): number {
  // expone contadores desde el engine si los tiene, o
  // mock listener.start con counter incrementable
  return pluginCtx.__sliceListenerCount ?? 0;
}
```

Alternativa: instrumentar el `SliceListenerOptions.onError` y
los handlers para que cuenten invocaciones; un reload debería
no acumular invocaciones.

### 3. Tabla de casos

| Caso | Esperado |
| --- | --- |
| `register()` × 1 | 1 listener slice, 0 timers de push |
| `register()` × N + dispose() entre medias | tras N ciclos, 1 listener activo |
| `register()` + `dispose()` | 0 listeners activos, 0 timers |
| `register()` falla a mitad (mock de startSliceListener throws) | `dispose()` se puede llamar y limpia lo iniciado |
| `dispose()` parcial (un timer falla) | resto se limpia, sin panic |
| Reload en same `ctx` (simulate agent_worktree) | cero duplicados tras reload |

### 4. Casos concretos

```ts
it('register leaves 1 slice listener', () => {
  const { plugin } = registerCommitPolicy({ ctx });
  expect(countSliceListeners(plugin)).toBe(1);
});

it('reload N times then dispose leaves 0 active listeners', async () => {
  for (let i = 0; i < 5; i++) {
    const { plugin } = registerCommitPolicy({ ctx });
    expect(countSliceListeners(plugin)).toBe(1);
    await plugin.dispose();
    expect(countActiveListeners()).toBe(0);
  }
});

it('dispose after failed register still cleans up', async () => {
  vi.spyOn(sliceListener, 'start').mockImplementationOnce(() => {
    throw new Error('boom');
  });
  expect(() => registerCommitPolicy({ ctx })).toThrow('boom');
  // dispose ya no es necesario porque register lanzó; pero si quedó
  // un timer accidental, debe estar cerrado:
  expect(countActiveTimers()).toBe(0);
});
```

### 5. Falsos timers (vitest)

`vi.useFakeTimers()` para verificar que `setInterval` se llama
una sola vez y que `clearInterval` se llama al `dispose`.

```ts
it('scheduler attaches at register and detaches at dispose', () => {
  vi.useFakeTimers();
  const { plugin } = registerCommitPolicy({ ctx, pushPolicy: { everyNMinutes: 5 } });
  expect(vi.getTimerCount()).toBe(1);
  plugin.dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});
```

### 6. Acceptance

```bash
bunx vitest run plugins/commit-policy/tests/src/index.spec.ts
# → 6 casos verdes
```

## Slices

- global_gate: lint

### S1 — Lifecycle: reload N, dispose mid-register, dispose best-effort

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/src/index.spec.ts`
- **Gate**: type
- **Dependency**: `x00261`, `f00182`
- acceptance:
  - "register × N → 1 listener tras dispose"
  - "register + dispose → 0 timers, 0 listeners"
  - "register falla + dispose → cleanup best-effort sin panic"
  - "scheduler se attach en register y detach en dispose"

## acceptance

- `bunx vitest run` del archivo verde.
- Tests deterministas (no flaky): uso de `vi.useFakeTimers()` y
  contadores explícitos.
- `bun run lint` verde; `tsc --noEmit` verde.
