---
id: a00091
title: "Auditoria tecnica integral — mcp-vertex"
kind: audit
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/2026-08-29-full-working-tree-audit.md
---

# a00091 — Auditoria tecnica integral — mcp-vertex

## Goal

## Indice
1. Snapshot exacto
2. Alcance y metodologia
3. Cobertura y limitaciones
4. Project Context Record
5. Resumen ejecutivo
6. Puntuaciones
7. Mapa del proyecto
8. Arquitectura actual
9. Hallazgos
10. Bugs confirmados
11. Bugs probables
12. Riesgos de diseno
13. Deuda tecnica
14. Mejoras
15. Ideas de producto
16. Testing
17. CI/CD
18. Seguridad
19. Rendimiento y resiliencia
20. Observabilidad
21. DX y documentacion
22. Costes / IA / tokens
23. Top 5 fortalezas
24. Top 5 riesgos
25. Top 10 cambios por ROI
26. Que NO hacer
27. Arquitectura objetivo
28. Roadmap P0/P1/P2/P3
29. Plan maestro
30. Propuestas hijas
31. Estrategia de orquestacion
32. Tests y gates requeridos
33. Metricas antes/despues
34. Definition of Done global
35. Riesgos residuales
36. Estado de ejecucion
37. Plantilla reusable de propuesta
38. Prompt reutilizable para futura auditoria independiente

## 1. Snapshot exacto

| Campo                   | Valor                                                          |
| ----------------------- | -------------------------------------------------------------- |
| Proyecto                | `mcp-vertex` / monorepo TypeScript + Bun                       |
| Rama                    | `wip/x00298-s1`                                                |
| HEAD auditado           | `9c3ed108` — `fix(proposals): persist x00298 S2 slice results` |
| Remoto                  | `origin git@github.com:CartagoGit/mcp-vertex.git`              |
| Fecha                   | 2026-08-29                                                     |
| Working tree            | Sucio: cambios de varios agentes y archivos no trackeados      |
| Estado remoto relevante | `origin/wip/x00298-s2` apunta al mismo HEAD observado          |

El snapshot vinculante es el working tree tal como estaba durante esta pasada, no solamente HEAD. Los cambios locales se consideran preexistentes y no se atribuyen a esta auditoria.

## 2. Alcance y metodologia

Se contrastaron manifests, configuracion, historial Git, codigo fuente, tests, artefactos generados y resultados ejecutables. Se siguio el playbook de auditoria del plugin: comandos de baseline primero, lectura cualitativa despues, y hallazgos solo cuando existe evidencia concreta.

Se priorizaron los cambios activos de `x00298`, los contratos core, la superficie lazy, `audit`, `commit-policy`, `proposals`, la suite global y los artefactos de propuestas. No se hizo una lectura literal de los 43k LOC: se uso muestreo dirigido por riesgo y por cambios recientes.

## 3. Cobertura y limitaciones

| Area                                      | Cobertura                                             |
| ----------------------------------------- | ----------------------------------------------------- |
| Core, CLI, contratos y bootstrap          | Parcial dirigida                                      |
| Proposals, locks, persistencia y cierre   | Alta sobre los archivos modificados                   |
| Audit, commit-policy y lazy assembly      | Alta sobre los archivos modificados                   |
| Resto de plugins                          | Muestreo; no exhaustivo                               |
| Extensions/apps/web                       | Inventario y evidencia historica; no lectura completa |
| Seguridad automatica                      | No ejecutada por desfase de routing MCP               |
| Auditor independiente delegado            | No disponible: limite de cuota del proveedor          |
| GitHub API, CI remoto y branch protection | No verificables desde este snapshot                   |
| Tests                                     | Suite global ejecutada                                |
| Build                                     | Ejecutado correctamente                               |
| Lint                                      | Ejecutado mediante `bunx biome`; falla                |

La superficie MCP anuncio herramientas de auditoria pero una llamada directa inicialmente devolvio `tool not found`; despues el router pudo generar el brief. La activacion de plugins tambien registro el error `Resource knowledge://commit-policy is already registered`, por lo que la salud del propio host MCP tiene una limitacion reproducible.

## 4. Project Context Record

- Producto: servidor MCP extensible para herramientas de desarrollo, auditoria, propuestas y orquestacion multiagente.
- Forma: monorepo con `packages/`, `plugins/`, `apps/`, `extensions/`, `tools/` y `docs/`.
- Runtime/tooling: TypeScript, Bun, Vitest, Biome, Astro y un shim Go.
- Contrato principal: plugins registran herramientas MCP con schemas de entrada/salida.
- Persistencia: filesystem local, cache bajo `.cache/mcp-vertex`, propuestas bajo `docs/mcp-vertex/proposals`.
- Configuracion: `mcp-vertex.config.json`; el snapshot configura superficie managed/lazy y persistencia `commit-and-push` para proposals.
- Public surface: core, CLI, cliente, plugins, extension VS Code y documentacion generada.
- CI/CD: presente en el repositorio, pero no se verifico estado remoto en esta pasada.

## 5. Resumen ejecutivo

El proyecto tiene una arquitectura modular madura, abundantes tests y un sistema de propuestas con trazabilidad. Sin embargo, el snapshot auditado no es integrable: la suite global falla en dos tests, Biome reporta 55 errores, y la superficie MCP presenta un desfase entre catalogo, activacion y herramientas invocables. La configuracion local ademas habilita persistencia `commit-and-push` hacia `origin HEAD:wip/mcp-vertex-work`, lo que exige gates de rama y aislamiento que no se pudieron verificar remotamente.

Bloqueadores actuales: corregir la clasificacion de `nodeDynamicImport`, restaurar la declaracion efectiva de `outputSchema` para `proposals_close_plan`, y resolver o acotar formalmente la deuda de Biome. La ejecucion de `x00298` debe continuar separada y no debe absorber estos fallos de integracion.

## 6. Puntuaciones

| Dimension               | Nota | Justificacion                                            |
| ----------------------- | ---: | -------------------------------------------------------- |
| Idea/product fit        |  8.0 | Producto coherente para hosts MCP y agentes              |
| Producto                |  7.5 | Superficie amplia; coste de complejidad alto             |
| Arquitectura            |  7.5 | Boundaries claros, pero registry/generated drift         |
| Runtime                 |  7.0 | Lifecycle trabajado; lazy activation reciente            |
| Modularidad             |  8.0 | Plugins y contratos bien separados                       |
| APIs/contratos          |  6.0 | Falla el contrato runtime de outputSchema                |
| Cliente/SDK             |  7.0 | No auditado completamente en esta pasada                 |
| Frontend/UI             |  6.5 | Aplicable pero solo muestreado                           |
| Backend/servicios       |  N/A | No es un backend distribuido convencional                |
| Datos/persistencia      |  7.0 | Filesystem durable con riesgo de integracion             |
| CLI/tooling             |  7.0 | Amplio y testeado; lint no verde                         |
| Plugins/extensiones     |  7.5 | Ecosistema rico; activacion duplicada observada          |
| Testing                 |  7.5 | 8701/8703 tests pasan, pero dos contratos fallan         |
| CI/CD                   |  6.0 | No verificable remoto; lint local no verde               |
| Seguridad               |  6.5 | Propuestas existentes; scan real no ejecutado            |
| Rendimiento/resiliencia |  7.0 | Costes y timeouts contemplados; falta medicion completa  |
| Observabilidad          |  7.5 | Logs de fallos utiles y estructurados                    |
| DX                      |  7.5 | Bootstrap, skills y propuestas bien documentados         |
| Mantenibilidad          |  7.0 | Deuda Biome y artefactos generados                       |
| Documentacion           |  7.5 | Amplia, con riesgo de drift                              |
| Governance              |  7.0 | Politicas presentes; remoto no verificado                |
| Release readiness       |  5.5 | No listo mientras tests/lint fallen                      |
| Coste operativo         |  6.5 | Superficie grande y activacion lazy mitigan parcialmente |
| Eficiencia IA/tokens    |  7.0 | Existe trabajo explicito de budgets y compactacion       |
| Potencial futuro        |  8.5 | Alta extensibilidad y trazabilidad                       |

Nota global actual: **7.0/10**, ponderando mas contratos, release readiness, seguridad y runtime que documentacion. Potencial tras P0/P1: **8.2/10**.

## 7. Mapa del proyecto

- `packages/core`: contratos, bootstrap, registro, CLI y primitives.
- `packages/client` y `packages/cli`: consumo programatico y CLI.
- `plugins/*`: herramientas MCP especializadas, incluyendo `audit`, `proposals`, `security`, `quality`, `logs` y `commit-policy`.
- `extensions/vscode`: integracion de editor.
- `apps/web`: documentacion/sitio Astro.
- `tools/scripts`: generacion, lint, tests, release y verificacion.
- `docs/mcp-vertex`: fuente documental y estado de propuestas; varios artefactos se regeneran.

## 8. Arquitectura actual

La composicion sigue un modelo de core + registry de plugins + superficie managed/lazy. El core conoce contratos y manifests; los plugins registran handlers y schemas. Proposals mantiene estado durable en documentos, indice cacheado, locks y logs de review. La arquitectura es incremental y evita una reescritura, pero la existencia simultanea de fuentes TypeScript, catalogos generados y runtime lazy crea una superficie de drift que requiere gates de consistencia.

## 9. Hallazgos

### F-001 — Inventario publico pierde `nodeDynamicImport`

- Clasificacion: **BUG CONFIRMADO**
- Severidad: **HIGH**
- Prioridad: **P0**
- Area: core public API / inventory tooling
- Confianza: alta
- Actual: el test busca `nodeDynamicImport` en el inventario publico y recibe `undefined`.
- Esperado: el export publico debe aparecer con madurez `deprecated` mientras exista por compatibilidad.
- Evidencia: `packages/core/tests/src/public/deprecation.spec.ts` comprueba la clasificacion; la implementacion conserva el export en `packages/core/src/public/index.ts` como `export const nodeDynamicImport = nodeDynamicImportImpl;`. La ejecucion global falla en `tests/inspect/core-public-inventory.spec.ts:65`.
- Problema/impacto: la API publica y el inventario generado dejan de describir el mismo contrato; consumidores y gates de deprecacion pueden tomar decisiones incorrectas.
- Reproduccion: `bun run test -- --reporter=verbose`; fallo `core-public-inventory (r00027) > classifies nodeDynamicImport as deprecated`.
- Causa probable: el extractor de inventario no reconoce el alias const del export reintroducido por b00237.
- Solucion minima: extender el extractor para clasificar el alias como export deprecated y regenerar inventario.
- Solucion ideal: derivar el inventario desde metadata declarativa de deprecacion, no de heuristicas de sintaxis.
- Tests: mantener el test existente y agregar alias/re-export cases.
- Aceptacion: inventario contiene exactamente una entrada deprecated; `deprecation.spec.ts` y el test de inventory pasan.
- Dependencias/riesgos: regeneracion de artefactos; posible impacto en API docs.
- Esfuerzo/ROI: S / muy alto.

### F-002 — `proposals_close_plan` no aparece con `outputSchema` en runtime

- Clasificacion: **BUG CONFIRMADO**
- Severidad: **HIGH**
- Prioridad: **P0**
- Area: proposals / MCP protocol contract
- Confianza: alta
- Actual: el E2E detecta `mcp-vertex_proposals_proposals_close_plan` en la lista de herramientas sin `outputSchema`.
- Esperado: toda herramienta registrada debe declarar un schema de salida efectivo, incluyendo dry-run y cierre aplicado.
- Evidencia: `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts:203` falla con `tools missing an outputSchema: [mcp-vertex_proposals_proposals_close_plan]`. El archivo local `plugins/proposals/src/lib/tools/close-plan.tool.ts` contiene una union `CLOSE_PLAN_OUTPUT_SCHEMA`, pero el registro efectivo observado por el E2E no la expone.
- Problema/impacto: rompe la garantia de validacion de protocolo y puede causar rechazo o interpretacion insegura de respuestas por hosts MCP.
- Reproduccion: `bun run test -- --reporter=verbose`; fallo `e2e: outputSchema validation over the protocol`.
- Causa probable: artefacto/dist o ruta de registro desactualizada respecto al source local, o una segunda registration path que omite el schema.
- Solucion minima: localizar la registration efectiva, conectar el schema union y regenerar dist/catalogos.
- Solucion ideal: gate de assembly que compare cada registration runtime con su metadata y falle antes de publicar.
- Tests: E2E existente, test de registration directa y smoke del managed surface.
- Aceptacion: `missing` es `[]`; el schema acepta las dos formas de exito y los errores siguen fuera de validacion de exito.
- Dependencias/riesgos: puede requerir regenerar `tool-outputs.ts` y manifests; no cambiar semantica del cierre.
- Esfuerzo/ROI: S-M / muy alto.

### F-003 — El gate de formato/lint no cubre un estado publicable

- Clasificacion: **BUG CONFIRMADO**
- Severidad: **MEDIUM**
- Prioridad: **P1**
- Area: quality gate
- Confianza: alta
- Evidencia: `bunx biome ci .` comprobo 3610 archivos y devolvio 55 errores, 116 warnings y 130 infos; el error visible incluye formato incorrecto en `tools/tests/report/tokenizer-profiles.spec.ts`.
- Impacto: el repo puede compilar y pasar tests mientras el gate de calidad falla; el resultado no es reproducible como release limpio.
- Solucion minima: aplicar correcciones acotadas y actualizar el baseline/gate segun la propuesta `x00281`; no aceptar silenciosamente nuevas violaciones.
- Aceptacion: `bunx biome ci .` verde o baseline ratchet documentado sin aumento.
- Esfuerzo/ROI: M / alto.

### F-004 — Activacion MCP duplicada de recurso `commit-policy`

- Clasificacion: **BUG PROBABLE**
- Severidad: **MEDIUM**
- Prioridad: **P1**
- Area: host MCP / plugin activation
- Confianza: media
- Evidencia: `logs_errors_tail` registro seis fallos entre 2026-08-29T08:00:19Z y 08:01:28Z con `Resource knowledge://commit-policy is already registered` al activar plugin y al enrutar herramientas.
- Impacto: puede impedir activar plugins o dejar la superficie parcialmente montada.
- Solucion: hacer idempotente el registro de knowledge/resources o garantizar una sola composicion por host.
- Aceptacion: repetir activacion no produce error; resources y tools quedan exactamente una vez.
- Esfuerzo/ROI: S / alto.

### F-005 — Catalogo lazy y superficie invocable pueden divergir

- Clasificacion: **RIESGO DE DISENO**
- Severidad: **MEDIUM**
- Prioridad: **P1**
- Area: managed lazy catalog / tool routing
- Confianza: media
- Evidencia: el overview anuncio `audit_plan` como visible tras activar `audit`, mientras la busqueda activa inicialmente no devolvio entrada y una llamada directa devolvio `tool not found`; solo el router pudo resolverlo despues.
- Impacto: hosts pueden construir prompts con herramientas que no pueden invocar, o perder herramientas validas por estado de catalogo stale.
- Solucion: unificar catalogo, routing y activation state desde una unica fuente runtime; añadir smoke que invoca cada entry anunciada.
- Aceptacion: toda herramienta anunciada por overview/catalog se resuelve en la misma sesion o se marca explicitamente lazy/no activa.
- Esfuerzo/ROI: M / alto.

## 10. Bugs confirmados

F-001, F-002 y F-003 son fallos confirmados en el snapshot. F-001 y F-002 bloquean contratos; F-003 bloquea el gate de calidad.

## 11. Bugs probables

F-004 es probable por eventos observados, pero requiere una segunda sesion limpia para distinguir doble activacion del host de un bug de idempotencia.

## 12. Riesgos de diseno

F-005: multiples catalogos generados, router gestionado y activation state pueden divergir. La mitigacion correcta es un smoke end-to-end de superficie, no solo regenerar JSON.

## 13. Deuda tecnica

- Deuda Biome existente documentada en `x00281`.
- Cobertura parcial de builders internos de plugins agregadores, ya observada en auditorias anteriores pero no revalidada exhaustivamente aqui.
- Muchos artefactos generados editados junto al source aumentan riesgo de snapshots inconsistentes.

## 14. Mejoras

1. Gate de coherencia source/dist/generated para plugins.
2. Comando `doctor` que verifique config, manifests, dist, locks y surface routing.
3. Test de repeticion de activacion y desactivacion de plugins.
4. Reducir duplicacion entre catalogo documental y runtime.

## 15. Ideas de producto

- Vista de salud del workspace con contratos MCP, locks, propuestas y gates en una sola respuesta compacta.
- Modo de auditoria incremental por riesgo que pueda reanudar cobertura sin afirmar exhaustividad falsa.

## 16. Testing

La suite es amplia: 1089 archivos y 8705 tests observados en la corrida completa; 8701 pasaron, 2 fallaron y 2 fueron omitidos. Los huecos prioritarios son assembly runtime versus schemas declarados, inventario de exports alias y activacion repetida.

## 17. CI/CD

El build local termino con 56 paquetes construidos. El lint completo falla. El estado remoto de workflows, required checks y branch protection no fue accesible en esta pasada; debe ser un gate P0/P1 antes de release.

## 18. Seguridad

La configuracion de proposals permite `commit-and-push` a `origin HEAD:wip/mcp-vertex-work`; esto no es automaticamente inseguro porque `agentWorktree` esta en `false`, pero eleva el riesgo de mezclar cambios compartidos. La politica de push bloquea ramas protegidas en el driver observado. No se ejecuto scan de secretos/SAST por el desfase de routing MCP.

## 19. Rendimiento y resiliencia

El timeout de cierre de slices esta acotado a 45 segundos y existen pruebas contra zombies y carreras de queue. La superficie total es grande y el build/test tarda minutos; conviene mantener gates dirigidos antes de la suite global.

## 20. Observabilidad

El stream de errores recoge timestamp, tarea, resumen y tipo de incidente. Esto permitio demostrar F-004. Falta una correlacion directa entre activation attempt, plugin id y registration id para diagnosticar el desfase de catalogo.

## 21. DX y documentacion

El bootstrap, skills y propuestas ofrecen una guia fuerte para agentes. El riesgo es la cantidad de documentos y artefactos generados: el estado efectivo debe prevalecer sobre docs historicos.

## 22. Costes / IA / tokens

El proyecto tiene presupuestos, compactacion y superficie lazy. No se midio en esta pasada un workflow completo de tokens; la prioridad es primero resolver la consistencia de superficie y schemas.

## 23. Top 5 fortalezas

1. Contratos y plugins con boundaries explicitos.
2. Suite grande con pruebas de concurrencia, timeouts y lifecycle.
3. Sistema de proposals trazable y con persistencia configurable.
4. Observabilidad de fallos utilizable.
5. Trabajo consciente de costes de contexto y output schemas.

## 24. Top 5 riesgos

1. Contrato runtime sin outputSchema (F-002).
2. Inventario publico inconsistente (F-001).
3. Lint no verde (F-003).
4. Activacion duplicada de resources (F-004).
5. Drift entre catalogo lazy y routing (F-005).

## 25. Top 10 cambios por ROI

1. Corregir F-002.
2. Corregir F-001 y regenerar inventario.
3. Activar un gate Biome ratcheted como `x00281`.
4. Smoke de catalogo anunciado versus invocable.
5. Idempotencia de resource registration.
6. Verificacion remota de main/develop y required checks.
7. Doctor de workspace.
8. Test de reactivacion de cada plugin startup.
9. Reducir artefactos generados manualmente editables.
10. Medir tokens por workflow despues de estabilizar contracts.

## 26. Que NO hacer

- No hacer una reescritura del monorepo.
- No mezclar `x00298` con fixes de contracts o lint.
- No aceptar `biome ci` verde debilitando reglas sin baseline explicito.
- No regenerar todos los artefactos como sustituto de localizar la registration efectiva.
- No cambiar la politica de push de `develop` o `main` sin verificar el workflow real.

## 27. Arquitectura objetivo

Una unica composition root debe producir: manifest runtime, catalogo lazy, registrations MCP y documentacion generada. Los contratos publicos deben tener metadata declarativa de madurez/deprecacion. Proposals debe mantener persistencia y locks detras de primitives atomicas. Un smoke de superficie debe probar el resultado final, no solo cada modulo aislado.

## 28. Roadmap P0/P1/P2/P3

### P0
- `F-001`: restaurar inventario deprecated.
- `F-002`: restaurar outputSchema efectivo.
- Ejecutar suite dirigida y global despues de cada slice.

### P1
- `F-003`: implementar/activar baseline ratchet de Biome (`x00281`).
- `F-004`: idempotencia de resources y diagnostico de activation.
- `F-005`: smoke catalogo-routing.
- Verificar branch protection y CI remoto.

### P2
- Doctor de workspace.
- Reducir duplicacion de artefactos generados.
- Ampliar tests unitarios de agregadores.

### P3
- Auditoria incremental reanudable.
- Metricas de tokens y coste por workflow.

## 29. Plan maestro

**Plan:** `q00012` — estabilizacion post-auditoria del working tree 2026-08-29.

Objetivo: devolver coherencia a contratos publicos, surface MCP y gates de calidad sin absorber el trabajo concurrente de `x00298`.

Scope: F-001, F-002 y preparacion trazable de F-003/F-004/F-005.

No-scope: reescritura, correccion completa de ReDoS, cambios remotos no verificables y features de producto.

Orden: `x00300` -> `x00305` -> `x00281`/propuestas de routing y activacion.

Definition of Done: ambos fallos P0 resueltos con tests, build y suite global verdes; lint resuelto o ratcheted; riesgos F-004/F-005 con propuesta y smoke reproducible.

## 30. Propuestas hijas

| ID       | Objetivo                                                    | Hallazgos | Prioridad |
| -------- | ----------------------------------------------------------- | --------- | --------- |
| `x00300` | Clasificar `nodeDynamicImport` como deprecated en inventory | F-001     | P0        |
| `x00305` | Exponer `outputSchema` efectivo de `proposals_close_plan`   | F-002     | P0        |

## 31. Estrategia de orquestacion

DAG: `x00300` y `x00305` son paralelizables si se reservan archivos disjuntos; ambos requieren gate dirigido y despues suite global. `x00281` depende de ambos solo como gate de integracion, no por codigo. No se debe tocar simultaneamente `plugins/proposals/src/lib/tools/close-plan.tool.ts` desde `x00298` y `x00305`.

## 32. Tests y gates requeridos

- F-001: inventory spec, deprecation spec, typecheck, regeneracion de docs si aplica.
- F-002: `packages/core/tests/src/lib/e2e/outputschema.e2e.spec.ts`, registration spec de proposals, typecheck.
- Integracion: `bun run build`, `bun run test`, `bunx biome ci .` o baseline ratchet aceptado.
- No cerrar propuestas con afirmaciones de tests que no se ejecutaron en el snapshot final.

## 33. Metricas antes/despues

| Metrica                   |                                Antes |
| ------------------------- | -----------------------------------: |
| Tests                     |       8701 pass / 2 fail / 2 skipped |
| Test files                |            1087 pass context; 2 fail |
| Build packages            |                                   56 |
| Biome                     | 55 errors / 116 warnings / 130 infos |
| TypeScript LOC aproximado |                                43144 |
| Proposals total           |                                  527 |
| Locks activos             |                                    1 |
| Proposals accionables     |                                    2 |

Despues: repetir exactamente los comandos y publicar solo cifras observadas.

## 34. Definition of Done global

Los hallazgos objetivo deben estar resueltos, los tests de regresion deben pasar, los schemas runtime deben coincidir con los handlers, los artefactos generados deben estar sincronizados, lint/typecheck/build deben ser verdes o ratcheted explicitamente, y no debe quedar ningun cambio local sin explicar.

## 35. Riesgos residuales

- Estado remoto de CI/branch protection no confirmado.
- Auditoria de seguridad automatica no ejecutada.
- Posible dist stale en el snapshot.
- Cambios de otros agentes pueden alterar las lineas y resultados.

## 36. Estado de ejecucion

Auditoria y plan creados. No se han implementado correcciones de codigo en esta pasada. `x00298` sigue siendo trabajo concurrente preexistente. El plan `q00012` y sus hijas quedan preparados para ejecucion aislada.

## 37. Plantilla reusable de propuesta

```markdown
# PROPOSAL <ID> — <titulo>

## Plan padre
q00012

## Hallazgos relacionados
- F-xxx

## Objetivo

## Contexto

## Scope

## Fuera de scope

## Estado actual

## Estado deseado

## Diseño propuesto

## Archivos/componentes afectados

## Compatibilidad y migracion

## Seguridad

## Rendimiento/coste

## Plan de implementacion
1. ...

## Tests obligatorios
- ...

## Criterios de aceptacion
- [ ] ...

## Rollback

## Dependencias

## Riesgos

## Evidencia de finalizacion
```

## 38. Prompt reutilizable para futura auditoria independiente

Audita de nuevo el snapshot real de `mcp-vertex` sin confiar en este informe. Fija HEAD, working tree, resultados de tests/build/lint y cobertura. Lee codigo real en core, proposals, plugins, extensions, apps y scripts. Verifica source versus dist/generated/runtime, especialmente deprecation inventory, outputSchema de toda herramienta y managed lazy routing. Clasifica cada hallazgo con evidencia de ruta, simbolo, lineas, reproduccion, causa, solucion, tests, severidad, prioridad, esfuerzo y ROI. No edites durante auditoria. Despues crea un plan y propuestas pequenas, y solo entonces ejecuta slices aisladas con gates reproducibles.

## notes

- Migrated from `docs/mcp-vertex/audits/2026-08-29-full-working-tree-audit.md` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.
