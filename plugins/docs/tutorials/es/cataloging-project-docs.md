---
title: "Catalogación de documentos del proyecto"
plugin: docs
audience: cualquier agente que necesite encontrar un documento por tema
order: 1
lang: es
---

# Catalogación de documentos del proyecto

El plugin `docs` responde a una pregunta pequeña pero frecuente: "¿qué documentos tiene este proyecto y cuál de ellos estoy buscando?". En lugar de hacer grep, el agente le pregunta al plugin. Esta guía muestra cómo activarlo, listarlo y leerlo.

## 0. El modelo mental

Un **documento** es cualquier archivo `.md` bajo las rutas configuradas en `roots`. El plugin los enumera una vez, extrae el título (de la primera cabecera `#` o del frontmatter `title:`) y ofrece un índice de bajo consumo de tokens. El cuerpo solo se recupera bajo demanda.

La configuración se almacena en `mcp-vertex.config.json`:

```jsonc
{
  "plugins": {
    "docs": {
      "options": {
        "roots": ["docs", "README.md", "CHANGELOG.md", "AGENTS.md"]
      }
    }
  }
}
```

`roots` es un array de rutas (archivos o directorios). Los directorios se recorren recursivamente. **Se rechazan las rutas fuera del espacio de trabajo** — no hay recorrido `..`.

## 1. Listar (índice de bajo token)

```json
{ "tool": "docs_list", "args": {} }
```

Respuesta (truncada):

```json
{
  "count": 18,
  "truncated": false,
  "docs": [
    { "path": "README.md", "title": "@mcp-vertex/core" },
    { "path": "docs/ARCHITECTURE.md", "title": "Architecture" },
    { "path": "docs/proposals/l100-…md", "title": "l100 — Web: i18n real…" },
    { "path": "CHANGELOG.md", "title": "Changelog" }
  ]
}
```

La lista se ordena por ruta. Pasa `roots` para limitar la lista a un subconjunto (p. ej. solo `["docs/proposals"]`):

```json
{
  "tool": "docs_list",
  "args": { "roots": ["docs/proposals"] }
}
```

## 2. Leer un documento

```json
{
  "tool": "docs_read",
  "args": { "path": "docs/ARCHITECTURE.md" }
}
```

Respuesta:

```json
{
  "path": "docs/ARCHITECTURE.md",
  "title": "Architecture",
  "content": "# Architecture\n\n…full body…",
  "truncated": false,
  "found": true
}
```

El campo `content` tiene un límite de 256 KiB. Si el documento es más grande, se devuelve `truncated: true` y el contenido corresponderá a los primeros 256 KiB. Si la ruta no coincide con ningún documento bajo las raíces configuradas, se devuelve `found: false`.

## 3. Por qué dos herramientas y no una

La herramienta `list` es muy económica (unos cientos de bytes por documento, 18 documentos ≈ 4 KiB). La herramienta `read` es costosa (potencialmente megabytes por documento). Separarlas permite que el agente ejecute `list` primero, y luego lea (`read`) únicamente los documentos que parezcan relevantes — ahorrando tokens en cada paso del proceso de descubrimiento.

## 4. Contención de rutas (seguridad)

`docs_read` resuelve la ruta utilizando `resolveWorkspaceContained` — se rechazan las rutas absolutas, el recorrido con `..` y los enlaces simbólicos que apunten fuera del espacio de trabajo. La respuesta `found: false` es la señal del agente de que la ruta fue rechazada; el plugin no distingue entre "no encontrado" y "fuera del workspace" a propósito (para evitar filtrar la estructura del sistema de archivos).

## Errores comunes

- **La raíz no existe**: `docs_list` devuelve `{ count: 0, truncated: false, docs: [] }`. El plugin no muestra advertencias.
- **Documento aún no commiteado**: se siguen sirviendo los archivos no rastreados (el plugin lee directamente del sistema de archivos, no de git). La ruta (`path`) devuelta es relativa al espacio de trabajo.
- **Falla la inferencia del título**: si la primera cabecera no es `# ` (sin espacio o nivel incorrecto) y no hay `title:` en el frontmatter, el plugin utiliza el nombre base del archivo (p. ej. `CHANGELOG.md` → `CHANGELOG.md`). Vuelve a ejecutar la herramienta después de corregir la cabecera.

## Siguiente paso

- [Cómo `docs_list` se integra con `memory_recall` para "qué guardé en la última sesión + dónde estaba documentado?"](#)
- [Curar un índice de conocimiento con el plugin `knowledge`](#)
