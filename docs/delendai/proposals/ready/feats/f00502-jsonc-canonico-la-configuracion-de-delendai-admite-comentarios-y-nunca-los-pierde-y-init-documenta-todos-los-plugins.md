---
id: f00502
title: "JSONC canónico: la configuración de delendai admite comentarios y nunca los pierde, y `init` documenta todos los plugins"
kind: feat
status: ready
type: proposal
track: config-dx
date: 2026-09-04
---

# f00502 — JSONC canónico: la configuración de delendai admite comentarios y nunca los pierde, y `init` documenta todos los plugins

## Goal

`delendai.config.json` pasa a ser JSONC de forma canónica: admite comentarios siempre, y toda escritura automática (init, config sync, migración, activar/desactivar plugin, cambio de preset) los preserva. Además, el fichero generado por `delendai init` lista TODOS los plugins conocidos —activados o no— cada uno con un comentario que explica qué hace y dónde consultar sus opciones, generado desde metadata canónica del manifest y nunca escrito a mano en una plantilla.

El objetivo de producto: el propio fichero de configuración basta para descubrir qué existe, qué está activo y dónde configurarlo, sin buscar documentación externa.

## why

Verificado en `70c3f945b`: `packages/core/src/lib/plugins/load-config-file.ts` usa `JSON.parse` en dos puntos (líneas 381 y 410). No hay soporte de JSONC en ninguna capa, así que hoy un comentario del usuario en su configuración es un error de parseo, y cualquier reescritura automática con `JSON.stringify` lo destruiría en silencio.

En paralelo, `configDocs` no existe en ningún manifest de plugin (0 ocurrencias en `packages/` y `plugins/`), de modo que el `init` comentado no tiene fuente de verdad de la que generar esos comentarios. Escribirlos a mano en una plantilla crearía justo la duplicación que el rail de clean code prohíbe: la web, los docs y el schema deben consumir la misma metadata.

## non-goals

- No renombrar `delendai.config.json` a `.jsonc` — el nombre se mantiene por compatibilidad; lo que cambia es el parser.
- No convertir el preset en la lista de plugins visibles: el preset decide `enabled` y defaults, nunca qué plugins aparecen en el fichero.
- No borrar automáticamente un plugin que desaparece del catálogo — se marca como deprecated/unavailable y se ofrece migración.
- No reordenar destructivamente el documento del usuario ni descartar claves desconocidas.

## Slices

- global_gate: type

### S1 — Documento JSONC: parseo y edición preservando comentarios
- **Status**: done
- **Files**: `packages/core/src/lib/config/jsonc-document.ts`, `packages/core/tests/src/lib/config/jsonc-document.spec.ts`
- **Gate**: type
- acceptance:
  - "Parsea JSONC (comentarios de línea y de bloque, comas colgantes) devolviendo el valor y el AST."
  - "Una edición puntual de una clave preserva comentarios, claves desconocidas, orden y formato manual del resto del documento."
  - "Round-trip sin cambios es byte-idéntico al original."
  - "La API es la única vía de escritura: no expone `JSON.stringify` sobre el documento completo."
- review-state: done
- review-implementer: claude-opus-5-f00502
- review-reviewer: reviewer-opus-5-peer
- review-log: approved by reviewer-opus-5-peer — Verificado contra el contrato. parseJsonc cubre comentarios de línea/bloque y comas colgantes devolviendo valor + errores posicionados; applyJsoncEdits usa modify/applyEdits de jsonc-parser preservando comentarios, claves desconocidas, orden e indentación detectada del propio documento; hay test explícito de round-trip byte-idéntico con lista de ediciones vacía; la API no expone JSON.stringify sobre el documento completo. Gate `type` (tsc --noEmit en packages/core) exit 0; jsonc-document.spec.ts 15/15.
### S2 — El loader del core deja de usar JSON.parse
- **Status**: done
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/tests/src/lib/plugins/load-config-file.spec.ts`
- **Gate**: type
- acceptance:
  - "Una configuración con comentarios carga correctamente en lugar de fallar el parseo."
  - "Los dos puntos de `JSON.parse` del cargador pasan por el documento JSONC."
  - "Un error de sintaxis sigue produciendo un diagnóstico con línea y columna."
- review-state: done
- review-implementer: claude-opus-5-f00502
- review-reviewer: reviewer-opus-5-peer
- review-log: approved by reviewer-opus-5-peer — Los dos JSON.parse del cargador (líneas 381 y 410 en el estado citado por la propuesta) pasan ahora por parseJsonc; grep confirma cero JSON.parse en load-config-file.ts. Tests cubren las tres aceptaciones: config con comentarios carga sin diagnósticos, y un error de sintaxis sigue reportando línea y columna. Gate `type` (tsc --noEmit, packages/core) exit 0; load-config-file.spec.ts 17/17.
### S3 — Metadata `configDocs` en el contrato de manifest de plugin
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/plugin-manifest.interface.ts`, `packages/core/src/lib/manifest/define-plugin-manifest.ts`, `packages/core/src/lib/plugins/plugin-config-docs.ts`
- **Gate**: type
- acceptance:
  - "El manifest declara `configDocs` como sobrescrituras opcionales de resumen y ruta de documentación; NO declara enablement."
  - "El campo se valida en `define-plugin-manifest` como el resto del manifest."
  - "Hay una sola fuente de verdad por plugin: el resumen sale del manifest y la ruta de docs de la convención, y `configDocs` sólo interviene cuando un plugin necesita apartarse de ellas."

> **Enmienda tras la revisión de reviewer-opus-5-peer (2026-09-04).** La
> redacción original pedía un `defaultEnabled` en `configDocs` y tres
> consumidores (init, docs, schema) leyendo el mismo campo. Ambas cosas
> chocaban con la propia propuesta y se corrigen aquí en vez de
> implementarse a la fuerza.
>
> `defaultEnabled` contradecía el non-goal "el preset decide `enabled`":
> si el manifest declarase su propio enablement por defecto habría dos
> autoridades sobre el mismo bit y el preset dejaría de ser el que manda.
> El campo se retira de la aceptación.
>
> Los tres consumidores eran la forma equivocada de perseguir la fuente
> única. Los 56 manifests ya declaran su `summary` y las 56 páginas
> generadas ya viven en una ruta convencional; añadir un campo que
> repitiese ambas cosas habría CREADO la duplicación que la aceptación
> quería evitar. `resolvePluginConfigDocs` deriva de lo que ya existe y
> `configDocs` queda como sobrescritura para el plugin que la necesite,
> que es la misma garantía con un campo menos que mantener sincronizado.
- review-state: in_review
- review-implementer: claude-opus-5
- review-log: requested_changes by reviewer-opus-5-peer — Dos aceptaciones sin cumplir. (1) "El manifest declara configDocs con resumen, ruta de documentación y defaultEnabled": IPluginConfigDocs solo declara `summary` y `docs`; `defaultEnabled` está ausente y el propio comentario del código dice que se omitió a propósito ("Enablement is deliberately absent"). Es una decisión defendible —choca con el non-goal "el preset decide enabled"— pero la aceptación es la aceptación: o se implementa el campo, o se enmienda el texto de la aceptación en la propuesta y se re-somete. (2) "Es una sola fuente de verdad: init, docs generados y schema la consumen": solo init la consume (manifest -> from-manifests.script.ts -> registro generado -> renderPluginConfigComment). No hay consumidor en la generación de docs ni en el schema de configuración; grep de `configDocs` fuera de core/tools/tests da cero. Falta cablear esos dos consumidores o justificar su exclusión en la propuesta. Nota menor: la implementación introduce `packages/core/src/lib/plugins/plugin-config-docs.ts`, fuera de los **Files** declarados de la slice; conviene declararlo.
### S4 — `init` emite todos los plugins con su comentario generado
- **Status**: pending
- **DependsOn**: [S2, S3]
- **Files**: `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/config-merge-edits.ts`, `packages/cli/src/lib/config-file.service.ts`, `packages/cli/src/commands/init/init.command.ts`
- **Gate**: type
- acceptance:
  - "`delendai init --preset=minimal` produce un fichero donde aparecen todos los plugins conocidos; los que el preset no activa quedan con `enabled: false` y un comentario que lo dice."
  - "Cada entrada lleva el resumen y el enlace a opciones tomados de `configDocs`, no de una plantilla."
  - "Ejecutar init dos veces es idempotente y no duplica comentarios."
  - "Añadir un plugin nuevo al catálogo lo añade al fichero sin borrar comentarios ni personalización existente."
- review-state: in_review
- review-implementer: claude-opus-5
- review-log: requested_changes by reviewer-opus-5-peer — Entrega parcial confirmada por lectura del código, no solo por la declaración del implementador. En `writeDelendaiConfig` (packages/cli/src/lib/init/init-writers.factory.ts) solo la rama de creación/`--force` escribe el texto JSONC verbatim vía `writeConfigTextSafely`; la rama de merge sobre un config existente parsea con `parseJsonc`, pasa por `mergeDerivedConfig` y vuelve a `writeConfigSafely`, es decir por el camino de objeto, que destruye los comentarios del usuario. Eso incumple la cuarta aceptación: "Añadir un plugin nuevo al catálogo lo añade al fichero sin borrar comentarios ni personalización existente". El propio comentario del código lo reconoce ("preserving an EXISTING user's comments across a merge is config-sync work, not init's"). Para cerrar: la rama de merge debe expresarse como `applyJsoncEdits` sobre el texto existente (S1 ya da la primitiva, incluido `leadingComment` solo al crear el miembro, que es justo lo que hace falta para no duplicar comentarios en la segunda ejecución), o bien mover explícitamente esa aceptación a otra slice de config-sync en la propuesta. Nota menor: los **Files** declarados (`init-writers.factory.ts`, `init-catalog.constant.ts`) no coinciden con lo entregado — `init-catalog.constant.ts` es el catálogo de agentes y no se tocó; el trabajo real está en `init-render.service.ts`, `init.command.ts` y `config-file.service.ts`.
## acceptance

- Parsea JSONC (comentarios de línea y de bloque, comas colgantes) devolviendo el valor y el AST.
- Una edición puntual de una clave preserva comentarios, claves desconocidas, orden y formato manual del resto del documento.
- Round-trip sin cambios es byte-idéntico al original.
- La API es la única vía de escritura: no expone `JSON.stringify` sobre el documento completo.
- Una configuración con comentarios carga correctamente en lugar de fallar el parseo.
- Los dos puntos de `JSON.parse` del cargador pasan por el documento JSONC.
- Un error de sintaxis sigue produciendo un diagnóstico con línea y columna.
- El manifest declara `configDocs` con resumen, ruta de documentación y `defaultEnabled`.
- El campo se valida en `define-plugin-manifest` como el resto del manifest.
- Es una sola fuente de verdad: init, docs generados y schema la consumen; ninguno redefine el texto.
- `delendai init --preset=minimal` produce un fichero donde aparecen todos los plugins conocidos; los que el preset no activa quedan con `enabled: false` y un comentario que lo dice.
- Cada entrada lleva el resumen y el enlace a opciones tomados de `configDocs`, no de una plantilla.
- Ejecutar init dos veces es idempotente y no duplica comentarios.
- Añadir un plugin nuevo al catálogo lo añade al fichero sin borrar comentarios ni personalización existente.
