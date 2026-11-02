---
id: f00193
title: "External MCPs como plano de control"
kind: feat
status: done
type: proposal
track: external-mcps
date: 2026-08-25
priority: P2
parent-plan: q00006
shipped-in:
  - 6c17c080
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track K / f00193"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00194 # capability versioning (consume la registry)
    - f00195 # cost-aware routing (consume la registry)
---

# f00193 — External MCPs como plano de control

## Goal

Hacer que el cliente `@mcp-vertex/client` soporte **múltiples
proveedores MCP externos** y que Vertex decida, según coste /
latencia / calidad, qué proveedor usar para cada capacidad. El
usuario declara los proveedores disponibles; el cliente enruta.

### Comportamiento actual

- `@mcp-vertex/client` consume un solo servidor MCP (configurado en
  `mcp-vertex.config.json`).
- No hay abstracción de "proveedor".
- La auditoría externa (§39) lo marca como gap: el host no puede
  aprovechar la competencia entre proveedores externos para mejorar
  coste / latencia.

### Comportamiento deseado

- `packages/client/src/services/external-mcp/**`:
  - Registry de proveedores:
    ```ts
    interface ExternalMcpProvider {
      id: string;            // 'openai-mcp', 'anthropic-mcp', etc.
      transport: 'stdio' | 'http';
      capabilities: Capability[]; // declarado, no inferido
      healthCheck: () => Promise<{ ok: boolean; latencyMs: number }>;
      cost: { tokensPer1k: number; usdPer1k?: number };
    }
    ```
  - Configuración: `mcp-vertex.config.json` admite
    `externalMcps: [...]`.
  - Router:
    - Cuando una tool se solicita, elige proveedor según:
      - capability match (R5.1).
      - coste declarado (R4.x).
      - health (online, latency).
      - preferencias del usuario.
    - Failover automático si un proveedor cae.
- Privacidad: tool names externos no se loggean en claro (R1.1).

## why

- Cierra §39 de la auditoría.
- Habilita que el usuario aproveche competencia de proveedores.
- Es la base para `f00195` (cost-aware routing) y `f00194`
  (capability versioning).
- Da redundancia ante caídas de un proveedor.

## non-goals

- No implementa un protocolo de migración de capacidad entre
  proveedores en caliente (eso es `f00194`).
- No cambia el host; solo el cliente.
- No negocia capacidades dinámicamente: las capacidades se
  declaran en config.

## architecture

### 1. Registry

- `packages/client/src/services/external-mcp/registry.ts`:
  - Carga desde config.
  - Lazy connect: el proveedor se inicializa solo cuando se va a
    usar.
- `health-check` corre cada N minutos en background; persiste el
  último estado.

### 2. Router

- `packages/client/src/services/external-mcp/router.ts`:
  - Dado `toolName` + `args` + `context`, devuelve el proveedor
    seleccionado.
- Logging estructurado: `provider.selected`, `provider.failed`,
  `provider.health.degraded`.

### 3. Privacidad

- Logs redactan tool names externos a un identificador opaco
  (`ext-mcp-1`, `ext-mcp-2`).
- Las capabilities se almacenan por id, no por nombre del
  proveedor.

### 4. Tests

- `packages/client/tests/src/services/external-mcp/router.spec.ts`:
  - Selección por capability match.
  - Failover si un proveedor cae.
  - Redacción de tool names.
  - Health check que marca degraded.

## Slices

### S1 — Registry + router + tests básicos

- **Status**: done
- **Files**: `packages/client/src/services/external-mcp/{registry,router,health}.ts`, `packages/client/tests/services/external-mcp/{router,registry,health}.spec.ts`, `packages/client/src/node/services/plugin-activation.service.ts`
- **Gate**: type
- review-state: done
- review-implementer: implementation_runner
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente: las suites external-mcp de router, registry y health pasan 38/38; el typecheck del cliente/workspace pasa. Registry lazy, selección por capability/coste/salud, failover y redacción están cubiertos por la implementación y tests canónicos.
## acceptance

- Registry carga múltiples proveedores.
- Router selecciona según capability + health + coste.
- Failover funciona.
- Redacción de tool names externos aplicada.
- Tests verdes.
