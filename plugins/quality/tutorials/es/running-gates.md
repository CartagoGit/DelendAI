---
title: "Ejecutar gates de calidad para cualquier lenguaje"
plugin: quality
audience: agente que necesite validar el estado del proyecto
order: 1
lang: es
---

# Ejecutar gates de calidad para cualquier lenguaje

El plugin `quality` es **agnóstico al lenguaje** por diseño: ejecuta cualquier comando que indique tu `mcp-vertex.config.json` y devuelve el código de salida. Esta guía muestra las tres fuentes de alcances (scopes) en orden de prioridad, cómo ejecutar uno y cómo cancelar una ejecución desbocada.

## 0. El modelo mental

Un **alcance (scope)** es una lista ordenada de comandos con nombre. El plugin ejecuta todos los comandos del scope, en orden, captura stdout/stderr y devuelve un informe estructurado `{ ok, results: [{ command, ok, code, tail }] }`. El campo `ok` refleja el estado de todo el scope — si algún comando falla, el scope no es correcto (`ok: false`).

```
┌─ options.scopes del plugin (máxima prioridad)
├─ mcp-vertex.config.json → validationMatrix.scopes
└─ scripts detectados de package.json → "all" (lint, typecheck, test, build)
```

## 1. Listar los scopes disponibles (solo lectura)

```json
{ "tool": "quality_get_quality_scopes", "args": {} }
```

Ejemplo de respuesta (truncada):

```json
{
  "scopes": {
    "all": [
      { "command": "bun run lint", "expect": "exit0" },
      { "command": "bun run typecheck", "expect": "exit0" },
      { "command": "bun run test", "expect": "exit0" }
    ]
  }
}
```

## 2. Ejecutar un scope

```json
{ "tool": "quality_run_quality", "args": { "scope": "all" } }
```

La respuesta se desglosa por comando:

```json
{
  "scope": "all",
  "ok": false,
  "results": [
    {
      "command": "bun run lint",
      "ok": true,
      "code": 0,
      "tail": "Checked 400 files in 159ms. No fixes applied."
    },
    {
      "command": "bun run test",
      "ok": false,
      "code": 1,
      "tail": "FAIL tests/src/foo.spec.ts …"
    }
  ]
}
```

Lee `results[N].tail` para obtener el contexto del fallo. El campo `tail` contiene las últimas 20 líneas no vacías (con un límite de 64 KiB del total de salida) — lo suficiente para depurar sin inundar el contexto de la ventana de tokens del agente.

## 3. Cancelar una ejecución desbocada

```json
{ "tool": "quality_quality_cancel", "args": {} }
```

Envía `SIGKILL` al grupo de procesos de cada ejecución en vuelo. Pasa `{ "pid": <número> }` para cancelar una en particular. La cancelación no bloquea: los `results` de la siguiente llamada reflejarán la terminación.

## 4. Hacerlo agnóstico al lenguaje

El núcleo ejecuta lo que indique tu configuración. Ejemplo para un proyecto políglota (TypeScript + Python):

```jsonc
// mcp-vertex.config.json
{
  "plugins": { "quality": { "options": {} } },
  "validationMatrix": {
    "scopes": {
      "typecheck": [
        { "command": "tsc --noEmit", "expect": "exit0" },
        { "command": "mypy .",      "expect": "exit0" }
      ],
      "test": [
        { "command": "vitest run", "expect": "exit0" },
        { "command": "pytest -q",  "expect": "exit0" }
      ]
    }
  }
}
```

`run_quality` ejecutará **los cuatro comandos** en los scopes `typecheck` / `test`, sin importar el lenguaje. Un código de salida 0 significa aprobado; distinto de cero significa error.

## 5. Asegurar con una política de comandos (commandPolicy)

`run_quality` **ejecuta** cualquier comando que indique la configuración del host. Para limitar qué ejecutables pueden ejecutarse cuando un agente con menos confianza invoca la herramienta, usa `commandPolicy`:

```jsonc
{
  "plugins": {
    "quality": {
      "options": {
        "commandPolicy": {
          "allow": ["bun", "npm", "npx", "tsc", "vitest", "biome", "mypy", "ruff", "pytest"],
          "deny":  ["curl", "wget", "bash", "sh"]
        }
      }
    }
  }
}
```

Cualquier comando bloqueado se reporta con `code: 126` y un motivo ("blocked by command policy") y **nunca se inicia**. La política `deny` tiene prioridad sobre `allow`; un `allow` vacío significa "cualquier ejecutable no denegado".

## Errores comunes

- **`run_quality` no reemplaza a `bun run validate`**: el script `validate` del monorepo ejecuta las cuatro validaciones directamente. `run_quality` se usa para ejecuciones **ad-hoc** y para que un agente pueda inspeccionar los scopes. Ambos métodos son válidos e independientes.
- **Un comando de larga duración que supere el tiempo límite** se cancelará con `code: 124` y `timedOut: true`. El tiempo límite por defecto es 600 000 ms (10 minutos), el cual se puede configurar por ejecutor si es necesario.
- **Polling para ver si ha terminado**: no lo hagas. `run_quality` es síncrono. Si necesitas abortar un scope largo que ya está corriendo, llama a `quality_cancel` con el `pid` correspondiente.

## Siguiente paso

- [Gates de calidad multi-lenguaje (l107)](../../l107-multilang-quality-gates.md)
- [Frontera de confianza y política de comandos (M13)](../../l107-multilang-quality-gates.md#5-no-objetivos)
