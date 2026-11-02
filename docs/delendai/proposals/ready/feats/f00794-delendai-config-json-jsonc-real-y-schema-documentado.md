---
id: f00794
title: "delendai.config.json: JSONC real y schema documentado"
kind: feat
status: ready
type: proposal
track: general
date: 2026-10-28
---

# f00794 — delendai.config.json: JSONC real y schema documentado

## goal

Que `delendai.config.json` acepte comentarios de verdad en TODO el runtime (hoy quedan lectores con `JSON.parse` que rompen con un fichero comentado), que el editor no los marque como error de sintaxis, y que el JSON Schema documente cada propiedad y cada valor posible de enum para que un usuario nuevo entienda que hace cada cosa sin tener que abrir la documentacion.

## why

1. El contrato ya dice que el fichero es JSONC (`packages/core/src/lib/config/jsonc-document.ts`: "The configuration file is JSONC by contract"), pero siete lectores siguen usando `JSON.parse` sobre esa ruta: un config comentado revienta en `setup`, en la politica de desarrollo, en `init --existing`, en las transiciones de configuracion, en `doctor`, en `config-file.service` y en el setup de GitHub de issues.
2. Aunque el runtime lo acepte, VS Code trata `.json` como JSON estricto: cada `//` que el usuario escriba sale marcado como error. El propio `init` escribe comentarios en el fichero, asi que el usuario recibe un fichero que su editor le dice que esta roto.
3. El schema se genera desde el Zod `CONFIG_FILE_SCHEMA` y hoy documenta 25 de 58 bloques de propiedades: la mayoria de las propiedades (y casi todos los enums) no dicen que hacen ni que significa cada valor. El autocomplete sugiere valores sin explicar nada, que es justo la complaint de quien no conoce el proyecto.

## non-goals

- No renombrar el fichero a `delendai.config.jsonc`: `delendai.config.json` es contrato publico (arranque, host hints, documentacion y cientos de tests lo nombran).
- No cambiar la semantica de ningun valor de configuracion existente: esto es solo legibilidad y robustez de parseo.
- No escribir un parser JSONC propio: `jsonc-parser` ya es la dependencia canonica y `parseJsonc` ya lo envuelve.
- No documentar las claves dinamicas de `plugins.*` una por una: esas las documenta el propio plugin en su manifiesto.

## slices

- global_gate: lint

### S1 — Los siete lectores de delendai.config.json dejan de usar JSON.parse
- **Status**: pending
- **Files**: `packages/core/src/lib/cli/setup-subcommand.ts`, `packages/core/src/lib/development-policy/project-branches.ts`, `packages/core/src/lib/bootstrap/init-config-tool.ts`, `packages/core/src/lib/workspace-migration/config-transitions.service.ts`, `packages/cli/src/commands/groups/doctor.ts`, `packages/cli/src/lib/config-file.service.ts`, `plugins/issues/src/lib/github-setup.ts`, `tools/scripts/lint/config-jsonc-only.script.ts`
- **Gate**: lint
- acceptance:
  - "Ninguno de los siete lectores usa `JSON.parse` sobre `delendai.config.json`: todos pasan por `parseJsonc` (o por un helper que lo use)."
  - "Un `delendai.config.json` comentado devuelve exactamente los mismos valores que el mismo fichero sin comentarios en los siete sitios migrados."
  - "Un gate nuevo (`bun tools/scripts/lint/config-jsonc-only.script.ts`) falla si vuelve a aparecer un `JSON.parse` sobre la ruta del config, y pasa sobre el arbol actual."

### S2 — Cada propiedad y cada valor de enum del schema queda documentado
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/plugins/config-schema-docs.ts`, `packages/core/src/public/index.ts`, `tools/scripts/types/generate-config-schema.script.ts`, `packages/core/schema/delendai.config.schema.json`, `packages/core/tests/config-schema.spec.ts`
- **Gate**: lint
- acceptance:
  - "Toda propiedad del schema emitido tiene una `description` no vacia que dice para que sirve."
  - "Todo enum tiene `enumDescriptions` con una entrada por cada valor de su `enum`, explicando que aplica a cada valor."
  - "El schema commiteado sigue coincidiendo byte a byte con `bun run config:schema`."
  - "Un test falla si una propiedad nueva aparece en el Zod sin su entrada de documentacion."

### S3 — init escribe comentarios que explican cada bloque de nivel superior
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/cli/src/lib/init/init-config-comments.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/init-render.service.spec.ts`
- **Gate**: lint
- acceptance:
  - "El `delendai.config.json` que escribe `init` lleva un comentario sobre cada bloque de nivel superior (`cacheDir`, `docsDir`, `surfaceMode`, `managedSurface`, `development`, `plugins`) que explique para que sirve."
  - "Un segundo `init` no duplica los comentarios que ya estaban."
  - "`delendai config set` conserva los comentarios del fichero."

### S4 — El editor trata delendai.config.json como jsonc
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `packages/cli/src/lib/init/init-vscode-settings.ts`, `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/cli/src/lib/init/init-default.command.spec.ts`, `.vscode/settings.json`
- **Gate**: lint
- acceptance:
  - "Tras `init`, el `.vscode/settings.json` del proyecto asocia `delendai.config.json` al lenguaje `jsonc`, de modo que los comentarios no se marcan como error."
  - "Si ya existe un `.vscode/settings.json`, se fusiona y no se pierde ninguna clave previa."
  - "El `.vscode/settings.json` de este repositorio hace lo mismo para el repo."

## acceptance

- Ninguno de los siete lectores usa `JSON.parse` sobre `delendai.config.json`: todos pasan por `parseJsonc` (o por un helper que lo use).
- Un `delendai.config.json` comentado devuelve exactamente los mismos valores que el mismo fichero sin comentarios en los siete sitios migrados.
- Un gate nuevo (`bun tools/scripts/lint/config-jsonc-only.script.ts`) falla si vuelve a aparecer un `JSON.parse` sobre la ruta del config, y pasa sobre el arbol actual.
- Toda propiedad del schema emitido tiene una `description` no vacia que dice para que sirve.
- Todo enum tiene `enumDescriptions` con una entrada por cada valor de su `enum`, explicando que aplica a cada valor.
- El schema commiteado sigue coincidiendo byte a byte con `bun run config:schema`.
- Un test falla si una propiedad nueva aparece en el Zod sin su entrada de documentacion.
- El `delendai.config.json` que escribe `init` lleva un comentario sobre cada bloque de nivel superior (`cacheDir`, `docsDir`, `surfaceMode`, `managedSurface`, `development`, `plugins`) que explique para que sirve.
- Un segundo `init` no duplica los comentarios que ya estaban.
- `delendai config set` conserva los comentarios del fichero.
- Tras `init`, el `.vscode/settings.json` del proyecto asocia `delendai.config.json` al lenguaje `jsonc`, de modo que los comentarios no se marcan como error.
- Si ya existe un `.vscode/settings.json`, se fusiona y no se pierde ninguna clave previa.
- El `.vscode/settings.json` de este repositorio hace lo mismo para el repo.
