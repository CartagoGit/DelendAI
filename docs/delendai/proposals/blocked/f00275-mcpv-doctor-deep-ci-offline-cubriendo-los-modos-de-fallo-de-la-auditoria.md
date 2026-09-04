---
id: f00275
title: "`delendai doctor --deep/--ci/--offline` cubriendo los modos de fallo de la auditoría"
kind: feat
status: blocked
type: proposal
track: product
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-F04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, f00276]
---

# f00275 — `delendai doctor --deep/--ci/--offline` cubriendo los modos de fallo de la auditoría

## Goal

Extender `delendai doctor` (que ya existe y es sólido) con tres modos —
`--deep`, `--ci`, `--offline`— y, dentro de `--deep`, una comprobación
concreta que hoy no existe: que `runErrorReportingSelfTest` (probado
pero sin ningún consumidor en producción) se ejecute como parte del
health check.

## why

**Verificación de la premisa.** Leído
`packages/cli/src/commands/groups/doctor.ts` completo (285 líneas):
implementa exactamente lo que la auditoría reconoce — puntuación
0-100 (`computeScore`), clasificación P0/P1/P2, salida `--json`,
códigos de salida por `CODE_BY_STATUS`, y una lista fija de checks de
workspace/config/manifests/git/runtime. **No existe** ninguna opción
`--deep`, `--ci` ni `--offline` (`grep` sobre esas cadenas literales
en el fichero no encuentra nada) — la superficie de flags es sólo la
heredada del framework de CLI (`--json`).

Verificado también el segundo hecho que el encargo pedía comprobar:
`runErrorReportingSelfTest` (`plugins/error-reporting/src/lib/self-test.service.ts`,
exportado en `plugins/error-reporting/src/public/index.ts:132`) **no
tiene consumidores** fuera de su propio spec
(`plugins/error-reporting/tests/self-test.service.spec.ts`) —
confirmado con `grep -rn runErrorReportingSelfTest` sobre todo el
repo. Sigue siendo, tal como constaba, un follow-up abierto: la
función existe, está probada, y nada la invoca en runtime ni desde
`doctor`.

**Por qué es un problema.** `doctor` es exactamente el lugar donde el
self-test de `error-reporting` debería vivir (es la comprobación
"¿está funcionando de verdad?" que `f00276` — AUD-G01, no en esta
propuesta — pide para el propio subsistema), y hoy ningún comando lo
expone.

## why this design

Se separan `--ci`/`--offline` de `--deep` porque son ortogonales:
`--ci`/`--offline` cambian el **modo de ejecución** (salida
estructurada, sin red) de los checks que YA existen, mientras que
`--deep` añade checks **nuevos** y más caros (invocar
`runErrorReportingSelfTest`, comprobar drift de artefactos generados,
salud de MCPs externos). Implementarlos en slices separados permite
que `--ci`/`--offline` — que son cambios de bajo riesgo sobre código
existente — se entreguen sin esperar a que cada check de `--deep` esté
listo.

Se empieza con **un** check de `--deep` (el self-test de
`error-reporting`, ya que es la pieza que el encargo pidió verificar
explícitamente y que no depende de ningún otro proposal de esta
tanda) en vez de los "diez modos de fallo" enumerados por la
auditoría de una sola vez: varios de esos modos (`E01`/`E02`
lifecycle, `D01` capability↔efectos) son objeto de sus propias
propuestas del plan y `--deep` debe poder crecer añadiendo checks sin
rediseñar el comando.

## non-goals

- Cubrir los diez modos de fallo enumerados en `AUD-F04` en un solo
  proposal — esta propuesta entrega el mecanismo (`--deep` como
  registro extensible de checks caros) y el primer check real
  (self-test de `error-reporting`); los demás checks (branch
  protection, drift de artefactos generados, salud de MCPs externos,
  etc.) se añaden incrementalmente como slices de seguimiento fuera
  de este proposal, cada uno cuando su propuesta de origen aterrice.
- `--fix` — explícitamente fuera de alcance por diseño (la
  restricción de la auditoría es que `doctor` nunca modifique nada
  por defecto); no se propone aquí.
- Reescribir los checks existentes de `runDoctorBody` — se mantienen
  intactos; `--deep` es aditivo.

## architecture

```
delendai doctor                → checks actuales (sin cambios)
delendai doctor --ci           → checks actuales + salida estructurada
                              pensada para pipelines (igual que --json
                              hoy, pero con exit codes documentados
                              para CI, no sólo para humanos)
delendai doctor --offline      → checks actuales, saltando los que
                              requieren red (marcados con una nueva
                              propiedad `requiresNetwork` en el
                              registro de checks)
delendai doctor --deep         → checks actuales + DEEP_CHECKS[]
                              DEEP_CHECKS[0] = error-reporting self-test
                              (runErrorReportingSelfTest con un `gh`
                              fake — nunca crea un issue real)
```

## slices

### S1 — `--ci`: salida estructurada + exit codes documentados

- **Status**: pending
- **Files**:
    - `packages/cli/src/commands/groups/doctor.ts`
    - `packages/cli/src/commands/groups/doctor.spec.ts`
- **Gate**: `bunx vitest run packages/cli/src/commands/groups/doctor.spec.ts`

### S2 — `--offline`: marcar y saltar checks que requieren red

- **Status**: pending
- **Files**:
    - `packages/cli/src/commands/groups/doctor.ts`
    - `packages/cli/src/lib/doctor/score.ts` (o el fichero equivalente
      donde vive la lista de checks — confirmar con
      `grep -n "extraChecks\|DOCTOR_CHECKS" packages/cli/src/commands/groups/doctor.ts`
      antes de implementar)
    - `packages/cli/src/commands/groups/doctor.spec.ts`
- **Gate**: `bunx vitest run packages/cli/src/commands/groups/doctor.spec.ts`

### S3 — `--deep`: registro de checks caros + primer check (error-reporting self-test)

- **Status**: pending
- **Files**:
    - `packages/cli/src/commands/groups/doctor.ts` (opción `--deep`,
      composición con `runErrorReportingSelfTest`)
    - `packages/cli/src/lib/doctor/deep-checks.ts` (nuevo)
    - `packages/cli/src/lib/doctor/deep-checks.spec.ts` (nuevo, con un
      `gh` fake — el spec debe verificar explícitamente que **no** se
      crea ningún issue real)
- **Gate**: `bunx vitest run packages/cli/src/lib/doctor/deep-checks.spec.ts`

## dependency graph

Independiente del resto de `q00011`; se beneficia de `f00276`
(AUD-G01, no incluida aquí) si esa propuesta añade contadores del
embudo de `error-reporting` que `--deep` podría reportar, pero no la
requiere: el self-test ya existe y es suficiente para S3. Dentro de
esta propuesta: S1 y S2 son independientes entre sí; S3 es
independiente de ambos (toca un módulo nuevo).

## acceptance

- `delendai doctor --ci` produce salida estructurada con exit code no-cero
  en al menos un fixture roto.
- `delendai doctor --offline` completa sin timeouts ni errores de red en
  un entorno sin conectividad simulado.
- `delendai doctor --deep` invoca `runErrorReportingSelfTest` y reporta
  su resultado como una sección más del informe, sin crear ningún
  issue de GitHub real durante el propio check.

## risks and mitigations

- **Riesgo: `--deep` con el self-test real podría intentar tocar
  `gh` de verdad si el fake no se inyecta correctamente.** Mitigación:
  el spec de S3 usa el mismo patrón de inyección de dependencias que
  ya usa `self-test.service.spec.ts` (revisar sus fakes antes de
  reimplementar) y afirma explícitamente `expect(ghCreateCalls).toBe(0)`.
- **Riesgo: marcar checks como `requiresNetwork` de forma incompleta
  deja `--offline` colgado en un check no marcado.** Mitigación: el
  spec de S2 incluye un timeout corto y falla explícitamente (no
  cuelga) si algún check no marcado intenta red bajo `--offline`.

## notes

El follow-up de `runErrorReportingSelfTest` sin consumidor —
mencionado como conocido en el encargo de este triage— sigue abierto
hoy; S3 es exactamente el trabajo que lo cierra. `f00276` (AUD-G01,
fuera de esta propuesta) puede añadir después el embudo de contadores
que `--deep` debería mostrar junto al resultado del self-test.
