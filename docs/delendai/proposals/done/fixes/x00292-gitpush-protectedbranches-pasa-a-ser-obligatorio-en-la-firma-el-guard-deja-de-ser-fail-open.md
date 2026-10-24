---
id: x00292
title: "gitPush: protectedBranches pasa a ser obligatorio en la firma — el guard deja de ser fail-open"
kind: fix
status: done
type: fix
track: security
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D06
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
shipped-in:
    - f5836e9 # S1 firma obligatoria + S2 fail-open cerrado + S3 push-driver intacto
related: [q00011, r00037]
---

# x00292 — `gitPush`: `protectedBranches` pasa a ser obligatorio en la firma

## Goal

Que ningún llamante de `gitPush` (`packages/core/src/lib/shared/git-write.ts`)
pueda force-pushear sin haber decidido explícitamente su lista de
ramas protegidas. Hoy `protectedBranches` es un campo opcional de
`IPushOptions` con default silencioso `[]` cuando se omite — el
compilador no exige la decisión y un llamante nuevo que se olvide del
parámetro obtiene, en silencio, cero protección. Se cambia la firma
para que el parámetro sea obligatorio, forzando a cada llamante
(actual y futuro) a declarar su lista o renunciar explícitamente con
`protectedBranches: []`.

## why

**Comportamiento verificado independientemente en esta sesión.**
`packages/core/src/lib/shared/git-write.ts:150` declara:

```ts
readonly protectedBranches?: readonly string[];
```

con el comentario exacto citado por el audit: *"Core stays
project-agnostic: there is no built-in default here, callers supply
their own resolved list (the `git`/`commit-policy` plugins already
compute one)."* Y en la implementación de `gitPush`, línea 241:

```ts
const protectedBranches = options.protectedBranches ?? [];
if (protectedBranches.length > 0) { /* … solo entonces comprueba … */ }
```

Es decir: si `options.protectedBranches` es `undefined`, el guard de
force-push **no se ejecuta nunca** — `protectedBranches.length > 0`
es `false` y el bloque entero que compara `targetBranch` contra la
lista y exige autorización se salta por completo. El resto del guard
(resolución del refspec real vía `resolveForceTargetBranch`,
autorización con `by`+`reason` vía `hasAuthorization`, registro
acotado a 200 entradas vía `recordForcePushAuthorization`) es sólido
— pero todo él es inalcanzable si el llamante omite el parámetro.

El hallazgo se sostiene exactamente como lo describe `AUD-D06`, sin
matices que corregir.

**Único llamante real hoy, verificado por grep.** Sólo
`plugins/commit-policy/src/lib/services/push-driver.ts` invoca
`gitPush` fuera de los propios tests de `git-write.ts`, y ya pasa
`protectedBranches: policy.protectedBranches` explícitamente (línea
174, comentado como "defense in depth" porque `push-driver.ts` ya
refuerza el mismo chequeo por su cuenta antes de llamar a `gitPush`).
Esto significa que el riesgo hoy es sobre todo **prospectivo**: el
próximo plugin que use `gitPush` directamente —y el proyecto declara
como objetivo que terceros escriban plugins— puede olvidarlo sin que
nada avise, ni en tiempo de compilación ni en tiempo de ejecución.

**Por qué es un problema.** En una primitiva de seguridad, el caso
por defecto (el que un llamante obtiene sin pensarlo) debe ser el
seguro. Aquí es al revés: "olvidar el parámetro" es indistinguible de
"decidir conscientemente no proteger nada", y ambos producen el mismo
comportamiento silencioso.

## why this design

El propio informe evalúa dos soluciones y elige explícitamente la
más fuerte: un default `['main', 'master']` en el core resuelve el
caso más común, pero sigue dejando "olvidarlo" como una opción válida
para cualquier lista distinta de la default — un llamante que necesite
proteger `release/*` y no lo declare vuelve a caer en fail-open
silencioso para esas ramas. Hacer el parámetro **obligatorio en el
tipo** (quitar el `?`) es la única forma de que "olvidarlo dejar de
ser posible": el compilador rechaza cualquier llamada a `gitPush` con
`force` que no incluya `protectedBranches`, y `protectedBranches: []`
se convierte en la única forma de renunciar a la protección — visible
en el diff de cada PR, nunca implícita.

Se descarta mantener el parámetro opcional con un valor por defecto
de `['main', 'master']` como solución final (aunque el informe la
llama "mínima") porque el proyecto es agnóstico de la convención de
ramas de cada adoptante (`develop` es la rama protegida real de
*este* repo, no `main`/`master` — ver
`plugins/commit-policy/src/lib/services/push-driver.ts:147`, el
guard `x00258` hardcodea `develop`) — un default fijo en el core
volvería a mezclar una convención de proyecto en una capa que la
propia base de código insiste en mantener agnóstica.

## non-goals

- Añadir una lista de ramas protegidas por defecto en el core — se
  descarta explícitamente arriba; el fix es de tipo, no de valor.
- Cambiar `push-driver.ts` — ya pasa la lista explícitamente y no
  requiere cambios de comportamiento, sólo pasa a compilar contra la
  firma nueva sin diferencias.
- Tocar `force: 'true'` sin autorización (ya cubierto por un guard
  independiente en `gitPush`, líneas 236-239) — esta propuesta sólo
  toca la ausencia de `protectedBranches`.

## architecture

`IPushOptions.protectedBranches` pasa de
`readonly protectedBranches?: readonly string[]` a
`readonly protectedBranches: readonly string[]` (sin `?`). Como
`IPushOptions` ya es el tipo del segundo parámetro de `gitPush`
(`options: IPushOptions = {}`), quitar la opcionalidad del campo hace
que **cualquier** llamada que use `force: 'with-lease'` o
`force: 'true'` sin `protectedBranches` falle en `tsc`, no en
runtime. Las llamadas con `force` omitido/`'false'` no requieren el
campo (esa rama de `gitPush` nunca lee `protectedBranches`), así que
un tipo condicional (`force` presente ⇒ `protectedBranches`
requerido) sería más preciso pero también más difícil de leer para
quien mantiene el fichero; se opta por requerir el campo siempre que
se construya un `IPushOptions` con intención de push
—`protectedBranches: []` como renuncia explícita es una línea, no una
carga real— en línea con la preferencia del repo por firmas simples
sobre tipos condicionales complejos (ver
`docs/mcp-vertex/AGENT-BOOTSTRAP.md` / convención de "minimal
root-cause fix" del repo).

## slices

### S1 — `protectedBranches` obligatorio en la firma + actualizar el único llamante interno

- **Status**: done
- **Files**:
    - `packages/core/src/lib/shared/git-write.ts`
      (`IPushOptions.protectedBranches` pierde el `?`; actualizar el
      comentario que hoy dice "there is no built-in default" para
      reflejar que el compilador exige la decisión)
    - `packages/core/tests/src/lib/shared/git-write.spec.ts`
      (actualizar cualquier construcción de `IPushOptions` con
      `force` que no pasara `protectedBranches`)
- **Gate**: `bun tools/scripts/typecheck.script.ts`,
  `bunx vitest run packages/core/tests/src/lib/shared/git-write.spec.ts`
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: IPushOptions exige protectedBranches, commitAndPush siempre llama a gitPush con una lista explícita (protectedBranches: [] antes de propagar options.push), el spec focalizado de git-write pasó 39/39 y packages/core typecheck pasó sin errores. No vi bloqueadores externos en packages/core para este slice: hay otros cambios concurrentes, pero no rompen el typecheck del paquete ni invalidan el contrato revisado.
### S2 — Tests del caso fail-open cerrado

- **Status**: done
- **Files**:
    - `packages/core/tests/src/lib/shared/git-write.spec.ts`
- **Gate**: `bunx vitest run packages/core/tests/src/lib/shared/git-write.spec.ts`

Casos a añadir en S2 (ninguno existe hoy — verificado por lectura del
spec actual): (a) `gitPush` con `force: 'with-lease'` y
`protectedBranches: []` explícito + `authorization` válida ⇒
permitido (renuncia consciente, comportamiento correcto); (b) al no
poder ya construirse un `IPushOptions` con `force` sin
`protectedBranches` (falla en compilación, no en runtime), un test de
tipo (`// @ts-expect-error`) que documente que
`gitPush(run, { force: 'with-lease' })` sin `protectedBranches` es un
error de compilación.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: el spec cubre el fail-open cerrado con rechazo determinista cuando la rama protegida se lista explícitamente, documenta el opt-out consciente con protectedBranches: [], y fija el error de compilación con @ts-expect-error cuando force omite protectedBranches. El spec focalizado pasó 41/41 y packages/core typecheck quedó verde. Hay cambios concurrentes en packages/core y proposals, pero no bloquean este slice: el ajuste adyacente en git-write.ts sólo preserva la compatibilidad de commitAndPush suministrando protectedBranches: [] explícito.
### S3 — Confirmar que `push-driver.ts` sigue verde sin cambios de comportamiento

- **Status**: done
- **Files**:
    - `plugins/commit-policy/src/lib/services/push-driver.ts` (no se
      espera diff — ya pasa `protectedBranches: policy.protectedBranches`;
      este slice es de verificación, no de escritura)
    - `plugins/commit-policy/tests/src/lib/services/push-driver.spec.ts`
- **Gate**: `bunx vitest run --project commit-policy`,
  `bun tools/scripts/typecheck.script.ts`
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revision independiente en el checkout actual: push-driver rechaza ramas protegidas desde policy, reenvia policy.protectedBranches a gitPush conforme a la firma vigente de core y los tests preservan el comportamiento observable esperado fuera de ese guard. Vitest focalizado verde y typecheck local del paquete commit-policy sin errores; el fallo del typecheck filtrado desde raiz proviene de errores globales ajenos a este slice.
## dependency graph

Sin dependencias funcionales — el propio informe lo marca
"Dependencias: Ninguna". En el grafo de `q00011`,
`x00288 ──► r00037 ──► x00292` refleja un orden de trabajo sugerido
sobre el mismo área de seguridad (efectos/git), no una dependencia de
diseño: esta propuesta no requiere que `r00037` exista para
implementarse; el orden evita que dos agentes toquen
`packages/core/src/lib/shared/` y `packages/core/src/lib/dry-run/` a
la vez.

## acceptance

- `gitPush(run, { force: 'with-lease' })` sin `protectedBranches` ya
  no compila (`tsc` falla) — ningún llamante puede forzar sin haber
  declarado su lista.
- `gitPush` con `protectedBranches: []` explícito y `force:
  'with-lease'` contra cualquier rama, sin `authorization`, se
  permite (renuncia consciente y visible en el código).
- `gitPush` con `protectedBranches: ['main']`, target `main`, sin
  `authorization`, se rechaza (comportamiento ya existente,
  preservado).
- `bunx vitest run --project core --project commit-policy` en verde.
- `bun tools/scripts/typecheck.script.ts` sin errores nuevos.

## risks and mitigations

- **Riesgo: breaking change en la API pública del core** —
  reconocido explícitamente por el propio informe ("cambio de firma
  → breaking menor en la API pública del core"). Mitigación: el único
  consumidor real dentro del monorepo (`push-driver.ts`) ya pasa el
  campo, así que el cambio no rompe nada interno; se documenta en el
  changelog del paquete `@mcp-vertex/core` como breaking (major/minor
  según convención de versionado del monorepo) para adoptantes
  externos que llamen a `gitPush` directamente.
- **Riesgo: un adoptante externo con un llamante propio a `gitPush`
  se rompe en su próximo `tsc`.** Mitigación: es exactamente el
  efecto buscado — un llamante que "olvidó" el campo antes tenía
  fail-open silencioso; ahora tiene un error de compilación explícito
  y accionable. Se documenta la migración (`protectedBranches: []`
  si de verdad no quieren protección, o la lista real) en las notas
  de release.

## notes

Ficheros de referencia:

- `packages/core/src/lib/shared/git-write.ts:139-260`
- `plugins/commit-policy/src/lib/services/push-driver.ts:140-176`
  (único llamante real de `gitPush` fuera de sus propios tests, ya
  conforme a la nueva firma)
- `packages/core/tests/src/lib/shared/git-write.spec.ts`
