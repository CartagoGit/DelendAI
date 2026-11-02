# ADR-0008 — Evolucion multi-modelo basada en capacidades

- Estado: propuesto
- Fecha: 2026-08-29
- Alcance: `orchestrator-runner`, `usage-tracking`, `external-mcps`, core

## Contexto

El plan maestro de evolucion multi-LLM propone catalogo, cuotas, salud,
discovery, routing explicable, observabilidad y auto-reparacion. El repositorio
ya contiene varias piezas de ese modelo, pero repartidas entre superficies con
responsabilidades distintas. Crear nuevos servicios sin respetar esas
fronteras produciria dos contratos de provider y dos routers incompatibles.

## Estado actual verificado

| Capacidad del plan               | Implementacion existente                                 | Estado                  | Gap principal                                                      |
| -------------------------------- | -------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Contrato de provider/capacidades | `packages/core/.../provider-capabilities.interface.ts`   | Parcialmente completo   | Falta lifecycle, aliases y metadata de verificacion                |
| Catalogo/roster                  | `orchestrator-runner` + `list_models`                    | Funcional MVP           | Es roster confirmado, no catalogo dinamico reusable                |
| Discovery                        | `discover_providers` y `bootstrap_providers`             | Funcional para CLIs     | Falta discovery machine-readable de modelos y diff de drift        |
| Cuota                            | `get_quota`, quota cache y spend guard                   | Funcional MVP           | Falta contrato unificado de ventanas, fuente y confianza           |
| Health                           | healthcheck, `HealthStore`, scoring y fallback           | Funcional MVP           | Falta circuit breaker explicito y errores normalizados             |
| Contexto                         | `contextWindow` + scoring existente                      | Parcial                 | Falta advisor con presupuesto utilizable y pressure                |
| Routing explicable               | `advise_routing`, `buildRoutingDecision`, `explainScore` | Funcional MVP           | Falta integrar cuota/headroom y contexto como restricciones duras  |
| Policy Lab                       | dry-run transversal del core                             | Reutilizable            | Falta simulacion especifica de routing y comparacion de politicas  |
| Ledger/observabilidad            | `usage-tracking` JSONL, rollups, pricing y KPIs          | Funcional               | Falta evento canonico de decision/fallback                         |
| Self-healing                     | dry-run, efectos y propuestas existentes                 | Infraestructura parcial | Falta pipeline de evidencia, canary, snapshot y rollback de config |
| Research web                     | `web-fetch`/audit como superficies separadas             | Disponible como tooling | No debe entrar en el runtime ni autorizar mutaciones               |
| Lifecycle                        | Sin servicio dedicado                                    | Ausente                 | Requiere model state, replacement y reglas de no eliminacion       |

## Decisiones

1. `orchestrator-runner` sigue siendo el propietario del roster, health,
   cuotas, fallback e invocacion. No se crea un segundo runtime de providers.
2. El contrato estable de capacidades continua en core. Las nuevas formas de
   modelo deben ser aditivas y mantener `IProviderCapabilities` compatible.
3. El primer incremento de catalogo debe ser una abstraccion pura, in-memory,
   alimentada por el roster existente. No hace red, no lee secretos y no cambia
   configuracion.
4. Discovery se divide en dos capas: adapters de evidencia y reconciliacion de
   catalogo. Discovery solo observa y produce diffs; Self-Healing decide si un
   diff puede proponerse o aplicarse.
5. `external-mcps` conserva su router para servidores MCP externos. No se
   reutiliza como router de modelos: sus entradas y semantica son de
   capacidades de servidor, no de contexto, cuota o coste de inferencia.
6. `usage-tracking` permanece como observador. Puede consumir eventos de
   routing, pero no decide el modelo ni posee health/quota.
7. Cualquier cambio funcional de configuracion requiere diff, validacion,
   snapshot, canary y rollback. El modo inicial de mantenimiento es `suggest`.

## Mapa de implementacion por PR

### PR-1 — Model catalog and lifecycle

- Extract a pure `ModelCatalog` around `IProviderCapabilities`.
- Add aliases, filters by capabilities/provider/context, and lifecycle/freshness
  metadata without introducing concrete providers in core.
- Adapt `list_models` to consume a projection of the catalog, keeping
  the current contract.
- Unit tests and contract document.

### PR-2 — Contratos de quota y health

- Normalizar snapshots de cuota con fuente, confianza, ventanas y timestamps.
- Separar health de availability: error normalizado, latencia y circuit state.
- Adaptadores iniciales solo para fuentes ya soportadas por el runner.
- Mantener degradacion segura cuando la cuota o health sean desconocidos.

### PR-3 — Discovery y drift

- Definir `ProviderDiscoveryAdapter`, evidencia y diff tipado.
- Reutilizar bootstrap/PATH probe como adapter local, sin llamarlo discovery
  oficial de modelos.
- Persistir observaciones en cache, nunca en la configuracion confirmada.
- Exponer inspect/diff/refresh como operaciones de solo lectura.

### PR-4 — Context advisor, policy lab y routing integrado

- Compute `usableInput` with output reserve and buffer.
- Exclude models that do not fit as a hard constraint.
- Add simulation and ranking with quota/health/context, keeping the
  explainable score and compatible fallback.

### PR-5 — Routing ledger

- Emit sanitized events for decision, fallback, latency, and error.
- Consume them from `usage-tracking` without storing prompts, responses, code,
  paths, or secrets.
- Add summary by model/provider and selection reasons.

### PR-6 — Self-healing en modo suggest

- Candidate patch estructurado, evidencia confiable y validacion estatica.
- Snapshots sanitizados de config/catalogo/policy.
- Canary aislado y rollback probado antes de cualquier apply.
- Approval gate obligatorio para endpoint, auth, default, eliminacion o
  cambios de semantica.

### PR-7 — Maintenance research y low-risk opt-in

- Evidence collector separado del runtime y del razonador.
- Contenido web tratado como evidencia no confiable, nunca como instrucciones.
- Auto-apply solo para aliases, metadata, labels de deprecation y modelos
  nuevos deshabilitados; `auto-with-canary` no es el default.

## Criterios de corte

Cada PR debe aportar tipos, tests focalizados, documentacion, timeout/cancelacion
si hace I/O, logs sanitizados y una ruta de degradacion. Ninguna PR posterior a
PR-3 puede asumir que una ausencia de cuota o health significa cero o down.

Antes de habilitar mutacion automatica deben existir tests demostrables para:

- diff correcto y reversible;
- canary exitoso y fallido;
- rollback ante error parcial y aumento de error rate;
- ausencia de credenciales en logs;
- bloqueo de instrucciones operativas provenientes de web;
- no modificacion silenciosa del provider default.

## Fuera de alcance de este ADR

- Integrar proveedores concretos nuevos o scraping de dashboards.
- Cambiar el contrato de invocacion de `orchestrator-runner`.
- Migrar el storage JSONL existente a SQLite sin una propuesta independiente.
- Activar auto-healing agresivo o modificar secretos.