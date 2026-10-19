# Propuestas activas del snapshot: cola de aceptación

Sólo a00095, f00551, q00034 y rutas relacionadas recibieron contraste dirigido en esta tanda. Las demás entradas conservan estado «aceptación pendiente de comprobar contra código»; listar su aceptación no la verifica. Ningún status editado.

## a00095 — in-progress

docs/delendai/proposals/in-progress/a00095-auditoria-multi-llm-de-develop-base-de-consenso-modelo-1-10-github-copilot-glm-5-3-flash.md

Auditoría multi-LLM de `develop` — base de consenso (modelo 1/10: GitHub Copilot · GLM 5.3 Flash)

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

1. El documento acumula ≥10 bloques de revisor con snapshot propio.
2. Todo hallazgo tiene `seenBy` actualizado por cada revisor que lo verificó,
   o una discrepancia argumentada en el bloque del revisor.
3. El Scoreboard lista cada hallazgo con su nivel de acuerdo y su estado
   (abierto / CONSENSO / DISPUTA).
4. Las disputas recogen cada desacuerdo con la argumentación de todos los
   revisores implicados.
5. Ningún revisor borra ni reescribe texto de otro (diff revisable por PR).
6. `bun run lint:proposals` pasa con este fichero presente.

### slices declarada

- global_gate: type

### S1 — Auditoría base (glm-5.3-flash, modelo 1/10)

- **Status**: done
- **Files**: [este documento]
- **Gate**: `bun run lint:proposals` sin errores para este fichero; hallazgos
  G1–G18 con evidencia archivo:línea contra el snapshot del Goal.

### S2..S9 — Un slice por revisor adicional (modelos 2–9)

- **Status**: pending
- **Files**: [este documento]
- **Gate**: cada revisor reproduce G1–G18 contra su propio snapshot,
  actualiza `seenBy` o abre discrepancia, añade sus hallazgos nuevos y su
  bloque de opinión. Entrega por PR a develop
  (`audit: a00095 review <modelo>`).

### S10 — Cierre de consenso (revisor 10)

- **Status**: pending
- **Files**: [este documento]
- **Gate**: tabla de consenso (≥8/10) rellenada; disputas con las posiciones
  de todos los implicados; `reviewers-completed: 10` en frontmatter.

### S11 — Entrega al modelo implementador (fuera de este documento)

- **Status**: pending
- **Files**: [propuestas hijas]
- **Gate**: claude-opus-5-5 recibe este documento como entrada única y crea
  las propuestas/slices; no reabre el consenso.

## f00551 — in-progress

docs/delendai/proposals/in-progress/f00551-delendai-batuta-orquestacion-multicuenta-mediante-el-plugin-y-mcp-existentes.md

DelendAI Batuta — orquestación multicuenta mediante el plugin y MCP existentes

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- Matriz existente/faltante sobre el SHA inspeccionado y antecedentes canónicos; no confundir dispatch real con passthrough.
- Sin inspección de cuentas o credenciales, sin ejecución de proveedores ni gasto; primer incremento definido con rutas exclusivas.
- El contexto del plugin recibe providers de la configuración raíz; options.providers prevalece incluso cuando es [].
- Pruebas de registro, routing y ausencia de roster; executeApi:false sigue rechazando gasto. No equivale al registro multicuenta de S1.
- Un bloque raíz `accounts` declara cada cuenta por `accountId` con `vendor`, `credentialMode`, `billingMode`, `credentialEnv` (nombre de variable, nunca un secreto), `profileDir`, `quotaGroups` y `permittedAutomation` (false si no se declara); una entrada del roster la nombra con `accountId` y una entrada sin cuenta sigue siendo válida, sin migración porque el cambio es aditivo.
- `--check` y el roster que reciben los plugins rechazan lo mismo: `accountId` duplicado, dos cuentas con un mismo `profileDir`, un grupo de cuota en dos cuentas y una entrada que nombra una cuenta no declarada o rechazada; dos cuentas del mismo proveedor con varios modelos quedan separadas.
- El esquema de una entrada de proveedor existe una sola vez, en core; orchestrator-runner lo importa en vez de mantener su copia.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Con `discovery: auto-with-consent` (por defecto) `discover_providers` y `bootstrap_providers` preguntan una vez por elicitación MCP y registran el sí; sin sí, o en un host sin elicitación, no ejecutan ninguna sonda ni escriben borrador y devuelven `consent.next` para el onboarding por preguntas. `manual` nunca sondea y `off` rechaza el descubrimiento.
- Ningún argumento del agente sustituye a la respuesta del usuario; reejecutar el wizard sigue siendo no destructivo y su brief pregunta por las cuentas (perfil aislado, plan, automatización permitida) que van al bloque `accounts` sin secretos.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Un proceso CLI de una entrada ligada a cuenta arranca solo con las variables base (PATH, HOME sin reemplazar, locale, temporales), la variable de credencial que nombra la cuenta y la variable de perfil aislado de su cliente (`CLAUDE_CONFIG_DIR` para claude, `CODEX_HOME` para codex); ninguna otra clave del servidor llega al worker, así que una clave API heredada no se impone al login de suscripción.
- Antes de lanzar nada se rechaza: una cuenta no registrada, una cuenta con `permittedAutomation` false, `claude --bare` sobre una cuenta de login de suscripción, un perfil aislado en un cliente sin variable de perfil conocida y una variable de credencial no definida; una entrada sin cuenta conserva el entorno heredado como antes.
- Las pruebas usan un spawner falso (contrato simulado); binarios reales y llamadas reales consentidas quedan pendientes y se reportan por separado.
- Antes de cada salto sobre una cuenta el gestor reserva hueco en todos sus grupos de cuota en un ledger compartido por todos los procesos de la máquina, bajo el mutex de fichero entre procesos de core (core no puede cargar `bun:sqlite`, y la especificación pide reutilizar los locks existentes); la reserva es idempotente por invocación, caduca sola tras su TTL y se libera al terminar el salto.
- Tres invocaciones concurrentes sobre un grupo con un solo hueco: solo una reserva. Un grupo sin observación, con observación obsoleta, con una ventana sin límite o sin uso, sin ventanas, o un ledger ilegible, rechazan con su razón (`unknown` nunca es ilimitado); cada ventana se comprueba por separado y no se suman unidades distintas; una cuenta sin grupos de cuota se rechaza porque su gasto no se puede acotar.
- Las fuentes que escriben observaciones por grupo (cabeceras, endpoints de remanente) quedan pendientes; sin ellas una cuenta no ejecuta trabajo desatendido, que es el comportamiento seguro.
- Cada salto se registra en un diario append-only de la caché del plugin (`running` antes de lanzar, después `completed` o `failed` con su motivo; `blocked` cuando la reserva de cuota lo rechaza, sin ejecutar nada), con la cuenta, el proveedor y el proceso que lo escribió, y con los secretos redactados.
- `completed` solo dice que el proceso del proveedor terminó sin error, nunca que la tarea cumple sus postcondiciones. Al arrancar, un salto `running` cuyo proceso ya no existe pasa a `interrupted`, de modo que nada inacabado se lee como terminado, y el diario se compacta a la última entrada de las 500 invocaciones más recientes.
- Workers en worktrees propios, plan persistente del principal y reanudación desde checkpoint quedan pendientes; el diario es la evidencia sobre la que se construyen.
- La herramienta MCP `<prefix>_accounts` del plugin existente (sin CLI, app ni daemon nuevos) lista cada cuenta con sus modos de credencial y facturación, si su cliente está aislado, si admite trabajo desatendido, cada grupo de cuota con las invocaciones que lo ocupan ahora (`null` si el ledger no se lee, nunca 0) y el último salto del diario; nunca un secreto ni la ruta del perfil.
- Con `confirmBeforeExecute: true` (por defecto), un salto que puede gastar pregunta al usuario mediante la elicitación MCP del host (proveedor y nivel de coste); un sí acuña el token de un solo uso con el mismo firmante con el que el gestor lo verifica; un no, un host sin elicitación o una llamada antes de que la herramienta se registre no gastan nada. Antes nada estaba cableado y la puerta denegaba todo gasto.
- Las demás operaciones de la especificación ya existen en el mismo plugin: `invoke` (run), `cancel_invocation` (cancel), `healthcheck_providers` (doctor), `bootstrap_providers` (configure); no se duplican con otro nombre.
- La matriz de hosts (Copilot VS Code, Claude, Codex, OpenCode, remoto) con invocación real queda pendiente: exige cuentas y consentimiento reales, y no se declara soportada sin esa evidencia.
- Entregar el alcance íntegro de S7 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Una guía de uso (`docs/delendai/batuta/guide.md`) explica cómo declarar cuentas y qué rechaza el registro, el consentimiento del descubrimiento, el entorno de un worker, cuotas, reservas y confirmación de gasto, el diario y la herramienta `accounts`, y separa explícitamente lo implementado contra procesos simulados de lo no probado con cuentas reales.
- El smoke real consentido y la publicación de una versión quedan pendientes: requieren cuentas reales y el consentimiento y la decisión de release del owner; ninguna combinación proveedor × cuenta se declara soportada sin esa evidencia.

### slices declarada

- global_gate: e2e

### S0 — Reconciliación del diseño con código, propuestas y ownership actuales
- **Status**: done
- **Files**: [`docs/delendai/batuta/reconciliation.md`]
- **Gate**: `bun run lint:proposals`
- acceptance:
  - "Matriz existente/faltante sobre el SHA inspeccionado y antecedentes canónicos; no confundir dispatch real con passthrough."
  - "Sin inspección de cuentas o credenciales, sin ejecución de proveedores ni gasto; primer incremento definido con rutas exclusivas."
- review-state: done
- review-implementer: codex-batuta-orchestrator
- review-reviewer: minimax-3.1
- review-log: approved by minimax-3.1 — verified at f56c411a0e78, validate exit 0, tests 1/1 — Gate declared by the slice (bun run lint:proposals): exit 0, no new findings. The deliverable docs/delendai/batuta/reconciliation.md exists (62 lines) and landed in commit 2d45a1072. This is a documentation slice and I judged it as one: the question is whether the reconciliation is honest and specific, not whether it proves runtime support. It is both. The document opens by pinning the inspected SHA, tabulates existing evidence against remaining work per area, and — the criterion that matters most — refuses to blur real dispatch against passthrough: it records that port resolution fails when no port exists, and separately that the subscription invoker returns an explicit textual passthrough invoking no provider. It also does not overclaim. The evidence-limits section states plainly that no accounts, credentials or quotas were inspected and no providers or paid calls were executed, and requires later reports to distinguish mocks, fake CLIs, real processes and consented real calls. The first increment is defined with exclusive paths and explicitly says completing S1a does not complete S1 or CA-01..CA-19. It even records two failed publication attempts as evidence limits rather than hiding them. S1a through S8 stay pending; this verdict covers S0 only.

### S1a — Conectar roster raíz al runner manteniendo override explícito
- **Status**: review
- **DependsOn**: [S0]
- **Files**:
  - `packages/core/src/lib/plugins/plugin-contract.ts`
  - `packages/core/src/lib/plugins/provider-roster.helper.ts`
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/src/lib/contracts/interfaces/provider-roster.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/plugins/provider-roster.helper.spec.ts`
  - `packages/core/tests/src/lib/cli/assemble.provider-roster.spec.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/src/lib/options.ts`
  - `plugins/orchestrator-runner/tests/src/lib/options.spec.ts`
  - `plugins/orchestrator-runner/README.md`
- **Gate**: type
- acceptance:
  - "El contexto del plugin recibe providers de la configuración raíz; options.providers prevalece incluso cuando es []."
  - "Pruebas de registro, routing y ausencia de roster; executeApi:false sigue rechazando gasto. No equivale al registro multicuenta de S1."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S1 — Registro canónico multicuenta y migraciones
- **Status**: review
- **DependsOn**: [S1a]
- **Files**:
  - `packages/core/src/lib/contracts/constants/provider-account-modes.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/provider-account.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/provider-roster.interface.ts`
  - `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`
  - `packages/core/src/lib/plugins/provider-entry-schema.ts`
  - `packages/core/src/lib/plugins/account-registry.helper.ts`
  - `packages/core/src/lib/plugins/provider-roster.helper.ts`
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/src/lib/plugins/load-config-file.ts`
  - `packages/core/src/lib/plugins/plugin-contract.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/public/index.ts`
  - `packages/core/src/contracts/index.ts`
  - `packages/core/tests/src/lib/plugins/provider-roster.helper.spec.ts`
  - `packages/core/tests/src/lib/plugins/config-file-schema-accounts.spec.ts`
  - `packages/core/tests/src/lib/cli/assemble.provider-roster.spec.ts`
  - `plugins/orchestrator-runner/src/lib/options.ts`
  - `plugins/orchestrator-runner/src/lib/schemas.ts`
  - `plugins/orchestrator-runner/src/lib/tools/advise-routing.tool.ts`
  - `plugins/orchestrator-runner/src/lib/tools/format-handoff.tool.ts`
  - `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts`
  - `plugins/orchestrator-runner/tests/src/lib/options.spec.ts`
- **Gate**: type
- acceptance:
  - "Un bloque raíz `accounts` declara cada cuenta por `accountId` con `vendor`, `credentialMode`, `billingMode`, `credentialEnv` (nombre de variable, nunca un secreto), `profileDir`, `quotaGroups` y `permittedAutomation` (false si no se declara); una entrada del roster la nombra con `accountId` y una entrada sin cuenta sigue siendo válida, sin migración porque el cambio es aditivo."
  - "`--check` y el roster que reciben los plugins rechazan lo mismo: `accountId` duplicado, dos cuentas con un mismo `profileDir`, un grupo de cuota en dos cuentas y una entrada que nombra una cuenta no declarada o rechazada; dos cuentas del mismo proveedor con varios modelos quedan separadas."
  - "El esquema de una entrada de proveedor existe una sola vez, en core; orchestrator-runner lo importa en vez de mantener su copia."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Descubrimiento con consentimiento y wizard MCP
- **Status**: review
- **DependsOn**: [S1]
- **Files**:
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/discovery-consent.interface.ts`
  - `plugins/orchestrator-runner/src/lib/contracts/constants/discovery-consent.constant.ts`
  - `plugins/orchestrator-runner/src/lib/services/discovery-consent.service.ts`
  - `plugins/orchestrator-runner/src/lib/services/read-cache-file.helper.ts`
  - `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`
  - `plugins/orchestrator-runner/src/lib/tools/bootstrap.tool.ts`
  - `plugins/orchestrator-runner/src/lib/tools/index.ts`
  - `plugins/orchestrator-runner/src/lib/bootstrap.ts`
  - `plugins/orchestrator-runner/src/lib/schemas.ts`
  - `plugins/orchestrator-runner/src/lib/options.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/README.md`
  - `plugins/orchestrator-runner/tests/src/lib/services/discovery-consent.service.spec.ts`
  - `plugins/orchestrator-runner/tests/src/lib/tools/discover.tool.spec.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_discover_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_bootstrap_providers.ts`
  - `packages/test-kit/src/contracts/interfaces/fake-tool-server.interface.ts`
  - `packages/test-kit/src/lib/fake-tool-server.helper.ts`
- **Gate**: type
- acceptance:
  - "Con `discovery: auto-with-consent` (por defecto) `discover_providers` y `bootstrap_providers` preguntan una vez por elicitación MCP y registran el sí; sin sí, o en un host sin elicitación, no ejecutan ninguna sonda ni escriben borrador y devuelven `consent.next` para el onboarding por preguntas. `manual` nunca sondea y `off` rechaza el descubrimiento."
  - "Ningún argumento del agente sustituye a la respuesta del usuario; reejecutar el wizard sigue siendo no destructivo y su brief pregunta por las cuentas (perfil aislado, plan, automatización permitida) que van al bloque `accounts` sin secretos."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Adaptadores de ejecución reales y perfiles aislados
- **Status**: review
- **DependsOn**: [S2]
- **Files**:
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/account-environment.interface.ts`
  - `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`
  - `plugins/orchestrator-runner/src/lib/subprocess/cli.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/account-environment.service.spec.ts`
  - `plugins/orchestrator-runner/tests/src/lib/subprocess/cli.spec.ts`
- **Gate**: type
- acceptance:
  - "Un proceso CLI de una entrada ligada a cuenta arranca solo con las variables base (PATH, HOME sin reemplazar, locale, temporales), la variable de credencial que nombra la cuenta y la variable de perfil aislado de su cliente (`CLAUDE_CONFIG_DIR` para claude, `CODEX_HOME` para codex); ninguna otra clave del servidor llega al worker, así que una clave API heredada no se impone al login de suscripción."
  - "Antes de lanzar nada se rechaza: una cuenta no registrada, una cuenta con `permittedAutomation` false, `claude --bare` sobre una cuenta de login de suscripción, un perfil aislado en un cliente sin variable de perfil conocida y una variable de credencial no definida; una entrada sin cuenta conserva el entorno heredado como antes."
  - "Las pruebas usan un spawner falso (contrato simulado); binarios reales y llamadas reales consentidas quedan pendientes y se reportan por separado."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — Cuotas, reservas SQLite y guardas de gasto
- **Status**: review
- **DependsOn**: [S3]
- **Files**:
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/quota-reservation.interface.ts`
  - `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`
  - `plugins/orchestrator-runner/src/lib/quota/read-quota.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/manager.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/quota-reservation.service.spec.ts`
  - `plugins/orchestrator-runner/tests/src/lib/quota/read-quota.spec.ts`
- **Gate**: type
- acceptance:
  - "Antes de cada salto sobre una cuenta el gestor reserva hueco en todos sus grupos de cuota en un ledger compartido por todos los procesos de la máquina, bajo el mutex de fichero entre procesos de core (core no puede cargar `bun:sqlite`, y la especificación pide reutilizar los locks existentes); la reserva es idempotente por invocación, caduca sola tras su TTL y se libera al terminar el salto."
  - "Tres invocaciones concurrentes sobre un grupo con un solo hueco: solo una reserva. Un grupo sin observación, con observación obsoleta, con una ventana sin límite o sin uso, sin ventanas, o un ledger ilegible, rechazan con su razón (`unknown` nunca es ilimitado); cada ventana se comprueba por separado y no se suman unidades distintas; una cuenta sin grupos de cuota se rechaza porque su gasto no se puede acotar."
  - "Las fuentes que escriben observaciones por grupo (cabeceras, endpoints de remanente) quedan pendientes; sin ellas una cuenta no ejecuta trabajo desatendido, que es el comportamiento seguro."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S5 — Principal persistente, workers y evidencia
- **Status**: review
- **DependsOn**: [S4]
- **Files**:
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/invocation-journal.interface.ts`
  - `plugins/orchestrator-runner/src/lib/services/invocation-journal.service.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/manager.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/invocation-journal.service.spec.ts`
  - `plugins/orchestrator-runner/tests/src/lib/invoke/manager-journal.spec.ts`
- **Gate**: type
- acceptance:
  - "Cada salto se registra en un diario append-only de la caché del plugin (`running` antes de lanzar, después `completed` o `failed` con su motivo; `blocked` cuando la reserva de cuota lo rechaza, sin ejecutar nada), con la cuenta, el proveedor y el proceso que lo escribió, y con los secretos redactados."
  - "`completed` solo dice que el proceso del proveedor terminó sin error, nunca que la tarea cumple sus postcondiciones. Al arrancar, un salto `running` cuyo proceso ya no existe pasa a `interrupted`, de modo que nada inacabado se lee como terminado, y el diario se compacta a la última entrada de las 500 invocaciones más recientes."
  - "Workers en worktrees propios, plan persistente del principal y reanudación desde checkpoint quedan pendientes; el diario es la evidencia sobre la que se construyen."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S6 — Integración en el MCP y hosts existentes
- **Status**: review
- **DependsOn**: [S5]
- **Files**:
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/account-status.interface.ts`
  - `plugins/orchestrator-runner/src/lib/services/account-status.service.ts`
  - `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`
  - `plugins/orchestrator-runner/src/lib/tools/accounts.tool.ts`
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/accounts-tool-options.interface.ts`
  - `plugins/orchestrator-runner/src/lib/contracts/constants/spend-confirmation.constant.ts`
  - `plugins/orchestrator-runner/src/lib/services/spend-confirmation.service.ts`
  - `plugins/orchestrator-runner/src/lib/services/invocation-journal.service.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/spend-confirmation.service.spec.ts`
  - `plugins/orchestrator-runner/src/lib/tools/index.ts`
  - `plugins/orchestrator-runner/src/lib/schemas.ts`
  - `plugins/orchestrator-runner/src/index.ts`
  - `plugins/orchestrator-runner/README.md`
  - `plugins/orchestrator-runner/tests/src/lib/services/account-status.service.spec.ts`
  - `plugins/orchestrator-runner/tests/src/lib/plugin.spec.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_accounts.ts`
  - `apps/web/src/i18n/tools/index.ts`
- **Gate**: type
- acceptance:
  - "La herramienta MCP `<prefix>_accounts` del plugin existente (sin CLI, app ni daemon nuevos) lista cada cuenta con sus modos de credencial y facturación, si su cliente está aislado, si admite trabajo desatendido, cada grupo de cuota con las invocaciones que lo ocupan ahora (`null` si el ledger no se lee, nunca 0) y el último salto del diario; nunca un secreto ni la ruta del perfil."
  - "Con `confirmBeforeExecute: true` (por defecto), un salto que puede gastar pregunta al usuario mediante la elicitación MCP del host (proveedor y nivel de coste); un sí acuña el token de un solo uso con el mismo firmante con el que el gestor lo verifica; un no, un host sin elicitación o una llamada antes de que la herramienta se registre no gastan nada. Antes nada estaba cableado y la puerta denegaba todo gasto."
  - "Las demás operaciones de la especificación ya existen en el mismo plugin: `invoke` (run), `cancel_invocation` (cancel), `healthcheck_providers` (doctor), `bootstrap_providers` (configure); no se duplican con otro nombre."
  - "La matriz de hosts (Copilot VS Code, Claude, Codex, OpenCode, remoto) con invocación real queda pendiente: exige cuentas y consentimiento reales, y no se declara soportada sin esa evidencia."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S7 — Calidad, aprendizaje y medición completa
- **Status**: pending
- **DependsOn**: [S6]
- **Files**: `docs/delendai/batuta/planning/evaluation.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S7 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Estado 2026-10-17: sin ejecuciones reales a través de cuentas (S8) no hay calidad, coste ni tokens reales que medir; el diario de invocaciones (S5) es la fuente sobre la que se construirá la medición, y una comparación A/B solo con procesos simulados no demostraría ahorro."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S8 — Release, documentación y smoke real consentido
- **Status**: review
- **DependsOn**: [S7]
- **Files**:
  - `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "Una guía de uso (`docs/delendai/batuta/guide.md`) explica cómo declarar cuentas y qué rechaza el registro, el consentimiento del descubrimiento, el entorno de un worker, cuotas, reservas y confirmación de gasto, el diario y la herramienta `accounts`, y separa explícitamente lo implementado contra procesos simulados de lo no probado con cuentas reales."
  - "El smoke real consentido y la publicación de una versión quedan pendientes: requieren cuentas reales y el consentimiento y la decisión de release del owner; ninguna combinación proveedor × cuenta se declara soportada sin esa evidencia."
- review-state: in_review
- review-implementer: claude-opus-5-5

## f00764 — ready

docs/delendai/proposals/ready/feats/f00764-joint-audits-a-plan-settles-every-finding-of-the-audits-it-contains.md

Joint audits: a plan settles every finding of the audits it contains

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- a00095 can be run as such a plan: its reviewers' findings land in one ledger, each settled by a proposal, a duplicate or a reason, and the audit closes when the plan does.

### slices declarada

- global_gate: type

### S1 — An audit's findings are data

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`
- **Gate**: type
- acceptance:
  - "An audit's findings are parsed from its document into records (id, title, classification, zone, evidence, `seenBy`), from the heading-and-field form a00095 uses, with a spec over a00095's own text; a finding without evidence is reported."

### S2 — A plan contains audits and keeps one ledger

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/proposals/proposal-document.ts`, `plugins/proposals/src/lib/proposals/blocked-by.ts`
- **Gate**: type
- acceptance:
  - "A plan's `contains.audits` lists audits; its ledger maps every finding of each to exactly one settlement: `settled-by: <proposal ids>`, `same-as: <audit>/<finding>`, or `rejected: <reason>`, with the agreement it reached (reviewers who confirmed it, reviewers who disputed it, the plan's threshold)."
  - "A finding of a contained audit that the ledger does not settle is listed as open, the way an open child is today."

### S3 — Delivering the plan settles its audits

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/plan-closure.types.ts`
- **Gate**: type
- acceptance:
  - "The plan closes only when every finding is settled and every `settled-by` proposal is done; closing it moves each contained audit to done with a link to the plan, and an audit inside a plan cannot be closed on its own."
  - "`lint:proposals` refuses a ledger that names a finding no contained audit has, or settles one finding twice."

## f00766 — ready

docs/delendai/proposals/ready/feats/f00766-one-discovery-that-knows-whether-an-account-can-work.md

One discovery that knows whether an account can work

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- On this machine, discovery reports Claude Code and Codex with their real verdicts, OpenCode as `needs-plan` or `unknown` from its own answer, and the same report reaches every plugin that asks.

### slices declarada

- global_gate: type

### S1 — One catalogue of clients

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/contracts/constants/known-providers.constant.ts`, `plugins/orchestrator-runner/src/lib/bootstrap.ts`
- **Gate**: type
- acceptance:
  - "One catalogue in core contracts lists each known client once: its command, how to read its version, how to ask whether it is logged in, how (if at all) to ask whether its plan can work now, and the variable that points it at a profile. Both plugins read it and keep no list of their own; it includes OpenCode and every client either list had. A spec holds that no plugin source declares a client list."

### S2 — One discovery with a verdict per client

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/healthcheck/probe.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`
- **Gate**: type
- acceptance:
  - "One service, consented as today, answers per client: `usable`, `needs-login`, `needs-plan`, `quota-exhausted`, `not-installed` or `unknown`, each with the command it ran and the line of its answer that decided it, never a credential. `auto-agent-selector` and `orchestrator-runner` call it and keep no probe of their own."
  - "Specs over recorded answers hold each verdict, an installed client with no plan read as `needs-plan` from its own answer, and a client that cannot tell read as `unknown`."

### S3 — A host client's models are listed through it

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/tools/discover.tool.ts`
- **Gate**: type
- acceptance:
  - "For a client that hosts several models (Copilot, OpenCode), discovery lists the model ids the client itself reports, when it offers a listing, each as a candidate of that client's account; when it offers none, discovery says so. No configuration file of the client is opened."

## q00011 — ready

docs/delendai/proposals/ready/plans/q00011-plan-cerrar-los-contratos-de-runtime-que-el-sistema-promete-y-no-cumple-ciclo-de-vida-eager-lazy-propiedad-del-teardown-enforcement-de-efectos-puertas-ciegas-de-ci-y-el-66-del-coste-de-tokens-que-vive-en-los-output-schemas.md

Plan — cerrar los contratos de runtime que el sistema promete y no cumple: ciclo de vida eager/lazy, propiedad del teardown, enforcement de efectos, puertas ciegas de CI y el 66% del coste de tokens que vive en los output schemas

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

El plan cierra cuando **todo** lo siguiente se cumple sobre el SHA **integrado**
en `develop` (no sobre la rama de trabajo), verificado por comando:

1. `eager` y `lazy` producen semántica idéntica: el test parametrizado por ruta
   (`t00029`) pasa sin ramas condicionales por ruta.
2. Cero fugas: sin runtimes, plugins ni subprocesos huérfanos tras `dispose()`;
   el test de handles activos da 0.
3. `dispose()` se invoca exactamente una vez por activación y es idempotente.
4. `register()` tiene timeout y cancelación probados en **ambas** rutas.
5. `dryRun: true` hace imposible el efecto a través de `ctx.effects`, y el lint
   de fronteras impide el camino directo.
6. `llmDecidesActivation` y `eager` están conectados, probados y documentados.
7. `verify-branch-protection` no puede devolver verde sin haber leído una rama;
   `verify-develop-health` está en verde o en `unverified` explícito.
8. `bun run lint` analiza ≥3.300 ficheros y la baseline sólo baja.
9. `tools/list` del preset `vertex` ≤ 120.000 B y el bootstrap adaptativo
   ≤ 4.500 B, sin pérdida funcional.
10. `TOKEN-BUDGETS.md` no contiene la cadena `(0B)`; los 6 presets gobernados
    declaran techo marginal.
11. `maxWarmPlugins` e `idleTtlMs` cambian comportamiento observable en un test.
12. Cobertura de branches ≥80% en `core/plugins`, `core/dry-run` y `core/project`;
    umbrales globales = medida − 0,5.
13. Cero `it.skip` incondicional sin caducidad declarada.
14. Cero drift de artefactos generados y de versión package/manifest/runtime.
15. `bun run validate` en verde.

### slices declarada

Cada slice agrupa propuestas hijas con fichero, tests y criterios propios. El
detalle vive en la hija; aquí el orden y la razón del orden.

### S1 — Gobernanza: devolver la señal a las puertas ciegas (P0)

- **Status**: done
- **Files**: [`tools/scripts/ci/verify-branch-protection.script.ts`, `tools/scripts/ci/verify-develop-health.script.ts`, `tools/scripts/ci/verify-branch-protection.spec.ts`, `tools/tests/ci/verify-develop-health.spec.ts`]
- **Gate**: `bun run test -- tools/tests/ci && bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run`


`x00278` (`allow_deletion` → `allow_deletions`) entra **primero**: sin él,
`x00277` y `x00276` seguirían reportando drift falso justo cuando alguien
intente hacerlo bien con un token de administrador. Después, en paralelo,
`x00277` (el falso verde deja de ser verde) y `x00276` (el 403 deja de explotar;
es el único check rojo que queda en `develop`).
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 108/108 — Closeout slice over x00278, x00277, x00276. Every named child is status: done at HEAD, and the per-child review-log line counts are 0/0/0 in that order. Gate green on both halves: `bun run test -- tools/tests/ci` exits 0 with 108 tests passed across 11 files, and `bun tools/scripts/ci/verify-branch-protection.script.ts --dry-run` exits 0, reporting it would verify 2 branches and reading back main with strict=true, checks delendai-validate + release-pr-gate + enforce_admins and allow_deletions=false, develop with strict=false and the expected check set. That read-back is the slice's own subject: the dry run reports allow_deletions=false for both branches, so the x00278 rename it leads with is in effect rather than merely written. Worth recording for the next reviewer, not as a blocker: none of x00278, x00277 or x00276 carries a review-log line. No criterion here demands peer review of the children, so the slice is not in violation of its own terms — but the closure it asserts rests on child status alone. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S2 — Ciclo de vida: la cadena completa o nada (P0)

- **Status**: done
- **Files**: [`packages/core/src/lib/plugins/managed-lazy-runtime.ts`, `packages/core/src/lib/plugins/load-plugins.ts`, `packages/core/src/lib/plugins/load-plugins-runtime.helper.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/cli/src/index.ts`, `plugins/external-mcps/src/index.ts`]
- **Gate**: `bun run test -- packages/core/tests/src/lib/plugins packages/core/tests/src/lib/project plugins/external-mcps`


`r00038` (`PluginActivationSession`) → `t00029` (test de equivalencia, escrito
**antes** del refactor y que debe fallar contra el código actual) → `r00039`
(`McpHostSession.dispose`) y `x00291` (`dispose` en `external-mcps`). Los tres
niveles están rotos a la vez: el plugin no expone, el activador no retiene, el
host no llama. Arreglar uno solo no produce ninguna mejora observable.

> **Estado de cobertura documental (2026-08-29).** Los 48 hijos declarados en
> `contains.proposals` tienen ya fichero escrito; hasta hoy faltaban 29 y el plan
> afirmaba un cuerpo de trabajo inexistente. Al escribirlos se corrigieron cinco
> premisas mías: `AUD-F02` fallaba por un bug de aserción anterior a `x00258` y no
> por `x00258`; `advise_routing` mide 7.969 B y no 12.157; `v00132` es `AUD-F06`,
> no `AUD-B05`; tres de las cuatro métricas de `AUD-B05` ya estaban propuestas en
> `f00198`/`f00199`; y `delendai adopt` (`AUD-G04`) y los subpaths del core
> (`AUD-E03`) **ya existían** — prescribí construir lo construido. Todas las
> correcciones están anotadas en su hallazgo de la auditoría.
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 669/669 — Closeout slice over r00038, t00029, r00039, x00291. Every named child is status: done at HEAD, and the per-child review-log line counts are 0/0/0/0 in that order. Gate green: `bun run test -- packages/core/tests/src/lib/plugins packages/core/tests/src/lib/project plugins/external-mcps` exits 0 with 669 tests passed across 79 files. The slice names four children and its own claim is that all three levels were broken at once and that fixing one yields no observable improvement; the suite covering load-plugins, managed-lazy-runtime and the external-mcps disposal is the one that would catch a partial fix, and it passes. Same caveat as S1 and S3: all four children are done with no review-log lines. The gate is green and the children are closed, which is what the slice asks for, so I am approving what it declares rather than a stronger claim it does not make. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S3 — Independientes de P0, en paralelo

- **Status**: done
- **Files**: [`plugins/external-mcps/src/lib/tools`, `tools/scripts/lint/effect-boundaries.script.ts`, `tools/scripts/lint/effect-boundaries.baseline.json`, `package.json`, `.github/workflows/ci.yml`]
- **Gate**: `bun run lint && bun tools/scripts/lint/effect-boundaries.script.ts`


`x00290` (`llmDecidesActivation` conectado al proxy), `x00288` (lint de
fronteras de efectos, ratchet medido en 104 — el 13 publicado contaba sólo
`child_process` con un grep ciego a `require()` dinámico), `x00281` (Biome sobre el monorepo
completo con baseline que sólo baja) y `x00295` (el guard de sondeo compara
literales que no existen en el union: 33 herramientas con efectos se invocan con
entrada vacía).
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 194314f260ff, validate exit 0, tests 1/1 — Closeout slice over x00290, x00288, x00281 and x00295; all four are status: done at HEAD, with per-child review-log line counts 0/0/1/0 in that order. Gate green on both halves: `bun run lint` resolves to biome-baseline and exits 0 ('no new Biome violations, 13 diagnostics baselined'), and `bun tools/scripts/lint/effect-boundaries.script.ts` exits 0 reporting 'no new violations; debt shrank 101 -> 99'. The ratchet moving down rather than up is the measurable claim this slice makes about x00288, and it moved. Delivery attributed to 194314f260ff ('feat(q00011): commit via slice S5'), which the tool confirms touched the same files: its diff to package.json is what wires `lint:effect-boundaries` and `lint:no-absolute-local-imports` into `validate:run`, so the effect-boundary ratchet this slice gates on is actually in the validate chain rather than merely runnable by hand — which is exactly what x00288 asked for and what made the earlier '13 published' number meaningless. No criterion in this proposal demands peer review of the children, so closure is judged on status plus the gate. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S4 — Tokens: atacar el 66% (P1)

- **Status**: done
- **Files**: [`packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `packages/core/src/lib/surface/bootstrap.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `plugins/orchestrator-runner/src/lib/schemas.ts`, `plugins/quality-policy/src`, `plugins/usage-tracking/src`]
- **Gate**: `bun run tokens:gate && bun run tokens:dashboard:check`


`x00283` y `x00284` primero (dashboard y medición honestos, para poder medir el
progreso), luego `v00129` (esquemas compactos por herramienta en core; el envelope
compartido vía `$defs`/`$ref` queda descartado: `v00128` estableció que zod v4 y
el SDK de MCP no deduplican `$ref`, así que no ahorra nada), `v00130`
(`advise_routing` + `invoke`), `v00131` (`quality_policy` + `usage_report`), y
`r00036` (ratchet descendente) para blindar lo ganado.
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 1/1 — Closeout slice over x00283, x00284, v00129, v00130, v00131, r00036. Every named child is status: done at HEAD, and the per-child review-log line counts are 0/0/0/0/1/0 in that order. Gate green on both halves: `bun run tokens:gate` exits 0 (largest surfaces reported: proposals 79,866 B over 50 tools at 27.3%, orchestrator-runner 13,242 B, agent-orchestrator 10,859 B, audit 9,736 B, container 8,663 B) and `bun run tokens:dashboard:check` exits 0 with 'in sync: docs/delendai/TOKEN-BUDGETS.md'. The dashboard being in sync is what makes the slice's token numbers checkable rather than asserted. No criterion in this proposal demands peer review of the children, so the closure is judged on status plus the slice's own gate. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S5 — Superficie adaptativa (P1)

- **Status**: done
- **Files**: [`packages/core/src/lib/surface/decide-mode.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`]
- **Gate**: `bun run test -- packages/core/tests/src/lib/surface packages/core/tests/src/lib/project`


`x00285` (decidir el modo leyendo al cliente) y `x00286` (evicción real del
working set, que depende del `dispose` retenido por `r00038`).
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 138/138 — Closeout slice over x00285, x00286. Every named child is status: done at HEAD, and the per-child review-log line counts are 0/0 in that order. Gate green: `bun run test -- packages/core/tests/src/lib/surface packages/core/tests/src/lib/project` exits 0 with 138 tests passed across 20 files. This is the slice that depends on r00038's retained dispose, so its tests overlapping the project scope is the intended coupling, not duplication. No criterion in this proposal demands peer review of the children, so the closure is judged on status plus the slice's own gate. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S6 — Seguridad, resto (P1)

- **Status**: done
- **Files**: [`packages/core/src/lib/dry-run`, `packages/core/src/lib/capabilities`, `packages/core/src/lib/shared/git-write.ts`, `plugins/external-mcps/src/lib/options-schema.ts`]
- **Gate**: `bun run test -- packages/core/tests/src/lib/dry-run plugins/external-mcps && bun run lint:capabilities`


`r00037` (`EffectBroker`: dry-run como prevención), `x00289` (`eager`
expresable), `x00292` (`protectedBranches` obligatorio en la firma).
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 209/209 — Closeout slice over r00037, x00289, x00292. Every named child is status: done at HEAD, and the per-child review-log line counts are 0/2/3 in that order. Gate green on both halves: `bun run test -- packages/core/tests/src/lib/dry-run plugins/external-mcps` exits 0 with 209 tests passed across 31 files, and `bun run lint:capabilities` exits 0 reporting '61 plugin(s), 1797 file(s) - every used capability is declared'. The capabilities lint is the check that would catch x00292's mandatory protectedBranches leaking into a signature without a declaration. No criterion in this proposal demands peer review of the children, so the closure is judged on status plus the slice's own gate. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S7 — CI y gobernanza, resto (P1)

- **Status**: done
- **Files**: [`.github/branch-protection.ts`, `tools/scripts/ci/affected.script.ts`, `.github/workflows/ci.yml`, `docs/delendai/adr`]
- **Gate**: `bun run test -- tools/tests/ci && bun run lint:proposals`


`x00279` (`defaults` consumidos), `x00282` (mapa workspace→proyecto vitest),
`x00294` (`tools/` entra en el typecheck: 95 errores invisibles hoy),
`d00013` (ADR del modelo de ramas), `x00273` (guard de push a `main`) y
`x00293` (versión única por plugin: 41 de 51 mienten al host).
- shipped-in: `ca9832016ec4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 108/108 — Closeout slice over x00279, x00282, x00294, d00013, x00273, x00293. Every named child is status: done at HEAD, and the per-child review-log line counts are 0/4/0/3/3/2 in that order. Gate green on both halves: the `bun run test -- tools/tests/ci` half is the same 108/108 run recorded for S1 (identical command), and `bun run lint:proposals` exits 0 with 'proposal-hygiene: no new findings (0 baselined, 10 open proposals scanned)'. One caveat worth the next reviewer's eye: that same lint reports x00539 with 'shipped-in: missing', which is not this slice's proposal but does mean the hygiene lint is surfacing a real gap elsewhere in the tree. No criterion in this proposal demands peer review of the children, so the closure is judged on status plus the slice's own gate. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S8 — Testing (P1)

- **Status**: done
- **Files**: [`vitest.config.ts`, `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`]
- **Gate**: `bun run test:coverage`
- shipped-in: `fc1a589e2`, `74583b235`


`t00030` (umbrales apretados + branches ≥80% en los módulos de P0) y `t00031`
(reescribir el e2e de dogfood de `commit-policy`). Acompañan a toda la Ola 1:
los tests de caminos de error suben la cobertura de ramas por sí solos.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at ca9832016ec4, validate exit 0, tests 16756/16760 — Closeout slice over t00030, t00031. Every named child is status: done at HEAD, and the per-child review-log line counts are 1/1 in that order. Gate is `bun run test:coverage`, which I did not run separately: the full `bun run validate` in this session already ran the coverage-bearing test stage and reported 16756 passed / 4 skipped / 0 failures across 2056 files, so the tests this slice gates on are green; only the coverage thresholds themselves were not independently re-measured here. What I did verify directly is the slice's own closeout claim: both named children, t00030 and t00031, are status done and each carries review-reviewer sonnet-worker-tests-2, matching the 'verified 2026-10-01: both children are closed' note. No criterion in this proposal demands peer review of the children, so the closure is judged on status plus the slice's own gate. Note on method: this proposal's slices declare no acceptance criteria at all (parseProposalSlicePlan returns acceptanceCriteria: [] for all nine), so there is nothing criterion-wise to check and the verdict rests on the declared gate and the children's closure.

### S9 — Plataforma (P2)

- **Status**: review
- **Files**: [`packages/core/src/public`, `packages/client/src`, `plugins/proposals/src`, `packages/cli/src/commands/groups/doctor.ts`, `extensions/vscode/package.json`, `docs/delendai/plugins`]
- **Gate**: `bun run validate`
- shipped-in: `3dbba9bb6`, `dce7937f0`, `8bc1ace5d`


`f00272` (métricas de superficie útil), `f00273` (ranking e histéresis),
`r00035` (desduplicar CI), `r00040` (subpaths del core), `r00041` (fronteras del
cliente), `r00042` (`proposals` como event log), `x00287` (fail-closed),
`v00132` (payload duplicado), `f00274` (activación de la extensión), `f00275`
(`doctor --deep`), `d00014` (docs canónicas).
- review-state: in_review
- review-implementer: claude-opus-5-5
- review-log: requested_changes by minimax-m3.1-flash-preview — I cannot approve S9, and the blocker is the gate, not the content. The slice declares `bun run validate`; on this tree validate exits 1 with '3 of 131 steps FAILED' — verify:tools, verify:external-install and lint:cache — and the review tool refuses an approval whose validateExitCode is not 0, so there is no honest approve to file. Every one of the three is checked rather than assumed: verify:external-install passes on its own (65 tarballs installed, init launch completed an MCP overview handshake) and is a flake under the concurrent agents sharing this checkout; verify:tools' two failures (core fs_write and core scaffold output-schema mismatches) trace to f7b477efd dated 2026-09-24, which git shows is already on origin/develop and predates this work; lint:cache flags one untracked, gitignored packages/core/.cache holding another agent's runtime output. Typecheck passed and the test stage reported 16756 passed / 4 skipped / 0 failures across 2056 files. What I verified about the slice itself and do not dispute: all eleven named children (f00272, f00273, r00035, r00040, r00041, r00042, x00287, v00132, f00274, f00275, d00014) are status: done at HEAD, with review-log counts 3/4/3/3/0/1/2/1/3/3/3 in that order, so the 2026-10-11 note's closure claim is true; and only r00041 among them carries no review-log line, which no criterion forbids. To close: either the two core outputSchemas get fixed so validate returns to green, or this slice's Gate is reworded to the gate it actually needs (typecheck plus the lint/test stages, all of which pass). I did not delete the stray packages/core/.cache — it is another agent's runtime output and not mine to remove mid-review. Separately, and not a blocker here: `bun run lint:proposals` reports x00539 with 'shipped-in: missing'.
- review-log: resubmitted by claude-opus-5-5 — resubmitted; answers the request above: the reviewer found the content right and was blocked by the gate: verify:tools exits 0 on develop (re-run 2026-10-15), verify:external-install passed on its own as the reviewer saw, and the lint:cache failure was a stray packages/core/.cache a server wrote inside the package, which a start-up migration now removes (x00904). Nothing in the slice changed.
- review-log: requested_changes by gemini-3.8-flash — Independent validation could not be completed: `bun run validate` reached the isolated plugin-suite stage and then waited on the repository's shared compute lock while other agents' validation runs were active. I interrupted only my own command after confirming the contention. No acceptance verdict is recorded; retry once the compute lock is available. The proposal's prior resubmission reports the underlying concerns resolved, but I cannot independently attest them from this run.
- review-log: resubmitted by claude-opus-5-5 — resubmitted; answers the request above: resubmitted; answers the request above: the shared compute lock is free (no holder, no heavy process running, 2026-10-18), so bun run validate can now run to its end; nothing in the slice changed.

## q00034 — ready

docs/delendai/proposals/ready/plans/q00034-plan-batuta-made-real-personal-accounts-one-router-one-learned-store-context-by-reference.md

Plan — Batuta made real: personal accounts, one router, one learned store, context by reference

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A person can declare their own accounts without committing them, delendai tells which can work and how much is left, picks per task by measured results, and gives each worker only its task's context, from sources every worker shares.

### slices declarada

- global_gate: type

Each slice becomes its own proposal before implementation, with its files, specs and acceptance reconciled against the code at that time.

### S1 — Accounts are personal, local and layered

- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/account-registry.helper.ts`, `packages/core/src/lib/plugins/load-config-file.ts`, `packages/core/src/lib/platform/user-directories.helper.ts`
- **Gate**: type
- acceptance:
  - "A person's accounts live outside the repository, in a per-user, per-project file under the user configuration root (`userConfigRoot`), never committed; the committed configuration may declare only what the project shares (recommended providers, policies, an optional shared account a team agrees on)."
  - "The two layers merge by one documented rule: the personal entry for an account id wins, so the same account can be a subscription for one person and a key for another; `delendai --check` names the layer each value came from."
  - "A start-up migration moves `accounts` and personal provider fields (`profileDir`, `credentialEnv`) from `delendai.config.json` to the personal file, journalled, leaving the shared part in place."

### S2 — One discovery that knows whether an account can work

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/healthcheck/probe.ts`, `plugins/auto-agent-selector/src/lib/discovery/real-deps.ts`
- **Gate**: type
- acceptance:
  - "One discovery service answers for every consumer: installed, version, logged in, and usable (`usable`, `needs-login`, `needs-plan`, `quota-exhausted`, `unknown`), with the evidence for each; `auto-agent-selector` and `orchestrator-runner` call it and keep no probe of their own."
  - "A client installed without a paid plan (OpenCode on 2026-10-18) reads `needs-plan` from the vendor's own answer, not from a guess; models a host client exposes through its configuration (Copilot's BYOK and hosted models) are listed by id through that client, and no value of that configuration is read."

### S3 — Quota and budget are observed, not assumed

- **Status**: pending
- **Files**: `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts`, `plugins/orchestrator-runner/src/lib/quota.ts`
- **Gate**: type
- acceptance:
  - "Every hop records what the vendor said about what is left (rate-limit headers, usage commands, limit errors) as a dated observation of the account's quota groups; a person may declare a budget per account in the personal layer (requests per window, or money)."
  - "With an observation or a declared budget, unattended hops run within it; with neither, they are refused as today. The runner's choice states what remained and why that hop fit."

### S4 — One router and one learned store

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/auto-agent-selector/src/lib/calibrate/store.ts`, `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
- **Gate**: type
- acceptance:
  - "One store keeps, per task kind, model and account: outcome against the task's own acceptance, tokens in and out, cost (measured, estimated or included in a plan, marked as which), latency and retries. `prompt-eval`, `self-learning` and the runner's journal write to it; `usage-tracking` correlates with it instead of keeping costs of its own."
  - "One ranking reads it, with what is left on each account (S3), and every consumer (`auto-agent-selector`, `orchestrator-runner`, `adaptive-optimizer`) asks it; a choice names its evidence (the observations it rests on, or that it had none)."

### S5 — A worker gets the context its task needs, by reference

- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts`, `plugins/context-for-change/src/index.ts`
- **Gate**: type
- acceptance:
  - "A delegated hop receives a bounded task pack: the slice, its acceptance, the files it may touch, the conventions it must follow, and the `context_for_change` result, under a byte budget the router sets per model; never the parent's conversation."
  - "Shared knowledge (memory, project context, the agent catalog, the work model) is named in the pack by reference and read through the same tools by every worker, so no worker holds a private copy that can drift; the pack's bytes and the hop's tokens are recorded in the S4 store."

### S6 — init and start-up offer the accounts found

- **Status**: pending
- **Files**: `packages/core/src/lib/install/ide-targets.ts`
- **Gate**: type
- acceptance:
  - "`init`, and a start-up migration in a project already using delendai, offer the accounts S2 found, once, through the host's consent; a yes writes the personal layer (S1) only, with automation off until the person turns it on per account."

### S7 — Real, consented runs feed the measurement

- **Status**: pending
- **Files**: `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "With the owner's accounts declared (S1, S6), at least one real hop per usable account runs through the runner, and its journal entry, quota observation and S4 record exist; the guide's 'Not proved yet' section lists what has now been proved and what has not. This is the evidence f00551 S7 waits for."

## f00765 — review

docs/delendai/proposals/review/f00765-a-person-s-accounts-live-outside-the-repository-in-a-personal-layer.md

A person's accounts live outside the repository, in a personal layer

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A person declares their accounts without touching a committed file, another person's accounts are never seen, and an account declared by the team can be overridden by one person alone.

### slices declarada

- global_gate: type

### S1 — The personal layer and its place

- **Status**: review
- **Files**: `packages/core/src/lib/plugins/personal-layer.service.ts`, `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/tests/src/lib/plugins/personal-layer.service.spec.ts`, `packages/core/src/lib/platform/user-directories.helper.ts`, `packages/core/src/lib/work-identity/host-chat-model.helper.ts`, `tools/scripts/lint/platform-reads.baseline.json`
- **Gate**: type
- acceptance:
  - "A project's personal file is `<userConfigRoot>/delendai/projects/<key>.json`, where `<key>` is derived from the project's identity: the normalised fetch URL of its integration remote, or the real path of the workspace when it has none, so two clones of one repository share a person's accounts and two repositories never do. One helper answers the path; a spec holds a remote, no remote, and two clones."
  - "It holds `accounts` and, per provider id, the fields that bind a provider to an account (`accountId`), validated by the same schema as the shared file; it is read when the workspace configuration is read, and a missing file is an empty layer."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `17cde649eda5`

### S2 — One merge rule, told by `--check`

- **Status**: review
- **Files**: `packages/core/src/lib/contracts/interfaces/account-layers.interface.ts`, `packages/core/src/lib/cli/run-cli.ts`, `packages/core/tests/src/lib/plugins/load-config-file.spec.ts`
- **Gate**: type
- acceptance:
  - "Accounts merge by `accountId`: a personal entry replaces a shared one with the same id whole, so one person's plan and another's key never mix fields; a personal entry with a new id is added. The registry rules (`accountIssues`) run over the merged list."
  - "`delendai --check` names, for each account, the layer it came from (`shared` or `personal`) and the personal file's path, never its values beyond what it already shows for shared accounts. A spec holds a shared-only, a personal-only, an override and a duplicate across layers."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `17cde649eda5`

### S3 — The migration moves what is personal

- **Status**: review
- **Files**: `packages/core/src/lib/workspace-migration/migrators/personal-accounts.migrator.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/personal-accounts.migrator.spec.ts`, `docs/delendai/batuta/guide.md`
- **Gate**: type
- acceptance:
  - "A start-up migration finds accounts with a `profileDir` or `credentialEnv` in `delendai.config.json`, moves them to the running person's personal file, and leaves in the shared file only what the project agreed to share (an account a team declares with neither field stays). Journalled like every migration, written atomically, and run once; a spec holds the move, the stay, and a second run that does nothing."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `17cde649eda5`

## x00909 — review

docs/delendai/proposals/review/x00909-what-the-2026-10-17-audits-confirmed-migrations-delegation-and-the-roadmap-keep-their-word.md

What the 2026-10-17 audits confirmed: migrations, delegation and the roadmap keep their word

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A namespace migration reaches every host's agents.
- A migration never deletes what cannot be regenerated.
- A delegated task carries its tools and acceptance and says what context it lacks.
- A review note, or any text spliced into a document, is written as it was given.
- A roadmap entry whose gates contradict its state is named, with the tool that closes it.
- `bun test` cannot judge a vitest spec.

### slices declarada

- global_gate: type

### S1 — A namespace migration reaches every host's agents

- **Status**: review
- **Files**:
  - `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts`
  - `packages/core/tests/src/lib/workspace-migration/namespace-prefix-transition.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The agent directories a namespace-prefix change rewrites are read from `AGENT_HOSTS`, not listed by hand; a spec renames the prefix in an OpenCode agent the old list missed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S2 — A migration keeps what does not regenerate

- **Status**: review
- **Files**:
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.constant.ts`
  - `packages/core/src/lib/workspace-migration/migrators/stray-member-cache.migrator.ts`
  - `packages/core/tests/src/lib/workspace-migration/migrators/stray-member-cache.migrator.spec.ts`
- **Gate**: type
- acceptance:
  - "A stray member cache's `evidence`, `logs` and `results` are moved into the workspace's own cache, under a directory named for the member, and only what regenerates (`runtime`, `scratch`) is deleted; the migration report says where each one went."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S3 — A delegated task carries its tools and acceptance, and says what context it lacks

- **Status**: review
- **Files**:
  - `plugins/agent-orchestrator/src/index.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`
  - `plugins/agent-orchestrator/src/lib/dispatch/delegation-manifest.service.ts`
  - `plugins/agent-orchestrator/src/lib/contracts/interfaces/delegation-manifest.interface.ts`
  - `plugins/agent-orchestrator/src/lib/policy/types.ts`
  - `plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`
  - `plugins/agent-orchestrator/tests/src/lib/dispatch/delegation-manifest.service.spec.ts`
  - `packages/contracts/src/delegated-task.interface.ts`
  - `packages/core/src/lib/subagents/delegation-prompt.helper.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/subagents/delegation-prompt.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "A delegated step's `allowedTools` are the tools of the core agent profile its role works under (scout → technical_investigator, implementer and scribe → implementation_runner, verifier and reviewer → delivery_verifier), the one list every host's agents are written from; `acceptance` is the checks `dispatch` is given for the task. The constant empty lists are gone, so an implementer is no longer told to use no tool."
  - "A file the task names that the workspace lacks, and a context source that fails, are listed in the manifest's `missingContext` with their reason, and the prompt a host gets says they are not available, instead of being left out in silence."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S5 — A roadmap entry whose gates contradict its state is named

- **Status**: review
- **Files**:
  - `plugins/roadmap/src/lib/read-model/roadmap-readiness.service.ts`
  - `plugins/roadmap/src/lib/contracts/interfaces/read-model.interface.ts`
  - `plugins/roadmap/src/lib/tools/readiness.tool.ts`
  - `plugins/roadmap/tests/src/lib/read-model/roadmap-readiness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "Readiness names, in `closable` and in its reason, every open entry whose gates all pass, with the tool that closes it. The projection stays a function of the roadmap file alone (so committed copies still compare byte for byte); moving a `proposed` entry is the owner's decision, so the four contradicted entries are reported to the owner, not rewritten."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S6 — The wrong test runner says so

- **Status**: review
- **Files**:
  - `bunfig.toml`
  - `tools/scripts/test/bun-owned-preload.ts`
  - `package.json`
- **Gate**: type
- acceptance:
  - "`bun test` on a spec outside `BUN_OWNED_SPECS` refuses with the command that runs it (`bun run test`, `bunx vitest run <file>`); `bun run test:sqlite` still runs all 477 Bun-owned tests green; the unused `test:context-compiler` script, which ran vitest specs under Bun, is removed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

### S7 — Text spliced into a document is text

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/tools/recovery-tools.ts`
  - `plugins/proposals/src/lib/services/review-entry.service.ts`
  - `plugins/proposals/src/lib/services/review-handoff.ts`
  - `plugins/proposals/src/lib/proposals/proposal-frontmatter-writer.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-note-literal.spec.ts`
  - `plugins/audit/src/lib/services/proposal-scaffolder.service.ts`
  - `plugins/test-convention/src/scan.ts`
  - `plugins/test-convention/src/suggest.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts`
  - `packages/ui-extension/src/dashboard/builders/build-panels.ts`
  - `extensions/vscode/src/commands/open-configuration-center.ts`
  - `extensions/vscode/src/commands/open-plugin-config.ts`
  - `tools/scripts/generate/preset-metadata.script.ts`
  - `tools/scripts/git/generated-merge-driver.script.ts`
  - `tools/scripts/lint/repository-identity.script.ts`
  - `tools/scripts/proposals/rename-padded.script.ts`
  - `tools/scripts/lint/no-interpolated-replacement.script.ts`
  - `tools/scripts/lint/no-interpolated-replacement.constant.ts`
  - `tools/scripts/lint/no-interpolated-replacement.script.spec.ts`
  - `package.json`
- **Gate**: type
- acceptance:
  - "Every `replace`/`replaceAll` that took an interpolated template as its replacement passes a function instead, group references included, so `$&`, `$'` and `$1` in the spliced text stay text; a review note quoting `$'` is written whole and the document keeps one copy of each slice (a spec that fails with the old splice)."
  - "`lint:no-interpolated-replacement`, chained into `lint:architecture`, refuses an interpolated template passed as a replacement string anywhere in product code or tooling."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d0f8a5c3bb1`

## x00910 — review

docs/delendai/proposals/review/x00910-what-the-hardening-review-of-2026-10-17-found-confirmations-nobody-can-give-copies-nobody-checks-and-silences.md

What the hardening review of 2026-10-17 found: confirmations nobody can give, copies nobody checks, and silences

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A tool's description has one source.
- The site publishes no data nobody produces.
- The remaining silent states are said where an agent or the owner looks.

### slices declarada

- global_gate: type

### S2 — A tool's description has one source

- **Status**: review
- **Files**:
  - `apps/web/scripts/gen-capabilities.ts`
  - `apps/web/scripts/__tests__/gen-capabilities.spec.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_accounts.ts`
  - `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`
  - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
  - `packages/core/tests/src/lib/dispatch/_fixtures/fake-runtime.ts`
- **Gate**: type
- acceptance:
  - "The site's live tool registry (`gen-capabilities` → `capabilities.json`) loads every first-party plugin under `plugins/`, from its own source: it named 13 of 61 by hand, so the site listed 142 tools of 280 and the other plugins' tools reached it only through hand-kept i18n copies. Now 280, none undocumented."
  - "A tool page's English is the long description its registration passes (read through the surface runtime's `listToolDescriptions`, since `tools/list` serves the short summary), never the catalogue's copy. The catalogue's `en` now records the English its translations were made from; a tool whose `en` differs from its registration is reported as translated from an older English, and `--strict` fails on any such tool the baseline (`stale-translations.baseline.json`, 56 measured 2026-10-18) does not already record; x00912 then translated those 56 and deleted the baseline with the code that read it, so `--strict` fails on any stale translation. A scratch workspace a closed server still writes to no longer fails the generation."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f253b607498`

### S3 — The site carries no data nobody produces

- **Status**: review
- **Files**:
  - `tools/scripts/report/token-roi.script.ts`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
  - `tools/scripts/lint/check-stray-cache-files.script.ts`
- **Gate**: type
- acceptance:
  - "`apps/web/src/data/token-roi.json` and `token-budget.json`, read by no page, are removed; the ROI report script writes to `.cache/delendai/reports/` instead of the site's data, and nothing that reads or builds the site changes. The two closed proposals that listed them (c00135, c00136) are recorded in the files-exist and slice-completeness baselines as files removed after closing, the case those baselines exist for. The cache layout check sanctions `reports/`, and `from-members/` (where x00909's migration keeps what a member's stray cache held, named by the migrator's own constant)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `7cb245385611`

### S4 — One SQLite loader, on every runtime

- **Status**: review
- **Files**:
  - `packages/sqlite/package.json`
  - `packages/sqlite/tsconfig.json`
  - `packages/sqlite/vitest.config.ts`
  - `packages/sqlite/AGENT.md`
  - `packages/sqlite/src/index.ts`
  - `packages/sqlite/src/lib/load-database-class.helper.ts`
  - `packages/sqlite/src/lib/node-sqlite-database.helper.ts`
  - `packages/sqlite/tests/src/lib/load-database-class.helper.spec.ts`
  - `packages/sqlite/tests/src/lib/node-sqlite-database.helper.spec.ts`
  - `packages/state-telemetry/src/lib/eta/duration-history.ts`
  - `packages/state-telemetry/src/lib/events/work-event-store.sqlite.ts`
  - `packages/core/src/lib/evidence/evidence-repo.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.ts`
  - `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`
  - `packages/proposals-sqlite/src/lib/work-model/startup-state-ports.ts`
  - `apps/web/public/logos/plugin-sqlite.svg`
  - `tools/scripts/release/release-plan.ts`
  - `tsconfig.base.json`
  - `vitest.shared.ts`
  - `tools/scripts/lint/core-runtime-deps.script.ts`
  - `tools/scripts/compile/build.script.ts`
  - `packages/cli/package.json`
  - `docs/delendai/proposals/done/feats/f00641-the-proposals-database-runs-on-node-as-well-as-bun.md`
- **Gate**: type
- acceptance:
  - "Telemetry (duration history and work-event store) opens its database through the one cross-runtime loader, `@delendai/sqlite`, under Bun and under Node; the proposals store reads the same package, and the evidence store resolves through it too while keeping its own rule of opening SQLite only under Bun (under Node it keeps the file backend, as every assembly in a Node test run reaches it). The three copies of the loader are gone."
  - "The loader is a small public package both depend on (`state-sqlite` is private, so a published package cannot depend on it, and telemetry depending on the proposals store would couple them); it ships with its logo, its place in the publish order before `packages/core`, its build, and its specs among the Bun-owned ones, and on the core's runtime allow-list with its reason. The build now names the package and the reason when one fails before running a command (it printed only an exit code, which hid that `packages/cli` bundles telemetry and so must declare the loader)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `f2bc98e0de18`

### S5 — A roster entry without an account is isolated too

- **Status**: review
- **Files**:
  - `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/account-environment.service.spec.ts`
  - `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts`
  - `plugins/orchestrator-runner/src/lib/services/account-status.service.ts`
  - `plugins/orchestrator-runner/tests/src/lib/services/account-status.service.spec.ts`
  - `plugins/orchestrator-runner/src/lib/tools/accounts.tool.ts`
  - `plugins/orchestrator-runner/src/lib/tools/index.ts`
  - `plugins/orchestrator-runner/src/lib/schemas.ts`
  - `plugins/orchestrator-runner/src/lib/contracts/interfaces/accounts-tool-options.interface.ts`
  - `packages/core/src/lib/contracts/constants/provider-entry-schema.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/provider-capabilities.interface.ts`
  - `packages/core/schema/delendai.config.schema.json`
- **Gate**: type
- acceptance:
  - "A CLI roster entry with no account that names the variables it needs (`invoke.env`) starts from the same allowlist as an account's process plus those variables, never the server's whole environment."
  - "Decided 2026-10-18 (autonomous, the option that breaks nobody): a legacy `cli` entry that names neither an account nor `invoke.env` keeps inheriting, because isolating it could take a key a provider reads from the environment (`aider` with `OPENAI_API_KEY`); the `accounts` tool lists every such entry (`inheriting`) so its owner can name an account or its variables. No layout changes, so no migration: an entry opts in by naming its variables."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b2c7c3020b97`

### S6 — Hydration does not make a unit look alive

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/unit-activity.helper.ts`
  - `packages/core/src/lib/work-units/unit-standings.service.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/tests/src/lib/work-units/unit-activity.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "A unit's standing, a hanging work ref and a stalled publication are dated by their own last work — the latest commit on them that is not a merge and is not on the integration branch — not by their tip, which every merge of the integration branch moves. A unit with no work of its own is dated by when it was first touched; one holding nothing beyond the integration branch, by its tip. One helper serves all three."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `720ad37447ac`

### S7 — A red publication is said to its author

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/publication-disposition.interface.ts`
  - `packages/core/src/lib/contracts/constants/publication-dispositions.constant.ts`
  - `packages/core/src/lib/work-units/publication-dispositions.service.ts`
  - `packages/core/src/lib/work-units/work-unit-status.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/work-units/publication-dispositions.service.spec.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/lint/check-stray-cache-files.script.ts`
- **Gate**: type
- acceptance:
  - "The queue refresh keeps its last verdict on each pull request in `<cache>/forge/publication-dispositions.json`; `work status` names each one that waits on its author (`waits on author #N <ref>: <why>`), which the refresh used to repeat only in its own log, every pass."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f4a2eda256c`

### S8 — A stale server says so

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/code-freshness.interface.ts`
  - `packages/core/src/lib/cli/code-freshness.service.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/cli/code-freshness.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The `delendai` status collector reports `code`: `stale` with the reason and the restart to do, read from x00701's stale-runtime watch (the one every tool result's advisory and the supervisor's restart use), not from a second detector. The first version of this slice carried its own git probe; it duplicated that watch and was replaced by it."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f4a2eda256c`

### S9 — Who made a piece of work is recorded

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/commit-maker-notes.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/commit-maker.interface.ts`
  - `packages/core/src/lib/work-units/commit-maker-notes.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/work-units/commit-maker-notes.service.spec.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `plugins/proposals/src/lib/services/carried-work.service.ts`
  - `plugins/proposals/tests/src/lib/services/carried-work.service.spec.ts`
- **Gate**: type
- acceptance:
  - "After each commit in a unit's worktree, the post-commit guard writes a git note (`maker`, `unit`, and `session` when known) under the agent's own notes ref `refs/notes/delendai/<agent>` and pushes it; the forge shows no notes, so nothing reaches the surface f00500 keeps free of AI names."
  - "Several instances of one model share its name and, on one machine, its notes ref: the unit tells them apart; a write that loses the ref's lock to another instance is retried, and a push refused because another instance pushed first merges both (`cat_sort_uniq`) and pushes again. Specs: two instances writing at once keep both notes; two clones of one agent pushing in turn leave both notes readable from a third clone."
  - "`carriedFrom` reads the recorded makers first (fetching every agent's notes beside the local ones) and falls back to inference only for commits made before; work another instance of the same model made stays that model's, so only another agent is named as a maker."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f4a2eda256c`

### S10 — The unit of a proposal in progress is not reaped

- **Status**: review
- **Files**:
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.spec.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/src/lib/wip-engine/proposal-in-progress.helper.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
- **Gate**: type
- acceptance:
  - "A work ref whose proposal is in progress on the integration branch keeps its worktree and ref however spent it looks: every merged slice leaves it so. Its publications are still reaped. A spec that fails without the check reproduces the reaped unit."
  - "The host server's checkout publisher no longer withdraws such a ref from the forge once its work landed (and puts it back when an older rule did): the forge showed f00551 and x00910 in progress with no unit, and the queue's doctor reddened develop on `in-progress-has-units`. A spec that fails without the check keeps the ref on the remote."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `0f4a2eda256c`

### S11 — One check for a declared file

- **Status**: review
- **Files**:
  - `tools/scripts/lint/proposal-files-exist.script.ts`
  - `tools/scripts/lint/proposal-files-exist.script.spec.ts`
  - `tools/scripts/lint/proposal-files-exist.baseline.json`
  - `tools/scripts/lint/proposal-slice-completeness.script.ts`
  - `tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
- **Gate**: type
- acceptance:
  - "Whether a proposal's declared files exist is checked once, by `proposal-files-exist`, with one baseline; it also refuses a pattern in a slice that ran, which `proposal-slice-completeness` used to say. `proposal-slice-completeness` keeps only what is its own (a slice left behind, a file under an ignored path), so one missing file is one debt entry, not two: the two baselines held 1154 entries and now hold 615, with nothing newly allowed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `7cb245385611`

### S12 — Specs do not depend on where they are run from

- **Status**: review
- **Files**:
  - `tools/scripts/test/hermetic-cwd-setup.ts`
  - `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "A setup file shared by every vitest project runs each spec from the repository root, so running a package's specs from the package directory gives the same results as from the root (the two specs that failed on root-relative paths pass) and no run writes a cache under the package."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `f2bc98e0de18`

## x00911 — review

docs/delendai/proposals/review/x00911-one-authority-for-a-work-ref-s-life-one-maintainer-per-workspace-and-never-on-stale-code.md

One authority for a work ref's life, one maintainer per workspace, and never on stale code

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A work ref's life is decided by one rule, read by everything that acts on refs or judges them.
- One process per workspace runs ref-changing maintenance.
- A server behind its checkout changes no ref.
- A ref pushed and deleted in a loop is reported.

### slices declarada

- global_gate: type

### S1 — One rule for a work ref's life

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/work-ref-lifecycle.interface.ts`
  - `packages/core/src/lib/work-units/work-ref-lifecycle.service.ts`
  - `packages/core/tests/src/lib/work-units/work-ref-lifecycle.service.spec.ts`
  - `packages/core/src/lib/wip-engine/proposal-in-progress.helper.ts`
  - `packages/core/src/lib/wip-engine/landed-work-ref.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.interface.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.spec.ts`
  - `plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`
  - `plugins/commit-policy/src/lib/contracts/interfaces/integrated-work-refs.interface.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
  - `plugins/commit-policy/tests/src/lib/services/integrated-work-refs.service.spec.ts`
- **Gate**: type
- acceptance:
  - "One core service (`workRefFate`) answers, for a work ref: keep it on the forge, put it back, withdraw it, or reap it with its clean worktree, with the reason; a spec holds the table. It reads a landed ref's proposal on the integration branch alone (a landed tip that still says in progress is history) and an unlanded one at its tip too."
  - "Every component that ends a work ref as maintenance reads it instead of its own condition: the checkout publisher (restores a lost unit once, then leaves it; withdraws only a ref on the forge), the ref maintenance (both reap paths, the one without a worktree included, which reaped open units' refs here and on the forge; it now restores too), the doctor's `no-remote-work-refs`, and the commit-policy checkpoint reaper, which deleted every other agent's integrated ref on each checkpoint, open proposals' units included. `in-progress-has-units` reads the same integration reading the rule does."
  - "Explicit ends by the unit's owner (`work publish`, `work retire`, adoption, `forge:publish`) are not maintenance and stay theirs."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d7ee0bb7fbc`

### S2 — One maintainer per workspace

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/maintenance-lease.constant.ts`
  - `packages/core/src/lib/contracts/interfaces/maintenance-lease.interface.ts`
  - `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
  - `packages/core/tests/src/lib/development-policy/maintenance-lease.service.spec.ts`
  - `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/src/lib/cli/assemble-core-tools.ts`
  - `packages/core/src/lib/wip-engine/work-checkout-publisher.ts`
  - `packages/core/tests/src/lib/wip-engine/work-checkout-publisher.spec.ts`
  - `packages/core/src/lib/startup-reconciler/hydration-watch.ts`
  - `packages/core/src/lib/startup-reconciler/hydration-watch.interface.ts`
  - `packages/core/tests/src/lib/startup-reconciler/hydration-watch.spec.ts`
  - `packages/core/src/lib/startup-gate/start-checkout-hydration.ts`
  - `packages/core/src/lib/startup-gate/start-checkout-hydration.interface.ts`
  - `tools/scripts/host/host-server.script.ts`
- **Gate**: type
- acceptance:
  - "Background maintenance that changes refs or moves the checkout (checkout publishing, hydration, candidate refresh) runs only in the process holding the workspace's maintenance lease (`<cacheDir>/startup/maintainer.lease`): taken by an atomic link, renewed by a heartbeat on its own clock, taken over when its holder is silent past the lease or dead on this machine, given up on shutdown. The holder is machine, process and a boot nonce, never an agent name, so two sessions of one model are two holders. Every other server serves, and `status` says which process maintains without taking the lease (a one-off command never becomes the maintainer). A spec holds two servers on one lease."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `10efcb475628`

### S3 — Stale code serves, but does not maintain

- **Status**: review
- **Files**:
  - `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
  - `plugins/commit-policy/src/index.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`
  - `plugins/commit-policy/src/lib/persistence/wip-persistence.interface.ts`
  - `plugins/commit-policy/src/lib/contracts/interfaces/integrated-work-refs.interface.ts`
  - `plugins/commit-policy/tests/src/lib/persistence/integrated-work-refs.persistence.spec.ts`
- **Gate**: type
- acceptance:
  - "A server whose runtime is behind its checkout (the existing `createStaleRuntimeWatch` reading, not a second detector) gives up the maintenance lease, so a current server takes over, and runs no ref-changing step until it restarts; the checkpoint sweep, which runs inside an agent's own checkpoint, stands down too and says so in its report (`reaped.stoodDown`). The log says each change of standing once, and `status` says why. A supervised server still restarts onto the new code as today."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `9bd6c4a2e459`

### S4 — A loop on a ref is said

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/work-ref-moves.interface.ts`
  - `packages/core/src/lib/work-units/work-ref-moves.service.ts`
  - `packages/core/tests/src/lib/work-units/work-ref-moves.service.spec.ts`
  - `packages/core/src/lib/wip-engine/landed-work-ref.ts`
  - `packages/core/src/lib/work-units/workflow-doctor.service.ts`
  - `packages/core/src/lib/work-units/work-unit-status.service.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
  - `plugins/commit-policy/src/lib/services/integrated-work-refs.service.ts`
- **Gate**: type
- acceptance:
  - "The checkout publisher, the ref maintenance and the checkpoint sweep record each removal of a work ref from the forge and each return to it, with the component and process, in the clone's git directory (shared by its worktrees, never committed, kept to a day past 512 KB). A ref taken and put back more than twice in a day is reported by the doctor (`no-work-ref-loops`) and `work status`, naming the components on each side."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2d7ee0bb7fbc`

## x00912 — review

docs/delendai/proposals/review/x00912-every-tool-page-is-translated-from-the-english-its-tool-registers.md

Every tool page is translated from the English its tool registers

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- Every tool page reads, in every language, the description its tool registers.
- No baseline excuses a stale translation.

### slices declarada

- global_gate: type

### S1 — The proposals tools

- **Status**: review
- **Files**:
  - `apps/web/src/i18n/tools/delendai_proposals_agent_worktree.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_auto_work.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_branch_gc.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_branch_status.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_close_slice.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_compact_status.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_get_proposal_workflow.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_adopt.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_board.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_force_transition.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_proposal_review.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_state_health.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_swarm_hygiene.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_sync_proposals.ts`
  - `apps/web/src/i18n/tools/delendai_proposals_task_queue.ts`
- **Gate**: type
- acceptance:
  - "The 15 proposals tools in the baseline carry, in their catalogue entry, `en` equal to their registration's description and eleven translations made from it; they leave the baseline (56 → 41), and `gen-capabilities --strict` passes."
  - "Found on the way: `agent_worktree` registers a description rendered from the project's development profile, so the site shows the one the harvest's scratch project gets (`shared-checkout-merge`) and calls it 'this project'. Translated as registered; a site page that states one profile's flow is a defect of its own, left for the slice that owns the site's tool pages to raise."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `ab8c78107820`

### S2 — The orchestration tools

- **Status**: review
- **Files**:
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_ack.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_call.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_catalog.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_status.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_suggest.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_validate_config.ts`
  - `apps/web/src/i18n/tools/external-mcps/delendai_external-mcps_verify_result.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_advise_routing.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_advise_spend.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_bootstrap_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_discover_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_get_quota.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_healthcheck_providers.ts`
  - `apps/web/src/i18n/tools/orchestrator-runner/delendai_orchestrator-runner_invoke.ts`
  - `apps/web/src/i18n/tools/usage-tracking/delendai_usage-tracking_usage_clear.ts`
  - `apps/web/src/i18n/tools/usage-tracking/delendai_usage-tracking_usage_report.ts`
- **Gate**: type
- acceptance:
  - "The external-mcps (7), orchestrator-runner (7) and usage-tracking (2) tools in the baseline are translated from their registration's English and leave the baseline (41 → 25); `gen-capabilities --strict` passes."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `3c526c77e2a1`

### S3 — The rest, and no baseline

- **Status**: review
- **Files**:
  - `apps/web/src/i18n/tools/delendai_agent-orchestrator_plan.ts`
  - `apps/web/src/i18n/tools/delendai_analyze_project.ts`
  - `apps/web/src/i18n/tools/delendai_audit_consolidate.ts`
  - `apps/web/src/i18n/tools/delendai_audit_plan.ts`
  - `apps/web/src/i18n/tools/delendai_deps_deps_list.ts`
  - `apps/web/src/i18n/tools/delendai_docs_docs_read.ts`
  - `apps/web/src/i18n/tools/delendai_docs_docs_search.ts`
  - `apps/web/src/i18n/tools/delendai_knowledge.ts`
  - `apps/web/src/i18n/tools/delendai_logs_correlate.ts`
  - `apps/web/src/i18n/tools/delendai_logs_query.ts`
  - `apps/web/src/i18n/tools/delendai_logs_subscribe.ts`
  - `apps/web/src/i18n/tools/delendai_logs_tail.ts`
  - `apps/web/src/i18n/tools/delendai_memory_forget.ts`
  - `apps/web/src/i18n/tools/delendai_memory_list.ts`
  - `apps/web/src/i18n/tools/delendai_memory_recall.ts`
  - `apps/web/src/i18n/tools/delendai_memory_save.ts`
  - `apps/web/src/i18n/tools/delendai_metrics.ts`
  - `apps/web/src/i18n/tools/delendai_notification_await_lock.ts`
  - `apps/web/src/i18n/tools/delendai_overview.ts`
  - `apps/web/src/i18n/tools/delendai_plan_mcp_project.ts`
  - `apps/web/src/i18n/tools/delendai_quality_run_quality.ts`
  - `apps/web/src/i18n/tools/delendai_rules_apply_rules.ts`
  - `apps/web/src/i18n/tools/delendai_rules_check_rules.ts`
  - `apps/web/src/i18n/tools/delendai_rules_get_rules.ts`
  - `apps/web/src/i18n/tools/delendai_search_search.ts`
  - `apps/web/scripts/gen-capabilities.ts`
  - `apps/web/scripts/__tests__/gen-capabilities.spec.ts`
  - `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`
  - `packages/core/src/lib/cli/assemble-plugins.ts`
  - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
  - `packages/core/tests/src/lib/project/tool-surface-runtime.descriptions.spec.ts`
  - `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/agent-worktree.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "The remaining 25 tools are translated from their registration's English; the baseline file is deleted with the code that reads it, so `gen-capabilities --strict` fails on any tool whose translations were made from an English other than its registration's, and passes today. A tool whose description is adapted to the project served declares what it does anywhere (`IToolRegistration.catalogDescription`), and the site reads that: `agent_worktree` read as 'not used under this project's development profile' on a page about the tool, and its general text carried an internal proposal id, now gone. What the harvest lacks is said by one function (`gapMessages`), and a scratch workspace that cannot be removed is reported, both tested (the file's branch coverage had fallen under the gate)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `cdc8242656ff`

## x00913 — review

docs/delendai/proposals/review/x00913-a-lazy-start-imports-only-the-plugins-whose-configuration-it-must-check.md

A lazy start imports only the plugins whose configuration it must check

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A lazy start checks every configuration it checked before, and imports nothing else.

### slices declarada

- global_gate: type

### S1 — Import what the check needs

- **Status**: review
- **Files**:
  - `packages/core/src/lib/plugins/managed-lazy-runtime.ts`
  - `packages/core/src/lib/plugins/managed-lazy-catalog.generated.ts`
  - `packages/core/tests/src/lib/plugins/managed-lazy-configuration.spec.ts`
  - `tools/scripts/generate/managed-lazy-catalog.script.ts`
  - `tools/scripts/generate/managed-lazy-catalog.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The managed-lazy catalogue records `startupCheck` for a plugin whose options schema rejects `{}` or that declares `validateConfiguration` (generated by `needsStartupCheck`, never hand-written: today commit-policy and proposals); the start-up check imports a plugin only when the user configured it or it carries that flag. A spec holds that an unconfigured plugin is not imported, that a configured plugin with invalid options still fails at start-up, and that a plugin's configuration check still runs. Measured 2026-10-18 (`assembleCliConfig`, `--preset=full`, lazy, warm): 418–451 ms before, 275–280 ms after."
  - "A plugin nobody configured whose module fails to import now fails at its first use instead of at start-up: that is a packaging failure the catalogue generator meets first, not a configuration error."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `32099bc39489`

## x00914 — review

docs/delendai/proposals/review/x00914-token-budgets-measure-what-reaches-the-model.md

Token budgets measure what reaches the model

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- No token budget is measured on a string the model does not receive.
- The cold-start answer's next action is one the agent has not taken.

### slices declarada

- global_gate: type

### S1 — Count the payload the model gets

- **Status**: review
- **Files**:
  - `tools/scripts/report/token-budget-report-lib.ts`
  - `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "A tool's measured bytes are its structured content's when it returns one, its text otherwise (`payloadBytes`), for every row of the dashboard and the gate; the dashboard is regenerated and every row stays within its hard budget, or the payload that breaches is shrunk in this slice. Regenerated 2026-10-18: overview full 55 → 2,105 B (managed) and 56 → 14,485 B (native), overview compact 63 → 875 / 64 → 2,419 B, agent_catalog 32 → 745 / 33 → 10,212 B, logs_tail 28 → 63 B; every row within its hard budget. `agent_catalog full` is over its warning (10,212 > 9,800 B), now measured for the first time."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b6003e1c5e8c`

### S2 — The cold start points past itself

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/skills/proposals-workflow-contribution.ts`
  - `plugins/proposals/tests/src/lib/skills/proposals-workflow-contribution.spec.ts`
  - `packages/core/tests/src/lib/cli/assemble-skills.spec.ts`
- **Gate**: type
- acceptance:
  - "The proposals workflow contribution recommends `<prefix>_proposals_auto_work` without naming the cold-start call that delivers it."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b6003e1c5e8c`

### S3 — A work plan names only the plugins the server has

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/auto-work.tool.ts`
  - `plugins/proposals/src/index.ts`
  - `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "Found while measuring S1: every `auto_work` work plan carried 'if the logs plugin is loaded' and 'if the notification plugin is loaded' steps, and a claim step naming `notification_await_lock`, whatever the server loaded (the token fixture loads neither). The plan now reads the peer registry at call time: a step about an absent plugin is left out, a present plugin's step drops its 'if loaded' clause, and a host that gives no registry keeps every step as before. A spec holds the three cases."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `a7c146bfbd91`

## x00915 — review

docs/delendai/proposals/review/x00915-what-is-repeated-comes-from-one-place.md

What is repeated comes from one place

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- Every fact a slice names is read from one source.

### slices declarada

- global_gate: type

### S1 — One list of what a hook leaks

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/hook-git-environment.constant.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/hidden-work.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/cli/src/lib/generated-refresh.service.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
- **Gate**: type
- acceptance:
  - "`HOOK_GIT_ENVIRONMENT` lists every variable any copy stripped (the object-directory pair included), and the six places strip through `hookFreeEnvironment` (exported from `@delendai/core/runtime` too, for scripts) instead of their own loop or list; no other list of these names remains in source (`grep -rn \"'GIT_DIR'\" packages plugins tools` finds only the constant)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `8b09da09fb4e`

## x00916 — review

docs/delendai/proposals/review/x00916-every-synchronous-git-read-goes-through-one-reader.md

Every synchronous git read goes through one reader

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A plain synchronous git read has one implementation, and it is hook-safe.

### slices declarada

- global_gate: type

### S1 — One reader, where everyone can reach it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/shared/git-read.helper.ts`
  - `packages/core/src/lib/shared/git-command.helper.ts`
  - `packages/core/src/lib/contracts/interfaces/git-read.interface.ts`
  - `packages/core/src/lib/contracts/interfaces/git-command.interface.ts`
  - `packages/core/src/lib/work-units/work-unit-shared.service.ts`
  - `packages/core/src/runtime/index.ts`
  - `packages/core/tests/src/lib/shared/git-read.helper.spec.ts`
  - `packages/core/tests/src/lib/shared/git-command.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "`readGit` (hook-safe, trimmed, `undefined` on failure) and `gitVerbatim` (untrimmed) live in `packages/core/src/lib/shared/git-read.helper.ts`, take `maxBuffer` and `input`, and are exported from `@delendai/core/runtime`; `work-unit-shared.service.ts` re-exports them so its importers do not move. `gitVerbatim` used to pass a hook's `GIT_DIR` through; it no longer does."
  - "Four modules also carried a command wrapper answering `{ ok, out }` with git's stderr on failure; `runGitCommand` (`shared/git-command.helper.ts`, hook-safe, extra variables, a `hookFree` switch for nested commands under a merge's index) is that one wrapper."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `80351b98b67c`

### S2 — The packages read through it

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/publication-target.service.ts`
  - `packages/core/src/lib/work-units/forge-work-refs.service.ts`
  - `packages/core/src/lib/work-units/hidden-work.service.ts`
  - `packages/core/src/lib/work-units/workflow-invariants.service.ts`
  - `packages/core/src/lib/work-units/work-swarm.service.ts`
  - `packages/core/src/lib/work-units/work-publish.service.ts`
  - `packages/core/src/lib/work-units/local-certification.service.ts`
  - `packages/core/src/lib/work-units/worktree-husks.service.ts`
  - `packages/core/src/lib/development-policy/default-branch.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/cli/src/commands/guard.command.ts`
  - `packages/cli/src/commands/review.command.ts`
  - `packages/cli/src/lib/generated-refresh.service.ts`
  - `packages/cli/src/lib/generated-merge-driver.service.ts`
  - `packages/cli/src/lib/review/review-releases.service.ts`
  - `packages/cli/src/lib/review/review-pack-check.service.ts`
- **Gate**: type
- acceptance:
  - "Every plain-read or `{ ok, out }` git wrapper under `packages/` and `plugins/` delegates to the shared helpers. The ones that stay, each for the option it needs: `packages/cli/src/lib/guard-hooks.service.ts` (`locateHooks` throws when git cannot say), `packages/core/src/lib/work-units/unit-ref-rename.service.ts` (throws, so a failed step aborts the rename), `plugins/proposals/src/lib/services/proposal-markdown-at-commit.ts` (binary `Buffer` output, throws), `packages/test-kit/src/lib/working-state.helper.ts` (the test kit does not depend on core), and the async `stale-runtime-advisory.ts` (a non-goal)."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `a57671985e95`

### S3 — The scripts read through it

- **Status**: review
- **Files**:
  - `tools/scripts/lint/publication-scope.script.ts`
  - `tools/scripts/git/prepare-clone.script.ts`
  - `tools/scripts/git/ended-reservations.service.ts`
  - `tools/scripts/git/refresh-candidate-artifacts.script.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `tools/scripts/git/maintain-ref-namespace.script.ts`
- **Gate**: type
- acceptance:
  - "Every `tools/scripts` wrapper of the plain-read shape (try `execFileSync('git', …)`, trimmed or not, `''` or `undefined` on failure) delegates to the reader from `@delendai/core/runtime`, and the three that strip a hook's variables on purpose use `runGitCommand` with `hookFree`. The hook scripts stay as they are: run in the hook's own worktree, they mean to answer about it (`refuse-integration-commit` reads the commit being made), and the reader would answer about `repoRoot()` instead when that is another checkout. The other shapes stay too, named: throwing wrappers (`lint/candidate-delivers`, `lint/verdicts-through-the-tool`, `lint/closed-with-independent-approval`, `reclaim/reclaim-local`, `forge/sync-with-integration`, `git/rewrite-llm-attribution`), `spawnSync` with a status check (`forge/release-checkout`, `lint/no-llm-attribution`), untrimmed large-buffer reads (`reclaim/reclaim-worktrees`, `lint/publication-scope` before this slice), and inline calls without a wrapper."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `d649733e9637`

## x00917 — review

docs/delendai/proposals/review/x00917-worktree-gc-and-the-ci-reaper-read-the-one-rule-for-a-work-ref-s-life.md

Worktree GC and the CI reaper read the one rule for a work ref's life

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- No component removes, or offers to remove, the unit of a proposal in progress.

### slices declarada

- global_gate: type

### S1 — Worktree GC asks the rule

- **Status**: review
- **Files**: `packages/core/src/lib/ref-lifecycle/branch-delivery.service.ts`, `packages/core/tests/src/lib/ref-lifecycle/branch-delivery.spec.ts`
- **Gate**: type
- acceptance:
  - "A work ref whose proposal the rule holds open (on the integration branch, or at an unlanded tip) is not delivered, with the rule's reason; `branch_gc`, `swarm_hygiene` and `auto_work`'s hygiene lines then keep its worktree. A spec holds an in-progress unit kept and a closed one's removed."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `84ebce7f12da`

### S2 — The CI reaper asks the rule

- **Status**: review
- **Files**: `tools/scripts/lint/in-progress-work-refs.helper.ts`, `tools/scripts/lint/in-progress-work-refs.helper.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`
- **Gate**: type
- acceptance:
  - "`keepInProgressWorkRefs` keeps a reapable work ref when the rule holds its proposal open, reading the integration branch's tree as well as the ref's tip, so a unit whose tip predates its proposal's move to in progress is kept and one whose proposal the integration branch closed is reaped; a spec holds both."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `84ebce7f12da`

## x00918 — review

docs/delendai/proposals/review/x00918-a-work-plan-states-the-work-model-it-runs-under.md

A work plan states the work model it runs under

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- An agent following only `auto_work` starts and lands work the way the policy says.

### slices declarada

- global_gate: type

### S1 — The plan names the work model

- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/index.ts`, `packages/core/src/plugin/index.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`
- **Gate**: type
- acceptance:
  - "With a resolved development policy, the work plan's first step is the profile's one-line work model (`workModelSummary`), read from the policy, not written in the tool; without one the plan is as before. A spec holds both."
  - "The plan's hygiene lines name the branch they measure against (the snapshot's base, not a literal `develop`) and every tool it points to under the plugin's prefix (`<prefix>_branch_gc`, `<prefix>_agent_worktree`, `<prefix>_continue_proposal`, not unprefixed names no server registers). Specs hold both."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `b625f0e2545f`

## x00919 — review

docs/delendai/proposals/review/x00919-agent-facing-text-names-tools-by-their-registered-names.md

Agent-facing text names tools by their registered names

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- No agent-facing line in the proposals plugin names a tool the server does not register.

### slices declarada

- global_gate: type

### S1 — Core names a peer's tool

- **Status**: review
- **Files**: `packages/core/src/lib/plugins/plugin-tool-name.helper.ts`, `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/cli/assemble-core-tools.ts`, `packages/core/src/lib/plugins/managed-lazy-runtime.ts`, `packages/core/tests/src/lib/plugins/plugin-tool-name.helper.spec.ts`, `packages/core/tests/src/lib/cli/assemble.tool-name-of.spec.ts`
- **Gate**: type
- acceptance:
  - "The plugin context offers `toolNameOf(plugin, toolId)`, returning the name the server registers that plugin's tool under (its configured prefix, under the core prefix), built by the same expression `assemble` uses for `namespacePrefix`. A spec holds a default and a configured prefix."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `da903cb32550`

### S2 — The proposals plugin uses it

- **Status**: review
- **Files**: `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/lib/locks/engine.ts`, `plugins/proposals/src/lib/locks/lock-paths.ts`, `plugins/proposals/tests/src/lib/auto-work.spec.ts`, `plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts`
- **Gate**: type
- acceptance:
  - "`auto_work`'s steps name the logs and notification tools, and the lock engine's needs-worktree refusals name the worktree tool, by their registered names. Specs hold each."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `da903cb32550`

## x00920 — review

docs/delendai/proposals/review/x00920-the-remedy-for-a-stray-ref-can-be-followed.md

The remedy for a stray ref can be followed

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- After `work retire` on each stray ref holding work, and the reaper on the rest, `no-stray-refs` holds, and every tip is on the forge.

### slices declarada

- global_gate: type

### S1 — A copy of what the forge holds is reaped

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/stray-refs-reap.service.ts`, `packages/core/src/lib/work-units/stray-refs-reap.interface.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The stray-ref reaper also removes a ref whose tip is the tip of a ref the forge holds, or is contained in one, and reports why; a ref holding a commit the forge lacks is still left. A spec holds both."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `c777e9403097`

### S2 — A stray tip is retired by the command the remedy names

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/stray-ref-retire.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/stray-refs.service.ts`, `packages/core/tests/src/lib/work-units/stray-ref-retire.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work retire --ref=<a ref no-stray-refs names> --reason=<why>` keeps its tip on the forge under the retired namespace, for the retiring agent, then deletes the local ref; a ref inside a managed namespace other than work and publication is still refused. The invariant's remedy names exactly this. A spec holds the round trip."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `c777e9403097`

## x00921 — review

docs/delendai/proposals/review/x00921-a-unit-starts-from-the-newer-of-the-two-integration-tips.md

A unit starts from the newer of the two integration tips

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A unit entered after a fetch, before the shared checkout fast-forwards, contains everything the forge's integration branch has.

### slices declarada

- global_gate: type

### S1 — The newer tip is the base

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/tests/src/lib/work-units/integration-base.spec.ts`
- **Gate**: type
- acceptance:
  - "When the local integration branch is an ancestor of its remote-tracking copy, `integrationBase` returns the remote-tracking commit, under every model; when the local branch holds commits the forge lacks, the answer is as before. A spec holds behind, ahead under a pull-request model, and ahead under a direct model."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `c561146179c2`

## x00922 — review

docs/delendai/proposals/review/x00922-a-review-that-could-not-run-hands-the-slice-back-to-the-queue.md

A review that could not run hands the slice back to the queue

Cobertura: aceptación pendiente de comprobar contra código, salvo notas dirigidas en architecture-roadmap.md.

### acceptance declarada

- A reviewer who could not verify a slice is told to give the claim back, the slice stays in the queue, and a resubmission note says its words once.

### slices declarada

- global_gate: type

### S1 — The review tool sends an unverified slice back to the queue

- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `apps/web/src/i18n/tools/delendai_proposals_proposal_review.ts`, `plugins/proposals/tests/src/lib/review-without-verdict.spec.ts`
- **Gate**: type
- acceptance:
  - "`proposal_review`'s description, its no-commit refusal and the review workflow knowledge tell a reviewer who could not verify a slice to record no verdict and give the claim back with `review_claim { release: <what stopped it> }`, never `request_changes`; the site's copy of the description says the same in every language. A spec holds the tool description and the workflow text."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `cb0e07a01f35`

### S2 — A note is written once

- **Status**: review
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review.ts`, `plugins/proposals/tests/src/lib/proposal-review.spec.ts`
- **Gate**: type
- acceptance:
  - "A resubmission note that already begins with the words the tool adds (`resubmitted;`, `answers the request above:`) is recorded without repeating them. A spec holds it."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `cb0e07a01f35`
