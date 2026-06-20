---
title: "Presets de lint y type-check conscientes del framework"
plugin: rules
audience: agente que necesite aplicar reglas de lint/type
order: 1
lang: es
---

# Presets de lint y type-check conscientes del framework

El plugin `rules` responde a una pregunta: "¿qué reglas de lint y type-check debo aplicar a este proyecto, este archivo o esta carpeta?". La respuesta se deriva del **framework** que utiliza el proyecto y de la **zona de proyecto (project area)** en la que reside el archivo. La propia configuración del proyecto siempre tiene prioridad.

## 0. El modelo mental

Una **zona de proyecto (project area)** es un directorio de nivel superior con su propio `package.json` (o equivalente). A cada zona se le detecta un framework a partir de su `package.json` / `requirements.txt` / `Cargo.toml` / `pubspec.yaml` / `go.mod` — el plugin incluye una pequeña librería de mapeos del tipo "si veo X, uso Y por defecto".

Un **preset** es un conjunto de configuración (reglas de lint, configuración de type-check) para un framework dado. El plugin incluye presets para `ts-eslint`, `ts-prettier`, `py-ruff`, `rs-clippy`, `go-vet`, `kt-detekt`, … (solo los que coincidan con herramientas instaladas en el host).

El plugin puede ejecutarse en tres modos (configurados con `--rules-mode=`):

| Modo | Comportamiento |
|---|---|
| `strict` | Falla si el proyecto no tiene configuración de reglas y ningún preset lo cubre. |
| `mixed` (por defecto) | Aplica el preset si el proyecto no tiene configuración; nunca falla. |
| `advisory` | No escribe nada; solo informa lo que se *aplicaría*. |

## 1. Aplicar un preset a una zona del proyecto

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react"
  }
}
```

La respuesta es una lista de archivos escritos + un resumen:

```json
{
  "ok": true,
  "written": [
    "apps/web/.eslintrc.json",
    "apps/web/tsconfig.strict.json"
  ],
  "preset": "ts-eslint+ts-prettier",
  "warnings": []
}
```

Si el proyecto ya tiene un `.eslintrc.json`, el plugin no lo toca e informa `preset: "user-override"`. La propia configuración del proyecto **siempre tiene prioridad** — ese es el contrato.

## 2. Listar presets disponibles

```json
{ "tool": "rules_get_presets", "args": { "framework": "ts-react" } }
```

Devuelve el nombre del preset, los archivos que escribiría y un enlace a la configuración original de la que hereda. La lista corresponde a lo que el host tiene instalado en `node_modules` — no se realiza ninguna descarga de red.

## 3. Comprobar qué se aplicaría (dry run)

```json
{
  "tool": "rules_apply",
  "args": {
    "area": "apps/web",
    "framework": "ts-react",
    "dryRun": true
  }
}
```

Misma estructura de respuesta, pero el array `written` refleja lo que se **escribiría** — no se escribe nada. Usa esto en modo advisory o para mostrar al usuario un diff antes de confirmar.

## 4. Mapear un proyecto a sus zonas (amigable para CI)

`rules_resolve_map` es la herramienta de solo lectura que devuelve el mapa detectado de zona de proyecto → framework → preset. El plugin lo almacena en caché en `.cache/mcp-vertex/rules/rules-map.json` para que la ejecución en CI no vuelva a detectarlo en cada llamada.

```json
{ "tool": "rules_resolve_map", "args": {} }
```

## Errores comunes

- **Dos `package.json` en la misma zona** (workspace + anidado): el plugin elige el más cercano al archivo. Si la detección es incorrecta, pasa la `area` explícitamente.
- **Framework personalizado**: si pasas `framework: "<tu-nombre>"`, el plugin no aplicará ningún preset (al no haber coincidencia en el registro). La herramienta responderá con `preset: "no-preset"` y una advertencia.
- **Herramienta no instalada localmente**: aplicar un preset que requiere `ruff` en una máquina sin `ruff` tendrá éxito (el plugin solo escribe la configuración) pero el posterior `quality_run_quality` fallará con `code: 127`. Ejecuta `rules_check` primero para probar toda la cadena sin escribir cambios.

## Siguiente paso

- [Cómo colaboran los plugins `rules` y `quality`](#)
- [Personalizar un preset sin hacerle fork (la regla user-override)](#)
