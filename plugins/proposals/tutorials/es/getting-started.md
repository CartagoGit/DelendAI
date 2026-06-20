---
title: Primeros pasos con el plugin proposals
plugin: proposals
audience: orquestador / agente
order: 1
lang: es
---

# Primeros pasos con el plugin proposals

Este recorrido toma un workspace limpio y termina con un ciclo
funcional propuesta → slice → implementación → cierre, con la
disciplina del mutex de archivos intacta. Asume que el plugin
`proposals` está habilitado (consulta `plugins/proposals/README.md`
para el fragmento JSON).

## 0. El modelo mental

Una **propuesta** es un archivo markdown con una cabecera de
frontmatter. Un **slice** es una sección numerada dentro de la
propuesta. El plugin coordina dos escritores por slice: uno
reclama, otro libera. `auto_work` es el punto de entrada de alto
nivel que responde a la pregunta «¿qué hago ahora?».

```
docs/mcp-vertex/proposals/
├─ index.json          (regenerado por sync_proposals)
├─ p<N>-<titulo>.md    (una propuesta)
│  ├─ ## Slices
│  │  ├─ s1-claim
│  │  ├─ s2-implement
│  │  └─ s3-close
```

## 1. Empezar con `auto_work`

`auto_work` devuelve el siguiente slice accionable a lo largo de
todo el almacén de propuestas, con un plan ordenado y compacto.
El plan debe ejecutarse literalmente, sin improvisar pasos.

```json
// Llamada a la tool MCP
{ "tool": "proposals_auto_work", "args": {} }

// Respuesta típica (truncada)
{
  "state": "work",
  "proposalId": "l110",
  "sliceId": "s1-claim",
  "steps": [
    "Abre docs/mcp-vertex/proposals/l110-…md y elige el siguiente slice atómico.",
    "Reclama sus archivos: proposals_agent_lock { action: \"claim\", … }.",
    "Implementa exactamente ese slice — nada fuera de los archivos reclamados.",
    "Valida según el gate del proyecto (consulta get_validation_matrix si existe).",
    "Marca el progreso en la propuesta y luego proposals_sync_proposals.",
    "Libera: proposals_agent_lock { action: \"release\", task_id }."
  ]
}
```

## 2. Reclamar los archivos del slice

La tool `proposals_agent_lock` registra quién es dueño de qué
rutas durante la duración de un slice. Sin un claim, `sync_proposals`
rechazará marcar el slice como hecho.

```json
{
  "tool": "proposals_agent_lock",
  "args": {
    "action": "claim",
    "files": [
      "apps/web/src/components/PluginPage.astro",
      "apps/web/src/data/capabilities.json"
    ]
  }
}
```

La respuesta lleva un `task_id` que debes conservar hasta la
liberación. Dos agentes reclamando el mismo archivo ⇒ conflicto,
sin progreso. El mutex está respaldado por el sistema de archivos
(no es advisory) y sobrevive reinicios del proceso.

## 3. Implementar el slice y luego validar

Edita solo los archivos reclamados. Ejecuta el gate del proyecto:

```bash
bun run validate
```

Si el gate falla, arregla el slice — no amplíes el claim en
silencio.

## 4. Marcar progreso y sincronizar

`sync_proposals` lee los archivos de propuestas, valida su
frontmatter y el plan de slices, y reconstruye `index.json`. Es
barato e idempotente.

```json
{ "tool": "proposals_sync_proposals", "args": {} }
```

## 5. Cerrar el slice

```json
{
  "tool": "proposals_close_slice",
  "args": {
    "proposalId": "l110",
    "sliceId": "s1-claim"
  }
}
```

Esto reescribe el estado del slice a `done` en la propuesta,
elimina el lock y vuelve a sincronizar el índice. Luego llama a
`auto_work` otra vez — devolverá el siguiente slice (o
`state: "idle"` si el almacén está vacío).

## Errores frecuentes

- **Editar archivos fuera del claim**: `sync_proposals` rechaza
  marcar el slice como hecho. Usa un segundo slice con su propio
  claim, o divide la propuesta.
- **Saltarse `sync_proposals`**: el índice queda obsoleto. El
  siguiente agente pide «el siguiente slice» y obtiene el
  incorrecto.
- **Olvidar liberar**: un lock obsoleto bloquea al siguiente
  orquestador hasta `staleMs` (por defecto 30 s). Llama a
  `proposals_agent_lock { action: "gc" }` para limpiarlo.

## Siguiente paso

- [Cómo el plugin agent_worktree aísla agentes concurrentes](#)
- [Modos de persistencia para auto_work (l109)](../../l109-feat-auto-work-persist-modes.md)
- [Round context para trabajo reanudado](#)

> **TRANSLATION PENDING** — This is the EN source copied
> verbatim. A human (or your preferred translation tool) must
> replace the body above with a proper Español
> translation. The `needs-human-review: true` and
> `auto-translated: true` frontmatter flags must be removed
> when the translation is finalised. See
> `scripts/translate-tutorials.sh` for the bootstrap process.
>
> Source: `plugins/proposals/tutorials/en/getting-started.md`

