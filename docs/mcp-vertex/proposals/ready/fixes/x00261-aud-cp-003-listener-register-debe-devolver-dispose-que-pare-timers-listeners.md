---
id: x00261
title: "AUD-CP-003 — Listener: `register()` debe devolver `dispose()` que pare timers/listeners"
kind: fix
status: ready
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
shipped-in: ["e17eac671"] # fix(commit-policy): x00261 — register returns dispose() for clean teardown
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / x00261"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-003
related:
    - q00006
    - t00020 # reload/dispose N veces deja 1 listener
    - x00266 # scheduler requiere lifecycle-clean
    - f00182 # engine (posee timers internos, debe soportar stop)
---

# x00261 — AUD-CP-003: `register()` debe devolver `dispose()` con `stop()` para listeners y timers

## Goal

`register()` en `plugins/commit-policy/src/index.ts` debe devolver un
objeto con un método `dispose()` que **pare todos los timers y
listeners** que el plugin haya registrado durante su vida:
- `slice-listener.stop()`
- `interval-timer.stop()` (si existe desde `x00266` o futuro)
- `commit-driver` no tiene timers, pero sí handles `git` que deben
  cerrarse si los posee.
- Cualquier `setInterval`/`setTimeout` del propio `index.ts`.

### Comportamiento actual (BUG)

```ts
const plugin = register(ctx);
// reload N veces → N listeners encadenados → N eventos duplicados
// dispose no existe → unload deja timers vivos
```

### Comportamiento deseado

```ts
const plugin = register(ctx);
// plugin.tools, plugin.knowledge
plugin.dispose();
//   ↳ sliceListener.stop()
//   ↳ intervalTimer?.stop()
//   ↳ release file mutexes y watchers
//   ↳ next reload deja exactamente 0 timers/listeners activos
```

## Why

- Sin `dispose()`, cada `agent_worktree create && agent_run` deja un
  listener zombie consumiendo eventos del repo activo.
- `x00266` introduce un scheduler de push (`everyNMinutes`); sin
  `dispose()` el scheduler duplica pushes en cada reload.
- Bug "predicado ≠ acción": el código expone `KnowledgeType`
  lifecycle-clean y la auditoría externa no ve un solo `stop()` en
  ningún path.
- `t00020` no puede afirmar "reload N veces deja 1 listener" sin
  esta corrección.

## Non-goals

- No añadir `dispose()` a capabilities que no pertenecen al plugin.
- No introducir sistema de event bus; `dispose` se ata al plugin.
- No rehacer `index.ts` desde cero; añadir el returned object.

## Architecture

### 1. Forma del return

```ts
// plugins/commit-policy/src/index.ts
export interface CommitPolicyPlugin {
  tools: ToolRegistration[];
  knowledge: KnowledgeRegistration[];
  dispose(): Promise<void>;
}

export function register(ctx: PluginContext): CommitPolicyPlugin {
  const sliceListener = startSliceListener(ctx);
  const intervalTimer = startIntervalTimer(ctx); // solo si se activa

  return {
    tools: [/* … */],
    knowledge: [/* … */],
    async dispose() {
      try { sliceListener.stop(); } catch (e) { onError(e); }
      try { intervalTimer?.stop(); } catch (e) { onError(e); }
      // file mutexes propios: ver x00261.x
    },
  };
}
```

### 2. Reglas del `dispose()`

| Recurso | Acción |
| --- | --- |
| Slice listener | `unwatch()` del fs/notifier + drain queue |
| Interval timer | `clearInterval` + libera handle |
| Push scheduler | `clearTimeout` recursivo |
| Mutex propio | `withFileMutex` libera al cerrar handle |
| File watchers | `.close()` sí o sí |

`dispose` es **idempotente** (segunda llamada no falla) y
**asincrónico** (await-able). Si una operación falla, se loguea y
continúa con el resto (best-effort cleanup).

### 3. Manejo de errores durante register

Si `startSliceListener()` falla a mitad, `dispose` igual debe
poder invocarse sobre los recursos que sí se crearon. Helper
interno `trackResource(disposer)` que se registra en una pila y
`dispose()` los ejecuta en orden inverso.

## Slices

- global_gate: lint

### S1 — `register()` devuelve `{ tools, knowledge, dispose }` y `dispose` para todos los handles

- **Status**: done
- **Files**: `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/tests/src/index.spec.ts`
- **Gate**: type
- **Dependency**: —
- acceptance:
  - "register() devuelve un objeto con `dispose()`"
  - "dispose() llama a sliceListener.stop(), intervalTimer.stop() si existe"
  - "dispose() es idempotente (segunda llamada no falla)"
  - "t00020 verde: reload N veces deja exactamente 1 listener; dispose deja 0"
- review-state: done
- review-implementer: GitHub
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — PASS independiente: register devuelve dispose idempotente, detiene sliceListener e intervalTimer y las pruebas de reload no dejan handles activos.
## acceptance

- `dispose()` invocable tras cualquier estado de `register()`
  (incluso si falló a mitad).
- Cero timers/listeners residuales tras `dispose()`.
- `t00020` pasa.
- `bun run lint` verde; `tsc --noEmit` verde.
- No introduce dependencias nuevas.
