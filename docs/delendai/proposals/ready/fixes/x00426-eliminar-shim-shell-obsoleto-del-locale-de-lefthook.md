---
id: x00426
title: "Eliminar shim shell obsoleto del locale de lefthook"
kind: fix
status: ready
type: proposal
track: tooling
date: 2026-09-03
---

# x00426 — Eliminar shim shell obsoleto del locale de lefthook

## Goal

Eliminar el shim shell bajo `tools/scripts` y sustituirlo por un entorno
`C.UTF-8` declarativo en cada comando, manteniendo la protección frente a
locales heredados inexistentes y la política TypeScript-only.

## why

`lint:tools` detecta `tools/scripts/hooks/lefthook-rc.sh` como la única
violación. Lefthook no puede ejecutar un módulo TypeScript en la opción `rc`
porque esa opción se carga con `source`; su configuración sí admite `env` por
comando, aplicado antes de iniciar el runner. Esa vía conserva la corrección
del locale externo inválido sin mantener shell bajo `tools/scripts`.

## non-goals

- No modificar los hooks generados dentro de .git/hooks; se regeneran desde lefthook.yml.
- No cambiar las comprobaciones ni los comandos que ejecuta Lefthook.

## Slices

- global_gate: lint

### S1 — Retirar shim locale shell y referencia lefthook
- **Status**: pending
- **Files**: `tools/scripts/hooks/lefthook-rc.sh`, `lefthook.yml`
- **Gate**: lint
- acceptance:
  - "lint:tools termina sin archivos shell bajo tools/ o scripts/."
  - "lefthook.yml no referencia el shim eliminado y conserva el resto de jobs."
  - "todos los comandos reciben LC_ALL y LANG igual a C.UTF-8."

## acceptance

- lint:tools termina sin archivos shell bajo tools/ o scripts/.
- lefthook.yml no referencia el shim eliminado y conserva el resto de jobs.
- Todos los comandos reciben `LC_ALL=C.UTF-8` y `LANG=C.UTF-8` antes de iniciar
  su runner.
