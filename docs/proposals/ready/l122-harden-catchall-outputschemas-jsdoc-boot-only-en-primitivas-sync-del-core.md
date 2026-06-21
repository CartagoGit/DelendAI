---
id: l122
status: ready
type: proposal
track: core+plugins
date: 2026-06-21
---

# l122 — Harden catchall outputSchemas + JSDoc boot-only en primitivas sync del core

## Goal

Cerrar los hallazgos H3 y H4 de la auditoría a022 (P1) — y de paso abrir el camino para cerrar definitivamente el master audit M24 follow-up que `l118` ya empezó. Esta propuesta actúa en **dos frentes complementarios**:

**Frente 1 (H3) — outputSchemas catchall residuales**

Reemplazar los 6 `z.object({}).catchall(z.unknown())` que la auditoría a022 encontró con `z.object({...})` concretos derivados de los tipos ya existentes. Lista cerrada:

| # | Archivo | Línea | Tipo a derivar |
|---|---|---|---|
| 1 | `packages/core/src/lib/bootstrap/bootstrap-tool.ts` | 99 | `IProjectAnalysis` |
| 2 | `packages/core/src/lib/bootstrap/bootstrap-tool.ts` | 138 | `IServerPlan` (o `IExhaustiveMcpBlueprint`) |
| 3 | `packages/core/src/lib/bootstrap/bootstrap-tool.ts` | 186 | `IMcpProjectSkeleton` |
| 4 | `packages/core/src/lib/scaffold/scaffold-tool.ts` | 291 | `IScaffoldReport` |
| 5 | `plugins/rules/src/lib/rules-tools.ts` | 199 | `IRulesManifest` |
| 6 | `plugins/proposals/src/lib/tools/proposals/adopt.tool.ts` | 81 | `ISwarmPathLayout` |

Para cada uno: leer el tipo, derivar el `z.object` con `zod-to-json-schema` o a mano, validar con un test que el JSON Schema generado por el SDK MCP es **estricto** (sin `additionalProperties: true` por defecto y sin patrones permisivos), y commitear.

**Frente 2 (H4) — JSDoc boot-only en primitivas sync**

Añadir JSDoc `/** Boot-time one-shot only — hot paths must use the async variant. */` en:
- `packages/core/src/lib/shared/atomic-write.ts` — cabecera de `writeFileAtomicSync` (línea 36-43).
- `packages/core/src/lib/shared/quarantine-corrupt-file.ts` — cabecera de `quarantineCorruptFileSync` (línea 65).

Adicionalmente, considerar añadir una regla Biome o ESLint custom que prohíba importar estas funciones desde `packages/core/src/lib/tools/**` o desde handlers. Si la regla custom es overkill para el beneficio, basta con el JSDoc y un párrafo en AGENTS.md (que ya existe, pero el código no lo refleja).

Acceptance:
- `bun run validate` verde.
- 0 ocurrencias de `z.object({}).catchall(z.unknown())` en `packages/core/src` y `plugins/*/src` (verificable con `grep -r 'catchall(z.unknown())' packages/core/src plugins/*/src`).
- 6 tests nuevos (uno por schema endurecido) que validen que el JSON Schema generado no es catchall.
- 2 JSDocs nuevos en las primitivas sync.
- `bun run lint:proposals` valida este documento.
- Cita cruzada desde `a022` (H3+H4) y referencia a `l118` (que ya endureció el catchall del plugin `rules`, ahora ampliado al resto).

## Slices

- global_gate: lint

### s1 — Endurecer 3 outputSchemas en bootstrap-tool (IProjectAnalysis, IServerPlan, IMcpProjectSkeleton)
- files: packages/core/src/lib/bootstrap/bootstrap-tool.ts
- gate: e2e
- acceptance:
  - "3 schemas derivados de tipos existentes"
  - "JSON Schema generado estricto (sin additionalProperties permisivos)"
  - "3 tests que validan el endurecimiento"
- status: pending

### s2 — Endurecer outputSchema de scaffold-tool (IScaffoldReport)
- files: packages/core/src/lib/scaffold/scaffold-tool.ts
- gate: e2e
- acceptance:
  - "1 schema derivado de IScaffoldReport"
  - "Test de JSON Schema estricto"
- status: pending

### s3 — Endurecer outputSchema de rules-tools (IRulesManifest)
- files: plugins/rules/src/lib/rules-tools.ts
- gate: e2e
- acceptance:
  - "1 schema derivado de IRulesManifest"
  - "Test de JSON Schema estricto"
- status: pending

### s4 — Endurecer outputSchema de adopt.tool (ISwarmPathLayout)
- files: plugins/proposals/src/lib/tools/proposals/adopt.tool.ts
- gate: e2e
- acceptance:
  - "1 schema derivado de ISwarmPathLayout"
  - "Test de JSON Schema estricto"
- status: pending

### s5 — JSDoc boot-only en primitivas sync del core
- files: packages/core/src/lib/shared/atomic-write.ts
- files: packages/core/src/lib/shared/quarantine-corrupt-file.ts
- gate: lint
- acceptance:
  - "JSDoc en writeFileAtomicSync"
  - "JSDoc en quarantineCorruptFileSync"
  - "bun run validate verde"
- status: pending
