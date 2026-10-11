---
id: x00287
title: "`isToolExposed` deja de ser fail-open para nombres desconocidos"
kind: fix
status: done
shipped-in:
    - bc807bb7
type: proposal
track: adaptive
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-C04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011]
---

# x00287 — `isToolExposed` deja de ser fail-open para nombres desconocidos

## Goal

Que `isToolExposed(name)` devuelva `false` (con un log `warn`) cuando
no encuentra registro para `name`, en lugar de `true` — y que el tipo
de retorno pase a ser tri-estado (`'visible' | 'hidden' | 'unknown'`)
para que ningún llamante pueda tratar "no lo sé" como "permitido"
implícitamente.

## why

**Verificación de la premisa — se sostiene exactamente.** Leído
`packages/core/src/lib/project/tool-surface-runtime.service.ts`,
método `isToolExposed` (líneas 308-311 en el estado actual del
branch, la auditoría lo citaba en 245-248 sobre la snapshot anterior —
el desplazamiento de línea es sólo por código añadido antes en el
fichero, la lógica es idéntica):

```ts
isToolExposed(name: string): boolean {
	const record = this.recordsByName.get(name);
	return record === undefined ? true : isToolVisible(record.access);
}
```

Confirmado: `record === undefined ? true : ...` — un nombre
desconocido se considera expuesto. No hay ningún cambio en el branch
(dieciséis commits ya aplicados) que toque esta función; el hallazgo
no estaba resuelto por trabajo previo.

**Por qué es un problema.** Es un fallo abierto en una función de
**visibilidad**: un nombre mal escrito, un registro perdido en una
recarga, o una tool registrada fuera del plan se consideran expuestos
por defecto. La política correcta en una decisión de exposición es
fail-closed y ruidosa — negar por defecto y avisar, no conceder por
defecto y callar.

**Impacto verificado.** Bajo hoy: `grep -rn "isToolExposed"` sobre el
repo muestra que los llamantes actuales siempre pasan nombres ya
registrados (nunca entrada de usuario sin validar), así que el camino
`undefined` no se alcanza en producción hoy. Es, tal como dice la
propia auditoría, una trampa para el futuro, no un incidente activo.

## why this design

Se descarta el cambio mínimo (`return record === undefined ? false :
...` sin más) como entrega única porque un `boolean` no puede
representar "no lo sé": un futuro llamante que reciba `false` no
puede distinguir "esta tool existe pero está oculta por política" de
"esta tool no existe" — y esa distinción importa para diagnóstico
(`doctor`, logs). El tipo tri-estado es la solución que la propia
auditoría marca como ideal y el coste de implementarlo junto al fix
mínimo es bajo porque sólo hay que tocar un método y sus llamantes
directos (no hay migración de dato persistido).

Se mantiene un método de compatibilidad `isToolExposed` que devuelve
`boolean` (mapeando `'unknown' → false`) para no romper llamantes
existentes en el mismo commit, con el tri-estado expuesto en un método
nuevo (`getToolExposure`) — permite migrar a los llamantes internos en
un slice separado del cambio de comportamiento fail-closed.

## non-goals

- Migrar todos los llamantes internos al tipo tri-estado en esta
  propuesta — S2 migra el/los llamantes conocidos hoy; cualquier
  llamante futuro usa `getToolExposure` desde el principio por
  convención, documentada en el JSDoc del método deprecado.
- Auditar por qué un registro podría perderse en una recarga (el "un
  registro que se perdió en una recarga" que menciona la auditoría
  como escenario) — es un escenario hipotético de este hallazgo, no
  un bug reproducido; si aparece evidencia real, es un fix aparte.

## architecture

```
isToolExposed(name) [deprecado, boolean]
        │
        └─► getToolExposure(name): 'visible' | 'hidden' | 'unknown'
                  │
          record === undefined        → 'unknown'  (+ log warn)
          isToolVisible(record.access) → 'visible' | 'hidden'

isToolExposed(name) = getToolExposure(name) === 'visible'
                       (unknown también mapea a false: fail-closed)
```

## slices

### S1 — `getToolExposure` tri-estado + `isToolExposed` fail-closed

- **Status**: done
- **Files**:
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
      (`isToolExposed`, nuevo `getToolExposure`)
    - `packages/core/src/lib/contracts/interfaces/tool-surface-runtime.interface.ts`
      (o el fichero donde se declara la interfaz del servicio —
      confirmar con
      `grep -rln "isToolExposed" packages/core/src/lib/contracts`)
    - `packages/core/tests/src/lib/project/tool-surface-runtime.exposure.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/project/tool-surface-runtime.exposure.spec.ts`
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: getToolExposure expone visible/hidden/unknown, emite warning para nombres desconocidos, e isToolExposed queda fail-closed al delegar en getToolExposure === visible. El test focalizado paso 3/3 y bunx tsc --noEmit -p packages/core/tsconfig.json termino sin errores. No observe cambios fuera del slice que bloqueen esta aprobacion.
### S2 — Migrar los llamantes internos conocidos a `getToolExposure`

- **Status**: done
- **Files**: los ficheros que resulten de
  `grep -rln "\.isToolExposed(" packages/core/src plugins` (a
  determinar exactamente al implementar; no adivinar la lista aquí)
- **Gate**: `bunx tsc --noEmit -p packages/core` (confirma que ningún
  llamante migrado quedó con un tipo incompatible) seguido de
  `bunx vitest run packages/core/tests/src/lib/project`
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: overview-tool migrado a getToolExposure(...) === 'visible', sin llamantes productivos restantes a isToolExposed en packages/core, y cobertura fail-closed/unknown validada en los specs objetivo. Los cambios ajenos presentes en el workspace no bloquean este slice porque los checks pedidos para packages/core pasan en este estado.
## dependency graph

Ninguna. Independiente del resto de `q00011`. Dentro de esta
propuesta: S2 depende de S1 (necesita que `getToolExposure` exista).

## acceptance

- Spec: un nombre desconocido para `getToolExposure` devuelve
  `'unknown'` y emite un log `warn` nombrando el nombre no encontrado.
- Spec: `isToolExposed` (el método deprecado) devuelve `false` para un
  nombre desconocido — nunca `true`.
- Spec de regresión: un nombre registrado y visible sigue devolviendo
  `true`/`'visible'` exactamente como hoy.
- Ningún camino del código trata `'unknown'` como `'visible'`.

## risks and mitigations

- **Riesgo: algún llamante hoy invisible a este grep depende del
  comportamiento fail-open actual (p. ej. una ruta de test que asume
  `true` para un nombre no registrado).** Mitigación: S1 corre la
  suite completa de `packages/core` antes de dar el slice por cerrado,
  no sólo el spec nuevo — cualquier test roto por el cambio de
  comportamiento se investiga como una segunda instancia del mismo
  bug, no se soslaya con un skip.
- **Riesgo: el log `warn` en cada búsqueda de un nombre desconocido
  genera ruido si `tool_search` prueba nombres candidatos
  internamente.** Mitigación: verificar antes de S1 si `tool_search`
  invoca `isToolExposed`/`getToolExposure` con nombres candidatos no
  confirmados (`grep -n "isToolExposed\|getToolExposure"` en
  `searchTools`); si es así, el log se limita a los llamantes que
  reciben un nombre ya elegido por el usuario/modelo, no a los
  candidatos internos de búsqueda.

## notes

Hallazgo verificado sin matices frente a `AUD-C04`: mismo
comportamiento, mismo fichero, mismo riesgo. El único ajuste de esta
propuesta respecto a la "solución mínima" del informe es entregar
directamente el tipo tri-estado en S1 en vez de posponerlo, porque el
coste adicional es bajo y evita reabrir el mismo fichero dos veces.
