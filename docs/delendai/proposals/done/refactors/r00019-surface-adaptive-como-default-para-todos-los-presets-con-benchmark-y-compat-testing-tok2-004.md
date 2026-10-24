---
id: r00019
title: "surface — `adaptive` como default para todos los presets (con benchmark y compat testing) (TOK2-004)"
kind: refactor
status: done
type: proposal
track: surface
date: 2026-08-25
priority: P2
classification: REVISAR / DECISIÓN DE PRODUCTO
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§9 TOK2-004 + §10 SURF2-001/002/003"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - i00005 # token gate
    - r00018 # proposals schema diet
    - f00176 # surface mode by capability (hermano)
    - r00021 # notifications/list_changed + bootstrap (hermano)
shipped-in:
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# r00019 — adaptive surface como default

## Goal

Hoy `surfaceMode` puede ser `native`, `adaptive` o `compact`, pero el default es `native`. Esto significa:

- La principal solución de contexto está implementada (existe `adaptive`).
- Pero no es la experiencia normal del usuario.

Resultado: swarm real = 229,740 B con `native`, vs ~50–80 KB con `adaptive` activado.

Reglas violadas: R4.1, §9 TOK2-004.


```ts
// mcp-vertex.config.json (default)
{
  "surfaceMode": "native"
}
```

El usuario que no especifica nada recibe la superficie nativa completa.


`REVISAR / DECISIÓN DE PRODUCTO` — el cambio tiene impacto en compatibilidad con clientes MCP. Necesita benchmark antes de aplicar.

## Why

- Si `adaptive` es default, los usuarios consumen menos tokens por defecto.
- Compatibilidad: clientes que cachean `tools/list` agresivamente pueden necesitar actualización del cache.
- UX: `listChanged` notification se vuelve parte del flujo normal.


Cero.


- **Actual**: swarm 229,740 B (native).
- **Target con adaptive default**: swarm bootstrap ~30–50 KB; tools adicionales activadas on-demand.
- **Estimación**: ~5–10x reducción en context inicial.

## Non-goals

**Permitido**:

- `mcp-vertex.config.json` schema (cambiar default).
- `packages/core/src/lib/surface/default-mode.ts` (lógica de decisión).
- `docs/mcp-vertex/configuration/surface-mode.md` (explicación).
- Tests de compatibilidad con clientes MCP reales.
- Benchmark suite.

**No permitido**:

- Cambios en el runtime adaptive surface (ya implementado).
- Cambios en plugins (cada uno decide su visibility vía manifest).


- Schema diet (`r00018`).
- Token gate (`i00005`).
- Surface mode by capability (`f00176`).

## Architecture

### 1. Benchmark obligatorio antes del cambio

```ts
// tools/scripts/bench/surface-mode-compare.bench.script.ts
import { measureBootstrapLatency } from '@mcp-vertex/core/metrics';
import { measureToolsListLatency } from '@mcp-vertex/core/metrics';
import { countToolsListChangedNotifications } from '@mcp-vertex/core/metrics';

const clients = [
  { name: 'claude-code', mcpVersion: '2025-06-18' },
  { name: 'vscode-copilot', mcpVersion: '2025-06-18' },
  { name: 'cursor', mcpVersion: '2024-11-05' },
  { name: 'codex-cli', mcpVersion: '2025-06-18' },
  { name: 'continue', mcpVersion: '2024-11-05' },
];

const surfaceModes = ['native', 'adaptive', 'compact'] as const;

const results: any[] = [];

for (const client of clients) {
  for (const mode of surfaceModes) {
    const measurement = await runBenchmark({
      client,
      surfaceMode: mode,
      task: 'cold-start + 10 tool calls',
    });
    results.push({ client: client.name, mode, ...measurement });
  }
}

// Output: tabla con cold-context, activation-latency, listChanged-count, etc.
```

Métricas a capturar:

| Métrica                              | native | adaptive | compact |
|--------------------------------------|--------|----------|---------|
| Cold context (bytes)                 | X      | Y        | Z       |
| Activation latency (ms, P95)         | X      | Y        | Z       |
| listChanged notifications (count)    | 0      | Y        | 0       |
| Tool discoverability (success rate)  | X%     | Y%       | Z%      |
| Failure rate (first 100 ops)         | X%     | Y%       | Z%      |

### 2. Compat testing

Para cada cliente MCP real:

1. Conectar con `native` (control).
2. Conectar con `adaptive`.
3. Verificar:
   - `listTools` inicial OK.
   - `listChanged` notification recibida cuando aplica.
   - Cache se actualiza correctamente.
   - Tools no presentes inicialmente activan on-demand sin error.

Resultado: matriz de compatibilidad.

### 3. Decision matrix

```yaml
# docs/mcp-vertex/configuration/surface-mode-decision.yaml (output del benchmark)
decision: |
  Basado en el benchmark de fecha <X>:
  - <cliente 1>: compatible con adaptive
  - <cliente 2>: compatible con adaptive (con cache invalidation)
  - <cliente 3>: NO compatible con adaptive (requiere native)
  
  Default propuesto:
    minimal  → adaptive
    lean     → adaptive
    standard → adaptive
    swarm    → adaptive
    full     → adaptive
    vertex   → adaptive
  
  Fallback automático:
    Si el cliente declara capabilities que indican cache agresivo
    sin listChanged support → degradar a native o compact.
```

### 4. Implementación del default

```ts
// packages/core/src/lib/surface/default-mode.ts
export interface ISurfaceModeDecision {
  mode: 'native' | 'adaptive' | 'compact';
  reason: string;
}

export function decideDefaultSurfaceMode(
  preset: string,
  clientCapabilities?: IClientCapabilities,
): ISurfaceModeDecision {
  // Compat override (basado en benchmark).
  if (clientCapabilities?.noListChangedSupport) {
    return {
      mode: 'native',
      reason: 'Client does not support notifications/tools/list_changed.',
    };
  }

  // Default para todos los presets: adaptive.
  return {
    mode: 'adaptive',
    reason: `Adaptive surface is the default since 2026-08-25. Reduces cold context ~5-10x.`,
  };
}
```

### 5. Override explícito

```json
// mcp-vertex.config.json
{
  "surfaceMode": "native"  // ← override explícito (legacy compat)
}
```

Si el usuario quiere native, lo declara. Adaptive deja de ser opt-in.

### 6. Comunicación a clientes

```ts
// Cuando se conecta con adaptive, el server envía:
// - bootstrap tools (orientation, discovery, activation, status, routing)
// - en background: activa más tools según uso
// - notifications/tools/list_changed cuando aplique
```

## Slices

- global_gate: type

### S1 — Benchmark + compat matrix

- **Status**: done
- **Files**: `tools/scripts/bench/surface-mode-compare.bench.script.ts`, `docs/mcp-vertex/configuration/surface-mode-decision.yaml`
- **Gate**: type
- acceptance:
  - "Benchmark ejecutado."
  - "Matriz de compat publicada."

### S2 — Default decision logic

- **Status**: done
- **Files**: `packages/core/src/lib/surface/decide-mode.ts`
- **Gate**: type
- acceptance:
  - "Función decideDefaultSurfaceMode implementada."
  - "Override explícito respetado."

### S3 — Cambio de default + override

- **Status**: done
- **Files**: `mcp-vertex.config.json` schema, `docs/mcp-vertex/configuration/surface-mode.md`
- **Gate**: type
- acceptance:
  - "Default = `adaptive` para todos los presets."
  - "Override `native` documentado."
  - "Fallback automático documentado."

## Acceptance

- **Unit**: `decideDefaultSurfaceMode` con varios clientCapabilities.
- **Benchmark**: `surface-mode-compare.bench.script.ts` con ≥3 clientes.
- **E2E**: tests de compat por cliente.
- **Regression**: swarm bootstrap bytes <= 50 KB con adaptive default.


- [ ] Benchmark ejecutado con ≥3 clientes MCP reales.
- [ ] Matriz de compatibilidad publicada.
- [ ] Decision documentada (`docs/mcp-vertex/configuration/surface-mode-decision.yaml`).
- [ ] Default cambiado a `adaptive` para todos los presets (excepto override explícito).
- [ ] Fallback automático a `native` o `compact` para clientes sin `listChanged` support.
- [ ] Bootstrap surface mínimo medido (orient + discover + activate + status + routing).
- [ ] Token gate verde con adaptive default.
- [ ] Documentación: `docs/mcp-vertex/configuration/surface-mode.md` explica la decisión, override, fallback.


- Benchmark ejecutado y documentado.
- Default cambiado a `adaptive`.
- Compat matrix publicada.
- Token gate verde.

---

## Notes

- **Token gate CI** (`i00005`) verde.
- **Benchmark regression**: si un nuevo cliente MCP pierde compat, alerta.
- **Override explícito**: si el usuario quiere native, sigue funcionando.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - benchmark-output: docs/mcp-vertex/configuration/surface-mode-decision.yaml
    - clients-tested: ≥3
    - before/after-bytes:
        before-bootstrap: "229,740 B (native, swarm)"
        after-bootstrap:  "<50,000 B (adaptive, swarm)"
    - compatibility-matrix: published
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track C + H.
- **Auditoría legada**: §9 TOK2-004, §10 SURF2-001/002/003.
- **Hermanas**: `r00021` (listChanged + bootstrap), `f00176` (surface mode by capability).
- **Principio §41**: *"Load only capabilities useful for the current task."* Esta propuesta lo aplica como default.
