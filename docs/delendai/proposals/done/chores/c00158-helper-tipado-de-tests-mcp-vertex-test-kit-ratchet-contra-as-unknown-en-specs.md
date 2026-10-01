---
id: c00158
title: "Helper tipado de tests (`@mcp-vertex/test-kit`) + ratchet contra `as unknown` en specs"
kind: chore
status: done
type: proposal
track: conventions
date: 2026-08-29
priority: P2
related:
    - c00157 # type-naming.script.ts — misma tanda de homogeneidad, mismo idioma de ratchet
    - c00126 # types-in-contracts.script.ts — idioma de ratchet con baseline por fichero
---

# c00158 — Helper tipado de tests + ratchet contra `as unknown` en specs

## Goal

Dar a los tests una forma **tipada** de construir dobles parciales, y
cerrar la puerta a que sigan apareciendo casts `as unknown as T`. Dos
piezas: un paquete interno `@mcp-vertex/test-kit` con `fakePartial`, y un
lint de tipo ratchet (`test-unsafe-casts.script.ts`) cuyo baseline solo
puede bajar.

## why

Los specs del repo acumulaban **196 `as unknown` en 120 ficheros**
(medido 2026-08-28). El patrón dominante era siempre el mismo:

```ts
await reg.register(server as unknown as Parameters<typeof reg.register>[0]);
```

Un doble parcial hecho a mano, forzado a través de una firma enorme del
SDK. Lo grave no es la fealdad: ese cast **apaga toda la comprobación de
tipos sobre el objeto** — erratas en nombres de campo, tipos
equivocados, y sobre todo el día en que la firma real cambie. Ese día
los 196 tests siguen compilando y siguen pasando mientras entregan una
forma que ya no existe.

Es el mismo defecto que persigue la auditoría `a00090`: una comprobación
que reporta verde porque ha dejado de mirar.

## why this design

`fakePartial<TReal, TRequiredKeys>` concentra la aserción en **un solo
lugar auditado** en vez de 196 dispersos, y recupera comprobación real:

- toda clave listada en `TRequiredKeys` es obligatoria con el tipo real —
  omitirla es error de compilación;
- toda clave aportada se contrasta contra su tipo real;
- las claves inventadas o con errata las rechaza el excess-property check.

El helper **declara por escrito su propia limitación**: no puede saber
qué campos lee en runtime el camino de código bajo prueba; eso lo aporta
el autor vía `TRequiredKeys`. Un helper que fingiera lo contrario —un
`(p: Partial<T>): T => p as T` pelado— sería `as unknown` con un nombre
más bonito, y sería **peor que el cast** porque parece seguro. Esa
distinción es el motivo de que el contrato viva en
`fake-partial.interface.ts` y esté documentado ahí.

El ratchet no es tolerancia cero porque la deuda restante es real y
drenarla de golpe arriesga cambiar el significado de los tests.

## non-goals

- Drenar los 171 `as unknown` restantes: fuera de alcance, es el trabajo
  que el ratchet hace posible medir.
- Migrar `packages/core/**`, `plugins/external-mcps/**` y
  `plugins/error-reporting/**`: territorio de otros agentes en vuelo
  durante esta tanda.
- Sustituir los dobles por mocks de vitest: cambiaría el estilo de test
  del repo, que es deliberadamente de dobles explícitos.

## architecture

- `packages/test-kit/` — paquete de workspace **privado** (`private: true`,
  nunca publicado). Sigue el layout del repo: `src/lib/`,
  `src/contracts/interfaces/`, `src/public/index.ts`, `tests/`.
- `fakePartial` (`src/lib/fake-partial.ts`) + `IFakePartialInput`
  (`src/contracts/interfaces/fake-partial.interface.ts`).
- `fake-tool-server.ts` y `as-array.ts` cubren los dos otros patrones
  repetidos en los specs migrados.
- `tools/scripts/lint/test-unsafe-casts.script.ts` + baseline por fichero,
  con `--update`, mismo idioma que `types-in-contracts` y
  `solid-compliance`.

## slices

### S1 — Paquete `@mcp-vertex/test-kit` con `fakePartial`
- **Status**: done
- **Files**: `packages/test-kit/src/lib/fake-partial.helper.ts`, `packages/test-kit/src/lib/fake-tool-server.helper.ts`, `packages/test-kit/src/lib/as-array.helper.ts`, `packages/test-kit/src/contracts/interfaces/fake-partial.interface.ts`, `packages/test-kit/package.json`, `tsconfig.base.json`, `vitest.shared.ts`
- **Gate**: `bunx vitest run --project test-kit` y `tsc --noEmit -p packages/test-kit/tsconfig.json`

### S2 — Ratchet `test-unsafe-casts` cableado en `validate` y CI
- **Status**: done
- **Files**: `tools/scripts/lint/test-unsafe-casts.script.ts`, `tools/scripts/lint/test-unsafe-casts.script.spec.ts`, `tools/scripts/lint/test-unsafe-casts.baseline.json`, `package.json`, `.github/workflows/ci.yml`
- **Gate**: `bun tools/scripts/lint/test-unsafe-casts.script.ts`

### S3 — Migración de los specs de 5 plugins al helper
- **Status**: done
- **Files**: `plugins/logs/tests/tools.spec.ts`, `plugins/quality/tests/src/lib/run-all.spec.ts`, `plugins/completion/tests/src/lib/completion-tools.spec.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`, `plugins/observability/src/lib/tools/obs-errors.tool.spec.ts`
- **Gate**: `bunx vitest run --project logs --project quality --project completion --project proposals --project observability`

## dependency graph

S1 → S3 (la migración necesita el helper). S2 es independiente de S3,
pero su baseline se fija **después** de S3 para que registre la deuda
real restante.

## acceptance

- `fakePartial` rechaza en compilación: clave requerida ausente, tipo
  incorrecto y clave inventada. Verificado con `@ts-expect-error`.
- El ratchet falla al añadir un cast nuevo en un spec y vuelve a pasar al
  retirarlo.
- `as unknown` en specs baja de 196 a 171; el baseline del ratchet queda
  en 354 (incluye los olores hermanos, no solo `as unknown`).
- Los 1447 tests de los 5 plugins migrados siguen verdes **y siguen
  probando lo mismo**.

## risks and mitigations

- **Riesgo**: que el helper se use como cast universal y la seguridad sea
  aparente. **Mitigación**: `TRequiredKeys` es obligatorio de facto para
  que el doble sirva, y la limitación está documentada en el contrato.
- **Riesgo**: que al quitar un cast un test deje de compilar porque el
  doble era genuinamente incorrecto. **Mitigación**: eso es un bug que el
  cast tapaba; se corrige y se reporta, no se re-castea.
- **Riesgo**: que `packages/test-kit` acabe publicado. **Mitigación**:
  `private: true` en su `package.json`.

## notes

El agente que ejecutó esta propuesta murió por límite de sesión justo
antes de cablear S2 en `package.json` y CI; ese cableado y este fichero
los completó el orquestador. El helper se verificó de forma
independiente antes de aceptarlo: los tres rechazos de compilación se
comprobaron con `@ts-expect-error` reales, no con la palabra del agente.
