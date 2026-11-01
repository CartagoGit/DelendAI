---
id: r00027
title: "Inventario + clasificación stable/experimental/internal de `core/public`"
kind: refactor
status: done
type: proposal
track: architecture
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track C / r00027"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00028 # subpath exports (depende del inventario)
    - r00029 # extraer @mcp-vertex/contracts (depende del inventario)
    - b00238 # APIs internas marcadas como internal (Track N)
shipped-in: ["1a0ed8afd"]
last-transition-id: f6705830-2344-4af1-81ff-d69a189d21e2
last-correlation-id: f6705830-2344-4af1-81ff-d69a189d21e2
last-transition-from: review
---

# r00027 — Inventario + clasificación stable/experimental/internal de `core/public`

## Goal

Producir un inventario **machine-readable** de todo lo exportado por
`packages/core/src/public/index.ts` (y los archivos que la superficie
pública re-exporta desde `packages/core/src/public/**`), clasificando
cada símbolo según su madurez y soporte.

La auditoría externa detectó (§50) que `@mcp-vertex/core` ha crecido
hacia "God Package" precisamente porque no existe una frontera clara
entre lo que es API estable, lo que es experimental y lo que es
interno. Sin un inventario verificable, cualquier intento de extraer
subpath exports o de marcar APIs como `@internal` se vuelve guesswork.

### Comportamiento actual

- `packages/core/src/public/index.ts` re-exporta decenas de tipos,
  helpers y adapters sin un manifiesto que indique cuál es estable.
- No hay forma de saber qué plugin depende de qué símbolo sin un
  análisis manual con grep.
- Los releases del core no pueden comunicar breaking changes con
  precisión porque no hay un "stable surface" al cual atarlos.

### Comportamiento deseado

- Script ejecutable: `bun tools/scripts/inspect/core-public-inventory.script.ts`
  - Recorre `packages/core/src/public/**` y todos los barrel re-exports.
  - Para cada símbolo determina:
    - `kind`: `function | class | type | const | enum`.
    - `maturity`: `stable | experimental | internal | deprecated`.
    - `sourceFile`: ruta absoluta desde la raíz del repo.
    - `referencedBy`: array de plugins/paths que lo importan
      (recorriendo `plugins/**`, `packages/**`, `apps/**`).
- Salida:
  - JSON estructurado en
    `build/inspect/core-public-inventory.json`.
  - Tabla Markdown generada en
    `docs/mcp-vertex/CORE-PUBLIC-API-INVENTORY.md` con columna
    "maturity" para revisión editorial.
- El script es idempotente: el JSON se regenera idéntico si no hay
  cambios en el código fuente.

## why

- Habilita `r00028` (subpath exports): para decidir qué entra en
  `./contracts`, `./plugin`, `./runtime` o `./node` necesitamos saber
  qué export está estable y qué no.
- Habilita `r00029` (extraer `@mcp-vertex/contracts`): la frontera
  contratos-vs-runtime se traza sobre este inventario.
- Habilita `b00238` (Track N, marcar APIs internas): la decisión de
  qué renombrar a `*Internal` requiere una lista verificable.
- Habilita comunicación de breaking changes a clientes downstream
  con semver meaningful: "el contrato estable cambió" vs "un helper
  experimental se renombró".

## non-goals

- No clasifica APIs como `internal` automáticamente; solo produce la
  lista inicial. La decisión editorial de madurez la toma un humano
  revisando `CORE-PUBLIC-API-INVENTORY.md`.
- No modifica `core/public`; no mueve archivos; no cambia nombres.
- No evalúa tokens/superficie; el inventario es estructural, no de
  coste.
- No genera documentación humana detallada por símbolo; sólo una fila
  por símbolo con su metadata estructural.

## architecture

### 1. Script de inspección

- Ruta: `tools/scripts/inspect/core-public-inventory.script.ts`.
- Tipo: `*.script.ts` (convención AGENTS.md).
- Entrada: árbol `packages/core/src/public/**`.
- Salida:
  - `build/inspect/core-public-inventory.json` (machine-readable).
  - `docs/mcp-vertex/CORE-PUBLIC-API-INVENTORY.md` (revisar en PR).
- Algoritmo:
  1. Resolver entrypoints de la superficie pública (lo que el
     `exports` map de `packages/core/package.json` declara).
  2. Para cada entrypoint, recorrer `export *` y `export {…}` con
     TypeScript Compiler API (no regex).
  3. Resolver cada símbolo a su archivo fuente y su JSDoc.
  4. Buscar `@stable`, `@experimental`, `@internal`, `@deprecated`
     en JSDoc para clasificar madurez.
  5. Para cada símbolo, buscar importers en `plugins/**`,
     `packages/**`, `apps/**` excluyendo `packages/core/src/public/**`
     mismo.

### 2. Formato JSON

```jsonc
{
  "generatedAt": "2026-08-25T...",
  "commit": "<SHA>",
  "entrypoints": ["packages/core/src/public/index.ts"],
  "symbols": [
    {
      "name": "definePlugin",
      "kind": "function",
      "maturity": "stable",
      "sourceFile": "packages/core/src/plugin/define-plugin.ts",
      "exportedFrom": ["packages/core/src/public/index.ts"],
      "referencedBy": [
        "plugins/proposals/src/lib/register.ts",
        "plugins/audit/src/index.ts",
        /* … */
      ]
    }
  ],
  "summary": {
    "total": 142,
    "byMaturity": { "stable": 80, "experimental": 32, "internal": 24, "deprecated": 6 }
  }
}
```

### 3. Tabla Markdown generada

| Símbolo | Kind | Maturity | Source | Referenced by |
| --- | --- | --- | --- | --- |
| `definePlugin` | function | stable | `packages/core/src/plugin/define-plugin.ts` | 27 plugins |
| `PluginLifecycle` | type | experimental | `packages/core/src/lib/plugins/lifecycle.ts` | 3 plugins |
| `nodeDynamicImport` | function | internal | `packages/core/src/node/dynamic-import.ts` | 2 callers |

### 4. Tests

- `tools/scripts/inspect/core-public-inventory.spec.ts`:
  - Genera el inventario contra fixtures.
  - Verifica que la salida es estable (mismo JSON en dos corridas
    consecutivas).
  - Verifica que el conteo por madurez cuadra.
  - Verifica que un símbolo `@experimental` se detecta por JSDoc.

## Slices

### S1 — Script de inspección + tabla generada

- **Status**: done
- **Files**: `tools/scripts/inspect/core-public-inventory.script.ts`, `tools/scripts/inspect/core-public-inventory.script.spec.ts`, `tools/tests/inspect/core-public-inventory.spec.ts`, `docs/mcp-vertex/CORE-PUBLIC-API-INVENTORY.md` (generado, revisión inicial), `build/inspect/core-public-inventory.json` (generado)
- **Gate**: type
- review-state: done
- review-implementer: copilot-orchestrator-r00027-s1
- review-reviewer: delivery-verifier-r00027-s1
- review-log: approved by delivery-verifier-r00027-s1 — Verified independently: S1 acceptance covered. 16 tests pass (11 unit on pure helpers + 5 integration that spawn the script). Acceptance: script runs without params, JSON stable across runs (excluding generatedAt), MD table has one row per export, totals reconcile.
## acceptance

- Script ejecutable sin parámetros.
- JSON estable: dos corridas consecutivas producen el mismo
  `generatedAt`-agnostic content.
- Tabla MD con al menos los símbolos que `core/public` exporta hoy.
- Conteos por madurez cuadran (`stable + experimental + internal + deprecated == total`).
- Tests verdes; `tsc --noEmit` verde.
- Sin cambios en código fuente de `packages/core/src/public/**`.
