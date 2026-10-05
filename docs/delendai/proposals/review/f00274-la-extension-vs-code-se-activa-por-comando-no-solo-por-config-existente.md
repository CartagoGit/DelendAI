---
id: f00274
title: "La extensión VS Code se activa por comando, no sólo por config existente"
kind: feat
status: review
type: proposal
track: product
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-F03
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, f00280, f00272]
last-transition-id: ffe82d87-405a-4706-bc12-7f21353ff485
last-correlation-id: ffe82d87-405a-4706-bc12-7f21353ff485
last-transition-from: in-progress
---

# f00274 — La extensión VS Code se activa por comando, no sólo por config existente

## Goal

Que la extensión de VS Code esté disponible en la paleta de comandos
en **cualquier** workspace — incluido uno que todavía no adoptó
delendai — en lugar de permanecer inerte hasta que exista
`delendai.config.json`.

## why

**Verificación de la premisa.** Confirmado en
`extensions/vscode/package.json#contributes`:
`activationEvents` es exactamente
`["workspaceContains:**/delendai.config.json"]` — una única entrada.
Hay 34 comandos declarados y sólo 3 propiedades de configuración
(`extensions/vscode/package.json#contributes.configuration.properties`),
consistente con lo que describe la auditoría.

**Por qué es un problema.** El momento en que un usuario decidiría
adoptar delendai es exactamente el momento en que la extensión está
inerte: sin config, VS Code nunca activa la extensión, así que ningún
comando —incluido uno de "adoptar este proyecto"— es alcanzable desde
la paleta. Es un embudo de adopción cerrado sobre sí mismo.

## why this design

La alternativa de activar siempre (`"*"`) se descarta: es el patrón
que VS Code desaconseja explícitamente por coste de arranque en cada
ventana, y no es necesario — sólo se necesita que los comandos de
arranque/adopción sean alcanzables, no que toda la funcionalidad
(vista de árbol, watchers de config) esté activa sin config. Añadir
`onCommand:delendai.adopt` (y los comandos de arranque afines) como
eventos de activación adicionales resuelve el embudo sin pagar el
coste de activación universal: VS Code activa la extensión bajo
demanda, la primera vez que el usuario invoca el comando desde la
paleta, no al abrir la ventana.

## non-goals

- La vista de explicabilidad (confianza, coste, último uso, decisión
  de enrutado) que la auditoría propone como "la siguiente capa de
  valor real" — depende de `f00272`/`f00277` (métricas de superficie
  útil y `AgentSession`) y es una propuesta de seguimiento, no parte
  de este incremento.
- Auditar o reducir los 34 comandos existentes — fuera de alcance;
  esta propuesta sólo cambia CUÁNDO se activa la extensión.
- Construir `delendai adopt`/`adopt_project` en sí — ya existe
  (`packages/core/src/lib/adopt/adopt-project.tool.ts`,
  `packages/cli/src/commands/groups/core.ts#adoptCommand`); esta
  propuesta sólo hace que el comando de VS Code equivalente sea
  alcanzable sin config previa.

## architecture

```
package.json#activationEvents:
    workspaceContains:**/delendai.config.json   (ya existe)
  + onCommand:delendai.adopt                     (nuevo)
  + onCommand:delendai.showAdoptionAssessment     (nuevo, si no existe
                                                      ya un comando equivalente)

extension.ts (activate):
    si no hay config → registrar sólo los comandos de adopción/arranque
    si hay config     → registrar todo (comportamiento actual, sin cambios)
```

## slices

### S1 — Adoption command reachable without a config

- **Status**: review
- **Files**:
    - `extensions/vscode/package.json`
    - `extensions/vscode/src/extension.ts`
    - `extensions/vscode/src/commands/adopt.ts`
    - `extensions/vscode/src/contracts/constants/adopt-command.constant.ts`
    - `extensions/vscode/src/test/extension-activation.spec.ts`
    - `extensions/vscode/src/test/contributes-completeness.spec.ts`
    - `extensions/vscode/src/test/smoke.spec.ts`
- **Gate**: `cd extensions/vscode && npx vitest run src/test/extension-activation.spec.ts src/test/contributes-completeness.spec.ts src/test/smoke.spec.ts`
- Premise check: `activationEvents` already held `onStartupFinished` besides the
  config glob, so the extension was not inert; but no adoption command existed at
  all. Shipped: `delendai.adopt` contributed, `onCommand:delendai.adopt` added, and
  the command registered in `activate()` before any network-backed surface. The
  command-count ratchets (37 to 38, 38 to 39 subscriptions) moved with it.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — The adopt command asks for a dry-run assessment and shows the plan

- **Status**: review
- **Files**:
    - `extensions/vscode/src/commands/adopt.ts`
    - `extensions/vscode/src/test/adopt-command.spec.ts`
- **Gate**: `cd extensions/vscode && npx vitest run src/test/adopt-command.spec.ts`
- No equivalent command existed (`grep -rni adopt extensions/vscode/src`). The
  command calls `delendai_adopt_project` with `{ analyze: true }` only (never
  `write`), renders the result in a webview and reports failures through
  `showCommandError`.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — Registration of the remaining commands with and without a config

- **Status**: review
- **Files**:
    - `extensions/vscode/src/test/extension-conditional-registration.spec.ts`
- **Gate**: `cd extensions/vscode && npx vitest run src/test/extension-conditional-registration.spec.ts`
- Premise check: the slice proposed registering only adoption commands when there
  is no config. Today every command is registered unconditionally (a contributed
  command that is not registered fails with "command not found", and
  `contributes-completeness.spec.ts` enforces it), and `activate()` has no
  config-dependent registration. The intent, that no command assumes a config
  exists, is satisfied by that and is pinned by a spec that activates with no
  server configured, asserts every contributed command is registered and that the
  overview and adoption commands fail softly. No `extension.ts` change was needed.
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## dependency graph

Independiente de todo lo demás en `q00011`. Dentro de la propuesta:
S1 no depende de nada; S2 depende de S1 (necesita el comando
registrado); S3 es independiente de S1/S2 y puede ir en paralelo.

## acceptance

- Test de activación: en un workspace **sin** `delendai.config.json`,
  el comando de adopción aparece en la paleta de comandos y es
  invocable.
- El flujo de adopción es alcanzable desde un repo virgen sin editar
  ningún fichero a mano primero.
- Ningún comando existente deja de funcionar en un workspace que ya
  tiene config (regresión de S3).

## risks and mitigations

- **Riesgo: activar la extensión bajo demanda en un workspace sin
  config podría intentar leer estado que asume una config presente
  (crash silencioso).** Mitigación: el spec de S1 cubre explícitamente
  el camino "sin config" y S3 audita cada comando actual para
  confirmar que ninguno asume `delendai.config.json` existente antes
  de registrarse incondicionalmente.
- **Riesgo: `onCommand:delendai.adopt` no dispara si el ID de
  comando real es distinto (p. ej. ya existe un comando de adopción
  con otro nombre).** Mitigación: S1 empieza con
  `grep -rn "registerCommand" extensions/vscode/src/extension.ts` para
  confirmar el ID exacto antes de editar `package.json`.

## notes

Esta propuesta se limita a la activación y al primer comando de
adopción alcanzable; la vista de explicabilidad completa que la
auditoría describe como el verdadero diferenciador de producto queda
fuera porque depende de métricas (`f00272`) y de `AgentSession`
(`f00277`) que no existen todavía — construirla ahora sería
arquitectura sin datos que mostrar.
