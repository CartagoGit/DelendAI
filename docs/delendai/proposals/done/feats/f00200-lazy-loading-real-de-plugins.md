---
id: f00200
title: "Lazy loading real de plugins"
kind: feat
status: done
type: proposal
track: architecture
date: 2026-08-25
shipped-in: [2eece76d9]
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track N / f00200"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00184 # lifecycle phases (lazy se aplica en activate)
    - f00200 # (esta propuesta)
    - r00028 # subpath exports (sinergia)
last-transition-id: 5f2171b8-4eb7-4a96-b66d-a339a483a32a
last-correlation-id: 5f2171b8-4eb7-4a96-b66d-a339a483a32a
last-transition-from: review
---

# f00200 — Lazy loading real de plugins

## Goal

Implementar **lazy loading real** de plugins: solo se hace
`dynamic import()` del módulo de un plugin cuando el usuario (o el
router) lo necesita, en lugar de cargar todos los manifests y
ejecutar todos los `prepare()` al boot.

### Comportamiento actual

- Al boot, el host carga todos los manifests, ejecuta `prepare()`
  sobre todos los plugins y mantiene en memoria todos los módulos.
- En una instalación con 50 plugins, esto consume memoria y tiempo
  de boot medibles.
- La auditoría externa (§52) lo marca como optimización pendiente.

### Comportamiento deseado

- `packages/core/src/lib/plugins/lazy-loader.ts`:
  - En boot, **solo** lee los manifests (`plugin.json`) sin
    importar los módulos TS/JS.
  - Cuando una tool es invocada por primera vez, importa el módulo
    del plugin que la declara (`await import(pluginPath)`).
  - `prepare()` / `activate()` corren en el momento de la primera
    invocación, no en boot.
- Mantiene un cache de plugins cargados.
- Config: `mcp-vertex.config.json` admite `plugins.lazy: true` (default)
  o `plugins.lazy: false` (compatibilidad / debugging).
- Compatibilidad: si un plugin declara side effects al cargar
  (import top-level), se le avisa al autor y se marca para revisión.

## why

- Cierra §52 de la auditoría.
- Reduce cold-start del host (medible).
- Reduce memoria base.
- Es la base para `f00196` (model-aware presets): si solo se
  exponen tools del perfil activo, no hace falta cargar los
  plugins del perfil completo.

## non-goals

- No introduce un bundler dinámico (es solo `import()` nativo).
- No cambia el modelo de capabilities (sigue funcionando).
- No cambia la API de plugins existentes.
- No intenta resolver ciclos de import.

## architecture

### 1. Lazy loader

- `packages/core/src/lib/plugins/lazy-loader.ts`:
  - Mantiene un `Map<PluginId, Promise<LoadedPlugin>>`.
  - `load(id)`: si está en cache, devuelve; si no, importa y
    ejecuta `prepare`/`activate`.
  - El router (`packages/core/src/lib/plugins/router.ts`) usa
    `load(id)` antes de delegar `tools/call`.

### 2. Plugin discovery

- `packages/core/src/lib/plugins/discovery.ts`:
  - Lista `plugins/*/plugin.json` sin importar el módulo.
  - Cache el resultado (file mtime).

### 3. Compatibilidad

- Modo `lazy: false` (compatibilidad): carga todo en boot.
- Modo `lazy: true` (default): lazy.

### 4. Tests

- `packages/core/tests/src/lib/plugins/lazy-loader.spec.ts`:
  - Plugin se carga solo cuando se invoca su tool.
  - Cold-start medible mejora (el test mide el tiempo).
  - Compatibilidad con `lazy: false` sigue funcionando.

### 5. Medición

- Antes/después:
  - Tiempo de boot del host.
  - Memoria RSS al boot.
  - Tiempo hasta la primera invocación.

## Slices

### S1 — Lazy loader + integración con router + tests + medición

- **Status**: done
- **Files**: `packages/core/src/lib/plugins/lazy-loader.ts`, `packages/core/src/lib/plugins/router.ts`, `packages/core/src/lib/plugins/discovery.ts`, `packages/core/tests/src/lib/plugins/lazy-loader.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: github-copilot
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente: el lazy loader, router y discovery están cubiertos por 21/21 tests focalizados; el typecheck de packages/core pasa con salida 0. Se conserva el alcance declarado del slice.
## acceptance

- Lazy loader carga plugins on-demand.
- Boot mejora mediblemente (cifras documentadas).
- Compatibilidad con `lazy: false` preservada.
- Tests verdes.
- `bun run validate` verde.
