---
id: v00137
title: "init:default importa el runtime de cada plugin habilitado para leer metadatos estáticos de env"
kind: perf
status: ready
type: proposal
track: architecture
date: 2026-09-10
---

# v00137 — El aviso de env cuesta 37 grafos de módulos para producir, casi siempre, una lista vacía

## Goal

Que `init:default` obtenga los requisitos de variables de entorno de los
plugins **sin cargar su runtime**, igual que
`managed-lazy-catalog.generated.ts` ya hace con tools, prompts y skills.

## why

`readEnvWarningFindings` (`packages/cli/src/commands/init/init.command.ts`)
recorre el conjunto de plugins habilitados y, para cada uno, hace
`await nodeDynamicImport(specifier)` con un único fin: leer
`plugin.optionsSchema` y pasarlo a `extractRequirements`, que se limita a
buscar marcadores `env:VAR` dentro de las cadenas `.describe()` del
esquema. Es decir: se instancia el grafo de módulos completo de cada
plugin —con sus dependencias transitivas y cualquier efecto de
importación— para leer metadatos que son **estáticos**.

Medido en el preset `dogfood`, que es el que `init:default` aplica:

| | |
|---|---:|
| plugins habilitados (`resolvePluginSet`) | 38 |
| plugins importados por el aviso de env | 37 |
| plugins que declaran algún marcador `env:` | 1 (`database`) |
| ¿está `database` habilitado en `dogfood`? | **no** |
| requisitos obtenidos | **0** |

El único plugin de todo el repositorio que declara requisitos de entorno
está deshabilitado en el preset. El bucle importa 37 runtimes, no
encuentra nada, y `requirements.length === 0` devuelve `[]`.

El coste es el término dominante del comando. Cronometrado por fases
sobre la propia tubería:

```
pass1 detect=31ms    pass1 run=8844ms
pass2 detect=14ms    pass2 run=107ms
```

`renderInitBundle` son 119 ms y la proyección de skills 3 ms; el resto
—8,7 s— es la importación. La segunda pasada baja a 107 ms porque los
módulos ya están en caché, que es la prueba de que se trata de un coste
de carga y no de trabajo útil.

Esto salió a la luz porque el spec end-to-end de `init:default` agotó su
timeout en un `validate` completo. Se paralelizó el sondeo
(`Promise.all` sobre los plugins, conservando el orden de especificadores
por plugin y el orden de `resolvedPlugins` en `requirements`), lo que
bajó el test de 9,3 s a 4,9 s en máquina ociosa, y se subió el techo del
proyecto a los 120 s que `tools/vitest.config.ts` y
`plugins/proposals/vitest.config.ts` ya documentan. Ambas cosas son
paliativos: la mitad del coste sigue ahí, y sigue pagándose en
producción, en el arranque de cada adopter.

## Non-goals

- No cambia qué avisos de entorno se emiten ni cuándo. El veredicto de
  `checkSchema` debe ser idéntico.
- No toca `plugins/env` como plugin en ejecución: sólo la vía por la que
  `init` descubre los requisitos antes de que exista configuración.
- No retira el sondeo dinámico para plugins de terceros; ver S2.

## Slices

### S1 — Los requisitos de entorno viajan en el catálogo generado

- **Status**: pending
- **Files**: [`tools/scripts/generate/managed-lazy-catalog.script.ts`, `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`, `packages/cli/src/commands/init/init.command.ts`]

- El generador —que ya importa cada plugin en tiempo de generación— pasa
  su `optionsSchema` por `extractRequirements` y emite los
  `IEnvRequirement` resultantes en la entrada del catálogo.
- `readEnvWarningFindings` lee el catálogo para los plugins de primera
  parte y deja de importarlos.
- Acceptance: "con el preset `dogfood`, `init:default` no importa ningún
  runtime de plugin y el aviso de entorno es el mismo que hoy."
- **Gate**: `bunx vitest run packages/cli/src/lib/init/init-default.command.spec.ts`

### S2 — El sondeo dinámico queda como vía de respaldo acotada

- **Status**: pending
- **Files**: [`packages/cli/src/commands/init/init.command.ts`]

- Un plugin habilitado que **no** figure en el catálogo generado (un
  plugin de terceros en el workspace del adopter) se sigue sondeando por
  importación: ahí el catálogo no puede saber nada.
- Acceptance: "un plugin fuera del catálogo que declara `env:VAR` sigue
  produciendo su aviso."
- **Gate**: `bunx vitest run packages/cli/src/lib/init/init-default.command.spec.ts`

### S3 — Devolver el techo del proyecto a su sitio

- **Status**: pending
- **Files**: [`packages/cli/vitest.config.ts`]

- Con S1 dentro, el spec end-to-end deja de pagar la importación. Se
  vuelve a medir y se baja `testTimeout` al valor que la medición
  sostenga, registrando la cifra en el comentario.
- Acceptance: "el comentario de `vitest.config.ts` cita la medición que
  justifica el techo vigente."
- **Gate**: `bunx vitest run packages/cli/src/lib/init/init-default.command.spec.ts`

## Acceptance

- `init:default` sobre el preset `dogfood` no importa runtimes de plugin.
- El conjunto de avisos de entorno emitido es idéntico al actual, tanto
  cuando hay requisitos como cuando no.
- Un plugin de terceros fuera del catálogo conserva su aviso.
- El techo de `packages/cli/vitest.config.ts` está justificado por una
  medición citada.

## Notes

La cabecera de `managed-lazy-catalog.generated.ts` ya enuncia el
principio que falta aquí: «el runtime consume este índice compacto sin
importar cada plugin». Los requisitos de entorno son el caso que quedó
fuera.
