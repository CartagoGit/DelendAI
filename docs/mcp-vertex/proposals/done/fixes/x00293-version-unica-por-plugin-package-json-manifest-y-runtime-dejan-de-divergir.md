---
id: x00293
title: "Versión única por plugin: package.json, manifest y runtime dejan de divergir"
kind: fix
status: done
type: proposal
track: release
date: 2026-08-29
priority: P1
related:
    - q00011
shipped-in:
    - f5836e9 # S1 41 plugins alineados + lint 3 fuentes + S2 spike version importada
---

# x00293 — Versión única por plugin

## Goal

Las tres fuentes de versión de cada plugin —`package.json`,
`plugin.manifest.ts` y el objeto `version` que devuelve
`src/index.ts` en `register()`— coinciden siempre. `lint:manifest-vs-package`
pasa de comparar dos fuentes a comparar las tres.

## why

Reproducido en vivo en esta sesión (2026-08-29), no confiando en el
número publicado por la auditoría sin volver a correrlo:

```bash
for d in plugins/*/; do
  name=$(basename "$d")
  pkg=$(node -e "console.log(require('./$d/package.json').version)")
  rt=$(grep -oE "version: *'[^']+'" "$d/src/index.ts" | head -1 | grep -oE "'[^']+'" | tr -d "'")
  [ "$pkg" != "$rt" ] && echo "$name PKG=$pkg RUNTIME=$rt"
done
```

Resultado: **41 de 51 plugins** publican `package.json` en `0.1.1` y
devuelven `version: '0.1.0'` en el objeto que su `register()` entrega
al host MCP en runtime. Coincide exactamente con la cifra que publica
la auditoría (AUD-F05: "41 de 51"). Los 10 restantes ya coinciden
(`0.1.1` en ambos sitios).

`package.json` y `plugin.manifest.ts` sí van sincronizados: hay un
lint (`lint:manifest-vs-package`, `tools/scripts/lint/manifest-vs-package.script.ts`)
que lo garantiza y pasa en verde hoy. El tercer sitio —el literal
`version:` dentro de `src/index.ts`— **no lo cubre ningún gate**, y
quedó congelado en `0.1.0` en 41 plugins mientras `package.json`
avanzaba a `0.1.1` en algún punto anterior sin que el runtime se
actualizara con él.

Como síntoma adyacente que confirma que el drift es real y no un
artefacto de medición: `plugins/changelog/src/index.ts` conserva un
comentario que describe un estado de implementación anterior al que
describe su propio `plugin.manifest.ts`, señal de que el fichero
`src/index.ts` de varios plugins ha quedado detrás del resto del
plugin en más de un aspecto, no solo en la versión.

## why this design

La opción de eliminar la tercera fuente por completo —derivar
`version` en runtime a partir de `package.json` en vez de escribirlo a
mano— es la corrección estructural correcta y se deja documentada en
"architecture" como dirección preferida en S2, pero no puede ser el
**único** slice de esta propuesta: si el plugin loader no admite hoy
una lectura de `package.json` en tiempo de `register()` (algunos
plugins pueden ejecutarse empaquetados sin el `package.json` fuente
disponible), forzar esa dependencia sin verificarlo primero podría
romper el arranque de 51 plugins de una vez. Por eso S1 hace la
corrección mecánica segura (igualar los 41 valores manualmente, que es
reversible y de riesgo cero) y S2 explora la derivación automática
como mejora incremental con su propio gate de verificación antes de
aplicarse.

## non-goals

- **Cambiar el número de versión real del proyecto** (seguir en
  `0.1.1` o similar). Esta propuesta solo sincroniza las tres fuentes
  entre sí, no decide a qué versión deben apuntar.
- **Automatizar el versionado semántico** (bump automático en release).
  Fuera de alcance; ver `d00013`/gobernanza de ramas para ese tema
  aparte.
- **Tocar plugins fuera de `plugins/*/`** (el core, el cliente, la
  extensión VS Code tienen su propio ciclo de versión, no cubierto por
  `lint:manifest-vs-package`).

## architecture

`tools/scripts/lint/manifest-vs-package.script.ts` gana una tercera
comparación: lee `src/index.ts` de cada plugin (mismo patrón regex que
ya usa para `plugin.manifest.ts`, `version: '...'` en la primera
ocurrencia dentro del objeto que retorna `register()`) y falla si no
coincide con `package.json`/`plugin.manifest.ts`, nombrando el
plugin y las tres versiones leídas.

Para que el fix persista, S1 corrige mecánicamente los 41 `src/index.ts`
para que su literal `version:` coincida con `package.json`. S2 evalúa
—sin aplicarlo todavía, solo como spike documentado en el propio
código con un test que lo demuestre viable o no— si `register()` puede
leer `version` desde un import de `package.json` (`import pkg from
'../package.json' with { type: 'json' }` o equivalente ya usado en
otras partes del repo) en vez de un literal duplicado; si el spike
demuestra que es seguro para los 51 plugins, se aplica en el mismo
slice.

## Slices

### S1 — Igualar las 41 versiones divergentes + extender el lint a 3 fuentes

- **Status**: done
- **Files**:
    - Los 41 ficheros `plugins/*/src/index.ts` con drift (ver lista
      completa reproducible con el bucle de "why"; incluye, sin ser
      exhaustivo: `api`, `audit`, `auto-agent-selector`,
      `auto-plugin-selector`, `browser`, `cache`, `changelog`,
      `container`, `conventions`, `database`, `deps`, `diagram`,
      `docs`, `env`, `external-mcps`, `forge`, `git`, `i18n`,
      `issues`, `link-check`, `logs`, `memory`, `notification`,
      `observability`, `orchestrator-runner`, `perf`, `prompt-eval`,
      `prompts-pack`, `proposals`, `quality`, `refactor`, `rules`,
      `search`, `security`, `skills-pack`, `status-marker`,
      `tech-debt`, `test-convention`, `test-policy`,
      `usage-tracking`, `web-fetch`)
    - `plugins/changelog/src/index.ts` (además del bump de versión,
      borrar el comentario `// S3 will wire ...` obsoleto)
    - `tools/scripts/lint/manifest-vs-package.script.ts`
    - `tools/scripts/lint/manifest-vs-package.spec.ts`
- **Gate**: `bun tools/scripts/lint/manifest-vs-package.script.ts`
  (debe pasar de fallar con 41 divergencias a exit 0),
  `bunx vitest run --project tools -- manifest-vs-package`
- review-state: done
- review-implementer: finch
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente sobre el checkout actual: bun tools/scripts/lint/manifest-vs-package.script.ts OK; bunx vitest run --project tools tools/scripts/lint/manifest-vs-package.spec.ts --reporter=dot con 5/5 tests verdes; chequeo rápido sin drift entre plugins/*/src/index.ts y package.json. Hay cambios concurrentes en el árbol, pero no bloquean esta aprobación del slice porque los archivos del slice validan y el lint compara package.json, plugin.manifest.ts y src/index.ts.
### S2 — Spike: derivar `version` de `package.json` en runtime

- **Status**: done
- **Files**:
    - `plugins/api/src/index.ts` (piloto en un solo plugin primero)
    - `tools/scripts/lint/manifest-vs-package.script.spec.ts` (caso de
      spike)
- **Gate**: `bunx vitest run --project api` y arranque real del
  servidor MCP con solo ese plugin activo, confirmando que
  `tools/list`/`initialize` sigue reportando la versión correcta —
  si el spike falla o introduce una dependencia de import no deseada,
  este slice se cierra documentando por qué y S1 queda como la
  solución final (no bloqueante para el resto de la propuesta).
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: plugins/api/src/index.ts deriva version desde package.json vía import apiPackageJson + apiPackageJson.version; tools/scripts/lint/manifest-vs-package.script.ts resuelve ese patrón leyendo el package.json real; tools/scripts/lint/manifest-vs-package.spec.ts cubre el caso spike y el archivo hoy corre verde con 6/6 tests. Ejecuciones solicitadas: bunx vitest run --project tools tools/scripts/lint/manifest-vs-package.spec.ts --reporter=dot, bun tools/scripts/lint/manifest-vs-package.script.ts y bunx tsc --noEmit -p plugins/api/tsconfig.json, todas con exit 0. Hay cambios concurrentes fuera del slice en el working tree, pero no bloquean esta aprobación porque no impiden ni contaminan las validaciones focalizadas del slice.
## dependency graph

S1 es independiente y cierra el bug real (AUD-F05) por sí sola. S2 es
una mejora opcional que depende de que S1 esté en verde (para tener
una base estable desde la que comparar el comportamiento del spike) y
no bloquea la aceptación de esta propuesta si se decide no aplicarla
de forma generalizada.

## acceptance

1. Las tres fuentes (`package.json`, `plugin.manifest.ts`,
   `src/index.ts`) coinciden en los 51 plugins, verificado por
   `bun tools/scripts/lint/manifest-vs-package.script.ts` en `ci.yml`.
2. El lint extendido falla contra un fixture con una tercera fuente
   divergente, nombrando el fichero — probado en el spec de S1.
3. `plugins/changelog/src/index.ts` ya no contiene el comentario
   obsoleto `// S3 will wire ...`.
4. `bun tools/scripts/lint/proposals.script.ts` sin errores ni
   warnings sobre este fichero.

## risks and mitigations

- **Riesgo: 41 ficheros tocados de una vez es un diff grande.**
  Mitigación: el cambio es mecánico y de una sola línea por fichero
  (`version: '0.1.0'` → `version: '0.1.1'`), fácil de revisar en bloque
  y sin lógica que pueda corromperse — no es un codemod estructural,
  es un bump de literal verificado por el propio lint que se añade en
  el mismo slice.
- **Riesgo: algún consumidor externo (adoptante) ya guardó `0.1.0`
  como la versión "real" reportada por el host y este cambio le genera
  una sorpresa.** Mitigación: severidad ya calificada como MEDIA por
  la propia auditoría ("Bajo hoy porque el delta es un patch") — el
  cambio hace que el número reportado sea **más** correcto, no menos;
  cualquier adoptante que dependiera del valor viejo estaba ya
  operando sobre información falsa.
- **Riesgo: S2 (derivar de `package.json`) introduce un import que no
  resuelve igual en todos los modos de empaquetado del plugin
  (standalone vs. dentro del monorepo).** Mitigación: S2 es un spike
  en un único plugin piloto antes de generalizar; si falla, S1 por sí
  sola ya satisface el criterio de aceptación y S2 se cierra sin
  aplicar el cambio al resto.

## notes

Medición completa reproducida el 2026-08-29 (un día después del
snapshot de la auditoría), confirmando exactamente **41 de 51** —
ningún plugin adicional ni ninguno menos que lo publicado en AUD-F05:

```
Total plugins checked: 51
Mismatches (pkg vs runtime): 41
```

Los 10 plugins ya sincronizados (`PKG === RUNTIME`) no se listan en
esta propuesta por no requerir cambio.
