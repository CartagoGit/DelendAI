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
- **Expect**: la auditoría deja una rúbrica estable y tres salidas cerrables sin tocar código: `already-strong`, `gaps documentales` y `baseline medible` sobre límites, jerarquía, presupuestos, criterios de salida y memoria compacta.

### S2 — Workflow multiagente: límites, jerarquía y criterios de salida

- **Files**:
  - `plugins/proposals/src/**`
  - `plugins/notification/src/**`
  - `docs/proposals/**`
  - `skills/proposal-swarm-runner/**`
  - `skills/state-repair-playbook/**`
  - `skills/token-budget-playbook/**`
  - `AGENTS.md`
  - `CLAUDE.md`
- **Gate**: `bun run validate`
- **Status**: pending
- **Expect**: baseline documental de workflow multiagente con tres salidas cerrables sin código: enforcement ya fuerte en runtime, gaps entre guidance y enforcement, y mapa mínimo de claim path / wait path / delegate threshold / stop path.

### S3 — Memoria, prompts y superficies de contexto

- **Files**:
  - `plugins/memory/src/**`
  - `skills/**`
  - `.github/copilot-instructions.md`
  - `CLAUDE.md`
  - `docs/TOKEN-BUDGETS.md`
  - `docs/scaffolds/ARCHITECTURE-MEMORY.md`
  - `docs/scaffolds/ARCHITECTURE-WORKFLOWS.md`
- **Gate**: `bun run validate`
- **Status**: pending
- **Expect**: baseline documental de memoria y contexto con tres salidas cerrables sin código: fronteras ya fuertes de memoria durable, gaps entre guidance e invalidación/compacción de sesión, y mapa mínimo de `memory vs docs/search/reread`.

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
- **Expect**: matriz por surface con cuatro ejes verificables sin tocar código: `compact-default`, `cap numérico`, `invalidación de caché` y `cheap check`, más gaps donde el bounded runtime ya exista pero el consumidor siga prefiriendo rutas caras.

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
| Baseline de eficiencia | Parcialmente levantada en `S1` desde superficies normativas/documentales |
| Hallazgos validados | Ya hay hallazgos documentales para `S1`, `S2` y `S3`, y evidencia de runtime/consumo para `S4`; aún no se ha hecho el triage de propuestas hijas |
| Propuestas hijas creadas | Aún no, se reservan para `S5` |
| Gate de cierre | `bun run validate` al pasar a `done` |

### Baseline S1

| Familia | Estado S1 | Evidencia base |
|---|---|---|
| Límites | fuerte en arranque y observabilidad; parcial fuera de esas rutas | `overview compact`, `auto_work`, capado de logs, thresholds del loop detector |
| Jerarquía | fuerte en orientación y delegación; parcial en umbral de “no trivial” | `overview`/`auto_work`/orchestrator y regla de delegar; falta umbral común más preciso |
| Presupuestos | fuerte para cold-start; parcial para otras superficies | budgets medidos y gateados para `overview`/`auto_work`, no para `search`/`docs`/`git`/`memory` |
| Criterios de salida | fuerte para cambios de código; parcial para investigación read-only | `bun run validate` como done global; falta cierre mínimo repositorio-específico para slices de investigación |
| Memoria compacta | parcial | existe disciplina de `/compact` y de no releer, pero no una política única y breve de qué persistir |

### Baseline S2

| Subfamilia | Estado S2 | Evidencia base |
|---|---|---|
| Claim / release | fuerte | mutex, conflicto explícito y cierre atómico por slice |
| Wait path | fuerte | `lock-released` push + `await_lock` sin polling |
| Delegación | fuerte en plugin, parcial como regla repo-wide | umbral concreto en `auto_work`; el cliente aún puede ignorarlo |
| Stop / exit | fuerte en runtime swarm, parcial para investigación read-only | `stop: true`, idle brake, stuck-detected; falta cierre mínimo común para auditorías |
| Aislamiento git | parcial | worktree recomendado para 2+ agentes, no precondición obligatoria |

### Baseline S3

| Subfamilia | Estado S3 | Evidencia base |
|---|---|---|
| Persistencia durable | fuerte | límites de entrada, quota, TTL, redaction, mutex, atomic write y cuarentena de corrupción |
| Recall / list | fuerte | recall y list separan índice barato de cuerpo completo |
| Invalidación de memoria persistida | fuerte | expiradas caen en lectura y export por defecto |
| Compacción de sesión | parcial | `/compact`, no-reread y compact-first existen, pero dependen de guidance manual |
| Decisión memory vs docs/search/reread | parcial | hay preferencia implícita por memory y surfaces compactas, pero no un decision tree corto unificado |
| Presupuesto específico de memory surfaces | parcial | hay bounded counts y hygiene, pero no budget explícito comparable al cold-start |

### Baseline S4

| Surface | Compact-default | Cap numérico | Invalidación / safety | Cheap check |
|---|---|---|---|---|
| `overview` | fuerte | fuerte | n/a | fuerte |
| `search` | fuerte | fuerte | containment + fallback seguro | parcial |
| `docs` | fuerte | fuerte | containment | fuerte |
| `proposals` round context | fuerte | fuerte | digest-aware | fuerte |
| `logs` | fuerte | fuerte | redaction + truncation + cursor | fuerte |
| client/hosts | parcial | parcial | cache local no digest-aware | parcial |

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

### already-covered

1. **Orientación compacta y barata ya prescrita**: primero `overview`, evitar crawling y preferir herramientas compactas sobre shell. El hilo principal ya tiene disciplina explícita de coste bajo.
2. **Disciplina explícita de no releer**: solo releer por cambio detectado, señal relevante de `overview` o necesidad de bytes nuevos.
3. **Presupuestos medidos y gateados para la ruta de arranque**: `overview` full/compact y `auto_work` tienen baseline y techos de regresión.
4. **Criterio de salida global fuerte**: una tarea no está hecha si `bun run validate` no está verde.
5. **Jerarquía del hilo principal bien definida**: trabajo no trivial baja a orchestrator/subagente y se pide compactar entre tareas no relacionadas.
6. **Anti-loop y anti-polling ya documentados**: esperar `lock-released` en vez de polling y respetar `stop: true`.
7. **Observabilidad con límites reales**: logs redactados, capados a 8 KiB por línea, retención de 30 días y rotación diaria.
8. **Detección de bucles con thresholds y handoff portable**: repeat/no-progress thresholds, ring size y handoff TTL ya fijados.
9. **Workflow multiagente con enforcement parcial en runtime**: claim/release con mutex, `delegate` atómico, `lock-released` por push, `await_lock` y `auto_work` con `stop: true` tras idles o stuck detection.
10. **Memoria bounded y no-log**: el plugin de memory ya limita título, cuerpo, tags, TTL y cuota; además dice explícitamente que la memoria es para notas durables, no logs.
11. **Recall y list baratos por defecto**: la recuperación separa índice paginado de payload completo, reduciendo coste de contexto.
12. **Persistencia segura y con invalidación real**: secretos se redactan antes de persistir, las expiradas desaparecen de lectura/export y la store corrupta se pone en cuarentena.
13. **Disciplina compact-first de prompts principales**: `overview` primero, no releer si no cambió el digest y usar `/compact` entre tareas no relacionadas ya forman parte del marco operativo.
14. **Bounded outputs reales en runtime**: `overview` compact, `search` con clamps múltiples, `docs` con index barato + payload unitario, `logs` con cursor/tail/truncation y `proposals` con policy digest-aware y previews capados.
15. **Cheap checks ya disponibles en varias surfaces**: `HealthService` puede omitir stale list, `status-marker` expone un ping mínimo y la web publica benchmarks medidos del cold-start.

### documentation gaps

1. **Hierarchy**: no hay un umbral operativo común para decidir qué cuenta como trabajo no trivial y cuándo la delegación deja de ser opcional.
2. **Budget**: los presupuestos medidos hoy cubren bien `overview` y `auto_work`, pero no varias superficies que probablemente dominan gasto real en swarm (`search`, `docs`, `git`, `memory`).
3. **Exit**: el criterio global de done es fuerte para código, pero no hay una definición repositorio-específica igual de breve para cerrar investigación read-only.
4. **Memory**: existe disciplina de compacción y de no releer, pero no una política única y breve sobre qué entra en memoria persistente operativa y qué debe quedar fuera.
5. **Limits**: el loop detector cubre repetición y no-progreso de edición, pero no documenta límites equivalentes para exploración read-only o verbosidad de respuesta fuera de esas señales.
6. **Hierarchy / enforcement**: el umbral de delegación existe dentro de `proposals` y `auto_work`, pero sigue siendo guidance del cliente/orchestrator y no una precondición dura del workflow repo-wide.
7. **Limits / hierarchy**: el uso de worktree en sesiones multiagente está recomendado, no exigido; la seguridad git entre agentes aún depende parcialmente de disciplina humana.
8. **Exit / hierarchy**: hay una tensión documental sobre el orden de `sync_proposals` en swarm: una narrativa lo deja dentro del loop por slice y otra lo reserva para el final del último slice abierto.
9. **Limits / hierarchy**: la ruta canónica cuando “todo está reclamado” sigue repartida entre `continue_proposal`, notification/`await_lock` y skills; no vive aún en una sola surface normativa corta.
10. **Memory**: falta una política normativa única de qué merece persistir como memoria durable y qué debe quedar fuera por ser continuidad de bajo valor.
11. **Hierarchy / memory**: no hay un decision tree corto y unificado para decidir cuándo usar memory, cuándo releer local y cuándo ir a docs/search.
12. **Exit / memory**: la compacción de sesión sigue siendo mayormente manual (`/compact`), no ligada de forma automática al cierre de slice o al cambio de tema.
13. **Budget / hierarchy**: la regla de hilo principal barato está repartida entre prompt corto, prompt de sesión y skills, lo que introduce duplicación y riesgo de drift.
14. **Memory / exit**: la arquitectura de memoria documenta bien seguridad y corrupción, pero no compactación semántica ni un forget path recomendado fuera del TTL.
15. **Budget**: los budgets medidos y gateados siguen concentrados en `overview` y `auto_work`; no hay una familia equivalente para `search`, `docs`, `logs` ni round-context read-only.
16. **Hierarchy / budget**: client y hosts siguen tirando de `overview` full por defecto en varias superficies; la ruta compact-first existe en servidor, pero no es todavía el default del consumidor.
17. **Budget**: el panel de tokens del client usa una heurística fija de ahorro, no una medida derivada del servidor real ni de `compact vs full`.
18. **Limits**: el árbol de memoria en VS Code limita y cachea una primera página sin overflow explícito ni navegación visible a páginas siguientes.
19. **Hierarchy / safe cache**: las caches de tools y memory en VS Code son baratas, pero no digest-aware ni stale-aware como sí lo es proposals round context.

### follow-up shape

Estas son las familias de hallazgo que la auditoría considera plausibles y dignas de seguimiento si se verifican:

1. **Una propuesta de workflow** si faltan límites, jerarquía o criterios de salida en el sistema multiagente.
2. **Una propuesta de memoria/contexto** si hay persistencia ruidosa, falta de compactación o invalidación pobre.
3. **Una propuesta de tool outputs/budgets** si hay herramientas o hosts que no ofrecen ruta compacta y presupuestos defendibles.
4. **Ninguna propuesta adicional** cuando el área ya esté bien cubierta por propuestas vivas o por invariantes existentes.

Ese shape es deliberado: mejor pocas propuestas bien acotadas que una colección de tickets solapados.

## scoreboard

| Dimensión | Objetivo de la auditoría |
|---|---|
| Límites | Fuerte en cold-start, observabilidad, search, docs, logs y round-context por caps runtime; parcial en algunas surfaces host que recortan sin transparencia suficiente |
| Jerarquía | Fuerte en orientación compacta, claim/release y delegación de `proposals`; parcial porque delegación y worktree siguen siendo guidance fuera del runtime del plugin |
| Presupuestos | Fuerte para `overview`/`auto_work`; parcial porque el resto de surfaces bounded (`search`, `docs`, `logs`, round-context, memory`) aún no tienen budgets medidos/gateados equivalentes |
| Criterios de salida | Fuerte para cambios de código y también en runtime swarm (`idle brake`, `all-claimed`, `stuck-detected`); parcial para slices de investigación documental |
| Memoria compacta | Fuerte en higiene de persistencia durable; parcial en compacción e invalidación del contexto de sesión y en la frontera normativa de qué persistir |
| Follow-ups | Aún no abrir; S1 solo justifica posibles familias, no propuestas hijas todavía |

## notes

- Esta auditoría está diseñada para ejecutarse por tramos y con bajo coste de contexto. Cada slice puede revisarse casi de forma independiente y solo `S5` recombina hallazgos.
- `a00025` ya estudió ahorro de tokens como familia concreta; `a00027` amplía el marco a gobierno operativo completo y decide qué follow-ups merecen existir hoy.
- `f00032` y `f00044` se marcan como relacionados porque tocan cobertura de skills/tools y onboarding cross-project, dos zonas donde el coste de contexto puede crecer rápido si no hay límites y rutas compactas.
- S1 usa solo superficies normativas/documentales por diseño; no concluye aún sobre cumplimiento profundo en código, solo sobre claridad del marco operativo actual.
- Baseline documental ya verificado en S1: `overview` full 6 735 B, `overview compact` 1 271 B, `auto_work` idle 159 B y `auto_work` con work plan 1 026 B; además existen techos de regresión para esas rutas en `docs/TOKEN-BUDGETS.md`.
- S2 confirma enforcement parcial ya fuerte en runtime swarm: claim/release con mutex, `delegate` atómico, `await_lock`, `lock-released` push y `stop: true` tras idles o stuck detection.
- Para slices read-only de workflow, el cierre útil mínimo no es `validate`, sino capturar evidencia sobre claim path, wait path, delegate threshold, stop path y cualquier ambigüedad entre surfaces normativas.
- S3 separa dos planos distintos: memoria durable segura y bounded frente a gobierno del contexto en vivo. El primero ya está bastante maduro; el segundo sigue descansando más en guidance que en una policy unificada.
- En memoria, “bounded” no equivale todavía a “budgeted”: hay límites de entrada y quota, pero no un presupuesto explícito de coste de contexto equivalente al que ya existe para `overview` y `auto_work`.
- S4 confirma que el repo ya resuelve bastante bien `bounded` en servidor, pero no siempre `compact-first` ni `budget-aware` en consumidores host/client.
- El follow-up potencial de S4 no es “más auditoría general”, sino decidir en `S5` si estos gaps merecen una propuesta de budgets multi-surface y otra de compact-default en clientes/hosts.