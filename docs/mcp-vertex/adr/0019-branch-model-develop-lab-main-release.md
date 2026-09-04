---
adr_id: 0019
title: "Modelo de ramas: develop es laboratorio, main es publicación"
status: Accepted
date: 2026-08-29
deciders:
  - operador (commit 20c699a9)
  - auditoría independiente Claude Opus 5 (AUD-A01)
supersedes: null
superseded_by: null
related_proposals:
  - d00013
  - x00273
related_audit:
  - docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
---

# ADR 0019 — Modelo de ramas: `develop` es laboratorio, `main` es publicación

> Status: **Accepted**.
> Date: 2026-08-29.

## Numbering note

Esta propuesta (`d00013`) fue escrita para reservar `ADR 0018`, y
`x00273` (el guard que implementa esta decisión, ya enviado en
`6ff19f8d`) cita "ADR 0018" en su propio texto porque en ese momento
ese era el siguiente número libre. Entre el `2026-08-30` (envío de
`x00273`) y el `2026-08-29`→`2026-09-02` (redacción real de este ADR),
otro trabajo tomó el `0018` (`docs/mcp-vertex/adr/0018-managed-lazy-loading-is-all-or-nothing.md`,
comiteado `2026-09-02`). Este documento se registra como **ADR 0019**
en su lugar; las menciones a "ADR 0018" dentro de `x00273` se refieren
a esta decisión, no a la de managed-lazy-loading.

## Context

El repositorio pasó por dos posturas de gobernanza de ramas sucesivas:

1. **Postura inicial (snapshot auditado):** `develop` se declaraba
   protegida en `.github/branch-protection.ts`, pero sin protección
   real aplicada en GitHub — una asimetría entre lo declarado y lo
   vigente que la auditoría independiente (AUD-A01) señaló como BUG.
2. **Corrección, y sobre-corrección:** el commit `20c699a9` cuenta la
   historia en su propio mensaje: *"I got this wrong earlier: I
   protected develop and routed everything through pull requests...
   I changed governance without reading the backlog."* El operador
   había protegido `develop` sin conocer el backlog (`c00156`), lo que
   introducía fricción en el flujo de trabajo diario sin necesidad —
   `develop` es, en este repositorio, el espacio de trabajo de un
   único operador humano, no un tronco compartido por un equipo.
3. **Postura actual (la que este ADR fija):** el mismo commit
   `20c699a9` introduce un flag `protected` explícito por rama en
   `IBranchPolicy`: `develop: protected: false` a propósito, `main:
   protected: true` con `required_checks: ['ci-complete']`. La
   auditoría reclasificó la asimetría original de BUG a "riesgo de
   diseño... que sigue abierto": la decisión de fondo nunca quedó
   registrada fuera del código y de un mensaje de commit.

Verificado en la sesión de origen (2026-08-29) y de nuevo al escribir
este ADR: GitHub no exige pull request para aterrizar en `main`. La
respuesta de `gh api repos/CartagoGit/delendai/branches/main/protection`
no incluye la clave `required_pull_request_reviews` en absoluto — no
es que el toggle esté desactivado, es que nunca se configuró. Un SHA
que ya tenga `ci-complete` en verde en otra rama puede aterrizar en
`main` por fast-forward sin que exista nunca una pull request.

## Decision

`develop` es el laboratorio de trabajo del operador: sin protección de
GitHub, push directo permitido, sin checks obligatorios de GitHub. El
único candado que aplica sobre `develop` es local y asimétrico por
rol: `push-to-develop-discipline.script.ts` bloquea que un **agente**
empuje directamente — el trabajo de agentes pasa por `wip/*` + pull
request — pero no restringe al operador humano.

`main` es la rama de publicación: protegida en GitHub
(`required_status_checks: ci-complete`, `enforce_admins: true`,
`required_linear_history: true`, sin force-push ni borrado). Ningún
push directo a `main` — humano o agente — está pensado como camino
válido; todo cambio entra por pull request.

Esta asimetría es deliberada, no drift: un único operador no gana
nada de una `develop` protegida más allá de la fricción, mientras que
`main` sí necesita el candado porque es el punto desde el que se
deriva versión y publicación.

## Consequences

### Positivas

- El operador trabaja sin fricción en su propio repositorio; no
  necesita abrir una pull request para su propio trabajo de laboratorio.
- `main` permanece confiable como punto de release: todo lo que llega
  ahí pasó por `ci-complete` en verde y, en el camino previsto, por
  revisión.
- La asimetría queda declarada por escrito en vez de vivir sólo en un
  mensaje de commit — la próxima sesión (agente o humano) tiene un
  documento al que apuntar antes de "corregir" la política de nuevo.

### Negativas

- `develop` puede quedar roja indefinidamente sin que ningún gate de
  GitHub lo impida — mitigado por verificación de salud (`verify:*`),
  no por branch protection.
- **Gap real, ya conocido y ya cerrado en el lado local:** sin
  "Require a pull request before merging" activado en GitHub para
  `main`, un SHA con `ci-complete` verde en otra rama podría, en
  teoría, aterrizar en `main` por fast-forward sin pull request. El
  lado que este repositorio puede controlar sin depender de un ajuste
  manual en la UI de GitHub está cerrado por `x00273` (guard local +
  gate `release-pr-gate` en pre-push y en CI). Activar el toggle en la
  UI de GitHub sigue siendo una acción manual pendiente del operador.

## Trigger for reversal

| # | Condición | Métrica | Estado |
|---|-----------|---------|--------|
| 1 | Un segundo contribuyente humano empieza a trabajar en `develop` | número de autores distintos en `git log develop` | medir trimestralmente |
| 2 | `develop` acumula >5 commits consecutivos en rojo | `gh api .../commits/{sha}/check-runs` | bloqueante — reabrir protección de `develop` |
| 3 | Un push directo a `main` aterriza sin pull request asociada | `gh api .../commits/{sha}/pulls` vacío en un commit de `main` | bloqueante — investigar el guard (`x00273`) |
| 4 | GitHub añade "Require a pull request" con excepción para el propio operador | changelog de GitHub | reevaluar si vale activar sin fricción |

Si el trigger 2 o el trigger 3 se materializan, reabrir `x00273` con
alcance ampliado.

## Verification

- `gh api repos/CartagoGit/delendai/branches/main/protection` —
  confirma qué exige GitHub hoy para `main`; ausencia de
  `required_pull_request_reviews` es el gap conocido (trigger 4).
- `tools/scripts/lint/push-to-develop-discipline.script.ts` — confirma
  que un agente no puede empujar directo a `develop`.
- `tools/scripts/lint/release-pr-gate.script.ts` (vía `x00273`) —
  confirma que ni humano ni agente pueden empujar directo a `main`
  desde el lado que el repositorio controla.

## References

- `d00013` — propuesta que originó este ADR.
- `x00273` — guard de push directo a `main` que implementa esta
  decisión (cita "ADR 0018"; ver "Numbering note" arriba).
- `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` — política
  declarativa y playbook operativo para aplicar/verificar la
  protección real en GitHub.
- `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md`
  (AUD-A01) — hallazgo original de la asimetría sin decisión escrita.
