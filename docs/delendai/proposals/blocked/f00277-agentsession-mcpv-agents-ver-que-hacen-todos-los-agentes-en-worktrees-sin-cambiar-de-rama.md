---
id: f00277
title: "`AgentSession` + `delendai agents`: ver qué hacen todos los agentes en worktrees sin cambiar de rama"
kind: feat
status: blocked
type: proposal
track: trust
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-G02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, f00278, f00274]
---

# f00277 — `AgentSession` + `delendai agents`: ver qué hacen todos los agentes en worktrees sin cambiar de rama

## Goal

Dar a `AgentSession` estatus de entidad de primera clase —
`{ id, agent, proposal, worktree, branch, baseCommit, currentCommit,
status, lastActivity, modifiedFiles, cost }`— derivada por lectura de
lo que ya existe (git worktrees, locks de fichero, el frontmatter de
proposals), y exponerla como `delendai agents`: una proyección legible del
estado de todos los agentes activos sin cambiar de checkout.

## why

**El dolor, en palabras del autor.** *"Cuando varios agentes trabajan
en worktrees es imposible saber si lo que están haciendo es lo que
queremos de verdad, y no voy a estar cambiando de ramas."*

**Verificación de la premisa.** Confirmado con `grep -rln
"AgentSession\|WorkIntent\|ProjectProfile" --include="*.ts" .`: ningún
resultado en código de producción — es territorio limpio, no hay
implementación parcial que este proposal deba reconciliar. También
confirmado que la infraestructura de base SÍ existe:
`agentWorktree`/`agent-branch-naming` aparecen en
`plugins/proposals/src/lib/tools/agent-worktree.tool.ts` y en el motor
de locks (`agent-lock-engine.ts`), y git permite inspeccionar el
estado de otro worktree (rama, commit, diff) sin tocar el checkout
propio — la funcionalidad de lectura de bajo nivel ya está disponible,
sólo falta la proyección agregada.

**Por qué es un problema.** Un `diff` no responde la pregunta que
importa, que es de *alineación*: ¿por qué el agente que iba a arreglar
el ciclo de vida lazy ha tocado `package.json` y
`plugins/proposals/`? Sin una entidad que agregue "qué worktree, qué
rama, qué proposal, qué ficheros tocados hasta ahora", la supervisión
recae enteramente en la cabeza del autor cambiando de rama a mano —
justo lo que dice no querer hacer.

## why this design

Se separa `AgentSession` (esta propuesta, control plane de lectura) de
`WorkIntent` (`f00278`, el contrato de "qué se pidió" y los
completion gates) porque son capas distintas: `AgentSession` es pura
lectura derivada de git + locks + proposals — no requiere que ningún
agente coopere activamente, funciona incluso para un agente que no
declaró intención. `WorkIntent` sí requiere que el agente declare algo
por adelantado. Construir primero la capa de lectura (esta propuesta)
permite tener valor —ver qué está pasando— sin esperar a que todos los
agentes adopten el contrato de intención, que es un cambio de
comportamiento más invasivo.

Se descarta un daemon persistente que vigile los worktrees en segundo
plano como primer incremento: `delendai agents` puede construirse como un
comando de lectura bajo demanda (invoca `git worktree list`, lee el
lock store, lee el frontmatter de proposals activas, compone la vista)
sin proceso en segundo plano — más simple, sin nuevo modo de fallo, y
suficiente para responder la pregunta del autor.

## non-goals

- El supervisor barato con LLM que la auditoría describe ("el agente
  arreglaba lifecycle lazy pero tocó proposals y package.json, ¿es
  coherente?") — depende de que exista `WorkIntent` (`f00278`) para
  tener algo contra qué comparar; esta propuesta sólo expone los datos
  crudos (ficheros modificados, worktree, proposal) sin juicio de
  alineación.
- La vista de VS Code (`AUD-F03`/`f00274`) que consumiría esta
  proyección — se construye después, cuando `delendai agents` ya emite
  datos estables.
- Persistir `AgentSession` en disco como estado propio — en este
  primer incremento es una proyección calculada en cada invocación a
  partir de fuentes que ya son la fuente de verdad (git, locks,
  proposals); no se introduce una cuarta fuente de verdad a mantener
  sincronizada.

## architecture

```
delendai agents
      │
      ├─ git worktree list --porcelain   → { worktree, branch, HEAD }
      ├─ agent-lock-engine (locks activos) → { proposalId, sliceId, agentId }
      ├─ proposals activas (frontmatter)   → { proposalId, title, status }
      └─ git diff <baseCommit>..<currentCommit> --stat (por worktree)
                        │
                        ▼
      AgentSession[] = join de las cuatro fuentes por agentId/worktree
                        │
                        ▼
      render tabla:
      agent-7   #183 External MCP teardown   12 files   last activity 3m ago
      agent-9   #186 Adaptive eviction         3 files   last activity 40s ago
```

## slices

### S1 — `AgentSession` derivada por lectura (sin persistencia propia)

- **Status**: pending
- **Files**: (pendiente de implementación)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/agents/derive-agent-sessions.spec.ts`
- review-state: changes_requested
- review-implementer: agent-session-f00277-s1-repair
- review-reviewer: copilot-reviewer-f00277-s1
- review-log: requested_changes by copilot-reviewer-f00277-s1 — Tests focalizados y typecheck de core pasan, pero S1 queda incompleto como entidad de primera clase: la nueva API sólo existe bajo src/lib y no se exporta en la superficie estable del paquete. packages/core/src/public/index.ts:1-3 declara que esa barrel es la ONLY stable import surface, y packages/core/package.json expone ./public como punto de entrada público. Sin reexportar deriveAgentSessions y los tipos IAgentSession* desde packages/core/src/public/index.ts, el slice no queda consumible por clientes como packages/cli que importan desde @delendai/core/public. Solicito añadir esa integración pública o justificar contractualmente por qué S1 debe seguir siendo interna.
### S2 — `delendai agents`: comando CLI que renderiza la proyección

- **Status**: pending
- **Files**:
    - `packages/cli/src/commands/groups/agents.ts` (nuevo)
    - `packages/cli/src/commands/registry.ts` (registrar el nuevo
      grupo — confirmar el patrón exacto de registro leyendo cómo se
      registra `doctorCommands`)
    - `packages/cli/src/commands/groups/agents.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/cli/src/commands/groups/agents.spec.ts`

### S3 — Coste estimado por sesión (bytes de superficie activada, tokens gastados)

- **Status**: pending
- **Files**: (pendiente de implementación)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/agents/agent-session-cost.spec.ts`

## dependency graph

`f00278` (WorkIntent + completion gates) se construye encima de la
entidad `AgentSession` que S1 define — el campo `intent`/`status`
(`ALIGNED`/`DRIFTED`) que describe la auditoría se añade en `f00278`,
no aquí. `f00274` (activación de VS Code) puede consumir esta
proyección una vez exista, pero no depende de ella para su propio
alcance. Dentro de esta propuesta: S1 no depende de nada; S2 depende
de S1; S3 depende de S1 y es independiente de S2 (puede implementarse
en paralelo, ambos leen de S1).

## acceptance

- Con dos o más git worktrees activos con cambios distintos, `delendai
  agents` lista cada uno con su proposal asociada (si tiene lock
  activo), rama, y conteo de ficheros modificados — sin requerir
  `git checkout` a ninguno de ellos.
- El comando funciona ejecutado desde el worktree principal, leyendo
  el estado de los demás.
- Responde *"¿qué están haciendo mis tres agentes?"* en una sola
  invocación, sin abrir ningún diff manualmente.

## risks and mitigations

- **Riesgo: leer el estado de un worktree ajeno mientras un agente
  escribe activamente puede capturar un estado a medio commit.**
  Mitigación: S1 usa sólo comandos git de lectura pura
  (`worktree list`, `diff --stat` contra el `HEAD` actual del
  worktree, nunca `checkout`/`merge`) — el peor caso es una lectura
  ligeramente desactualizada, nunca una escritura concurrente.
- **Riesgo: el coste de S3 requiere parsear logs de cada worktree, que
  pueden no existir o estar en un formato distinto si el worktree usa
  una versión antigua del código.** Mitigación: el campo `cost` es
  `optional` en la interfaz de S1; su ausencia no rompe el resto de la
  proyección — degradación elegante, no fallo total.

## notes

Esta propuesta es la mitad "control plane" del dolor de `AUD-G02`; la
mitad "qué se pidió vs. qué se está haciendo" es `f00278`. Se
implementan en ese orden porque la proyección de lectura tiene valor
inmediato por sí sola (responde ya "qué están tocando mis agentes"),
mientras que la comparación de alineación necesita que `WorkIntent`
exista primero.
