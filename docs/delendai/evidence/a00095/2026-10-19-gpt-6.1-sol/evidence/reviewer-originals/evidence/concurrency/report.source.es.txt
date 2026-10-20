# Auditoría independiente: concurrencia y Batuta

Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`, extraído en `/tmp/delendai-audit-20261019-L2whP7`. Host observado: Codex, identidad comunicada por el coordinador: `gpt-6.1-sol`. Fecha local de la sesión: 2026-10-19, Europe/Madrid. Los timestamps UTC de los procesos corresponden a la noche del 18 de octubre. Esta es una contribución parcial, no una certificación exhaustiva del monorepo.

No se consultaron auditorías anteriores ni sus conclusiones. Se leyeron bootstrap, reglas y playbook actual, código de las cadenas de locks y cola, y las costuras de ejecución/cuentas del runner y selector. No se cambió producto ni se invocaron proveedores reales. Toda reproducción explícita escribió en este directorio. Las suites existentes crean sus propios temporales y limpian según sus fixtures.

## Evidencia y método

`source-manifest.json` registra ruta, tamaño y SHA-256 de 25 fuentes centrales, 262.047 bytes. Es una selección reproducible de los archivos inspeccionados, no un inventario exhaustivo de todos los archivos leídos. Cada ubicación de este informe se refiere al snapshot y a su hash individual en ese manifiesto.

`evidence-manifest.json` registra los 73 archivos de evidencia existentes al cerrar la captura, con 162.992 bytes en total; se generó antes de este informe y no lo incluye. Los resultados estructurados principales son `results.json` (7.901 bytes) y `extra-results.json` (5.699 bytes). Los logs de suites son `spec-proposals.log` (39.682 bytes) y `spec-orchestrator.log` (58.874 bytes). Los tamaños son bytes reales, no tokens estimados.

Se ejecutaron procesos Bun separados, con PID propio, barreras de archivos y mutex real; no se sustituyó la concurrencia de procesos por `Promise.all` dentro de un único runtime. En la prueba de slice se mantuvo el mutex de tabla un segundo para que ambos procesos hubiesen calculado el plan antes de competir por el claim. Se usó `holder: 'agent'`, modalidad soportada que evita confundir el fin del proceso corto de reproducción con la muerte del agente de trabajo.

Comandos ejecutados desde el snapshot, mediante bash aislado:

```text
timeout 90s bun --tsconfig-override /tmp/delendai-audit-20261019-L2whP7/tsconfig.json /tmp/delendai-audit-evidence-concurrencia/repro.ts
timeout 60s bun --tsconfig-override /tmp/delendai-audit-20261019-L2whP7/tsconfig.json /tmp/delendai-audit-evidence-concurrencia/extra.ts
timeout 150s node node_modules/vitest/vitest.mjs run --project=proposals plugins/proposals/tests/src/lib/locks/file-lock-table.spec.ts plugins/proposals/tests/src/lib/locks/agent-lock-engine.spec.ts plugins/proposals/tests/src/lib/locks/agent-lock-engine-file-granularity.spec.ts plugins/proposals/tests/src/lib/agents/persistent-task-queue.spec.ts plugins/proposals/tests/src/lib/agents/task-queue-engine.concurrency.spec.ts plugins/proposals/tests/src/lib/agents/task-queue-engine.corrupt.spec.ts --maxWorkers=1
timeout 150s node node_modules/vitest/vitest.mjs run --project=orchestrator-runner --maxWorkers=1
```

Las dos suites finalizaron correctamente: propuestas, 6 archivos y 82 tests, 12,24 s; runner, 38 archivos y 209 tests, 28,11 s. No se ejecutó una suite completa del selector. Los procesos Bun emitieron un diagnóstico interno de resolución de tsconfig (`directory mismatch`); sus exit codes fueron cero y se conservaron los resultados. Ese mensaje se atribuye al entorno de reproducción, no al producto.

Para repetir los scripts es necesario usar un directorio de fixtures nuevo o retirar los fixtures anteriores: las barreras y estados se conservan deliberadamente como evidencia. No ejecutar sobre un checkout de usuario o sus cuentas.

## Resultados de consistencia

| Escenario | Esperado | Observado | Evidencia |
|---|---|---|---|
| Dos procesos incrementan contador bajo mutex | 2 actualizaciones sin pérdida | contador final 2; PIDs 322096 y 322097 | `results.json`, `mutex` |
| Claim mismo archivo con tareas distintas | Una concesión y un bloqueo | una respuesta `ok:true`, otra `lock-conflict` | `engine-distinct` |
| Claim mismo taskId con agentes distintos | Segundo agente rechazado | ambos `ok:true`; segundo `refreshed:true` | `engine-same-task` |
| Claim de la misma slice por dos procesos | Un solo propietario autorizado | dos `slice-claim`, cada uno afirma ser propietario | `extra-results.json`, `same-slice-two-processes` |
| Dos procesos encolan 20 tareas cada uno | 40 entradas distintas | 40 entradas | `results.json`, `queue` |
| Dos procesos reservan última request, mismo ledger | Una reserva y un rechazo | 1 reservado / 1 rechazado | `quota-shared` |
| Misma cuota personal en ledgers de dos workspaces | Límite compartido si se promete aislamiento por cuenta | Ambos reservan la última request | `quota-split-clones` |
| SIGKILL al propietario del mutex | Otro proceso recupera el lease muerto | recuperación correcta tras staleMs=50; PID muerto 323655 | `killed-holder` |
| Ledger de cuota corrupto y siguiente intento | Estado desconocido no se convierte automáticamente en libre | primer intento rechaza y cuarentena; segundo reserva | `extra-results.json`, `quota-corruption-second-attempt` |
| Tabla de locks corrupta | Error y preservación explícita | claim exitoso, tabla corrupta sustituida | `corrupt-file-lock-map` |
| Cuenta API no permitida, credentialEnv distinto | Rechazo y ninguna llamada al adaptador | mock fetch recibió `Bearer other-fixture` y devolvió éxito | `api-account-policy-and-key` |

## Hallazgos

### C1 — P1: dos agentes reciben la misma slice y divergen los dos registros de ownership

Ubicaciones: `plugins/proposals/src/lib/locks/execute-lock-action.ts:61`, `:87`, `:102`; `plugins/proposals/src/lib/tools/continue-proposal.tool.ts:502`, `:518`, `:531`, `:548`. SHA del snapshot y SHA-256 individual: cabecera y `source-manifest.json`.

```typescript
const existing = lock.in_flight.find((entry) => entry.task_id === taskId);
if (existing !== undefined) {
    existing.last_seen = now;
    // ... no existing.agent === agent check ...
    await addFileLocks({ agentId: agent, files: existing.ownership, taskId, ... });
    // ... refreshed: true ...
}
```

La capa exterior sí toma el mutex de tabla antes de ejecutar la acción. El defecto es de identidad: la idempotencia usa solamente taskId. La slice genera ese identificador de forma determinista (`${doc.id}-${args.sliceId}`) y valida disponibilidad antes de entrar en el mutex. Dos planes legítimos pueden competir con el mismo id; el segundo se interpreta como refresh del primero, aunque cambia el agente.

Reproducción: `extra.ts`, dos procesos PIDs 329378 y 329379. Ambos recibieron `kind: 'slice-claim'`, con propietarios `agent-a` y `agent-b` respectivamente. El estado final conserva `in_flight.agent = agent-a` pero `file-locks.json` contiene `agentId = agent-b` para `src/shared.ts`. Se demuestra el desacuerdo persistente, no solo un plan desactualizado.

Impacto: dos agentes autorizados a editar la misma slice, trabajo duplicado, carreras de contenido y registros incoherentes usados por guardas posteriores. Remedio: validar propietario al refrescar, distinguir reintento del mismo agente de una reclamación competidora y resolver de nuevo la concesión dentro de la sección crítica. Regresión: dos procesos y el mismo identificador de slice; exactamente uno obtiene concesión y ambos registros coinciden. Confianza: alta. Pendiente de corrección, sin cambios de producto en esta auditoría.

### C2 — P1: las cuentas API no atraviesan la autorización/selección de credencial de las cuentas CLI

Ubicaciones: `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts:190`; `plugins/orchestrator-runner/src/lib/subprocess/api.ts:103`; `plugins/orchestrator-runner/src/lib/services/account-environment.service.ts:107` (comprobación de permittedAutomation); `plugins/orchestrator-runner/src/lib/invoke/manager.ts:235`.

```typescript
const apiInvoker = createApiInvoker({ fetchFn: globalHttpFetch });
// api.ts
const key = readEnv(invoke.envVar);
```

El factory entrega la cuenta y su política al adaptador CLI mediante `accountEnvironment`, pero crea el adaptador API sin información de cuenta. El manager no aplica la autorización de cuenta de forma común antes de escoger el adaptador. Tener permiso global para ejecutar/gastar no equivale a tener permiso para usar todas las cuentas.

Reproducción completamente sintética: se reemplazó global fetch antes de invocar; solo se crearon y leyeron dos variables `AUDIT_*` ficticias. Cuenta `forbidden` con `permittedAutomation:false`, credentialEnv propio; proveedor API enlazado a la cuenta pero con invoke.envVar diferente. Resultado: `fixture-response`, sin error, y el mock registró `Bearer other-fixture`. El mismo objeto produce rechazo en `accountEnvironment`. No hubo red ni lectura de secretos reales.

Límite de esta reproducción: el objeto de cuenta del script usa etiquetas de credentialMode/billingMode simplificadas que no pasan el esquema de carga (`api-key`/`metered` frente a los enums actuales). Se llama directamente al factory, no a una carga completa de configuración. Por ello el resultado dinámico prueba la ausencia de guardia en esa costura, pero no constituye por sí solo una prueba integral con configuración válida. La lectura de código muestra que cambiar esas etiquetas a sus valores válidos no introduce ninguna guardia API; queda pendiente esa regresión integral.

Impacto: una invocación puede consumir otra credencial y contabilizar la cuota de la cuenta declarada, e ignorar la prohibición de automatizar dicha cuenta. Remedio: política común de cuenta previa a cualquier transporte; resolver la credencial de la cuenta y rechazar contradicciones con invoke.envVar; aplicar el mismo principio al transporte MCP. Regresión: configuración validada, cuenta prohibida, y API/MCP/CLI sin efectos; cuenta permitida usa exactamente su credencial. Confianza: alta en la lectura y costura probada; validación integral pendiente. Pendiente de corrección.

### C3 — P2: los ledgers de cuota son locales al workspace, aunque las cuentas personales pueden compartirse entre clones

Ubicación: `plugins/orchestrator-runner/src/index.ts:144` (construcción de ledgerPath bajo pluginCacheDir), `:168` (inyección); `packages/core/src/lib/plugins/personal-layer.service.ts:67` (identidad de proyecto por remoto) y `:109` (archivo personal).

```typescript
const ledgerPath = ctx.workspace.resolve(
    joinRel(ctx.pluginCacheDir, 'quota-reservations.json'),
);
```

El mutex protege correctamente una única ruta de ledger. Dos clones o workspaces con la misma cuenta personal construyen rutas distintas; el lease de un proceso no es visible para el otro. La prueba con dos procesos y una observación de una única request libre da 1/1 si comparten ruta, pero 2 reservas si cada uno usa su ruta. No se lanzaron dos servidores completos ni se clonó una cuenta real: la relación con clones se fundamenta en la resolución de rutas de producción y en la identidad personal por remoto.

Impacto: no se sostiene la promesa del comentario de que el ledger se comparte por todos los procesos de la máquina cuando abarcan varios workspaces. Pueden sobreasignar el mismo pool de cuenta. Remedio: almacenamiento de reservas por identidad personal de cuenta/pool fuera del checkout, con ámbito explícito, mutex y aislamiento de usuarios. Regresión: dos roots distintos, una cuenta/pool común y una request libre; una sola concesión. Confianza: alta sobre ámbito de rutas, media-alta sobre despliegue multiclone completo. Pendiente de corrección.

### C4 — P2: cuarentenar un ledger de reservas corrupto permite reservar en el siguiente intento sin reconciliar lo desconocido

Ubicación: `plugins/orchestrator-runner/src/lib/services/quota-reservation.service.ts:42`, `:109`.

```typescript
if (raw === undefined) return { reservations: [] };
// ... corrupt branch ...
await quarantineCorruptFile(input.ledgerPath).catch(() => undefined);
return { kind: 'refused', reason: '... already held is unknown; it was set aside' };
```

El primer rechazo es seguro pero no persistente. La cuarentena retira el ledger activo y el intento siguiente interpreta su ausencia como ninguna reserva. `extra-results.json` conserva primer `refused`, segundo `reserved` y el backup corrupto junto al ledger nuevo. La observación usada era reciente y tenía una request libre; no demuestra cuántas reservas reales contenía el fichero perdido, sino que esa incógnita deja de bloquear en la segunda llamada.

Impacto condicionado: si existían invocaciones activas desconocidas, el siguiente intento puede sobreasignar la cuota. Remedio: marcador durable de estado desconocido hasta reconciliación, observación posterior o expiración conservadora de las reservas; conservar backup sin usar ausencia como recuperación automática. Regresión: corrupción con un lease activo simulado, dos llamadas consecutivas, ambas rechazan hasta la condición de recuperación definida. Confianza: alta. Pendiente de corrección.

### C5 — P2: la tabla de archivos convierte corrupción en vacía y destruye el original al siguiente claim

Ubicación: `plugins/proposals/src/lib/locks/file-lock-document.ts:107`, `:137`; consumidores en `file-lock-table.ts`.

```typescript
} catch {
    return emptyDocument();
}
```

La prueba inyecta `{corrupt` en file-locks.json, con agents.lock.json parseable pero vacío, y reclama un archivo. Se obtiene `claimed:true`; la tabla se reescribe sin backup ni señal de corrupción. Esa condición importa: si agents.lock.json conserva la claim de otro agente para el mismo archivo, su propia comprobación puede bloquear correctamente. No se afirma que corromper solo la tabla siempre produzca dos escritores.

Impacto: pérdida silenciosa de evidencia y ownership exclusivo de la tabla, lectura permisiva de errores distintos de ENOENT, diagnóstico de recuperación insuficiente. Remedio: distinguir ausencia de corrupción/errores de lectura, preservar el original y reconciliar ambas fuentes bajo el mutex antes de permitir nuevos claims. Regresión: tabla corrupta y registro principal vacío/desincronizado; negativa explícita y copia preservada. Confianza: alta. Pendiente de corrección.

## Fortalezas y estado de los plugins

Propuestas/locks/cola: auditados parcialmente, cadena principal y 82 tests ejecutados. La sección crítica exterior cubre la comprobación y escritura de claims con taskIds distintos; contador y cola no perdieron actualizaciones en la prueba de dos procesos. La recuperación real después de SIGKILL funcionó. El motor de cola distingue corrupción de ausencia en la ruta pública y sus tests de corrupción/concurrencia pasan. La escritura atómica usa temporal en el directorio de destino, fsync y rename; el mutex dispone de identidad, heartbeat, liveness y revalidación de recuperación.

Orchestrator-runner/Batuta: auditado parcialmente; suite completa declarada del proyecto ejecutada, 209 tests verdes. CLI aplica allowlist de entorno, guardia de automatización y perfil por cliente. El consentimiento de descubrimiento pasa por elicitation y la confirmación de gasto usa firmante; se inspeccionaron sus servicios, pero no se simuló un host MCP real durante esta contribución. Los estados desconocidos de cuota se rechazan en el primer intento y el mismo ledger sí serializa procesos reales. El journal registra interrupciones y redacta datos, aunque sus fallos son best effort y no se hizo prueba destructiva adicional de journal.

Auto-agent-selector: lectura parcial de entrada, descubrimiento, ranking, elegibilidad, roster durable y auto-run; sin suite ejecutada. Se observó que la ejecución predeterminada de auto-run construye handoffs y no ejecuta proveedores. El módulo de elegibilidad y el ranking/descubrimiento de herramientas son piezas distintas; no se ha demostrado en esta contribución que todos los controles del primero estén conectados a cada ruta pública. Tampoco se ha demostrado un bypass de gasto del selector: no debe afirmarse tal cosa a partir de este informe.

El estado anterior expresa cobertura de auditoría, no lifecycle `idea/active/done` de manifiestos. No se verificó un manifiesto de lifecycle actual para los tres plugins. El servidor de orientación disponible no representa el snapshot aislado; no se usó su catálogo para atribuir lifecycle al SHA auditado.

## Cobertura pendiente y límites

No hay lectura exhaustiva de todos los archivos de estos plugins, todos los specs del core ni todos los modos de fallo. Quedan pendientes: reservar/renovar cuota durante una invocación más larga que su TTL; caída exactamente entre escritura de tabla y registro principal; dos servidores completos con cuentas personales compartidas; env/perfiles del transporte MCP; guardias API desde carga de configuración válida; límites/concurrencia efectiva del manager entre procesos; comportamiento con filesystem remoto/Windows; reconcilación de journal y cancelación con procesos reales de proveedor. No se consultaron directorios de perfiles, credenciales ni cuotas de usuario, y no se gastó dinero.

La comprobación de conflictos de `tryAcquireFileLocks` aparece antes de su mutex local, pero el único consumidor de producción localizado es el engine exterior que ya sostiene ese mutex; no se eleva a hallazgo de explotación de la ruta pública sin una llamada descubierta que eluda dicha cobertura. Del mismo modo, no se eleva el diseño documentado de ventanas de tokens como si prometiera reservas cuantitativas por token.

Los tests verdes no refutan C1: los casos existentes no ejercen la combinación demostrada de mismo identificador de slice, agentes distintos, planes concurrentes y comparación posterior de ambas fuentes de ownership. Los hallazgos se guardaron de forma independiente antes de cotejar con otros informes; esta contribución no incluye fase de consenso ni resolución de discrepancias entre auditores.
