---
id: x00240
title: "memory — disposer cierra `fs.watch` + debounce timer; lifecycle correcto (MEM2-002)"
kind: fix
status: done
type: proposal
track: quality
date: 2026-08-25
priority: P3
classification: REVISAR / MEJORA
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§18 MEM2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00158 # error-reporting (referencia de lifecycle)
shipped-in:
  - 9a2ff04b # fix: dispose memory watcher resources
---

# x00240 — memory: disposer cierra watcher + debounce timer

## Goal

`fs.watch()` se crea durante `register()` del plugin memory. Hoy:

- Si existe disposer, no se ha verificado que cierre correctamente el watcher.
- El debounce timer (250 ms) puede quedar colgado.
- El proceso puede no terminar limpio (event loop queda con handles activos).

Reglas violadas: §18 MEM2-002.


```ts
// plugins/memory/src/index.ts (aprox)
async register(ctx: IPluginContext): Promise<IDisposable> {
  const watcher = fs.watch(memoryStorePath, () => {
    debouncedRefresh();
  });

  return {
    async dispose() {
      // ¿watcher.close()? ¿debounce timer cancel?
    },
  };
}
```

Test que falla en HEAD:

```ts
test('memory dispose closes watcher + clears debounce', async () => {
  const plugin = await loadMemoryPlugin();
  const watcherCount = countActiveWatchers();
  await plugin.dispose();
  // Pequeño yield para que el event loop procese.
  await new Promise((r) => setImmediate(r));
  expect(countActiveWatchers()).toBe(watcherCount - 1);
});
```


`REVISAR / MEJORA`.

## Why

- Proceso termina limpio (no queda colgado).
- Tests que cargan + descargan el plugin no acumulan handles.
- Lifecycle determinista.


Cero.


Cero.

## Non-goals

**Permitido**:

- `plugins/memory/src/index.ts` (disposer).
- `plugins/memory/src/lib/services/watcher.service.ts` (si existe; refactor).
- Tests.

**No permitido**:

- Cambios en la lógica de memory.
- Cambios en otros plugins.


- Memory freshness (ya event-driven, no reabrir).
- BM25/recall/TTL/compaction (cubierto por otras proposals).

## Architecture

### 1. Disposer correcto

```ts
// plugins/memory/src/index.ts (refactor)
export async function register(ctx: IPluginContext): Promise<IDisposable> {
  const watcherService = createWatcherService({
    path: ctx.options.memoryStorePath,
    onChange: () => debouncedRefresh(),
    debounceMs: 250,
  });

  await watcherService.start();

  return {
    async dispose() {
      await watcherService.stop();
      // ↓ Esto cierra el fs.watch y cancela el debounce timer pendiente.
    },
  };
}
```

### 2. WatcherService

```ts
// plugins/memory/src/lib/services/watcher.service.ts
import * as fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';

export interface IWatcherService {
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
}

export function createWatcherService(opts: {
  path: string;
  onChange: () => void;
  debounceMs: number;
}): IWatcherService {
  let watcher: fs.FileWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let active = false;

  const debouncedOnChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      opts.onChange();
    }, opts.debounceMs);
  };

  return {
    async start() {
      if (active) return;
      watcher = fs.watch(opts.path, debouncedOnChange);
      active = true;
    },

    async stop() {
      if (!active) return;
      active = false;

      // Cancel debounce timer.
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      // Close watcher.
      if (watcher) {
        await watcher.close();
        watcher = null;
      }
    },

    isActive() {
      return active;
    },
  };
}
```

### 3. Tests

```ts
// plugins/memory/tests/src/index.spec.ts
describe('memory plugin lifecycle', () => {
  it('dispose closes watcher and clears debounce timer', async () => {
    const initialHandles = process.getActiveResourcesInfo().length;
    const plugin = await loadMemoryPlugin({ workspaceRoot: '/tmp/test' });
    await plugin.dispose();

    // Yield para que el event loop procese.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const finalHandles = process.getActiveResourcesInfo().length;
    expect(finalHandles).toBeLessThanOrEqual(initialHandles);
  });

  it('double dispose is idempotent', async () => {
    const plugin = await loadMemoryPlugin({ workspaceRoot: '/tmp/test' });
    await plugin.dispose();
    await plugin.dispose();  // no debe lanzar
  });

  it('dispose during debounce window cancels refresh', async () => {
    const refreshCount = { value: 0 };
    const plugin = await loadMemoryPlugin({
      workspaceRoot: '/tmp/test',
      onRefresh: () => refreshCount.value++,
    });

    // Trigger change (debera schedule refresh).
    await fs.writeFile('/tmp/test/memory.json', '{}');

    // Dispose before debounce fires.
    await new Promise((r) => setTimeout(r, 100));  // < 250ms debounce
    await plugin.dispose();

    // Wait for what would have been the debounce window.
    await new Promise((r) => setTimeout(r, 300));

    expect(refreshCount.value).toBe(0);  // debounce was cancelled
  });
});
```

### 4. Lifecycle E2E test

```ts
// plugins/memory/tests/src/e2e/lifecycle.spec.ts
describe('memory lifecycle E2E', () => {
  it('load → use → dispose → reload cycle is clean', async () => {
    for (let i = 0; i < 5; i++) {
      const plugin = await loadMemoryPlugin({ workspaceRoot: '/tmp/test' });
      await plugin.use();
      await plugin.dispose();
    }

    // Después de 5 ciclos, no quedan handles colgados.
    const handles = process.getActiveResourcesInfo();
    expect(handles.length).toBeLessThan(10);  // baseline
  });
});
```

## Slices

- global_gate: type

### S1 — WatcherService + dispose

- **Status**: done
- **Files**: `plugins/memory/src/lib/services/store-watcher.ts`, `plugins/memory/src/index.ts`
- **Gate**: type
- acceptance:
  - "WatcherService implementa start/stop/idempotente."
  - "Dispose cierra watcher y cancela debounce."

### S2 — Tests de lifecycle

- **Status**: done
- **Files**: `plugins/memory/tests/src/lib/store-watcher.spec.ts`, `plugins/memory/tests/src/lib/memory.spec.ts`
- **Gate**: type
- acceptance:
  - "Tests verdes."
  - "E2E lifecycle verde."

## Acceptance

- **Unit**: dispose cierra watcher.
- **Unit**: dispose cancela debounce timer.
- **Unit**: dispose idempotente.
- **E2E**: 5 ciclos load → dispose no acumulan handles.


- [ ] `dispose()` cierra el `fs.watch` watcher.
- [ ] `dispose()` cancela el debounce timer pendiente.
- [ ] Double dispose es idempotente.
- [ ] Después de dispose, no quedan handles activos (verificable con `process.getActiveResourcesInfo()`).
- [ ] E2E: 5 ciclos load → dispose sin acumulación.
- [ ] Documentación: `docs/mcp-vertex/plugins/memory.md` menciona el lifecycle.
- [ ] `bun run validate` verde.


- Dispose cierra watcher + cancela debounce.
- Idempotente.
- E2E verde.

---

## Notes

- **Lifecycle test E2E** verde en CI.
- **Property test**: dispose N veces == dispose 1 vez (idempotencia).


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - files-modified:
        - plugins/memory/src/index.ts
        - plugins/memory/src/lib/services/watcher.service.ts (nuevo)
        - plugins/memory/tests/** (tests de lifecycle)
    - before/after:
        before: "Dispose no cierra watcher; handles pueden quedar activos"
        after:  "Dispose cierra watcher + cancela debounce; lifecycle determinista"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track F.
- **Auditoría legada**: §18 MEM2-002.
- **Hermana**: `x00239` (utf-8).
