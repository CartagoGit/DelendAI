---
id: f00176
title: "surface — modo por `clientInfo/capabilities` (adaptive si soporta listChanged, native/compact si no) (SURF2-003)"
kind: feat
status: done
type: proposal
track: surface
date: 2026-08-25
priority: P2
classification: IDEA → PRODUCTO
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§10 SURF2-003"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - r00019 # adaptive default (hermano)
    - r00221 # listChanged + bootstrap (hermano)
shipped-in:
  - 5e47ecb1 # feat: negotiate surface mode from client capabilities
  - 82c54bcc # feat(track-c-e): manifests + token budgets + surface-mode defaults
---

# f00176 — surface: mode by clientInfo/capabilities

## Goal

`r00019` cambia el default a `adaptive`. Pero algunos clientes MCP no soportan `notifications/tools/list_changed`, lo que rompe la experiencia (cache obsoleto).

Solución propuesta (SURF2-003): decidir el surface mode automáticamente según las `capabilities` declaradas por el cliente durante el handshake MCP.

Reglas violadas: §10 SURF2-003.


Hoy, el surface mode es estático (config file). No hay decisión basada en capabilities.


`IDEA → PRODUCTO`.

## Why

- Adaptive funciona con clientes compatibles.
- Native/compact fallback automático para clientes que no soportan `listChanged`.
- No requiere configuración manual.


Cero.


Cero (no añade tools).

## Non-goals

**Permitido**:

- `packages/core/src/lib/surface/client-capabilities.ts` (detección).
- `packages/core/src/lib/surface/decide-mode.ts` (decisión).
- Tests.

**No permitido**:

- Cambiar el handshake MCP.
- Cambiar en plugins.


- Adaptive default (`r00019`).
- ListChanged validation (`r00221`).

## Architecture

### 1. Detección de capabilities

```ts
// packages/core/src/lib/surface/client-capabilities.ts
export interface IClientCapabilities {
  /** Cliente soporta `notifications/tools/list_changed`. */
  listChangedSupport: boolean;
  /** Cliente cachea `tools/list` agresivamente. */
  aggressiveCaching: boolean;
  /** Otras capabilities detectadas. */
  custom?: Record<string, unknown>;
}

export function detectCapabilities(
  clientInfo: { name: string; version: string },
  initializeResponse: unknown,
): IClientCapabilities {
  // Heurística por nombre (último recurso; preferir capabilities explícitas).
  const knownCompatibleClients = new Set([
    'claude-code',
    'vscode-copilot',
    'cursor',
    'codex-cli',
    'continue',
  ]);

  // Si el cliente declara explícitamente `capabilities.listChanged: true`, confiar.
  const declared = (initializeResponse as any)?.capabilities;
  if (declared?.listChanged === true) {
    return { listChangedSupport: true, aggressiveCaching: false };
  }

  // Fallback por nombre.
  if (knownCompatibleClients.has(clientInfo.name)) {
    return { listChangedSupport: true, aggressiveCaching: false };
  }

  // Por defecto, asumir que NO soporta listChanged.
  return { listChangedSupport: false, aggressiveCaching: true };
}
```

### 2. Decisión automática

```ts
// packages/core/src/lib/surface/decide-mode.ts
export function decideSurfaceModeFromCapabilities(
  caps: IClientCapabilities,
  preset: string,
): ISurfaceModeDecision {
  if (caps.listChangedSupport) {
    return {
      mode: 'adaptive',
      reason: `Client supports notifications/tools/list_changed; using adaptive.`,
    };
  }

  if (caps.aggressiveCaching) {
    return {
      mode: 'native',
      reason: `Client does not support listChanged and caches aggressively; using native.`,
    };
  }

  return {
    mode: 'compact',
    reason: `Client has limited capabilities; using compact.`,
  };
}
```

### 3. Override explícito

```json
// mcp-vertex.config.json
{
  "surfaceMode": "adaptive"  // override explícito (toma precedencia)
}
```

Si el usuario quiere adaptive independientemente de las capabilities, lo declara.

### 4. Logging

```ts
// En el startup del server, log:
console.log(`[surface] Client "${clientInfo.name}" v${clientInfo.version}:`);
console.log(`  Capabilities: ${JSON.stringify(caps)}`);
console.log(`  Decision: ${decision.mode} (${decision.reason})`);
```

Esto ayuda a debugging cuando un cliente tiene un comportamiento inesperado.

### 5. Telemetry local (opcional)

Para análisis futuro (sin enviar a ningún lado):

```ts
// Métricas locales: cuántos clientes reciben adaptive vs native vs compact.
// Esto NO se envía a un servidor externo.
```

## Slices

- global_gate: type

### S1 — Detect capabilities + decide mode

- **Status**: done
- **Files**: `packages/core/src/lib/surface/client-capabilities.ts`, `packages/core/src/lib/surface/decide-mode.ts`
- **Gate**: type
- acceptance:
  - "Funciones implementadas."
  - "Override explícito respetado."

### S2 — Tests + docs

- **Status**: done
- **Files**: `packages/core/tests/src/lib/surface/`, `docs/mcp-vertex/surface/mode-decision.md`
- **Gate**: type
- acceptance:
  - "Tests verdes."
  - "Documentación."

## Acceptance

- **Unit**: `detectCapabilities` con varios `clientInfo` + `initializeResponse`.
- **Unit**: `decideSurfaceModeFromCapabilities` con varias combinaciones.
- **Override**: config explícito toma precedencia.
- **E2E**: handshake con un cliente real → surface mode correcto.


- [ ] `detectCapabilities` implementado y exportado.
- [ ] `decideSurfaceModeFromCapabilities` implementado y exportado.
- [ ] Override explícito respetado.
- [ ] Logging en startup.
- [ ] Tests verdes.
- [ ] Documentación: `docs/mcp-vertex/surface/mode-decision.md` explica el flujo.
- [ ] `bun run validate` verde.


- Decisión dinámica implementada.
- Override explícito funciona.
- Logging + tests.

---

## Notes

- **E2E test** con cliente conocido (claude-code) → adaptive.
- **E2E test** con cliente simulado sin listChanged → native o compact.
- **Property test**: cualquier combinación de capabilities produce un mode válido.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - packages/core/src/lib/surface/client-capabilities.ts
        - packages/core/src/lib/surface/decide-mode.ts
    - before/after:
        before: "Surface mode estático desde config"
        after:  "Surface mode dinámico según capabilities del cliente (con override)"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track H.
- **Auditoría legada**: §10 SURF2-003.
- **Hermanas**: `r00019` (adaptive default), `r00221` (listChanged validation).
- **Cierra el Track H**: tras esta propuesta, la decisión de surface mode es inteligente y adaptativa.
