# Invariants — adaptive surface

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariante: visible ≠ loaded ≠ active ≠ callable

**Estado actual**: CIERTO — la auditoría lo destaca explícitamente
como el único de sus cuatro ejemplos que **ya estaba bien diseñado**
antes de esta auditoría, no como una corrección. Se documenta y
protege aquí precisamente para que "está bien diseñado hoy" no se
confunda con "está garantizado para siempre" — sin un test dedicado,
un refactor futuro del tool-surface runtime podría colapsar estos
cuatro estados sin que nada lo advirtiera.

Los cuatro estados son independientes:

- **visible**: el tool aparece en el catálogo que un cliente puede
  descubrir (`tools/list` o el router `vertex`).
- **loaded**: el módulo del plugin que lo posee ha sido importado.
- **active**: el plugin está efectivamente registrado en la sesión.
- **callable**: una invocación real del tool puede completarse ahora
  mismo (no está en medio de una desactivación, por ejemplo).

Un tool puede ser visible sin estar loaded (superficie `managed`,
activación lazy); puede estar loaded sin estar active (registro
fallido a medias); puede estar active sin ser callable en un instante
concreto (in-flight eviction). Colapsar cualquiera de estas
distinciones en el código sería asumir, por ejemplo, que "aparece en
la lista" implica "se puede llamar ahora", que es exactamente el tipo
de suposición que rompió `AUD-E01` en otro subsistema.

**Test que lo vigila**:
`packages/core/tests/src/lib/project/adaptive-surface-invariants.spec.ts`
(nuevo, d00015 S2) — complementa la cobertura existente en
`tool-surface-runtime.spec.ts`, `tool-surface-runtime.exposure.spec.ts`
y `managed-lazy-runtime.spec.ts`, que ya ejercitan estos estados por
separado pero no afirman explícitamente que son cuatro conceptos
distintos.

## Invariante: una herramienta nunca desaparece mientras está in-flight

**Estado actual**: CIERTO.

**Test que lo vigila**:
`packages/core/tests/src/lib/project/tool-surface-runtime-eviction.spec.ts`
y su contraparte basada en propiedades,
`tool-surface-runtime-eviction.property.spec.ts`.

## Invariante: activación y desactivación tienen histéresis

**Estado actual**: NO IMPLEMENTADO (`AUD-C03`). La auditoría lo marca
como "hoy no existe" — no es que el comportamiento actual esté mal,
es que no hay ningún mecanismo de histéresis: un tool puede activarse
y desactivarse en rápida sucesión (thrashing) sin ningún periodo de
enfriamiento.

**Si es FALSO/no implementado**: `f00273` — "Ranking, umbral de
confianza e histéresis en tool search" (estado: `blocked`) es la
propuesta de seguimiento que cerraría este invariante. Hasta que se
implemente, este documento es la evidencia escrita de que la ausencia
es conocida y no un descuido silencioso.
