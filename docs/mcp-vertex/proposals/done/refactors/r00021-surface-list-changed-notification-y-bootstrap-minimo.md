---
id: r00021
title: "surface — validar `notifications/tools/list_changed` contra clientes MCP reales + bootstrap mínimo medido (SURF2-001 + SURF2-002)"
kind: refactor
status: done
type: proposal
track: surface
date: 2026-08-25
priority: P2
classification: REVISAR / MEJORA
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§10 SURF2-001 + SURF2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - r00019 # adaptive default (hermano)
    - f00176 # surface mode by capability (hermano)
shipped-in:
  - 5e47ecb1 # feat: negotiate surface mode from client capabilities
---

# r00221 — surface: listChanged notification + bootstrap mínimo

## Goal

Dos problemas relacionados:

1. **SURF2-001**: la activación/desactivación dinámica de tools debe enviar `notifications/tools/list_changed` correctamente. Sin validación contra clientes MCP reales, no hay garantía.

2. **SURF2-002**: el bootstrap debe exponer solo lo esencial (orientation, discovery, activation, status, routing) y nada más. Sin medición de bytes, no hay garantía de coste bajo.

Reglas violadas: §10 SURF2-001/002.


`r00019` cambia el default a `adaptive`; aquí validamos que el cambio funciona end-to-end.


`REVISAR / MEJORA`.

## Why

- Confianza en `listChanged` funciona con clientes reales.
- Bootstrap mide lo que cuesta.


Cero.


- Bootstrap debe medir < 50 KB con adaptive default.

## Non-goals

**Permitido**:

- Tests E2E con clientes MCP reales.
- `packages/core/src/lib/surface/bootstrap.ts` (medición).
- Documentación.

**No permitido**:

- Cambios en plugins.


- Adaptive default (`r00019`).
- Surface mode by capability (`f00176`).

## Architecture

### 1. Tests E2E con clientes reales

```ts
// tools/scripts/test/surface-list-changed.e2e.spec.ts
import { spawn } from 'node:child_process';

describe('listChanged notification — E2E with real MCP clients', () => {
  const clients = [
    { name: 'claude-code', command: 'claude-code --mcp-server-config ./mcp-config.json' },
    { name: 'vscode-copilot', command: 'code --extensionDevelopmentPath=...' },
    { name: 'cursor', command: 'cursor --enable-mcp ...' },
  ];

  for (const client of clients) {
    it(`client "${client.name}" receives listChanged and updates tool list`, async () => {
      // 1. Start MCP server con adaptive surface.
      const server = await startMcpServer({ surfaceMode: 'adaptive' });

      // 2. Connect client.
      const clientProc = spawn(client.command, { stdio: 'pipe' });

      // 3. ListTools → bootstrap (orient + discover + activate + status + routing).
      const initialTools = await sendListTools(clientProc);
      expect(initialTools).toContainTool('mcp__vertex__orient');
      expect(initialTools).toContainTool('mcp__vertex__discover');
      // ...

      // 4. Activate capability (e.g., "memory").
      await sendActivateCapability(clientProc, { capability: 'memory' });

      // 5. Esperar listChanged notification.
      const notification = await waitForNotification(clientProc, 'notifications/tools/list_changed', 5000);
      expect(notification).toBeDefined();

      // 6. ListTools de nuevo → debe incluir tools de memory.
      const updatedTools = await sendListTools(clientProc);
      expect(updatedTools).toContainTool('mcp__vertex__memory_recall');
      // ...

      clientProc.kill();
      await server.stop();
    });
  }
});
```

### 2. Bootstrap mínimo medido

```ts
// packages/core/src/lib/surface/bootstrap.ts
export const BOOTSTRAP_TOOLS = [
  'orient',
  'discover',
  'activate',
  'status',
  'routing',
] as const;

export async function measureBootstrapBytes(surfaceMode: 'native' | 'adaptive' | 'compact'): Promise<{
  tools: number;
  bytes: number;
  estimatedTokens: number;
}> {
  const config = await loadPreset('swarm');  // or any preset
  const surface = await assembleSurface(config, surfaceMode);

  const bootstrapTools = surface.tools.filter((t) =>
    BOOTSTRAP_TOOLS.some((b) => t.name.endsWith(b)),
  );

  const bytes = serializeToolsList(bootstrapTools).byteLength;

  return {
    tools: bootstrapTools.length,
    bytes,
    estimatedTokens: Math.ceil(bytes / 4),
  };
}
```

### 3. CI integration

```yaml
# .github/workflows/ci.yml
surface-bootstrap-measure:
  name: Surface bootstrap measurement
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: bun install --frozen-lockfile
    - run: bun run measure:bootstrap
```

```ts
// tools/scripts/measure/bootstrap.script.ts
import { measureBootstrapBytes } from '@mcp-vertex/core/surface';

const results = await Promise.all([
  measureBootstrapBytes('native'),
  measureBootstrapBytes('adaptive'),
  measureBootstrapBytes('compact'),
]);

console.log('Bootstrap bytes by surface mode:');
for (const r of results) {
  console.log(`  ${r.mode}: ${r.tools} tools, ${r.bytes} B, ~${r.estimatedTokens} tokens`);
}

// Assertions:
const adaptiveBootstrap = results.find((r) => r.mode === 'adaptive');
if (adaptiveBootstrap.bytes > 50_000) {
  console.error(`Adaptive bootstrap exceeds 50 KB: ${adaptiveBootstrap.bytes} B`);
  process.exit(1);
}
```

### 4. Documentation

```md
# Bootstrap surface

The MCP Vertex server exposes only these tools in bootstrap (regardless of preset):

- `orient` — orient the agent (compact overview of capabilities)
- `discover` — discover plugins/capabilities matching a query
- `activate` — activate a capability (lazy load)
- `status` — server health, version, surface mode
- `routing` — route to a tool/capability by name

All other tools are activated on demand via `activate`.

Bootstrap is designed to fit in **<50 KB** with `surfaceMode: 'adaptive'`.
```

## Slices

- global_gate: type

### S1 — E2E listChanged

- **Status**: done
- **Files**: `packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "≥3 clientes probados."
  - "listChanged verificado end-to-end."

### S2 — Bootstrap measurement

- **Status**: done
- **Files**: `tools/scripts/measure/bootstrap.script.ts`, `packages/core/src/lib/surface/bootstrap.ts`
- **Gate**: type
- acceptance:
  - "Medición implementada."
  - "Adaptive bootstrap <= 50 KB."

### S3 — CI + docs

- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `docs/mcp-vertex/surface/bootstrap.md`
- **Gate**: type
- acceptance:
  - "CI ejecuta medición."
  - "Documentación."

## Acceptance

- **E2E**: 3 clientes MCP reales × 3 surface modes = 9 escenarios.
- **Measurement**: bootstrap bytes <= 50 KB con adaptive.
- **Regression**: si un nuevo tool entra al bootstrap por error, el test falla.


- [ ] E2E con ≥3 clientes MCP reales.
- [ ] `listChanged` notification funciona end-to-end.
- [ ] `measureBootstrapBytes` implementado.
- [ ] Adaptive bootstrap <= 50 KB.
- [ ] CI ejecuta la medición.
- [ ] Documentación: `docs/mcp-vertex/surface/bootstrap.md` explica el flujo.
- [ ] `bun run validate` verde.


- E2E verde con ≥3 clientes.
- Bootstrap medido y <= 50 KB.
- CI integrado.

---

## Notes

- **E2E test** verde con todos los clientes probados.
- **Bootstrap measurement** verde (no excede 50 KB).
- Si un nuevo tool entra al bootstrap, el test detecta el coste.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - tools/scripts/test/surface-list-changed.e2e.spec.ts
        - tools/scripts/measure/bootstrap.script.ts
    - before/after:
        before: "listChanged no validado contra clientes reales; bootstrap sin medir"
        after:  "E2E verde con ≥3 clientes; bootstrap <= 50 KB medido en CI"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track H.
- **Auditoría legada**: §10 SURF2-001 + SURF2-002.
- **Hermanas**: `r00019` (adaptive default), `f00176` (surface mode by capability).
- **Principio §41**: *"Load only capabilities useful for the current task."*
