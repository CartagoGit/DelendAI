---
id: b00236
title: "error-reporting — retirar internalOnly:false (breaking) — reporting externo es imposible por construcción, no configurable"
kind: breaking
status: done
type: proposal
track: privacy
date: 2026-08-25
priority: P0
classification: MEJORA / SEGURIDAD DE DISEÑO
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§4 ER2-002"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00214 # DTO seguro (predecesor)
    - x00245 # safe tool identity (hermano)
    - x00237 # runtime version source (hermano)
    - t00009 # privacy adversarial regression
    - f00158 # error-reporting base
breaking-change: true
shipped-in:
  - d98e0528 # fix(privacy): x00236 — retire internalOnly config surface
---

# x00236 — error-reporting: retirar `internalOnly:false`

## Goal

La API pública de `error-reporting` aún permite, **conceptualmente**:

```json
{ "internalOnly": false }
```

Y la documentación sugiere: *"si es `false`, reportar cualquier tool failure"*.

Aunque el pipeline actual mantiene filtros más estrictos (DTO seguro, classifier, validator), esta opción es una **bomba de mantenimiento**:

- Un agente futuro puede encontrar `internalOnly` "configurado pero no afecta X" y "arreglarlo".
- Cualquier intento de "permitir reportar errores externos" parte de un flag ya existente en el schema.
- La promesa legal del producto es: **los datos del proyecto nunca son combustible de diagnóstico**. Hacer esa promesa **configurable** la debilita.

Reglas violadas: R1.1 (privacidad por construcción), R1.2 (no por redacción), §3 auditoría.


```ts
// plugins/error-reporting/src/lib/contracts/constants/options.constant.ts
export const ERROR_REPORTING_OPTIONS_SCHEMA = z.object({
  internalOnly: z.boolean().default(true),
  // ...
});
```

```ts
// docs/mcp-vertex/plugins/error-reporting.md (extracto)
> `internalOnly`: si es `false`, reporta cualquier tool failure,
> no solo las internas de Vertex. **Default: true.**
```

Reproducción conceptual:

1. Configurar `errorReporting.internalOnly = false`.
2. Registrar una tool externa `acme_hr_onboarding`.
3. Provocar una `Error` cualquiera dentro de esa tool.
4. **Si** en el futuro el classifier se "arregla" para aceptar ese path, el report incluirá información de `acme_hr_onboarding`. El schema ya anuncia el camino.


`MEJORA / SEGURIDAD DE DISEÑO` — no hay fuga activa hoy, pero el diseño permite que aparezca.

## Why

**Neutro** en operación normal. Quien use la API verá:

- El campo `internalOnly` desaparece del schema.
- Quien lo tenía en config recibe warning de deprecación, ignorado por el reporter.
- Quien lo tenía a `false` verá que el comportamiento no cambia (el pipeline ya era estricto).
- Quien lo tenía a `true` no nota diferencia.

Si en el futuro alguien pide "poder reportar errores externos" para una feature legítima, esa propuesta debe:

1. Explicar **qué categoría de errores externos** (de la cual **NO** hay ninguna legítima por privacidad).
2. Pasar revisión legal.
3. No usar este flag como puerta de entrada.


| Antes                                          | Después                                              |
|------------------------------------------------|------------------------------------------------------|
| Schema permite `internalOnly:false`            | Schema lo prohíbe; warning deprecación si aparece    |
| Documentación sugiere "reportar cualquier tool failure" | Documentación dice: "external project data is non-reportable by construction" |
| Riesgo futuro: "arreglar el classifier"        | Classifier no tiene que "arreglarse"; la opción no existe |

Refuerza R1.1 y R1.2.


Cero. No añade tools ni cambia schema de salida.

## Non-goals

**Permitido**:

- `plugins/error-reporting/src/lib/contracts/constants/options.constant.ts`
- `plugins/error-reporting/src/lib/options.service.ts`
- `plugins/error-reporting/src/lib/reporter.service.ts` (eliminar ramas `if (!internalOnly)` que ya existieran).
- `docs/mcp-vertex/plugins/error-reporting.md` — sección "Options" reescrita.
- `plugins/error-reporting/tests/**` — actualizar tests que asuman el campo.
- `mcp-vertex.config.json` schema (si existe `errorReporting.internalOnly`): añadir `// deprecated` comment.
- Catálogo: regenerar docs de options.

**No permitido**:

- Cualquier cambio que reactive la posibilidad de reportar errores externos.
- Cambios en el pipeline seguro (ya cubierto por `x00214`).


- `x00245` (safe tool identity): sigue siendo necesario independiente de esta opción.
- `x00237` (runtime version): ortogonal.
- `t00009` (privacy adversarial): cubre la verificación final.

## Architecture

### 1. Schema

```ts
// plugins/error-reporting/src/lib/contracts/constants/options.constant.ts
export const ERROR_REPORTING_OPTIONS_SCHEMA = z.object({
  // (campo eliminado)
  // internalOnly: z.boolean().default(true),  ← REMOVIDO

  dailyMax: z.number().int().positive().default(20),
  dedupeWindowMs: z.number().int().positive().default(3_600_000),
  // ... resto de opciones que SÍ son configurables (rate limit, dedupe, backoff, circuit breaker).
});
```

### 2. Compatibilidad hacia atrás

Si una configuración existente trae `internalOnly`:

```ts
// plugins/error-reporting/src/lib/options.service.ts
function normalizeErrorReportingOptions(raw: unknown): IErrorReportingOptions {
  const parsed = ERROR_REPORTING_OPTIONS_SCHEMA.parse(raw);

  // Deprecated field — solo se ignora con warning, jamás se usa.
  if (typeof raw === 'object' && raw !== null && 'internalOnly' in raw) {
    logWarn({
      code: 'ERR_REPORTING_OPTION_DEPRECATED',
      message: '"internalOnly" is deprecated and ignored. External project data is non-reportable by construction.',
    });
  }

  return parsed;
}
```

`internalOnly: false` → warning + ignorado.
`internalOnly: true` → warning + ignorado (ya no aporta información).
Ausente → silencio.

### 3. Documentación

`docs/mcp-vertex/plugins/error-reporting.md` reescribe la sección:

```md

## Slices

- global_gate: type

### S1 — Schema + service

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/constants/options.constant.ts`, `plugins/error-reporting/src/lib/options.service.ts`
- **Gate**: type
- acceptance:
  - "`internalOnly` eliminado del schema; warning deprecación si aparece."
  - "Tests pasan con/sin `internalOnly` en config."

### S2 — Reporter sin rama de internalOnly

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/reporter.service.ts`
- **Gate**: type
- acceptance:
  - "No existe `if (!internalOnly)` ni equivalente."
  - "El flujo del reporter no consulta la opción."

### S3 — Documentación + lint + grep test

- **Status**: done
- **Files**: `docs/mcp-vertex/plugins/error-reporting.md`, `tools/scripts/lint/privacy-internal-only.script.ts`
- **Gate**: type
- acceptance:
  - "Sección 'Reporting policy' reescrita con el invariante."
  - "Lint añadido a `bun run validate`."
  - "Doc grep test integrado."

## Acceptance

- **Unit**: `plugins/error-reporting/tests/src/lib/options.service.spec.ts` (extender).
- **Unit**: `plugins/error-reporting/tests/src/lib/reporter.service.spec.ts` (verificar que el flujo sigue funcionando).
- **Snapshot test**: schema de options no contiene `internalOnly` en JSON serializado.
- **Doc test**: grep `internalOnly` en `docs/mcp-vertex/plugins/error-reporting.md` no debe encontrarlo en la sección "Configurable options" (puede aparecer solo en "removed in 2026-08-25").


- [ ] El campo `internalOnly` ya no aparece en `ERROR_REPORTING_OPTIONS_SCHEMA`.
- [ ] Ningún path de runtime consulta `options.internalOnly`.
- [ ] Configuraciones con `internalOnly` producen un warning `ERR_REPORTING_OPTION_DEPRECATED` y son ignoradas.
- [ ] `docs/mcp-vertex/plugins/error-reporting.md` reescrito: sección "Reporting policy" explica el invariante; sección "Configurable options" NO lista `internalOnly`.
- [ ] `mcp-vertex.config.json` schema (si aplica) marca `internalOnly` como `@deprecated` con comentario explicativo.
- [ ] Tests verdes; coverage no cae.
- [ ] `bun run validate` verde.


- El campo `internalOnly` ya no aparece en `ERROR_REPORTING_OPTIONS_SCHEMA`.
- Ningún path de runtime consulta `options.internalOnly`.
- Configuraciones con `internalOnly` producen un warning y son ignoradas.
- Documentación reescrita explicando el invariante.
- `bun run validate` verde.

---

## Notes

External project data is **non-reportable by construction**.

This is not a configurable option. The reporter only accepts `ISafeMcpVertexReport`
DTOs whose provenance has been resolved through the plugin registry and whose
frames have been normalized to package-relative. There is no API surface, schema
field, runtime option or feature flag that re-enables reporting of external
project data.

If you need to disable the reporter entirely, do so at the host configuration
level (disable the plugin). The reporter being default-on is a product decision
about diagnosing Vertex itself; the privacy boundary is on the **content**, not
on a per-error opt-out.

### Configurable options

- `dailyMax`, `dedupeWindowMs`, `backoffMs`, `circuitBreakerThreshold`, ...
  (operational rate limits; see `options.service.ts`).

The following options were removed in 2026-08-25 (`x00236`):

- `internalOnly` — replaced by the invariant "external project data is
  non-reportable by construction". Legacy values emit a deprecation warning and
  are ignored.
```

### 4. Tests

| Test                                                           | Esperado                              |
|----------------------------------------------------------------|---------------------------------------|
| Config con `internalOnly: false`                               | Warning emitido, opción ignorada      |
| Config con `internalOnly: true`                                | Warning emitido, opción ignorada      |
| Config sin `internalOnly`                                      | Sin warning, opción no existe          |
| Pipeline del reporter sigue funcionando con/sin el campo       | Sin cambios observables               |
| Schema de options no contiene `internalOnly`                   | Aserción de tipo                      |
| Documentación no menciona `internalOnly` como opción           | grep sobre docs devuelve 0            |


- **Lint arquitectónico**: `tools/scripts/lint/privacy-internal-only.script.ts`:
  - Busca `internalOnly` en el código del reporter y falla si encuentra una rama que afecte el flujo (`if (!options.internalOnly)` o equivalente).
  - El warning de deprecación puede existir; el lint lo permite solo dentro de `normalizeErrorReportingOptions`.
- **Property test**: una config con cualquier valor de `internalOnly` (true/false/0/1/"yes") produce el mismo set de reports que sin ese campo.
- **Doc grep test** integrado en CI: `grep -nR 'internalOnly' docs/mcp-vertex/plugins/error-reporting.md` debe devolver 0 hits fuera de la sección "removed".


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - schema-diff: "ERROR_REPORTING_OPTIONS_SCHEMA: internalOnly removed"
    - lint: tools/scripts/lint/privacy-internal-only.script.ts
    - docs: docs/mcp-vertex/plugins/error-reporting.md rewritten
    - before/after:
        before: "Schema permite internalOnly:false con default true; documentación sugiere reportar cualquier tool failure"
        after:  "Schema no contiene internalOnly; reporting externo es invariante de arquitectura; docs lo explican"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track D (Privacidad P0).
- **Auditoría legada**: §3 (invariante) + §4 (ER2-002).
- **Hermanas**: `x00245` (provenance), `x00237` (version), `t00009` (adversarial suite).
- **Predecesora**: `x00214` (DTO seguro).
- **Principio**: §41 de la auditoría, principio 1: *"Privacy by construction, no by redaction."*

## Slices

- global_gate: type

### S1 — Schema + service

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/constants/options.constant.ts`, `plugins/error-reporting/src/lib/options.service.ts`
- **Gate**: type
- acceptance:
  - "`internalOnly` eliminado del schema; warning deprecación si aparece."
  - "Tests pasan con/sin `internalOnly` en config."

### S2 — Reporter sin rama de internalOnly

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/reporter.service.ts`
- **Gate**: type
- acceptance:
  - "No existe `if (!internalOnly)` ni equivalente."
  - "El flujo del reporter no consulta la opción."

### S3 — Documentación + lint + grep test

- **Status**: done
- **Files**: `docs/mcp-vertex/plugins/error-reporting.md`, `tools/scripts/lint/privacy-internal-only.script.ts`
- **Gate**: type
- acceptance:
  - "Sección 'Reporting policy' reescrita con el invariante."
  - "Lint añadido a `bun run validate`."
  - "Doc grep test integrado."

## Acceptance

- El campo `internalOnly` ya no aparece en `ERROR_REPORTING_OPTIONS_SCHEMA`.
- Ningún path de runtime consulta `options.internalOnly`.
- Configuraciones con `internalOnly` producen un warning y son ignoradas.
- Documentación reescrita explicando el invariante.
- `bun run validate` verde.
