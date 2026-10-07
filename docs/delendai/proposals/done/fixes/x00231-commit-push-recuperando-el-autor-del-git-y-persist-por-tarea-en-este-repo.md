---
id: x00231
title: "Commit+push recuperando el autor del git y persist por tarea en este repo"
kind: fix
status: done
type: proposal
track: plugins
date: 2026-08-24
---

# x00231 — Commit+push recuperando el autor del git y persist por tarea en este repo

## Goal

Que **este repo** recupere siempre el autor de cada commit desde el `git config` del repo (no hardcodeado en la config de mcp-vertex) y que el plan de `auto_work` ordene commit+push al terminar cada tarea respetando la política de ramas (`agentWorktree: false` → commit/push directo sobre `develop`, nunca `agent/*`).

## why

x00212 habilitó las write tools del plugin git y declaró `commitAuthor: { "mode": "git" }`, que es el comportamiento correcto: recupera `user.name`/`user.email` del `git config` del repo. El problema no era el modo, sino que en sandboxes con identidad de agente el `git config` era el del agente, no el del autor, así que a veces no recuperaba la identidad correcta. La corrección es fijar el `git config` **local** del repo (`.git/config` `[user]`) a Cartago: en este repo los agentes trabajan en el mismo checkout (`agentWorktree: false`), así que ese config local siempre gana y el modo `git` recupera siempre al autor. No se usa `named` (no hardcodear el nombre en `mcp-vertex.config.json`).

Además, el persist de `auto_work` seguía en `none` (default), así que el plan no ordenaba commit+push por tarea. Y su guía hardcodeaba `pushTarget: "origin agent/<branch>"` y un paso `agent_worktree create` incondicional — que contradicen la invariante de este repo (`agentWorktree: false`, sin ramas `agent/*`). La guía debe respetar la política de ramas configurada.

## non-goals

- No tocar la política commit-author del core (f00082: los 4 modos son correctos; aquí se elige `git`).
- No crear un tool nuevo para el persist: `maybePersistAfterSlice` sigue siendo el helper del orquestador y las write tools del plugin git (`_commit`/`_push`) siguen siendo el mecanismo concreto que el agente usa.
- No enumerar hardcoded plugins/tools en archivos de host.

## Slices

### S1 — Config de este repo: commitAuthor git + git config local fijado + persist commit-and-push
- **Status**: done
- **Files**: `mcp-vertex.config.json`
- **Nota**: este slice también fija el `[user]` del `.git/config` local del repo. No se lista en `Files` porque no es un fichero versionado y no puede existir en un checkout limpio — declararlo ahí hacía fallar `lint:proposal-files-exist` y `lint:proposal-slice-completeness` para siempre.
- **Gate**: none
- acceptance:
  - "`commitAuthor` declara `mode: "git"` (recuperar `user.name`/`user.email` del git config del repo)."
  - "El `git config` local del repo fija `user.name: Cartago` y `user.email: cartago.relaxingcup@gmail.com` para que el modo `git` recupere siempre al autor."
  - "`plugins.proposals.persist` declara `mode: "commit-and-push"` con `pushTarget: "origin develop"`."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Redo. validate verde (a nivel de mi lote).
### S2 — Guía de persist de `auto_work` aware de la política de ramas
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "Con `agentWorktree` activo, el plan mantiene el paso `agent_worktree create` y el `pushTarget` `origin agent/<branch>` (o el configurado)."
  - "Con `agentWorktree` desactivado (este repo), el plan ordena commit+push directo sobre `develop` y NO emite el paso `agent_worktree create`."
  - "`pushTarget` configurado en `persist.pushTarget` se usa en la guía en vez del hardcodeado `origin agent/<branch>`."

## acceptance

- La config fija `commitAuthor` en modo `git` (autor recuperado del git config local del repo).
- El git config local del repo fija la identidad del autor (Cartago).
- La config fija `plugins.proposals.persist` en `commit-and-push` hacia `develop`.
- El plan de `auto_work` respeta la política de ramas: worktree → rama por agente; sin worktree → `develop` directo.
- `bun run validate` verde.
