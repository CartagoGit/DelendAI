---
id: a00027
kind: audit
title: "Auditoría marco de eficiencia operativa de agentes — límites, jerarquía, presupuestos, criterios de salida y memoria compacta"
status: ready
date: 2026-06-21
track: workflow+core+plugins+apps+docs+memory
related:
  - a00025
  - f00032
  - f00044
ownership:
  - { agent: technical_investigator, task: 'S1: establecer rúbrica y baseline de eficiencia con foco en límites, jerarquía, presupuestos y compacción' }
  - { agent: technical_investigator, task: 'S2: auditar workflow y gobierno multiagente en proposals, locks, handoff y criterios de salida' }
  - { agent: technical_investigator, task: 'S3: auditar memoria, prompts, skills y surfaces de contexto para detectar contexto innecesario y missing compaction' }
  - { agent: technical_investigator, task: 'S4: auditar core, client, plugins y hosts para bounded outputs, presupuestos, caches y rutas compactas por defecto' }
  - { agent: proposal_guardian, task: 'S5: convertir hallazgos validados en propuestas hijas acotadas, con prerequisites y aceptación medible' }
  - { agent: proposal_guardian, task: 'S6: cerrar la auditoría cuando el mapa de follow-ups y no-goals quede trazado' }
acceptance:
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run validate, expect: exit0 }
---

# a00027 — Auditoría marco de eficiencia operativa de agentes

## goal

- **Audited Scope**: todo el monorepo, con foco transversal en cinco invariantes operativos: **límites**, **jerarquía**, **presupuestos**, **criterios de salida** y **memoria/contexto compactos**.
- **Audited HEAD**: rama de trabajo actual; la auditoría es viva y se ancla a fecha + propuestas derivadas, no a una foto histórica cerrada.
- **Revisor / Model**: GitHub Copilot (GPT-5.4).
- **Date**: 2026-06-21.
- **Método**: revisión por tramos con rúbrica explícita, contraste contra las reglas ya declaradas en [AGENTS.md](../../../AGENTS.md), [.github/copilot-instructions.md](../../../.github/copilot-instructions.md), [CLAUDE.md](../../../CLAUDE.md), la familia de propuestas activas y las superficies donde hoy se gasta contexto o bytes sin retorno claro. La salida obligatoria no es "otro documento": son **propuestas hijas concretas** solo cuando el gap esté verificado.

## why

La tesis que origina esta auditoría es correcta: **la ventaja ya no está en “más inteligencia” sino en mejor gobierno operativo**. Un agente útil en este repo necesita:

1. **Límites duros** para no abrir superficie, leer más de la cuenta ni responder con outputs desproporcionados.
2. **Jerarquía y handoff claros** para que cada capa haga lo suyo y no suba todo al hilo principal.
3. **Presupuestos medibles** para bytes, lecturas, pasos y herramientas caras.
4. **Criterios de salida explícitos** para saber cuándo un slice termina, cuándo se compacta y cuándo se deriva a otra propuesta.
5. **Memoria compacta** que conserve solo lo reusable y expulse el contexto incidental.

Abrir hoy varias propuestas de implementación sin esta revisión sería prematuro: mezclaría intuición con evidencia y llenaría el board de follow-ups especulativos. Por eso la decisión correcta es:

- **Una auditoría marco ahora**.
- **Propuestas hijas después**, una por familia de gap validado y con acceptance verificable.

## non-goals

- No abrir propuestas hijas por preferencia estética o por “podría estar mejor” sin evidencia operacional.
- No reescribir propuestas activas salvo para enlazarlas como prerequisite o dependencia cuando el hallazgo lo exija.
- No mover reglas operativas al core si pertenecen a prompts, skills, workflow o host.
- No tratar como defecto una salida larga si es excepcional, deliberada y ya está gateada.
- No convertir esta auditoría en una implementación omnibus. Su trabajo es **mapear, priorizar y derivar**.

## slices

- global_gate: lint

### S1 — Rúbrica, baseline y mapa de superficies críticas

- **Files**:
  - `AGENTS.md`
  - `.github/copilot-instructions.md`
  - `CLAUDE.md`
  - `docs/TOKEN-BUDGETS.md`
  - `docs/LOGS.md`
  - `docs/LOOP-DETECTION.md`
  - `docs/proposals/ready/a00027-21-06-2026-copilot-gpt-5-4-eficiencia-operativa-de-agentes.md`
- **Gate**: `bun run lint:proposals`
- **Status**: pending
- **Expect**: la auditoría deja una rúbrica estable, una baseline de superficies caras y una lista priorizada de puntos donde el repo ya tiene disciplina y donde aún no la tiene.

### S2 — Workflow multiagente: límites, jerarquía y criterios de salida

- **Files**:
  - `plugins/proposals/src/**`
  - `plugins/notification/src/**`
  - `docs/proposals/**`
  - `skills/proposal-swarm-runner/**`
  - `skills/state-repair-playbook/**`
  - `skills/token-budget-playbook/**`
  - `AGENTS.md`
- **Gate**: `bun run validate`
- **Status**: pending
- **Expect**: hallazgos concretos sobre claim/lock discipline, thresholds de compactación, handoff entre agentes, y cuándo el sistema obliga a parar, cerrar o delegar.

### S3 — Memoria, prompts y superficies de contexto

- **Files**:
  - `plugins/memory/src/**`
  - `skills/**`
  - `.github/copilot-instructions.md`
  - `CLAUDE.md`
  - `docs/scaffolds/ARCHITECTURE-MEMORY.md`
  - `docs/scaffolds/ARCHITECTURE-WORKFLOWS.md`
- **Gate**: `bun run validate`
- **Status**: pending
- **Expect**: determinar qué memoria aporta señal real, qué memoria es ruido persistido, qué instrucciones duplican contexto innecesariamente y dónde falta compactación automática o invalidación.

### S4 — Core, plugins, client y hosts: bounded outputs y rutas compactas por defecto

- **Files**:
  - `packages/core/src/**`
  - `packages/client/src/**`
  - `plugins/search/src/**`
  - `plugins/docs/src/**`
  - `plugins/proposals/src/**`
  - `plugins/status-marker/src/**`
  - `plugins/logs/src/**`
  - `extensions/vscode/src/**`
  - `apps/web/src/**`
- **Gate**: `bun run validate`
- **Status**: pending
- **Expect**: identificar tools o flows que aún no privilegian outputs compactos, presupuestos por defecto, caching seguro, paths de validación baratos o compacción al cambiar de tramo.

### S5 — Triage: convertir gaps validados en propuestas hijas

- **Files**:
  - `docs/proposals/ready/a00027-21-06-2026-copilot-gpt-5-4-eficiencia-operativa-de-agentes.md`
  - `docs/proposals/ready/*.md`
  - `docs/proposals/index.json`
- **Gate**: `bun run lint:proposals`
- **Status**: pending
- **Expect**:
  - cada gap validado produce **como mucho una propuesta hija por familia causal**, no una por síntoma;
  - cada propuesta hija declara prerequisite, acceptance y superficie reservada;
  - si un hallazgo no merece propuesta, queda documentado como `non-goal`, `already-covered` o `defer-until-<id>`.

### S6 — Cierre de auditoría y mapa final

- **Files**:
  - `docs/proposals/done/audits/a00027-21-06-2026-copilot-gpt-5-4-eficiencia-operativa-de-agentes.md`
  - `docs/proposals/index.json`
- **Gate**: `bun run validate`
- **Status**: pending
- **Expect**: la auditoría solo se mueve a done cuando el mapa de follow-ups esté trazado y el repo pueda explicar, con links concretos, qué se va a hacer, qué no, y por qué.

## acceptance

- `bun run lint:proposals` valida la propuesta en `ready/`.
- `bun run validate` sigue verde al cerrar la auditoría.
- La rúbrica cubre de forma explícita límites, jerarquía, presupuestos, criterios de salida y memoria compacta.
- El resultado de `S5` no crea backlog especulativo: toda propuesta hija nace de un gap reproducido o de una ausencia clara de invariante.
- Cada propuesta hija queda acotada por familia causal, prerequisites y acceptance medible.
- La auditoría documenta también los `non-goals` y los casos `already-covered`, para evitar duplicar trabajo y contexto.

## verified state

| Aspecto | Estado actual |
|---|---|
| Propuesta creada | Sí, en `ready/` |
| Baseline de eficiencia | Pendiente de levantar en `S1` |
| Hallazgos validados | Aún no, esta propuesta define el trabajo |
| Propuestas hijas creadas | Aún no, se reservan para `S5` |
| Gate de cierre | `bun run validate` al pasar a `done` |

La rúbrica de evaluación que se usará en la auditoría es esta. Un hallazgo solo escala a propuesta hija si falla al menos uno de estos puntos con evidencia reproducible.

### R1 — Boundedness

- ¿La herramienta, prompt o flujo tiene un límite explícito de bytes, paths, items o pasos?
- ¿Existe ruta compacta por defecto antes de la ruta verbosa?
- ¿La salida evita listar contexto que no cambia la decisión?

### R2 — Hierarchy

- ¿La responsabilidad está en la capa correcta?
- ¿El hilo principal delega trabajo denso en subagentes o herramientas compactas?
- ¿La jerarquía evita releer o recomputar lo que otra capa ya decidió?

### R3 — Budgeting

- ¿Hay presupuesto documentado y, cuando importa, gateado?
- ¿La superficie tiene una forma barata de validarse antes de abrir una validación cara?
- ¿Se evita pagar tokens/bytes repetidos por el mismo estado?

### R4 — Exit Criteria

- ¿Cada slice o workflow sabe cuándo termina?
- ¿Hay condiciones claras para compactar, delegar, pausar o cerrar?
- ¿Se evita el estado ambiguo de “seguir explorando” sin una comprobación discriminante?

### R5 — Compact Memory

- ¿La memoria persistida es mínima, reutilizable y libre de ruido?
- ¿La sesión expulsa contexto stale cuando cambia de tema o de slice?
- ¿Los resúmenes preservan decisiones y no transcript crudo?

## findings

Estas son las familias de hallazgo que la auditoría considera plausibles y dignas de seguimiento si se verifican:

1. **Una propuesta de workflow** si faltan límites, jerarquía o criterios de salida en el sistema multiagente.
2. **Una propuesta de memoria/contexto** si hay persistencia ruidosa, falta de compactación o invalidación pobre.
3. **Una propuesta de tool outputs/budgets** si hay herramientas o hosts que no ofrecen ruta compacta y presupuestos defendibles.
4. **Ninguna propuesta adicional** cuando el área ya esté bien cubierta por propuestas vivas o por invariantes existentes.

Ese shape es deliberado: mejor pocas propuestas bien acotadas que una colección de tickets solapados.

## scoreboard

| Dimensión | Objetivo de la auditoría |
|---|---|
| Límites | Confirmar que las superficies caras tienen topes explícitos o ruta compacta previa |
| Jerarquía | Verificar que el trabajo denso baja a la capa correcta y no se queda en el hilo principal |
| Presupuestos | Detectar gaps sin presupuesto, sin baseline o sin gate defendible |
| Criterios de salida | Asegurar que slices y workflows saben cuándo parar, compactar o delegar |
| Memoria compacta | Separar memoria reusable de transcript ruidoso o stale |
| Follow-ups | Abrir solo propuestas hijas con causalidad clara y aceptación medible |

## notes

- Esta auditoría está diseñada para ejecutarse por tramos y con bajo coste de contexto. Cada slice puede revisarse casi de forma independiente y solo `S5` recombina hallazgos.
- `a00025` ya estudió ahorro de tokens como familia concreta; `a00027` amplía el marco a gobierno operativo completo y decide qué follow-ups merecen existir hoy.
- `f00032` y `f00044` se marcan como relacionados porque tocan cobertura de skills/tools y onboarding cross-project, dos zonas donde el coste de contexto puede crecer rápido si no hay límites y rutas compactas.