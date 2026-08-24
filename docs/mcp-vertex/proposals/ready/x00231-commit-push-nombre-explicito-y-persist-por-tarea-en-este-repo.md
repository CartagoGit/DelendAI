---
id: x00231
title: "Commit+push explícito en nombre del autor y persist por tarea en este repo"
kind: fix
status: ready
type: proposal
track: plugins
date: 2026-08-24
---

# x00231 — Commit+push explícito en nombre del autor y persist por tarea en este repo

## Goal

Que **este repo** firme cada commit de agente explícitamente en nombre del autor (Cartago) de forma portable entre máquinas, y que el plan de `auto_work` ordene commit+push al terminar cada tarea respetando la política de ramas de este repo (`agentWorktree: false` → commit/push directo sobre `develop`, nunca `agent/*`).

## why

x00212 habilitó las write tools del plugin git y declaró `commitAuthor: { "mode": "git" }`. Eso cubre la máquina actual, pero es implícito y depende del `git config` del entorno donde corre el agente: en sandboxes con identidad de agente (`copilot-minimax-m3 <copilot@MiniMax>`, `GitHub Copilot <copilot@anthropic.com>`, …) los commits salen a nombre del agente, no del autor. El historial de este repo ya contiene commits con esos autores (jun–ago 2026), lo que demuestra que `mode: "git"` no basta.

Además, el persist de `auto_work` sigue en `none` (default), así que el plan no ordena commit+push por tarea. Y aunque se activara, la guía hardcodea `pushTarget: "origin agent/<branch>"` y un paso `agent_worktree create` incondicional — que contradicen la invariante de este repo (`agentWorktree: false`, sin ramas `agent/*`). La guía debe respetar la política de ramas configurada.

## non-goals

- No tocar la política commit-author del core (f00082: los 4 modos son correctos; aquí solo se elige `named`).
- No crear un tool nuevo para el persist: `maybePersistAfterSlice` sigue siendo el helper del orquestador y las write tools del plugin git (`_commit`/`_push`) siguen siendo el mecanismo concreto que el agente usa.
- No enumerar hardcoded plugins/tools en archivos de host.

## Slices

### S1 — Config de este repo: commitAuthor explícito + persist commit-and-push
- **Status**: pending
- **Files**: `mcp-vertex.config.json`
- **Gate**: none
- acceptance:
  - "`commitAuthor` declara `mode: "named"` con `humanName: "Cartago"` y `humanEmail` del autor, portables entre máquinas."
  - "`plugins.proposals.persist` declara `mode: "commit-and-push"` con `pushTarget: "origin develop"`."

### S2 — Guía de persist de `auto_work` aware de la política de ramas
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "Con `agentWorktree` activo, el plan mantiene el paso `agent_worktree create` y el `pushTarget` `origin agent/<branch>` (o el configurado)."
  - "Con `agentWorktree` desactivado (este repo), el plan ordena commit+push directo sobre `develop` y NO emite el paso `agent_worktree create`."
  - "`pushTarget` configurado en `persist.pushTarget` se usa en la guía en vez del hardcodeado `origin agent/<branch>`."

## acceptance

- La config fija `commitAuthor` en modo `named` con el nombre/email del autor.
- La config fija `plugins.proposals.persist` en `commit-and-push` hacia `develop`.
- El plan de `auto_work` respeta la política de ramas: worktree → rama por agente; sin worktree → `develop` directo.
- `bun run validate` verde.
