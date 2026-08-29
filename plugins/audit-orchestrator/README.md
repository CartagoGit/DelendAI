# Audit orchestrator

Plugin agnóstico para convertir una propuesta de auditoría de tipo plan en trabajo
coordinado mediante subagentes.

## Flujo

1. `audit_plan` o `audit_run` del plugin de auditorías genera una auditoría de tipo
   `plan` y materializa una propuesta padre `type: plan`.
2. `audit_orchestrate_plan` lee esa propuesta, valida que pertenece al workspace y
   deriva tareas ordenadas desde sus `contains.proposals` o sus `## Slices`.
3. `audit_orchestrate_run` ejecuta esas tareas mediante el puerto de despacho que
   inyecta el host, reutilizando el planificador, presupuestos, rotación y lifecycle
   del plugin `agent-orchestrator`.

## Seguridad

- `dryRun` es `true` por defecto.
- La ejecución real requiere `dryRun: false` y un `dispatchPortFactory` explícito.
- Las rutas se validan contra el workspace y nunca se usa `process.cwd()`.
- El plugin no conoce proveedores, modelos, credenciales ni comandos de un proyecto
  concreto. El host decide cómo crear, aislar, cancelar y verificar cada subagente.

## Herramientas

- `audit_orchestrate_plan { planPath, mode? }`: vista previa de tareas y dependencias.
- `audit_orchestrate_run { planPath, dryRun?, mode? }`: vista previa o ejecución
  secuencial fail-closed de las tareas derivadas.

## Configuración

```jsonc
{
	"plugins": {
		"audit-orchestrator": {
			"options": {
				"dispatchPortFactory": "<host injected factory>"
			}
		}
	}
}
```

El plugin depende de `agent-orchestrator`. En producción el host debe inyectar un
`IDispatchPort` real; `allowFakeDispatchPort` solo debe utilizarse en fixtures y tests.
