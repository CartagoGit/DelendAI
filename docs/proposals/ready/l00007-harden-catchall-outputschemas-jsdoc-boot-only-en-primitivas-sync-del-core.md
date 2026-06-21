---
id: l00007
kind: refactor
title: Harden catchall outputSchemas + JSDoc boot-only en primitivas sync del core
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

## Why

- AGENTS.md, invariante 8: "Every public tool declares an `outputSchema`. Open `catchall` schemas are a documented exception, not a default". Hoy el código tiene 6 catchalls (3 en `bootstrap`, 1 en `scaffold`, 1 en `rules`, 1 en `proposals/adopt`). El audit l118 ya cerró los catchalls dentro de `rules` para una rama concreta; este l122 cierra el resto.
- Un `outputSchema` que admite cualquier objeto es, en la práctica, equivalente a no tener schema: el SDK no puede validar `structuredContent`, la generación de tipos SDK colapsa a `unknown`, y los consumidores caen en duck-typing — exactamente lo que M24 (master audit) fue creado para prevenir.
- Los tipos `IProjectAnalysis`, `IServerPlan`, `IMcpProjectSkeleton`, `IScaffoldReport`, `IRulesManifest`, `ISwarmPathLayout` ya existen en el código (son las interfaces TypeScript de las que el runtime ya deriva sus `z.object` parciales). Solo falta formalizar el `z.object` en el `outputSchema` de cada tool.
- Para H4, el JSDoc en el código es lo único que falta entre el invariante documentado en AGENTS.md y el dev que llega a la función: hoy la barrera es solo un párrafo en un doc que muchos no leen antes de importar.

## Non-goals

- Reescribir los tipos a `z.object` puros en todo el codebase; este slice es solo sobre los `outputSchema` declarados en `server.registerTool`.
- Cambiar el formato de `structuredContent` ni el protocolo MCP subyacente.
- Endurecer el `outputSchema` de `metrics-tool.ts:64` (`tools: z.object({}).catchall(MetricSchema)`) — es legítimo porque el dominio es dinámico (cualquier tool registrada). Documentado como excepción en el audit.

## Slices

### S1 — Endurecer 3 outputSchemas en bootstrap-tool (IProjectAnalysis, IServerPlan, IMcpProjectSkeleton)
  - **Status**: done
  - **Files**: `packages/core/src/lib/bootstrap/bootstrap-tool.ts`
  - **Command**: `bunx vitest run packages/core && bun run typecheck`
  - **Expect**: green; 3 schemas derivados de tipos existentes; JSON Schema generado estricto (sin `additionalProperties` permisivos).
  - **Acceptance**:
    - 3 schemas derivados de tipos existentes (`z.object` con propiedades explícitas)
    - JSON Schema generado estricto
    - 3 tests que validan el endurecimiento (uno por schema)

### S2 — Endurecer outputSchema de scaffold-tool (IScaffoldReport)
  - **Status**: done
  - **Files**: `packages/core/src/lib/scaffold/scaffold-tool.ts`
  - **Command**: `bunx vitest run packages/core && bun run typecheck`
  - **Expect**: green; 1 schema derivado de `IScaffoldReport`; test de JSON Schema estricto.
  - **Acceptance**:
    - 1 schema derivado de `IScaffoldReport`
    - Test de JSON Schema estricto

### S3 — Endurecer outputSchema de rules-tools (IRulesManifest)
  - **Status**: deferred — ver Notes (META-1)
  - **Files**: `plugins/rules/src/lib/rules-tools.ts`
  - **Command**: `bunx vitest run plugins/rules && bun run typecheck`
  - **Expect**: green; 1 schema derivado de `IRulesManifest`; test de JSON Schema estricto.
  - **Acceptance**:
    - 1 schema derivado de `IRulesManifest`
    - Test de JSON Schema estricto

### S4 — Endurecer outputSchema de adopt.tool (ISwarmPathLayout)
  - **Status**: deferred — ver Notes (META-1)
  - **Files**: `plugins/proposals/src/lib/tools/proposals/adopt.tool.ts`
  - **Command**: `bunx vitest run plugins/proposals && bun run typecheck`
  - **Expect**: green; 1 schema derivado de `ISwarmPathLayout`; test de JSON Schema estricto.
  - **Acceptance**:
    - 1 schema derivado de `ISwarmPathLayout`
    - Test de JSON Schema estricto

### S5 — JSDoc boot-only en primitivas sync del core
  - **Status**: done
  - **Files**:
    - `packages/core/src/lib/shared/atomic-write.ts`
    - `packages/core/src/lib/shared/quarantine-corrupt-file.ts`
  - **Command**: `bun run validate`
  - **Expect**: green; 2 JSDocs añadidos.
  - **Acceptance**:
    - JSDoc `/** Boot-time one-shot only — hot paths must use the async variant. */` en `writeFileAtomicSync`
    - JSDoc equivalente en `quarantineCorruptFileSync`

## Acceptance

- [x] `bun run validate` es verde para S1/S2/S5 (typecheck + test limpios; `bun run lint` global bloqueado únicamente por `docs/proposals/index.json`, lockeado por el trabajo concurrente de `f126`/`f119`, ajeno a este slice).
- [x] 0 ocurrencias de `z.object({}).catchall(z.unknown())` en `packages/core/src` tras S1/S2 (verificable con `grep -r 'catchall(z.unknown())' packages/core/src` → sin resultados). Los 2 catchalls restantes en `plugins/*/src` (`rules-tools.ts`, `adopt.tool.ts`) quedan **deferred a `l125`** (slice `s4`) — ver Notes.
- [x] 4 tests nuevos (uno por schema endurecido en S1, más uno de cobertura en S2) que validan que el JSON Schema generado ya no es catchall — `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`, test `hardened bootstrap tool outputSchemas are no longer permissive catchalls`.
- [x] 2 JSDocs nuevos en las primitivas sync.
- [x] `bun run lint:proposals` valida este documento.
- [x] Cita cruzada desde `a022` (H3+H4) y referencia a `l118` marcada en el checklist.

## Risks and mitigations

- **R1**: derivar `z.object` a mano para 6 tipos puede divergir del tipo real si alguien edita la interface y olvida actualizar el schema. **Mitigación**: usar `z.custom<T>()` con un type-test runtime, o derivar automáticamente con `z.infer<typeof IProjectAnalysis>` y un `z.object({...})` paralelo documentado como "must mirror IProjectAnalysis".
- **R2**: el JSON Schema generado por `zod-to-json-schema` puede añadir `additionalProperties: true` por defecto. **Mitigación**: en cada test de S1-S4, parsear el schema y asertar que el nivel raíz no tiene `additionalProperties` o que es `additionalProperties: false`.
- **R3**: la regla Biome/ESLint custom para "no importar *Sync desde tools" puede ser overkill. **Mitigación**: en S5, si la fricción es alta, dejar solo el JSDoc y abrir follow-up separado.

## Notes

- **Auditoría origen**: `a022-21-06-2026-copilot-minimax-m3-repositorio.md` (H3 y H4, severidad P1).
- **Propuesta complementaria**: `l118-harden-catchall-output-schemas.md` (que endureció `rules` parcialmente); esta `l122` es la iteración "resto del monorepo".
- **Master audit**: cierra el follow-up de M24 (outputSchemas catchall).
- **Naturaleza de la deuda**: hygiene, no corrección. La API actual funciona, pero pierde validación en runtime y dificulta la generación de tipos SDK.
- **Follow-up natural**: si se aprueba, abre el camino a una tercera iteración (`l123`?) que audite cualquier `z.object({})` o `z.unknown()` introducido en PRs futuros vía una regla Biome.
- **Implementación (S1, S2, S5)**: los 4 catchalls de `packages/core/src` (3 en `bootstrap-tool.ts` + 1 en `scaffold-tool.ts`) están reemplazados por `z.object` explícitos que mirroran `IProjectAnalysis`/`IServerPlan`/`IMcpProjectSkeleton` (ad-hoc, ver `MCP_PROJECT_SKELETON_SCHEMA`)/`IServerBlueprint`/`IScaffoldReport`. `bun run types:generate` ejecutado — `packages/core/src/generated/tool-outputs.ts` regenerado, los 4 `[key: string]: unknown` colapsan a interfaces concretas. Cobertura: `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts` extendido con llamadas reales a `create_project`/`plan_mcp_project`/`scaffold` (antes solo `analyze_project` estaba cubierto) más un test dedicado que verifica, vía `client.listTools()`, que ninguno de los 4 outputSchema endurecidos tiene `additionalProperties: true` ni `properties` vacío. JSDocs de S5 añadidos en `writeFileAtomicSync` y `quarantineCorruptFileSync`. `bun run typecheck` y `bun run test` (142 archivos, 1042+ tests) verdes.
- **META-1 (S3/S4 deferred)**: `l125` (slice `s4`) reclama el mismo fix para los mismos 2 archivos (`rules-tools.ts:199`, `adopt.tool.ts:81`) que S3/S4 de esta propuesta. Para evitar trabajo duplicado o colisión de edición concurrente (ver `a026` § META-1), esta sesión **no implementa S3/S4** — quedan `status: deferred`, formalmente cedidos a `l125`. Si `l125` se cierra sin tocar esos 2 archivos por cualquier razón, S3/S4 de `l122` quedan disponibles para retomarse.
