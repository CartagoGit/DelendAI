# Batuta: reconciliación inicial

Inspección del 21 de septiembre de 2026 sobre `bce54340ba87238bbd754f1d514ff04b3b64bd7a`.
La especificación íntegra aprobada se conserva en la propuesta canónica de Batuta.
Este documento acredita la reconciliación inicial; no acredita soporte de proveedores ni los criterios E2E.

## Código existente y brechas

| Área | Evidencia existente | Trabajo pendiente |
| --- | --- | --- |
| Roster | `packages/core/src/lib/cli/load-config-file.ts` y `config-file-schema.ts` admiten proveedores en la configuración raíz. | `plugins/orchestrator-runner/src/index.ts` solo consume `options.providers`; conectar el roster mediante el contexto, preservando overrides explícitos. |
| Selección | `auto-agent-selector` y `orchestrator-runner` ya contienen descubrimiento, scoring y políticas. | Identidad separada por cuenta, transporte, autenticación, facturación y grupo de cuota; filtros duros antes del scoring. Reutilizar los selectores. |
| Dispatch | `plugins/agent-orchestrator/src/lib/dispatch/port-resolution.helper.ts` resuelve ejecución real mediante `ctx.subagentRuntime` o `portFactory` y falla sin puerto. | Adaptar la orquestación persistente y evidencias de Batuta; no duplicar el dispatch ni describirlo como mera planificación. |
| Suscripción | El invocador de suscripción del runner devuelve un passthrough textual que declara que no invocó un proveedor externo. | Ejecutores reales autorizados con perfiles aislados; devolver limitación explícita mientras no exista integración verificada. |
| CLI | El spawner del runner recibe comando y argumentos; su construcción no introduce directorio y entorno aislados por cuenta. | Aislar cada invocación con allowlist de entorno y perfil; no modificar la autenticación global del host. |
| Gasto | El manager conserva `executeApi: false` por defecto y guardas de token/autoBypass. `SpendLimitsStore` devuelve una vista neutra si faltan datos o son corruptos. | Distinguir `unknown` de autorización ilimitada explícita; ledger transaccional y reservas por fondo y grupo, sin tratar cuotas ausentes como permiso. |
| Uso | `usage-tracking` ya correlaciona invocaciones. | Añadir identidad financiera y de cuenta sin secretos; distinguir medidas reales, estimación y facturación incluida. |
| Persistencia | `packages/state-sqlite` expone proyecciones de estado. | No utilizar productores de proyecciones como ledger de negocio; diseñar transacciones dentro del propietario del gasto. |
| Host MCP | El host repo-local arranca en superficie managed y resuelve herramientas ocultas mediante el broker. | Integración Batuta dentro de esa superficie, sin CLI/editor/app/daemon de producto adicional. |

## Propuestas y ownership

Se consultaron los registros canónicos de los antecedentes indicados en la especificación:
orquestación multimodelo, selector automático, resolución de capacidades y reconciliación de satisfacción están en `done`.
El registro histórico de resolución de capacidades conserva algunas slices pendientes pese a su estado global; no se reabre ni se usa ese estado como prueba de paridad E2E.
La propuesta de frugalidad de contexto permanece en `ready`; reutilizar su trabajo cuando corresponda, sin reclamar sus rutas incidentalmente.
La búsqueda canónica de Batuta no encontró una propuesta previa antes del registro.

En el momento de la reconciliación no había claims activos antes de reclamar S0.
La consulta de pull requests abiertas hacia la rama de integración devolvió una lista vacía.
El checkout sigue en la rama de integración y el SHA inspeccionado no cambió.
El plan automático global sugirió cerrar una propuesta ajena: se mantuvo intacta y se utilizó la continuación acotada a Batuta.

## Primer incremento

S1a conecta la configuración raíz al contexto del plugin y al runner, manteniendo precedencia de `options.providers`, incluido `[]`.
Las pruebas deben cubrir roster raíz, override local, override vacío, ausencia de roster y rechazo con gasto deshabilitado.
Sus siete rutas figuran en el plan canónico y son disjuntas de este documento.
Completar S1a no completa el registro multicuenta S1 ni los criterios CA-01 a CA-19.

Las slices S1–S8 conservan el alcance original y permanecen pendientes.
Antes de ejecutarlas se reemplazará su scope de planificación por contratos y archivos de producto reconciliados y reclamables.
Crear documentación o mocks nunca basta para cerrar esas slices.

## Límites de la evidencia

No se inspeccionaron cuentas, credenciales privadas ni cuotas reales; no se ejecutaron proveedores ni llamadas con gasto.
No hay todavía smoke real de Batuta por host o proveedor.
Las pruebas futuras distinguirán mocks, fake CLI, proceso real y llamada real consentida.
Los permisos y compatibilidad de cada modalidad deben comprobarse antes de activarla.

La creación canónica registró la propuesta, pero su publicación inicial falló: el intento de commit sobre la rama de integración fue rechazado por la política.
La acción de publicación sugerida falló después al consultar un blob de un archivo nuevo inexistente en `origin/develop`.
La publicación requiere reparar esa ruta canónica sin cambiar el checkout ni eludir las guardas.
