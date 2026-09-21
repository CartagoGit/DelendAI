---
id: f00551
title: "DelendAI Batuta — orquestación multicuenta mediante el plugin y MCP existentes"
kind: feat
status: ready
type: proposal
track: batuta
date: 2026-09-20
---

# f00551 — DelendAI Batuta — orquestación multicuenta mediante el plugin y MCP existentes

## Goal

Implementar Batuta según la especificación íntegra preservada debajo. La nota de BORRADOR pertenece a la fuente histórica; el estado operativo lo fija el frontmatter canónico. S0 y S1a tienen scopes concretos. S1–S8 permanecen pendientes y exigen desglose de producto bajo claims antes de ejecutar; su planning no acredita su aceptación. El checkout compartido permanece en la rama de integración conforme a la política actual; se usan refs de trabajo sin cambiar HEAD.

## why

El usuario autoriza registrar la propuesta final e iniciar implementación. El registro canónico conserva la especificación completa; comenzar por reconciliación y el incremento acotado S1a.

## non-goals

- Nuevo CLI, editor, aplicación o daemon obligatorio de Batuta.
- Inspeccionar cuentas/credenciales o habilitar gasto sin consentimiento explícito adicional.
- Declarar soporte real mediante mocks o reabrir propuestas históricas congeladas.

## Slices

- global_gate: e2e

### S0 — Reconciliación del diseño con código, propuestas y ownership actuales
- **Status**: pending
- **Files**: `docs/delendai/batuta/reconciliation.md`
- **Gate**: lint
- acceptance:
  - "Matriz existente/faltante sobre el SHA inspeccionado y antecedentes canónicos; no confundir dispatch real con passthrough."
  - "Sin inspección de cuentas o credenciales, sin ejecución de proveedores ni gasto; primer incremento definido con rutas exclusivas."
- review-state: in_review
- review-implementer: codex-batuta-orchestrator
### S1a — Conectar roster raíz al runner manteniendo override explícito
- **Status**: pending
- **DependsOn**: [S0]
- **Files**: `packages/core/src/lib/plugins/plugin-contract.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/tests/src/lib/cli/assemble.spec.ts`, `plugins/orchestrator-runner/src/index.ts`, `plugins/orchestrator-runner/src/lib/options.ts`, `plugins/orchestrator-runner/tests/src/lib/plugin.spec.ts`, `plugins/orchestrator-runner/README.md`
- **Gate**: type
- acceptance:
  - "El contexto del plugin recibe providers de la configuración raíz; options.providers prevalece incluso cuando es []."
  - "Pruebas de registro, routing y ausencia de roster; executeApi:false sigue rechazando gasto. No equivale al registro multicuenta de S1."

### S1 — Registro canónico multicuenta y migraciones
- **Status**: pending
- **DependsOn**: [S1a]
- **Files**: `docs/delendai/batuta/planning/accounts.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S1 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S2 — Descubrimiento con consentimiento y wizard MCP
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `docs/delendai/batuta/planning/onboarding.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S2 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S3 — Adaptadores de ejecución reales y perfiles aislados
- **Status**: pending
- **DependsOn**: [S2]
- **Files**: `docs/delendai/batuta/planning/adapters.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S3 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S4 — Cuotas, reservas SQLite y guardas de gasto
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `docs/delendai/batuta/planning/quotas.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S4 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S5 — Principal persistente, workers y evidencia
- **Status**: pending
- **DependsOn**: [S4]
- **Files**: `docs/delendai/batuta/planning/execution.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S5 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S6 — Integración en el MCP y hosts existentes
- **Status**: pending
- **DependsOn**: [S5]
- **Files**: `docs/delendai/batuta/planning/host-integration.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S6 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S7 — Calidad, aprendizaje y medición completa
- **Status**: pending
- **DependsOn**: [S6]
- **Files**: `docs/delendai/batuta/planning/evaluation.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S7 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

### S8 — Release, documentación y smoke real consentido
- **Status**: pending
- **DependsOn**: [S7]
- **Files**: `docs/delendai/batuta/planning/release.md`
- **Gate**: e2e
- acceptance:
  - "Entregar el alcance íntegro de S8 y sus CA vinculados en la especificación conservada, con revisión independiente."
  - "Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación."
  - "Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado."

## acceptance

- Matriz existente/faltante sobre el SHA inspeccionado y antecedentes canónicos; no confundir dispatch real con passthrough.
- Sin inspección de cuentas o credenciales, sin ejecución de proveedores ni gasto; primer incremento definido con rutas exclusivas.
- El contexto del plugin recibe providers de la configuración raíz; options.providers prevalece incluso cuando es [].
- Pruebas de registro, routing y ausencia de roster; executeApi:false sigue rechazando gasto. No equivale al registro multicuenta de S1.
- Entregar el alcance íntegro de S1 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S2 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S3 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S4 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S5 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S6 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S7 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.
- Entregar el alcance íntegro de S8 y sus CA vinculados en la especificación conservada, con revisión independiente.
- Antes de implementar, desglosar esta slice en scopes reales reconciliados y reclamables mediante el flujo canónico; la ruta de planificación no sustituye a los archivos de producto ni permite cerrar esta slice solo con documentación.
- Mantener pendientes los CA sin evidencia; mocks, proceso local real y llamadas reales consentidas se reportan por separado.

## Notes

The approved source specification is preserved verbatim below. Its draft label is historical; the canonical frontmatter and slices above describe current workflow state.

````markdown
# PROPUESTA DE FUNCIONALIDAD — DelendAI Batuta

> **Estado:** BORRADOR REVISADO CON ALCANCE SOLO PLUGIN/MCP, LISTO PARA INGESTA, sin identificador canónico asignado. Registrar a través de `proposals` para obtener ID y ruta; no inventar f00xxx ni escribir directamente sobre `develop`.
>
> **Fecha:** 2026-09-21. **Repositorio:** `CartagoGit/DelendAI`. **Base técnica consultada:** `develop`, componentes `orchestrator-runner`, `auto-agent-selector`, `agent-orchestrator`, `usage-tracking`, `proposals`. **Propietario de implementación propuesto:** un agente de alta capacidad (Opus o Astra) con disponibilidad y permisos comprobados; no se ha asignado ni iniciado ninguna ejecución. **Revisor:** agente distinto al implementador.
>
> **Naturaleza:** especificación de producto, arquitectura y aceptación. Ningún cliente, cuenta, credencial o cuota real del usuario ha sido inspeccionado desde esta conversación.

## 1. Resumen ejecutivo y problema observable

**DelendAI Batuta** debe comportarse como director de orquesta de agentes **como plugin de DelendAI, accesible desde su MCP actual y sus integraciones instaladas, sin producto CLI/IDE propio**: un usuario configura una sola vez sus proveedores, cuentas y modelos autorizados; desde VS Code Copilot, extensión Codex, extensión Claude, OpenCode u otro host MCP compatible (incluidos los que funcionan desde terminal) puede pedir a Batuta que planifique, seleccione y **ejecute** trabajadores distintos según tareas y capacidad disponible. El principal conserva una visión persistente del plan y revisa resultados; los trabajadores devuelven evidencia compacta sin difundir conversaciones enteras ni credenciales.

**Problema actual informado por el usuario:** desde Copilot de VS Code no ha conseguido invocar de verdad Claude/Codex/MiniMax; desde Claude o Codex tampoco puede utilizar los otros modelos; el host no conoce sus configuraciones o modos de acceso. El sistema actual tiene descubrimiento, scoring, invocación y gastos parciales, pero no demuestra continuidad universal extremo a extremo desde los hosts solicitados. No confundir herramientas registradas, recomendación y ejecución real.

**Necesidad diferenciadora:** varias cuentas legítimas del mismo proveedor con perfiles independientes (p. ej. dos suscripciones anuales de Claude y perfiles de Codex), además de APIs de pago por token, suscripciones mensuales/anuales y modelos locales. El período de facturación anual NO describe necesariamente la ventana de cuota. No confundir cuota de suscripción con créditos API, límites RPM/TPM ni presupuesto autorizado en USD.

### Resultado observable obligatorio

Con un equipo en el que el usuario ha autorizado y configurado dos perfiles Claude y un perfil Codex, desde Copilot VS Code en Agent Mode el usuario ordena «usa Batuta para implementar esta slice». Copilot invoca una herramienta MCP de Batuta; Batuta elige un proveedor/cuenta/modelo autorizado, arranca un trabajador en entorno aislado, obtiene evidencia verificable, registra uso y devuelve el resultado a Copilot. Si el primer perfil no puede ejecutar, y otro perfil está autorizado y el proveedor permite ese uso, Batuta continúa o reinicia desde checkpoint con el segundo sin cambiar la autenticación global del editor. Si la integración no está soportada, devuelve `unsupported`/`manual-handoff` y nunca simula éxito.

## 2. Alcance, exclusiones y condiciones

### Incluye

- Descubrimiento **local, de solo lectura y previo consentimiento explícito** del usuario: binarios por PATH, versiones, capacidades de CLI/SDK, ubicación de configuraciones públicas, compatibilidad del host y estado de autenticación disponible mediante operaciones oficiales. Modo por defecto propuesto: `auto-with-consent`; si el usuario deniega, `manual` y funcionamiento sin exploración.
- Wizard interactivo de preguntas que guarde borrador y exija confirmación antes de activar cuentas, conectar herramientas externas, escribir ajustes de host o habilitar gasto.
- Registro canónico de proveedor / **cuenta** / modalidad de facturación / modelo / credencial referenciada / adapter / cuota compartida / permisos / entorno / estado.
- Perfiles aislados de cuentas oficialmente soportados: Claude `CLAUDE_CONFIG_DIR`; Codex `CODEX_HOME` por proceso y credenciales gestionadas por la herramienta; probar compatibilidad de versiones, llavero y extensiones. No copiar ni inspeccionar tokens de autenticación privados.
- API adapters con claves guardadas en llavero o almacén seguro y pases de entorno exclusivos al proceso autorizado. CLI adapters y modelos locales. Los adaptadores de suscripción solo podrán ejecutar cuando el proveedor/cliente admita ese uso.
- Principal persistente más workers especializados. Plan, trabajo, estado y evidencias canónicos; contextos independientes; worktrees para escritores; review por otro agente cuando corresponda.
- Controles de cuota, latencia, concurrencia, coste, calidad por tipo de tarea, fallback permitido y verificación. Presupuestos de usuario además de cuotas del proveedor.
- Integración host-agnostic únicamente a través de la instalación/inyección actual de DelendAI y sus herramientas MCP; activación del plugin Batuta en configuración. No crear CLI de usuario, IDE, app, interfaz web ni ecosistema propios. Las CLI de modelos son ejecutores INTERNOS.

### No incluye

- Controlar por la fuerza decisiones internas de Copilot, Claude o Codex ni prometer que el host delegará sin llamar a MCP.
- Reutilizar credenciales de las extensiones leyendo bases privadas, refresh tokens, `auth.json` o cookies, realizar scraping de paneles privados, usar OAuth no documentado ni suplantar sesiones.
- Pasar solicitudes de suscripción a APIs de pago «como si» fuesen facturación incluida; los flujos API y suscripción son distintos.
- Rotar identidades para evadir restricciones globales, límites, reglas de uso razonable o condiciones contractuales. La continuidad multicuenta queda condicionada a cuentas propias/autorizadas, mecanismos soportados y políticas de cada proveedor.
- Dar al principal permiso para aumentar presupuestos o revelar secretos.
- Añadir otro sistema de propuestas, otro planificador de gasto u otro motor de selección duplicado sin justificar la extensión de lo existente.
- Crear un comando `delendai batuta`, una nueva TUI/CLI de usuario, una extensión VS Code independiente, una interfaz web nueva o exigir un daemon como producto adicional. El lanzamiento interno de `claude`/`codex`/`copilot`/`opencode` como trabajador sí está permitido.

## 3. Referencias de diseño y estado existente (confirmar de nuevo al crear la slice)

| Componente | Reutilización exigida | Brecha a verificar |
|---|---|---|
| `orchestrator-runner` | `bootstrap`, `healthcheck`, `router`, `InvocationManager`, fallback, guards, sesiones | Del roster raíz a contexto de plugins; ejecución real por modalidad; identidad de cuenta; cuota por grupo; guard stale/unknown. |
| `auto-agent-selector` | Discovery, preferencias, evaluación/calibración, task pins, auto-run | Selección unificada y sin scorer/catálogos paralelos; calidad real por tarea. |
| `agent-orchestrator` | Plan/dispatch/políticas y clasificación existente | Principal con continuidad persistente, worker ownership, resultado verificable. |
| `usage-tracking` | Log de invocación, pricing, circuit breaker, rollups | Integrar cuotas de suscripción (no monetizarlas a la fuerza), correlación por invocationId, reserva atómica. |
| `proposals`, estado SQLite, worktrees, locks | Contratos, slices, CAS, reconciliación y evidencias | Impedir colisiones de escritura, retomar resultados, sin duplicar fuentes de verdad. |
| `CapabilityResolver` | Resolución de herramientas no activadas | Garantizar que la herramienta de Batuta sea visible y alcanzable en cada host. |
| `f00536` | Métrica de coste real de tarea y compactación | A/B vs ejecución directa, calidad sin regresión. |

**Nota de auditoría:** en el snapshot inspeccionado, `orchestrator-runner` lee providers de sus propias opciones mientras el asistente propone configurarlos a nivel raíz; `SpendLimitsStore` interpreta fichero ausente/corrupto como vista neutra; las cuotas están restringidas a hourly/weekly/monthly. Confirmar vigencia con el SHA actual antes de trabajar. El guard de gasto actual conserva una confirmación independiente: no declarar que hoy existe un bypass automático por defecto.

## 4. Arquitectura propuesta y propiedad de los datos

```text
Copilot VS Code ─┐
Claude / Codex ──┼──> DelendAI instalado / MCP existente ──> Plugin Batuta (activado por config)
OpenCode / host ┘                                              │
                                                     Orquestador + políticas
                                                              │
                                               Registro canónico de cuentas
                                                     y ledger compartido
                                                              │
                                               Invocadores internos por modo
                                                ┌───────────┼───────────┐
                                          CLI Claude A   CLI Codex    API BYOK
                                          CLI Claude B   CLI Copilot  MiniMax plan vía CLI compatible*
                                                └───────────┼───────────┘
                                                   Evidencia y resultado
                                                              │
                                                    MCP → host original
```

**Regla de producto:** no se requiere ni se crea una interfaz CLI propia de Batuta. La palabra CLI solo identifica un mecanismo INTERNO de ejecución de proveedores; OpenCode puede ser tanto host MCP como backend de un modelo compatible según adaptador y autorización. El asterisco significa que el modo CLI se habilita únicamente tras probar invocación no interactiva soportada en la versión instalada.

La implementación debe comenzar como parte del servidor MCP/proceso de DelendAI ya instalado, usando los locks y estado compartido existentes para coordinar invocaciones de distintos hosts. No exigir un daemon nuevo. Si la coordinación entre varios procesos requiere un coordinador residente, demostrar primero que los mecanismos existentes no bastan; cualquier servicio interno opcional será gestionado transparentemente por DelendAI y no obligará al usuario a lanzar otro producto. Degradar con seguridad cuando no pueda garantizarse un presupuesto único.

La persistencia **canónica** vive en infraestructura de estado existente: proveedor/cuenta/modelo, autorización, cuenta compartida, uso, reservas, planes/slices, resultados y checkpoints. No guardar datos de autenticación ni respuestas completas sensibles en la configuración ni en el repo; referencias a secreto fuera de la base y almacenamiento separado cifrado para credenciales.

### Contratos semánticos (TypeScript ilustrativo; validar tipos/reutilización antes de crear)

```ts
type ExecutionTransport = 'cli' | 'api' | 'mcp' | 'local';
type CredentialMode = 'official-subscription-login' | 'provider-plan-token' | 'byok-api-key' | 'local-none';
type BillingMode = 'subscription-included' | 'prepaid-token-plan' | 'pay-as-you-go' | 'local';
// Transporte, credencial y facturación son ejes diferentes: BYOK describe quién aporta la clave, NO otro transporte.
type EvidenceGrade = 'official' | 'observed' | 'estimated' | 'manual' | 'unknown';
type ConnectionState = 'detected' | 'needs-auth' | 'connected' | 'unsupported' | 'blocked';
type QuotaUnit = 'usd' | 'credits' | 'tokens' | 'requests' | 'subscription-usage';
type LimitState = 'within-budget' | 'near-limit' | 'exhausted' | 'unknown' | 'unlimited-explicit';
interface ProviderAccount {
  accountId: string; providerId: string; displayName: string;
  transport: ExecutionTransport; credentialMode: CredentialMode; billingMode: BillingMode;
  credentialRef?: string; profileRef?: string; adapterId: string;
  authState: ConnectionState; permittedAutomation: boolean;
  models: string[]; quotaGroupIds: string[]; userEnabled: boolean;
}
interface QuotaObservation {
  accountId: string; quotaGroupId: string; metric: QuotaUnit;
  windowStart?: string; windowEnd?: string; resetAt?: string;
  limit?: number; used?: number; remaining?: number;
  source: EvidenceGrade; observedAt: string; expiresAt?: string;
}
interface BatutaInvocation {
  taskId: string; invocationId: string; hostId: string;
  selectedAccountId: string; providerId: string; modelId: string;
  budgetReservationId?: string; worktreeId?: string;
  state: 'planned'|'reserved'|'running'|'partial'|'completed'|'blocked'|'failed';
  evidenceRefs: string[]; checkpointRef?: string;
}
```

Mantener las unidades independientes: una cuota de 5 horas y otra semanal de la misma cuenta son restricciones simultáneas, no cifras sumables; varios modelos pueden compartir un mismo fondo; precio en USD es distinto de una cuota de suscripción. `unknown` no es `unlimited`.

## 5. Descubrimiento y onboarding: contrato UX

1. En primera ejecución, presentar «¿Permites a Batuta examinar **solo** instalaciones, versiones y metadatos públicos de clientes IA en este equipo?». Elección por defecto ofrecida: «autodetectar con permiso». No escanear hasta el consentimiento; permitir manual/omitir.
2. Descubrimiento por adaptadores de CLI con `--version`, `--help`, `auth status`/SDK oficial donde esté documentado. No leer credenciales ni escanear discos arbitrariamente. Detectar instalación, no inferir identidad de usuario a partir de rutas/secretos.
3. Mostrar ficha por proveedor: instalado, sesión verificada por mecanismo oficial, modelos y capacidades disponibles, cuotas observables, tipos de acceso, si soporta múltiples perfiles, si soporta invocación no interactiva, alcance de permisos. Identidad/pago desconocidos = preguntas al usuario.
4. Wizard pregunta por proveedores a activar, identidades separadas, directorio de perfil para cada cuenta autorizada, tipo de plan, uso principal permitido, preferencia calidad/coste, máximos USD API por tarea/día/mes, reserva del principal y política cuando cuota desconocida. No asumir las cifras del panel conceptual de una conversación como autorización real.
5. Para añadir un perfil Claude, crear espacio aislado sin tocar la sesión actual y solicitar al usuario iniciar sesión con el flujo oficial en ese espacio. Para Codex crear `CODEX_HOME` independiente, iniciar sesión oficialmente y confirmar la relación cuenta-perfil; perfiles `--profile` configuran opciones y NO son por sí mismos identidades autenticadas distintas. Verificar comportamiento de la versión instalada.
6. En API usar variables/secret store por proceso, llavero o secreto administrado. Preferir API oficial para automatización desatendida cuando los acuerdos de suscripción/CLI no lo permitan.
7. Mostrar diff de cambios propuestos para settings personales de Copilot VS Code, Copilot CLI, Claude Code, Codex, OpenCode. Aplicar individualmente solo tras confirmación; backup/rollback, no guardar secretos en `.vscode/mcp.json` compartido.
8. Probar una tarea mínima **real** bajo autorización/coste conocidos y reportar el estado: conexión, ruta, cuenta, resultado, métricas y causa si falla. Una CLI en PATH o una tool registrada NO equivalen a integración funcional.

### Modos de conexión del plugin (independientes y seleccionables por cuenta)

El wizard ofrece por cada cuenta: **(a) CLI oficial/autorizada con sesión de suscripción**, **(b) CLI compatible con token de plan de proveedor**, **(c) API directa con clave propia BYOK y facturación declarada**, **(d) agregador/CLI compatible mediante configuración pública soportada**, **(e) local**. Mostrar solo opciones probadas en cada proveedor; una marca/modelo no implica CLI propia ni que su API utilice la suscripción.

- Claude Code: `claude -p` admite invocación no interactiva; `CLAUDE_CONFIG_DIR` separa perfiles según documentación. No usar `--bare` para intentar consumir la suscripción, pues ignora credenciales OAuth/llavero y requiere credencial API; tampoco permitir cargar hooks/MCP de un repositorio no confiable sin contención y revisión. Validar cada versión y ejecución en sandbox.
- Codex: `codex exec` utiliza la autenticación CLI guardada y admite elección entre inicio de sesión ChatGPT y clave API; `CODEX_HOME` aísla el estado del perfil. Determinar y mostrar método de autenticación real antes de ejecutar. Ejecutar con sandbox y approvals restringidos.
- Copilot CLI: dispone de `copilot -p` programático y límite por invocación de créditos AI en versiones soportadas. La extensión de VS Code como host no es el mismo proceso que la CLI worker; comprobar ambos independientemente.
- MiniMax: no asumir una CLI universal propia del modelo. Su Token Plan ofrece una clave específica `sk-cp` para herramientas compatibles (p. ej. Claude Code / clientes OpenAI compatibles), separada de una API pay-as-you-go; documenta consulta de consumo `GET https://www.minimax.io/v1/token_plan/remains` para la modalidad correspondiente. Comprobar términos, región/endpoints y acceso real antes de activarlo.
- OpenCode: puede funcionar como host MCP, CLI no interactiva o backend multiproveedor. Seleccionar perfil/modelo y autenticación mediante interfaces documentadas; no leer su `auth.json` para extraer secretos.
- Otro proveedor: registrar `unsupported` o `needs-setup` hasta disponer de adaptador probado. No confundir una CLI agregadora con una CLI del proveedor del modelo.

Por defecto, `discovery: auto-with-consent` (solicita permiso una vez antes de explorar PATH o metadatos públicos); admite `manual`, `off`, `configure-by-questions`. Tras detectar, ejecutar un doctor no destructivo por transporte, perfil y modelo y permitir que el usuario apruebe un smoke real con presupuesto y evidencias. Activación final de Batuta: **opción explícita en el plugin** con wizard guiado por el host MCP y almacenamiento canónico, no comando de usuario.

### Host matrix obligatoria

- VS Code GitHub Copilot Agent Mode: MCP visible, herramienta Batuta accesible y delegación real desde ese chat. No suponer que Copilot invoca herramientas si el usuario no utiliza modo agente/permisos adecuados.
- VS Code Codex extensión: MCP configurado para el entorno de usuario, integración operativa; si un host no decide delegar por sí solo, solicitud explícita a la herramienta MCP y reporte de restricciones.
- VS Code Claude extensión / Claude Code: MCP o integración soportada; evitar dependencia de la cuenta global del editor para workers.
- OpenCode: adaptador mediante MCP/CLI documentados en versión verificada.
- Cliente usado desde terminal: seguir utilizando su propio host MCP; configuración, diagnóstico, cuentas, cuotas y ejecución mediante herramientas MCP del plugin Batuta, sin nuevos comandos CLI de producto.
- Cloud/remote: no hereda `localhost` ni el llavero del ordenador. Ofrecer configuración remota independiente explícita; ningún éxito falso cuando el supervisor local es inaccesible.

## 6. Multicuenta y continuidad

- Perfiles identificados por `accountId`, no únicamente `providerId` ni `modelId`. Los nombres A/B son etiquetas de UI, no identidad inferida de tokens privados.
- Mantener directorios de configuración separados por proceso sin sobreescribir `HOME`, credenciales ni la cuenta predeterminada del editor. En Claude se documenta `CLAUDE_CONFIG_DIR`; en Codex `CODEX_HOME`. Autenticación oficial individual de cada perfil con usuario presente.
- Cada perfil registra explícitamente compatibilidad y condiciones aplicables; cuentas ajenas, utilización para eludir restricciones o mecanismos no soportados no son targets válidos.
- El cambio de cuenta se hace **entre invocaciones** o en checkpoint seguro: cancelar/terminar la llamada fallida, guardar evidencias/estado, comprobar idempotencia, seleccionar alternativa, reconstruir contexto mínimo y reanudar. Nunca trasladar una conversación autenticada viva de una cuenta a otra asumiendo que conserva estado remoto.
- Evitar reintentar automáticamente escrituras no idempotentes; diffs, commits, llamadas externas y gasto tienen identificadores y comprobaciones de estado antes de la reejecución.
- Al agotar una ventana o sufrir `429`, consultar reset y otras restricciones, marcar indisponibilidad; considerar otro perfil solo si la política del proveedor lo permite y el usuario lo autorizó. Si no, esperar, pedir decisión o usar API/local permitida.
- Las suscripciones anual/mensual no se convierten en «tokens gratuitos»; registrar coste incremental de la tarea como `included-plan` cuando corresponda, manteniendo métrica real de uso separada.

## 7. Cuotas, reservas y gasto

- `QuotaAdapter` por proveedor y modalidad, con `readQuota()` opcional, `readModels()`, `checkAuthentication()`, `supportsProfileIsolation()`, `invoke()` y `cancel()` según capacidad documentada. Fallo de quota API no bloquea modos manuales sin gasto, pero no habilita gasto automático.
- Consumir fuentes oficiales (API/SDK/cabeceras) cuando existan y estén autorizadas. Un fallback local solo mide trabajo de Batuta, no lo consumido en otras aplicaciones; debe presentarse como estimación. Cuotas no expuestas = `unknown`.
- El runner debe distinguir explícitamente `unlimited-explicit` de datos ausentes; la vista neutra actual nunca ha de autorizar un nuevo modo autónomo con límite exigido.
- Reservar con transacción SQLite sobre cada fondo de gasto autorizado y grupo de cuota compartido: comprobar available menos reservations menos buffer; CAS/serialización; TTL; liberación/conciliación; reintentos idempotentes; recuperación ante crash; frescura de datos. Antes de invocar volver a comprobar restricciones de cuenta y modelo.
- Presupuesto multinivel: tarea, principal, worker, sesión, día/mes, API, cuota por cuenta/grupo, concurrencia, RPM/TPM. **No sumar** fondos de crédito, límites de solicitudes y suscripciones.
- Preservar cuota del principal para validación y entrega; fallback no eleva coste máximo sin autorización. Nunca elegir un proveedor `costTier` más barato si está prohibido o es incompatible.
- Si un proveedor permite topes server-side, configurarlos también; las reservas locales no previenen gasto externo realizado por otros clientes ni garantizan coste final exacto en todo caso.
- Credenciales de billing solo lectura/alcance mínimo, aisladas de credenciales de inferencia; no exponer valores en MCP/logs.

## 8. El director de orquesta y la selección de especialistas

1. Al entrar una tarea, principal produce un plan con slices, dependencias, capacidades, permisos, dificultad provisional, criterios de aceptación y límite de coste.
2. El selector filtra candidatos por conectividad, método de ejecución, compatibilidad host, política de cuenta, permisos, contexto, modelos y quotas/budgets observables. Filtro duro primero, puntuación después.
3. Puntuar calidad estimada por tipo de tarea con resultados de tests y revisiones; no declarar modelo universalmente mejor. Coste **por tarea completa** = ejecución + revisión + fallos/reintentos + recuperación de contexto. Considerar latencia y stickiness/context cache.
4. Elegir principal estable (configurable y reemplazable mediante checkpoint) y N workers según trabajo realmente paralelizable, límites y worktrees. Principal puede delegar exploración barata, implementación adecuada, revisión independiente avanzada.
5. Workers reciben brief, SHA de base, worktree/rutas reclamadas, capacidades permitidas, presupuesto, política y aceptación; solo devuelven resumen, diff, resultados de tests y referencias de evidencia. No se redistribuye todo el prompt del principal.
6. El principal valida postcondiciones, integra únicamente resultado seguro y registra aprendizaje. No dejar a un modelo declarar `completed` por haber finalizado su proceso.
7. Aprendizaje controlado por versión de modelo, task type, muestras y señales confiables; penalizar arreglos posteriores, falsos positivos y tareas abortadas. Mantener opción manual de pin y no autoactualizar preferencias sin evidencia suficiente.
8. La selección nunca delega secretos o archivos sensibles a proveedores sin autorización explícita de alcance. Workers no pueden modificar presupuestos ni asignarse privilegios.

## 9. Política de control real de hosts

**Un único producto, dos maneras de solicitar su función dentro del MCP existente:**

- `host-mediated`: Copilot/Claude/Codex/OpenCode invoca una herramienta MCP de Batuta; el plugin planifica, elige cuenta/transporte y ejecuta el subagente a través de una CLI interna o API autorizada. El anfitrión mantiene su contexto propio. No prometer que los clientes invoquen MCP espontáneamente ni que Batuta controle las instrucciones de sistema del host.
- `explicit-tool`: el usuario solicita de forma explícita al host «usa DelendAI Batuta» y este llama a `batuta_run`, o selecciona la herramienta por la interfaz de tools si la ofrece. En ambos casos sigue dentro del host/MCP; **NO** se crea un CLI, app, extensión ni ecosistema Batuta alternativo. Si el host no expone MCP/herramientas necesarias, la compatibilidad queda `unsupported`, no se inventa un atajo fuera del producto.

La herramienta MCP de Batuta ofrece superficie acotada: `batuta_status`, `batuta_doctor`, `batuta_configure`, `batuta_accounts` (metadatos redactados), `batuta_plan`, `batuta_run`, `batuta_cancel`, `batuta_resume`, `batuta_result`. Configurar `effects` conforme al vocabulario real del contrato `@delendai/core` y permisos efectivos; no inventar valores. El listado inicial no revela nombres de cuenta personales ni secretos.

## 10. Plan de implementación completo asignable a Opus o Astra

**Importante:** el usuario puede preferir Opus o Astra como implementador de la *propuesta*, pero solo se asignará tras comprobación de su disponibilidad, permisos y cuota; la identidad ejecutora no se codifica en el diseño. El agente principal de Batuta puede ser seleccionable por el usuario.

| Slice | Entregable concreto | Verificación de salida |
|---|---|---|
| S0 — Reconciliación | Inspección del SHA actual, propuestas `f00067`, `f00119`, `x00512`, `f00505`, `f00536`; matriz de funciones existentes, ownership/rutas/PR activas | Sin duplicaciones ni nuevo identificador inventado; dependencias y owner asignados por sistema de propuestas. |
| S1 — Registro canónico | Modelo por proveedor-cuenta-método-modelo-grupo cuota; migraciones; wiring del roster raíz | Registrar 2 cuentas mismo proveedor y varios modelos sin mezclar cuotas ni secretos; compatibilidad anterior. |
| S2 — Descubrimiento+wizard | Autodetección con permiso, flujo manual, draft/diff confirmable, host doctor | Sin consentimiento no se inspecciona ni modifica configuración; reejecución no destructiva. |
| S3 — Adaptadores reales | Matriz transporte × credencial × facturación: Claude CLI multicuenta, Codex CLI multi-home, Copilot CLI/SDK, MiniMax plan-token mediante cliente compatible, OpenCode; API BYOK y local; unsupported explícito | Pruebas con binarios reales donde sea posible y contratos simulados de los demás. No se hace pasar un mock por E2E. |
| S4 — Quotas+reservas | Fuentes versionadas; grupos/ventanas/unidades; consulta por cuenta; guard strict; ledger transaccional | Dos workers simultáneos no pueden sobre-reservar presupuesto; corrupción/stale/unknown no se trata como unlimited. |
| S5 — Principal y workers | Plan persistente, selección, ejecución, worktree/locks, resumen de evidencia, cancel/resume/checkpoints | Delegación real cruzando proveedor y cuenta; pausa segura; writer no pisa a otro; revisión separada. |
| S6 — Inyección MCP existente | Integración y configuración del plugin Batuta desde Copilot VS Code, Claude, Codex, OpenCode y otros clientes MCP; instalación existente, backup y permisos; SIN nuevo CLI/UI/ecosistema | Desde **cada host soportado**, tarea sintética invoca realmente worker diferente o devuelve limitación específica verificable. |
| S7 — Calidad, aprendizaje y tokens | Evaluación por tarea, coste real, quality gates, dashboards, A/B vs flujo sin Batuta | No degradar aceptación; informar coste completo y procedencia de cada cifra; reducción demostrada, no promesa. |
| S8 — Release y documentación | Manual por SO, seguridad, onboarding, compatibilidad de versiones, smoke real, release gate | Código, tests, docs, empaquetado, instalación limpia y CI requeridos verdes en SHA final. |

Cada slice es pequeña, con archivos propios, tests primero/antes-después, dueño exclusivo y revisión por agente distinto. No modificar `develop` directamente ni empezar trabajo si otra PR/slice ocupa las mismas rutas. Se permite paralelismo entre contratos sin conflicto.

## 11. Criterios de aceptación E2E obligatorios

**CA-01.** Instalación nueva: con permiso, detecta CLIs presentes; sin permiso, no inspecciona rutas ni ejecuta probes y permite onboarding manual. No instala ni modifica nada sin confirmación.

**CA-02.** Cuenta múltiple: dos perfiles Claude configurados mediante autenticación oficial; el lanzamiento de worker B no altera identidad, sesiones ni config de worker A ni del editor. Ídem Codex con dos `CODEX_HOME` cuando esté soportado en versión/práctica y términos. No tocar archivos secretos en tests/documentación.

**CA-03.** Diferenciar plan anual/mensual, cuota de suscripción, API por token y ventana de límites: dos cuotas de ventanas distintas pueden bloquear por separado; no se suman porcentajes, USD y requests; varias cuentas no colapsan en un `providerId`.

**CA-04.** Proveedor disponible solo en API: credencial referenciada, no expuesta, coste máximo configurado, rechazo de invocación antes de gasto cuando el límite o reserva fallan.

**CA-05.** Quota ausente/corrupta/obsoleta: `unknown` con razón; gasto autónomo sujeto a política segura, sin asumir ilimitado. Una cuota remota actualizada después de la reserva causa revalidación y fallback permitido.

**CA-06.** Carrera: dos procesos comprueban saldo para dos tareas cuyo total excede capacidad disponible; solo se admite un conjunto que respete el límite bajo transacción SQLite y se concilia con crash/timeout.

**CA-07.** VS Code Copilot Agent Mode: `batuta_run` visible y autorizado, invoca realmente un worker Claude/Codex sin necesidad de autenticarlos dentro de Copilot; resultado con evidencia verificable. Si host no llama a herramientas: permitir solicitud explícita dentro de su MCP, y si no lo soporta declarar incompatibilidad, sin crear CLI alternativa.

**CA-08.** Desde Claude/Codex/OpenCode o cliente MCP en terminal: mismos perfiles/catálogos/políticas/resultados vía plugin Batuta y estado DelendAI compartido. Las integraciones no soportadas lo indican sin prometer funcionalidad.

**CA-09.** Fallback por cuenta: error real o cuota agotada en A, B autorizada y permitida, replan desde checkpoint y continúo sin duplicar escrituras/cobros ni cambiar login global. Si proveedor lo impide, no rotar, bloqueo razonado.

**CA-10.** Trabajador con permisos de lectura no escribe; escritor usa worktree/claim; no fusiona sin CI verde correspondiente al SHA; no considera terminar proceso como completar postcondiciones.

**CA-11.** Presupuesto del principal reservado para cierre. Un worker nunca elige un modelo caro excediendo límite por fallback; invalid token, stale quota y circuito roto producen bloqueo explicable.

**CA-12.** Comparativa A/B reproducible con conjunto de tareas representativo: calidad de aceptación, tiempo, coste real, tokens reales (si disponibles), estimación marcada y reintentos; ninguna reducción de `tools/list` cuenta como ahorro total de tarea por sí sola.

**CA-13.** Host cloud/remoto aislado: no se asume acceso al proceso MCP local, `~/.claude`, `~/.codex` ni llavero del ordenador; devuelve `local-unreachable` o configuración remota autorizada.

**CA-14.** Tokens, secretos, emails completos de cuenta y contenidos sensibles no aparecen en logs, traces, resumen MCP, git diff, fixtures ni CI. Tests negativos para todos los gates de permisos, cuota y postcondiciones.

**CA-15.** E2E diferenciados en reporte: mocked, fake CLI, proceso real, llamada real con gasto consentido; el mock no sustituye el smoke real. Si una integración no puede verificarse por ausencia de cuenta/permiso, no marcarla como soportada/terminada.

**CA-16.** Prohibición de nuevo ecosistema: instalación DelendAI + activación del plugin + MCP existente bastan para el uso; no hay CLI Batuta, nuevo editor, nueva app web ni daemon requerido. En terminal se usa el cliente habitual como host y la CLI del modelo únicamente como trabajador interno.

**CA-17.** Matriz de modalidades: mismo modelo disponible por CLI de suscripción, token de plan y API BYOK conserva tres perfiles financieros/credenciales separados; el reporte demuestra en cada invocación el modo efectivo y no imputa gasto API a suscripción ni viceversa. Pruebas de variables de entorno heredadas, incluida precedencia de clave API sobre login por suscripción.

**CA-18.** MiniMax Token Plan: un adaptador puede usar clave `sk-cp` en un cliente compatible oficialmente admitido y consultar su endpoint de remanente cuando esté disponible; no requiere inventar `minimax` CLI. API pay-as-you-go es modalidad independiente. Prueba real consentida o `unsupported` explícito.

**CA-19.** Claude: una invocación de suscripción mediante `claude -p` no activa `--bare`, que ignora credenciales OAuth y llavero; se prueban los riesgos de hooks/MCP no confiables y se aplican restricciones antes de permitir herramientas de escritura.

## 12. Priorización y definición de Done

**Prioridad:** alta como capacidad de producto, pero los safeguards de autenticación, gasto y ejecución deben preceder al modo autónomo. **Valor estimado:** muy alto por independencia de host y aprovechamiento de herramientas ya instaladas; ningún porcentaje de ahorro prometido sin benchmark.

**Done significa:** soporte comprobado para las rutas del alcance acordado con smoke real, CA-01..19 satisfechos o limitación explícita y aceptada con matriz de compatibilidad, docs y migraciones, sin duplicación de módulos, review independiente, CI verde para SHA que vaya a integrarse y evidencia archivada. Si una API o CLI no ofrece método autorizado de uso de suscripción, esa modalidad queda documentada como `unsupported` y se considera solución correcta, no excusa para añadir un camino no oficial.

## 13. Instrucción completa para agente implementador (Opus o Astra)

«Registra esta propuesta mediante el flujo canónico de DelendAI asignando ID automáticamente. Ejecuta primero S0: reconcilia diseño con `develop` y propuestas/PRs activas y produce matriz existente/faltante antes de escribir código. Implementa las slices S1–S8 bajo claims y worktrees exclusivos, sin crear un CLI/app/editor/daemon obligatorio de Batuta, sin tocar la autenticación actual del operador, sin manipular credenciales privadas y con gasto deshabilitado inicialmente. Implementa el wizard dentro del plugin/MCP; distingue transporte, autenticación y facturación y prioriza workers CLI autorizados sin confundir su plan con API BYOK. Reutiliza los sistemas existentes; si encuentras que una slice está resuelta, prueba su satisfacción y ciérrala mediante reconciliación. Incorpora pruebas unitarias, integración con binarios reales y smokes por host; distingue estrictamente lo que ha pasado de lo que no se puede comprobar. No cambies de modelo/cuenta para eludir límites. No declares completado hasta superar CA-01..19 y todos los checks obligatorios asociados al SHA final. Un revisor diferente valida contratos de cuota, aislamiento de cuentas, presupuestos y rutas MCP. Entrega diff, artefactos, matriz por host/proveedor, evidencia, costes y riesgos residuales.»

## 14. Referencias externas verificadas para implementar

- GitHub Copilot MCP en VS Code: https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp
- Copilot CLI MCP: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
- Claude Code variables y `CLAUDE_CONFIG_DIR`: https://code.claude.com/docs/en/env-vars
- Codex variables `CODEX_HOME`: https://developers.openai.com/es-419/docs/config-file/environment-variables
- Codex autenticación y almacenamiento seguro: https://developers.openai.com/es-419/docs/auth
- Codex usos/límites del plan: https://help.openai.com/es-es/articles/11369540
- Términos aplicables: consultar versiones vigentes por proveedor y tipo de cuenta antes de habilitar automatización.

- Claude CLI programática `-p`; cuidado `--bare` y suscripciones: https://code.claude.com/docs/en/headless
- Codex `exec` y autenticación: https://developers.openai.com/es-419/docs/non-interactive-mode y https://developers.openai.com/es-419/docs/auth
- Copilot CLI `-p` y límite de créditos: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference y https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/set-session-limit
- MiniMax Token Plan, integración sk-cp y consulta de remanente: https://platform.minimax.io/subscribe/coding-plan
- OpenCode modalidades y credenciales: https://opencode.ai/docs/providers

**Referencia inspiradora, NO especificación equivalente:** Fusion de Devin, https://docs.devin.ai/es/cli/fusion. La URL no ha sido recuperable durante esta elaboración, por lo que no se atribuyen capacidades detalladas exclusivamente a esa página.
````
