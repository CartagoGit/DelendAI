---
title: "Guardar y recuperar notas de memoria"
plugin: memory
audience: cualquier agente que necesite continuidad entre sesiones
order: 1
lang: es
---

# Guardar y recuperar notas de memoria

Esta guía muestra las cuatro herramientas `memory_*` en acción. Las notas son pequeños registros JSON bajo `.cache/mcp-vertex/memory/notes.json`, lo suficientemente pequeños como para volcarse por completo, indexados por id, y recuperables por etiqueta (tag) o consulta de texto completo.

## 0. El modelo mental

Una **nota** es `{ id, title, body, tags, createdAt, updatedAt }`. Los títulos son únicos (insensibles a mayúsculas/minúsculas) — `memory_save` realiza un upsert por título. No hay esquema para `body`; trátalo como un campo de texto libre corto. Los secretos se redactan automáticamente mediante `redactSecrets` antes de que la nota se guarde (ver `packages/core/src/lib/shared/redact.ts`).

## 1. Guardar una nota

```json
{
  "tool": "memory_save",
  "args": {
    "title": "monorepo publish order",
    "body": "core first, then plugins in lockstep. derive-version.ts reads Conventional Commits since the last vX.Y.Z tag.",
    "tags": ["release", "monorepo"]
  }
}
```

Respuesta: `{ id: "<uuid>", createdAt: "..." }`. Save devuelve el id para que puedas usar `forget` más tarde si es necesario.

## 2. Recuperar por consulta (recall)

```json
{
  "tool": "memory_recall",
  "args": {
    "query": "publish order",
    "limit": 5
  }
}
```

Devuelve hasta `limit` notas que coincidan con la consulta (coincidencia de subcadena en título + cuerpo, ordenadas por relevancia/reciente). Usa `tags` en lugar de (o junto con) `query` para limitar los resultados:

```json
{
  "tool": "memory_recall",
  "args": { "tags": ["release"], "limit": 10 }
}
```

## 3. Listar de forma económica

`memory_list` devuelve solo `{ id, title, tags }` — el índice. Úsalo cuando no quieras recuperar los cuerpos de las notas todavía:

```json
{ "tool": "memory_list", "args": { "limit": 50 } }
```

## 4. Olvidar

```json
{ "tool": "memory_forget", "args": { "id": "<uuid>" } }
```

`memory_forget` es un borrado definitivo (no hay papelera ni archivado). El id desaparece; el título queda libre para un futuro `memory_save`.

## Errores comunes

- **Secretos en `body`**: aunque el plugin redacta al guardar, no pegues tokens sin procesar o valores de estilo `.env` — la redacción es heurística, no perfecta.
- **Colisiones de títulos**: `memory_save` realiza un upsert por título. Si dos agentes guardan con el mismo título en paralelo, el segundo escritor sobrescribirá la nota anterior. Usa títulos únicos por sección o por problema.
- **La búsqueda devuelve demasiados resultados**: prefiere `tags` sobre una consulta `query` amplia. Una consulta de `""` devuelve todas las notas ordenadas por fecha, lo cual es útil para ver qué se guardó en la última sesión, pero costoso en un almacén grande.

## Siguiente paso

- [Cómo round_context (proposals) enlaza notas de memoria a propuestas activas](../../proposals/tutorials/es/getting-started.md)
- [Contrato de redacción de secretos](https://github.com/CartagoGit/mcp-vertex/blob/main/packages/core/src/lib/shared/redact.ts)
