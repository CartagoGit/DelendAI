---
id: x00232
title: "resume-hint determinista: romper el bucle de re-orientación del orquestador"
kind: fix
status: done
type: proposal
track: plugins+fix
date: 2026-08-24
related:
  - a00085
---

# x00232 — resume-hint determinista: romper el bucle de re-orientación del orquestador

## Goal

Cuando el round-context no tiene señal en vuelo (sin checkpoint abierto, sin chat context, sin locks ni subagentes activos), `buildResumeHint` devuelve `mode: "unknown"` con un motivo no accionable. El orquestador, que recibe ese hint como guía de "resume o next", no tiene camino hacia delante y re-orienta en bucle: reasigna la tarea `orient` a subagentes nuevos que caen a cooldown sin producir señal. El digest persistido de la sesión atascada lo registra literalmente: `resumeHint.mode: "unknown"` con "Sin señal suficiente para decidir resume o next".

Este fix hace el fallback terminal determinista: `mode: "next"` con un motivo accionable que apunta al camino canónico (`auto_work` para reclamar el siguiente slice listo). El round-context siempre entrega una instrucción hacia delante, rompiendo el bucle de re-orientación.

## why

`"unknown"` es honesto pero no accionable. El contrato del resume-hint es decirle al agente qué hacer; cuando no hay señal, la única acción válida es avanzar (reclamar trabajo nuevo), no detenerse sin instrucción. Las otras ramas de `buildResumeHint` ya apuntan siempre hacia delante (resume/next); solo la rama terminal se quedaba en `"unknown"`.

## non-goals

- No eliminar `"unknown"` del tipo ni del schema: los digests ya persistidos (y la retrocompatibilidad de lectura) lo siguen admitiendo. Solo se deja de producir como fallback terminal.
- No tocar el idle-guard de `auto_work` ni el loop-detector: ambos ya existen y son correctos.
- No cambiar la semántica de `resume` (checkpoint abierto / chat context / lock activo).

## Slices

- global_gate: lint

### S1 — Fallback terminal determinista en buildResumeHint
- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/round-context-resume.ts`, `plugins/proposals/tests/src/lib/swarm/round-context-resume.spec.ts`
- **Gate**: lint
- acceptance:
  - "Sin señal (sin checkpoint/chat/locks/agentes) devuelve `mode: 'next'`, no `'unknown'`."
  - "El motivo es accionable y apunta a `auto_work`."
  - "Las ramas resume/next existentes no cambian."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde (a nivel de mi lote).
## acceptance

- `buildResumeHint` sin señal devuelve `mode: 'next'` con motivo accionable.
- Las ramas `resume` (checkpoint abierto, chat context, lock activo) y `next` (checkpoint cerrado) siguen intactas.
- `bun run lint:proposals` exits 0 y los specs de `round-context-resume` pasan.
