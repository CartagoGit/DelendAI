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
- **Status**: pending
- **Files**: `packages/core/src/lib/config/jsonc-document.ts`, `packages/core/tests/src/lib/config/jsonc-document.spec.ts`
- **Gate**: type
- acceptance:
  - "Parsea JSONC (comentarios de línea y de bloque, comas colgantes) devolviendo el valor y el AST."
  - "Una edición puntual de una clave preserva comentarios, claves desconocidas, orden y formato manual del resto del documento."
  - "Round-trip sin cambios es byte-idéntico al original."
  - "La API es la única vía de escritura: no expone `JSON.stringify` sobre el documento completo."
- review-state: in_review
- review-implementer: claude-opus-5-f00502
### S2 — El loader del core deja de usar JSON.parse
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/tests/src/lib/plugins/load-config-file.spec.ts`
- **Gate**: type
- acceptance:
  - "Una configuración con comentarios carga correctamente en lugar de fallar el parseo."
  - "Los dos puntos de `JSON.parse` del cargador pasan por el documento JSONC."
  - "Un error de sintaxis sigue produciendo un diagnóstico con línea y columna."
- review-state: in_review
- review-implementer: claude-opus-5-f00502
### S3 — Metadata `configDocs` en el contrato de manifest de plugin
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/interfaces/plugin-manifest.interface.ts`, `packages/core/src/lib/manifest/define-plugin-manifest.ts`
- **Gate**: type
- acceptance:
  - "El manifest declara `configDocs` con resumen, ruta de documentación y `defaultEnabled`."
  - "El campo se valida en `define-plugin-manifest` como el resto del manifest."
  - "Es una sola fuente de verdad: init, docs generados y schema la consumen; ninguno redefine el texto."
- review-state: in_review
- review-implementer: claude-opus-5-f00502
### S4 — `init` emite todos los plugins con su comentario generado
- **Status**: pending
- **DependsOn**: [S2, S3]
- **Files**: `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/cli/src/lib/init/init-catalog.constant.ts`
- **Gate**: type
- acceptance:
  - "`delendai init --preset=minimal` produce un fichero donde aparecen todos los plugins conocidos; los que el preset no activa quedan con `enabled: false` y un comentario que lo dice."
  - "Cada entrada lleva el resumen y el enlace a opciones tomados de `configDocs`, no de una plantilla."
  - "Ejecutar init dos veces es idempotente y no duplica comentarios."
  - "Añadir un plugin nuevo al catálogo lo añade al fichero sin borrar comentarios ni personalización existente."
- review-state: in_review
- review-implementer: claude-opus-5-f00502
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
