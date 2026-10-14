---
id: a00093
title: "MCP Vertex — Auditoría completa de `develop` (segunda pasada) → TODO ejecutable para agente"
kind: audit
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
---

# a00093 — MCP Vertex — Auditoría completa de `develop` (segunda pasada) → TODO ejecutable para agente

## Goal

> **Documento de trabajo generado a partir de una nueva auditoría completa del estado actual de `develop`.**
>
> **Commit auditado:** `e1b4cefd39c140913800748fea44c392026ca303`
>
> **Objetivo:** que un agente pueda convertir esta auditoría en propuestas/slices verificables, implementar únicamente lo que realmente siga pendiente y cerrar cada punto con evidencia.
>
> **Importante:** este documento NO significa que todo lo listado sea un bug confirmado. La clasificación de cada punto manda.
>
> **Regla principal para el agente:** antes de modificar código, reproducir/comprobar cada hallazgo contra el HEAD actual. Si el hallazgo no se reproduce, se cierra con evidencia como `NOT_REPRODUCIBLE`, `ALREADY_FIXED`, `ACCEPTED_RISK` o `NOT_APPLICABLE`.
>
> **Relación con planes previos:** este documento es heredero del `2026-08-24-develop-external-audit.md` (consolidado por `q00003`). El presente plan orquestador es **`q00004`**. Las propuestas nuevas se enlazan a ambos documentos cuando aplique para mantener trazabilidad histórica.

---

# 0. Cómo usar este documento

Cada punto debe conservar una de estas clasificaciones:

- `CONFIRMADO`: el comportamiento se observa directamente en el código actual o en artefactos generados del repo.
- `PROBABLE`: el código muestra una condición peligrosa, pero conviene reproducirla con un test antes de modificar arquitectura.
- `REVISAR`: requiere medición/benchmark/decisión de producto.
- `MEJORA`: no es un bug; aumenta calidad, mantenibilidad, seguridad o eficiencia.
- `IDEA`: propuesta de evolución de producto.

Cada punto debe terminar en uno de estos estados:

- `IMPLEMENTED`
- `ALREADY_FIXED`
- `NOT_REPRODUCIBLE`
- `ACCEPTED_RISK`
- `DEFERRED_WITH_REASON`
- `NOT_APPLICABLE`

Nunca cerrar un punto únicamente porque una proposal anterior figure como `done`.

---

# 1. Resumen ejecutivo de esta segunda auditoría

## 1.1 Estado global

La base ha mejorado de forma importante respecto a la primera auditoría.

Áreas que ahora considero sustancialmente corregidas:

- loader usa opciones validadas/normalizadas;
- lifecycle de plugins mucho más sólido;
- dependencias topológicas;
- rollback/dispose cooperativo;
- proceso con límites por bytes reales;
- presupuesto combinado stdout/stderr;
- kill de árbol de procesos;
- métricas por UTF-8 real;
- errores ya no cuentan `0` bytes;
- truncación estructural;
- techo genérico reducido de 256 KiB a 64 KiB;
- metadata adicional movida a MCP `_meta`;
- memory freshness event-driven/debounced;
- cliente sin versión hardcodeada;
- validación opcional de payload cliente;
- CI dividido en gates reales;
- coverage ya no excluye todos los `index.ts`;
- error-reporting rediseñado alrededor de DTO seguro;
- registry ya incluye `auto-plugin-selector`;
- existe runtime de superficie `native/adaptive/compact`;
- existen manifests;
- existen nuevos plugins de alto valor:
  - `context-for-change`
  - `impact-analysis`
  - `project-health`
  - `quality-policy`
  - `adaptive-optimizer`
- existe assessment de adopción.

## 1.2 Lo que NO debe hacerse

No volver a implementar desde cero:

- aplicación de `parsed.data`;
- métrica UTF-8;
- output metadata en `_meta`;
- byte caps de `runArgv`;
- client version;
- memory refresh global;
- blanket `index.ts` exclusion;
- reporter raw-stack architecture antigua;
- auto-plugin-selector registry entry.

Si un agente encuentra una proposal vieja que pida uno de esos cambios, debe validar primero si ya está resuelto y cerrar la proposal con evidencia.

---

# 2. Prioridad inmediata

## P1 — seguridad/correctitud

1. `context-for-change`: containment de rutas.
2. `impact-analysis` / `tests-for-change`: containment de rutas.
3. `with-file-mutex`: demostrar o descartar race de stale reclaim.
4. Gate de token budget con la superficie REAL de `swarm`.
5. `error-reporting`: provenance segura de `toolId`.

## P2 — arquitectura/producto

6. Eliminar la posibilidad conceptual de `internalOnly:false`.
7. Terminar migración de manifests.
8. Hacer el dashboard de tokens verificable en CI.
9. Decidir estrategia default de superficie `adaptive`.
10. Reducir coste estático de `proposals`.
11. Unificar scoring de surface/selector/optimizer.
12. Fortalecer branch health / required checks.

## P3 — limpieza y precisión

13. Edge UTF-8 en process output.
14. `EXACT_ADOPTION_WRITE_ESTIMATE`.
15. versión efectiva del runtime en reportes.
16. summaries de presets derivados/validados.
17. eliminar validaciones Zod duplicadas innecesarias tras el loader.

---

# 3. Invariante de privacidad — NO NEGOCIABLE

El producto mantiene la decisión de negocio de que `error-reporting` esté **activo por defecto**.

Eso NO debe cambiar salvo decisión explícita del propietario.

La privacidad debe garantizarse por arquitectura.

## 3.1 Regla

MCP Vertex puede reportar automáticamente problemas de MCP Vertex.

Nunca debe publicar:

- datos de proyectos externos;
- nombres de empresas;
- clientes;
- repos privados;
- nombres de ramas privadas;
- rutas absolutas;
- usernames;
- nombres de home directories;
- prompts;
- tool args del usuario;
- tool outputs;
- source code;
- SQL real;
- GraphQL real;
- URLs privadas;
- tokens;
- emails;
- nombres internos;
- filenames sensibles externos;
- nombres de tools externas cuando puedan revelar dominio de negocio.

Si hace falta un ejemplo, se genera un ejemplo **sintético**, no un payload real redactado.

## 3.2 Propiedad fuerte deseada

Dos proyectos privados completamente distintos que provoquen exactamente el mismo bug interno de Vertex deberían producir el mismo issue público, salvo metadata explícitamente segura como:

- versión MCP Vertex;
- package/component interno;
- error code;
- runtime family;
- OS family.

---

# 4. Error reporting — residual de privacidad

## ER2-001 — `toolName` todavía puede entrar en el DTO público

**Clasificación:** `CONFIRMADO`
**Prioridad:** P1
**Archivo principal:** `plugins/error-reporting/src/lib/report-builder.helper.ts`

### Problema

`buildSafeReport()` construye:

```ts
toolId: toolName
```

Aunque el error sea legítimamente interno a Vertex, `toolName` puede pertenecer a una tool registrada por el host/proyecto.

Ejemplo conceptual:

```text
privatecompany_reconciliation_execute
```

Si esa tool llama a infraestructura Vertex y aparece un fallo interno Vertex, publicar ese nombre revela información del proyecto.

### Cambio requerido

Introducir provenance/ownership explícita del tool id.

Regla:

```text
if tool is owned by @mcp-vertex/*
    public toolId may be included
else
    omit toolId OR replace with safe category
```

No sanitizar nombres arbitrarios.

No intentar convertirlos a slug.

No enviar.

### Diseño recomendado

Crear algo como:

```ts
interface ISafeToolIdentity {
  owner: 'mcp-vertex' | 'external' | 'host';
  safeToolId?: string;
}
```

o una función:

```ts
resolvePublicToolIdentity(toolName, registryMetadata)
```

### Tests obligatorios

- tool MCP Vertex → conserva id;
- tool host custom → no conserva nombre;
- tool externa con nombre de empresa → no aparece serializada;
- tool nombre que parece `mcp-vertex_*` pero no está registrada como Vertex → no confiar en prefijo;
- dos hosts distintos → mismo safe report.

### Criterios de aceptación

- ningún string de tool externo entra al DTO transmisible;
- el reporter no recibe `toolName` arbitrario;
- test adversarial demuestra ausencia.

---

## ER2-002 — retirar `internalOnly:false`

**Clasificación:** `MEJORA / SEGURIDAD DE DISEÑO`
**Prioridad:** P2
**Archivo:** `plugins/error-reporting/src/lib/contracts/constants/options.constant.ts`

### Problema

La API todavía permite conceptualmente:

```json
{
  "internalOnly": false
}
```

La documentación de la opción implica "reportar cualquier tool failure".

Aunque el pipeline actual sigue siendo estricto, esta opción deja una bomba de mantenimiento: un agente futuro puede intentar "hacer funcionar" el flag y debilitar la privacidad.

### Cambio requerido

Eliminar la opción pública.

La política debe ser:

```text
external project data is non-reportable by construction
```

No configurable.

### Compatibilidad

Si existe config histórica:

- ignorar el campo con warning de deprecación;
- o aceptar temporalmente solo `true`;
- cualquier `false` debe fallar cerrado o quedar ignorado.

### Criterios de aceptación

- no existe path soportado para reportar errores externos;
- schema no anuncia `internalOnly:false`;
- docs explican que el reporting es MCP-only y no configurable hacia datos del proyecto.

---

## ER2-003 — versión efectiva de MCP Vertex en reportes

**Clasificación:** `MEJORA`
**Prioridad:** P3

### Problema

`mcpVertexVersion` se deriva del `package.json` raíz privado.

Ese valor no tiene por qué coincidir con la versión pública real de `@mcp-vertex/core`.

### Cambio requerido

Una fuente canónica del runtime version:

- build-time injected;
- package metadata del paquete publicado;
- o constante exportada por core.

### Criterios de aceptación

Un issue generado por `@mcp-vertex/core@X.Y.Z` contiene exactamente `X.Y.Z`.

---

## ER2-004 — conservar las protecciones ya correctas

**Clasificación:** `NO CAMBIAR`

No revertir:

- DTO seguro;
- synthetic examples;
- safe frames;
- serialized privacy validation;
- rate limit;
- dedupe;
- backoff;
- circuit breaker;
- `lastAttempt`/`lastSuccess` separados;
- fail-closed.

---

# 5. Filesystem — NUEVA regresión crítica

## FS2-001 — `context-for-change` acepta rutas absolutas fuera del workspace

**Clasificación:** `CONFIRMADO POR CÓDIGO / REPRODUCIR CON TEST`
**Prioridad:** P1

**Archivo:**
`plugins/context-for-change/src/lib/services/context-for-change.service.ts`

### Patrón actual

El normalizador hace esencialmente:

```ts
if (isAbsolute(inputPath)) {
  const prefix = `${workspaceRootAbs}/`;
  return inputPath.startsWith(prefix)
    ? inputPath.slice(prefix.length)
    : inputPath;
}
```

Luego:

```ts
readFile(resolve(workspaceRootAbs, filePath), 'utf8')
```

Si `filePath` sigue siendo absoluto, `resolve()` ignora `workspaceRootAbs`.

### Impacto

Una llamada puede apuntar a:

```text
/otro/proyecto/private.ts
```

y el servicio puede:

- leerlo;
- extraer símbolos;
- derivar referencias/contexto;
- incluir metadatos derivados.

No hace falta que devuelva el fichero entero para que el boundary esté roto.

### Solución requerida

No hacer path normalization local.

Usar una única API pública del core:

```ts
resolveWorkspaceContained(...)
```

y para lecturas reales:

```ts
safeReadWorkspaceFile(...)
```

con containment symlink-aware.

### Regla arquitectónica

Toda tool con permiso `filesystem-read` que procese una ruta suministrada por caller debe pasar por una API común.

### Tests adversariales obligatorios

- `../outside.ts`
- `/absolute/outside.ts`
- symlink dentro → target fuera
- symlink chain
- Windows `C:\outside\secret.ts`
- path con mixed separators
- prefix collision:
  - workspace `/foo/bar`
  - path `/foo/bar-secret/file.ts`
- Unicode path edge.

### Criterios de aceptación

Ninguna ruta exterior puede abrirse, ni siquiera si:

- existe;
- tiene extensión soportada;
- es symlink target;
- se pasa como absoluta.

---

## FS2-002 — `impact-analysis` tiene el mismo patrón

**Clasificación:** `CONFIRMADO POR CÓDIGO / REPRODUCIR`
**Prioridad:** P1

**Archivo:**
`plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`

### Problema

`normalizePath()` conserva rutas absolutas exteriores y `readSource()` usa:

```ts
readFile(resolve(workspaceRootAbs, filePath))
```

Mismo problema.

### Superficies afectadas

- `impact_analyze`
- `tests_for_change`
- cualquier helper que reutilice `computeImpactAnalysis`.

### Cambio requerido

Mismo `SafeWorkspaceReader` que en FS2-001.

### Criterio extra

No duplicar la solución en dos plugins.

Resolver a nivel de API compartida.

---

## FS2-003 — lint arquitectónico para impedir nuevas lecturas inseguras

**Clasificación:** `MEJORA`
**Prioridad:** P2

### Objetivo

Evitar que un agente nuevo vuelva a escribir:

```ts
readFile(resolve(workspaceRootAbs, userPath))
```

### Propuesta

Lint/check:

- plugins con permiso filesystem y input paths no pueden importar `node:fs/promises#readFile` directamente salvo allowlist;
- deben usar `@mcp-vertex/core/public` safe reader;
- excepciones documentadas y revisadas.

### Criterios

- CI bloquea nuevos escapes de esta clase;
- allowlist explícita para archivos internos del propio plugin.

---

# 6. Mutex / concurrencia

## MUT2-001 — race durante stale reclaim

**Clasificación:** `PROBABLE`
**Prioridad:** P1
**Archivo:** `packages/core/src/lib/shared/with-file-mutex.ts`

### Escenario a reproducir

```text
holder A posee lock
waiter B observa lock stale
A heartbeat refresca lock
B renombra lockPath → quarantine
lockPath queda libre temporalmente
contender C crea lock nuevo con O_EXCL
B descubre que la observación era vieja y deshace/abandona reclaim
A podría seguir en sección crítica
C también entra
```

La tokenización protege release, pero no necesariamente la exclusión durante el intervalo de quarantine.

### Tarea

Construir un test determinista con:

- clock inyectable;
- fs operations inyectables;
- barreras/promises;
- heartbeat intercalado exactamente entre observation y rename.

### Si se reproduce

Rediseñar stale reclaim.

Opciones:

1. lease/generation;
2. reclaim marker visible;
3. CAS-like directory strategy;
4. OS locking portable;
5. rename protocol donde ningún contender pueda considerar el lock libre durante verificación.

### No aceptar como solución

- "es improbable";
- aumentar timeout;
- dormir más;
- reintentar después de crear un segundo holder.

### Criterios

Nunca dos holders simultáneos, incluso bajo:

- heartbeat concurrente;
- crash;
- stale reclaim;
- 3+ contenders.

---

## MUT2-002 — métricas de contention

**Clasificación:** `MEJORA`
**Prioridad:** P3

Medir localmente:

- lock wait P50/P95;
- stale reclaim count;
- steal attempts;
- failed revalidation;
- max wait.

No enviar externamente datos de workspace.

---

# 7. Procesos

## PROC2-001 — validar edge UTF-8 al recortar chunks

**Clasificación:** `PROBABLE / MENOR`
**Prioridad:** P3

### Problema

El recorte actual puede dejar una secuencia UTF-8 incompleta si corta justo después del byte inicial de una secuencia multibyte.

Resultado posible:

- `�`;
- byte accounting final distinto del string reserializado.

### Tarea

Test con:

- emoji;
- CJK;
- 2/3/4-byte sequences;
- corte en todos los offsets.

### Solución recomendada

`TextDecoder` incremental o helper compartido de truncación UTF-8 segura.

### Criterio

`Buffer.byteLength(returnedString, 'utf8') <= remainingBudget` siempre.

---

## PROC2-002 — preservar las mejoras existentes

No reabrir:

- combined stdout/stderr budget;
- process tree kill;
- real byte accounting;
- truncation flag.

---

# 8. Tool responses / MCP output

## OUT2-001 — conservar metadata exclusivamente en `_meta`

**Clasificación:** `NO CAMBIAR`

No devolver a `structuredContent`:

- checkpoint advisory;
- stuck info;
- logHint;
- instrumentation metadata.

Esta corrección evita romper `outputSchema`.

---

## OUT2-002 — ampliar pagination/cursor real

**Clasificación:** `MEJORA`
**Prioridad:** P2

El generic truncation debe ser última defensa, no UX principal.

Auditar tools potencialmente no acotadas:

- logs;
- search;
- docs;
- proposal lists;
- issue lists;
- dependency trees;
- audit findings;
- browser snapshots;
- external MCP catalogs.

Para cada una decidir:

```text
limit
cursor
nextCursor
hasMore
summary
```

### Criterio

Ninguna tool común depende del envelope truncado para su funcionamiento normal.

---

# 9. Tokens — principal deuda de producto restante

## TOK2-001 — el `swarm` real supera su hard budget

**Clasificación:** `CONFIRMADO EN DASHBOARD GENERADO`
**Prioridad:** P1

Valores actuales documentados:

```text
swarm tools/list real: 229,740 B
hard budget:           192,000 B
```

Exceso aproximado:

```text
37,740 B
≈ 19.7 %
```

### Regla

No subir automáticamente el budget.

Primero reducir coste.

### Objetivo

`swarm` <= hard y preferiblemente <= warning.

### Criterios

- medición con ensamblado real;
- commit muestra delta before/after;
- no se "resuelve" subiendo 192k a 240k salvo decisión explícita documentada.

---

## TOK2-002 — el E2E de budget debe usar el preset real

**Clasificación:** `CONFIRMADO / REVISAR IMPLEMENTACIÓN`
**Prioridad:** P1

El test E2E utiliza un importer sintético con un subconjunto manual de plugins.

Esto puede permitir:

```text
test green
real dashboard red
```

### Cambio requerido

La fuente del gate debe ser la misma que la del runtime real.

Opciones:

- dynamic import real de todos los preset members;
- usar el loader real;
- reutilizar generator/assembler del dashboard;
- fixture solo para payloads tool específicos, no para total preset surface.

### Criterio

Si el dashboard dice:

```text
swarm > hard
```

CI falla.

No puede existir discrepancia.

---

## TOK2-003 — dashboard generado debe tener `--check`

**Clasificación:** `CONFIRMADO`
**Prioridad:** P2

El dashboard generado puede quedar viejo respecto al HEAD.

### Cambio

Crear:

```bash
bun run tokens:dashboard:check
```

o equivalente.

Proceso:

1. regenerar en memoria/temp;
2. comparar con tracked artifact;
3. exit 1 si cambia.

### Integración

Añadir a:

- CI;
- `bun run validate`.

### Criterio

Cambiar preset/plugin/schema sin regenerar dashboard rompe CI.

---

## TOK2-004 — estrategia default de `surfaceMode`

**Clasificación:** `REVISAR / DECISIÓN DE PRODUCTO`
**Prioridad:** P2

Existe:

```text
native
adaptive
compact
```

pero el default sigue siendo `native`.

### Problema

La principal solución de contexto está implementada pero no es la experiencia normal.

### Tarea

Benchmark de:

- client compatibility;
- cold context;
- activation latency;
- average tool discoverability;
- failure rate;
- tool list changed handling.

### Candidatos

```text
minimal → native/adaptive
lean → adaptive
standard → adaptive
swarm → adaptive
full → adaptive
vertex → adaptive
```

### Criterio

Tomar una decisión basada en datos.

No cambiar default sin compat testing.

---

## TOK2-005 — reducir `proposals` static schema

**Clasificación:** `CONFIRMADO / MEJORA`
**Prioridad:** P2

Valor medido aproximado:

```text
31 tools
76,776 B tools/list
63,853 B schema
54,839 B outputSchema
```

### Objetivo

Reducir significativamente coste sin perder seguridad de tipos.

Target inicial:

```text
< 40 KB static
```

o justificar otro target.

### Enfoques

- consolidación semántica de tools;
- schemas compartidos más pequeños;
- output schemas compactos;
- mover large optional structures a resources;
- lazy activation por workflow;
- menos descriptions duplicadas;
- action discriminators cuando tengan semántica común.

### NO hacer

Un único mega-tool ambiguo con `action: string` sin tipado.

---

## TOK2-006 — presupuesto real de `vertex`

**Clasificación:** `REVISAR`

El dashboard tracked puede estar desactualizado.

Regenerar y medir:

- plugin count;
- tool count;
- schema bytes;
- tool list bytes;
- top 10 plugin marginal cost.

Crear hard/warning explícitos también para `vertex`, no solo swarm/lean.

---

## TOK2-007 — token tax por plugin

**Clasificación:** `MEJORA`

Exponer de forma canónica:

```ts
pluginStaticCost = {
  toolCount,
  toolsListBytes,
  descriptionBytes,
  inputSchemaBytes,
  outputSchemaBytes,
  estimatedTokens
}
```

El selector/optimizer debe poder consumirlo.

---

## TOK2-008 — utility por 1K tokens

**Clasificación:** `IDEA`

Combinar:

```text
success contribution
relevance
activation frequency
static token cost
runtime response cost
latency
permission risk
```

para obtener una métrica interna:

```text
utilityPer1kTokens
```

No usarla como verdad absoluta, sino como señal.

---

# 10. Surface runtime

## SURF2-001 — validar `notifications/tools/list_changed`

**Clasificación:** `REVISAR`

Comprobar que la activación/desactivación dinámica:

- actualiza MCP tool list;
- envía la notificación correcta cuando aplica;
- no rompe clientes que cachean tool list;
- tiene fallback.

### Tests

Cliente MCP real:

1. connect;
2. listTools;
3. activar capability;
4. esperar listChanged;
5. listTools;
6. verificar cambio.

---

## SURF2-002 — bootstrap surface mínimo

**Clasificación:** `MEJORA`

Revisar qué tools deben estar siempre visibles.

Objetivo:

```text
orientation
discovery
activation
status
routing
```

y nada más.

Medir byte coste del bootstrap.

---

## SURF2-003 — surface mode como capability del host

**Clasificación:** `IDEA`

Permitir estrategia automática basada en clientInfo/capabilities:

```text
dynamic-client → adaptive
legacy-client → native/compact fallback
```

No usar heurísticas por nombre del cliente salvo última opción.

---

# 11. Plugin manifests — terminar la migración

## MAN2-001 — eliminar `MIGRATED_PLUGIN_IDS`

**Clasificación:** `CONFIRMADO / ARQUITECTURA PARCIAL`
**Prioridad:** P2

Actualmente manifests están migrados solo para un subconjunto.

El sistema definitivo no debe tener una lista manual de "plugins migrados".

### Objetivo

Descubrir automáticamente:

```text
plugins/*/plugin.manifest.ts
```

### Criterio

Nuevo plugin con manifest se incorpora automáticamente.

---

## MAN2-002 — manifest obligatorio para plugins públicos

**Clasificación:** `MEJORA`

Todo plugin first-party público debe declarar:

- id;
- package;
- version;
- visibility;
- summary;
- tags;
- maturity;
- permissions;
- toolPermissions;
- presets;
- tokenBudget;
- dependencies;
- capabilities.

Plugins privados internos pueden usar el mismo schema con `visibility: private`.

---

## MAN2-003 — generar `FIRST_PARTY_PLUGIN_INDEX` completo

**Clasificación:** `MEJORA`

Eliminar entradas manuales progresivamente.

Target final:

```text
FIRST_PARTY_PLUGIN_INDEX = generated artifact
```

No mezcla manual + generated.

---

## MAN2-004 — generar catálogo web

**Clasificación:** `MEJORA`

Web no debe mantener listas propias de plugins.

---

## MAN2-005 — generar docs de plugins

**Clasificación:** `MEJORA`

Generar:

- plugin list;
- maturity;
- permissions;
- presets;
- capabilities;
- token budget.

El texto editorial puede ser manual, los datos no.

---

## MAN2-006 — generar permission matrix

**Clasificación:** `MEJORA`

Tabla plugin/tool → permisos reales.

Usarla en:

- docs;
- selector;
- optimizer;
- adoption assessment;
- review.

---

## MAN2-007 — validar manifest vs package.json

**Clasificación:** `MEJORA`

CI debe fallar si:

```text
manifest.version != package.version
manifest.package != package.name
manifest.visibility incompatible con private
manifest.id != folder id
```

---

## MAN2-008 — validar manifest vs preset catalog

**Clasificación:** `MEJORA`

La matrix ya existe parcialmente.

Debe ser gate completo cuando todos estén migrados.

---

# 12. Presets

## PRE2-001 — summaries deben reflejar membership real

**Clasificación:** `CONFIRMADO / MENOR`

Revisar especialmente `backend-api`.

No dejar summaries que mencionen plugins ausentes o "opt-in" ambiguos.

### Criterio

Tests snapshot/semantic:

- todos los plugins nombrados literalmente en summary deben estar presentes o identificados explícitamente como "not included / opt-in".

Idealmente no nombrar lista manual en summary.

---

## PRE2-002 — presupuesto por preset

**Clasificación:** `MEJORA`

Cada preset debe tener:

- tool count;
- static bytes;
- estimated tokens;
- permissions union;
- max marginal plugin;
- warning/hard.

---

## PRE2-003 — estándar más ligero

**Clasificación:** `REVISAR`

`standard` tiene ~80 tools y ~119 KB nativos.

Preguntas:

- ¿debe incluir `refactor` siempre?
- ¿database siempre?
- ¿container siempre?
- ¿diagram siempre?
- ¿env siempre?
- ¿error-reporting sí, por política?
- ¿auto-agent-selector sí?

No eliminar por intuición.

Usar usage/activation data.

---

# 13. Adoption / proyecto externo

## ADOPT2-001 — `EXACT_ADOPTION_WRITE_ESTIMATE = 25`

**Clasificación:** `CONFIRMADO / PRECISIÓN`
**Prioridad:** P3

### Problema

Se marca un número fijo como:

```text
exact: true
```

aunque el plan real puede cambiar.

### Cambio

Derivar de:

```text
config write
+ generated files
+ proposal store files
+ otros artifacts
```

Si no puede ser exacto:

```text
exact: false
```

### Criterio

Test modifica `buildAgentFiles()` y el count sigue correcto automáticamente.

---

## ADOPT2-002 — cost assessment debe usar plugin set exacto cuando sea posible

**Clasificación:** `MEJORA`

Actualmente puede reutilizar el presupuesto del preset que cubre todo el set.

Más preciso:

- sumar marginal bytes reales del set;
- más core surface;
- o ensamblar surface dry-run.

### Criterio

Assessment de un subconjunto no informa coste de un preset mucho mayor si puede calcular coste exacto.

---

## ADOPT2-003 — project-specific defaults

**Clasificación:** `MEJORA`

Mantener package defaults agnósticos.

Detectar:

- package manager;
- docs roots;
- tests;
- CI;
- framework;
- workspace layout;
- commands.

No materializar `bun run validate` en terceros salvo detección clara.

---

# 14. Auto plugin selector / adaptive optimizer

## OPT2-001 — unificar función de scoring

**Clasificación:** `MEJORA`
**Prioridad:** P2

Actualmente existen señales relacionadas en:

- `auto-plugin-selector`;
- `adaptive-optimizer`;
- tool-surface scoring.

Riesgo:

tres fórmulas divergentes.

### Extraer modelo común

```ts
interface ICandidateSignals {
  relevance;
  confidence;
  staticTokenCost;
  runtimeTokenCost?;
  latency?;
  permissionRisk;
  successRate?;
  capabilityFit;
}
```

con weights/context diferentes.

---

## OPT2-002 — auto-plugin-selector debe penalizar token tax

**Clasificación:** `MEJORA`

No recomendar un plugin ligeramente útil si cuesta decenas de miles de tokens en native surface, salvo necesidad clara.

---

## OPT2-003 — optimizer no debe experimentar automáticamente todavía

**Clasificación:** `NO CAMBIAR`

Mantener:

- consent;
- explicit budget;
- cheap scorer by default.

Antes de closed-loop:

- offline eval;
- rollback;
- confidence;
- cost caps;
- privacy review.

---

# 15. Context-for-change — evolución tras arreglar containment

## CFC2-001 — reutilizar peers/runtime en lugar de imports rígidos cuando convenga

**Clasificación:** `REVISAR`

El plugin reutiliza APIs públicas de otros plugins, lo cual es bueno.

Pero revisar si hard imports implican cargar dependencias aunque la capability no esté activa.

Objetivo:

- no romper modularidad;
- no inflar startup innecesariamente.

---

## CFC2-002 — memoryStorePath autodetectable

**Clasificación:** `MEJORA`

Actualmente la memoria puede aparecer como unavailable si no se configura el path.

Preferible:

- peer API;
- runtime capability;
- shared store accessor.

No duplicar conocimiento del layout de `memory`.

---

## CFC2-003 — benchmark utility vs llamadas separadas

**Clasificación:** `MEJORA`

Comparar:

```text
context_for_change
```

contra flujo manual de 5–8 tools.

Medir:

- tokens;
- latency;
- task success;
- precision;
- missing context.

---

# 16. Impact analysis

## IMP2-001 — containment

Cubierto por FS2-002.

---

## IMP2-002 — dependencia lexical vs semantic

**Clasificación:** `REVISAR`

El análisis actual es deliberadamente lexical/bounded.

Mantenerlo barato.

Añadir opcionalmente layers:

```text
fast → lexical
deep → nav/reference graph
```

No meter LLM por defecto.

---

## IMP2-003 — test selection benchmark

**Clasificación:** `MEJORA`

Crear corpus fixture con cambios conocidos.

Métricas:

- recall de tests relevantes;
- precision;
- false negatives;
- runtime;
- tokens.

---

# 17. Project health

## PH2-001 — mantener summary-first

**Clasificación:** `NO CAMBIAR`

Es uno de los mejores patrones nuevos.

---

## PH2-002 — domain lazy detail

**Clasificación:** `MEJORA**

Asegurar que detalle de:

- security;
- deps;
- quality;
- tech debt;

no se ejecuta en summary barato salvo necesidad.

---

# 18. Memory

## MEM2-001 — preservar invalidación event-driven

**Clasificación:** `NO CAMBIAR`

No volver a refresh en cada tool call global.

---

## MEM2-002 — watch lifecycle/dispose

**Clasificación:** `REVISAR`

`fs.watch()` se crea durante register.

Comprobar que el disposer del plugin cierra:

- watcher;
- debounce timer.

Si no existe disposer, añadirlo.

### Tests

load → dispose → watcher no recibe eventos / proceso puede terminar limpio.

---

## MEM2-003 — metrics de recall local

**Clasificación:** `IDEA`

Medir localmente:

- recall hit rate;
- query latency;
- store size;
- note expiry;
- compaction savings.

No reportar contenidos.

---

# 19. CI / gobernanza

## CI2-001 — required health para `develop`

**Clasificación:** `CONFIRMADO`
**Prioridad:** P2

La branch continúa sin protección requerida.

### No asumir que debe usarse PR humano

El workflow puede seguir permitiendo pushes directos de agentes.

Pero exigir una política de health.

Opciones:

1. GitHub required checks;
2. bot revert automático;
3. deployment gate;
4. branch health lock;
5. propuestas no pueden pasar a `done` si HEAD rojo.

### Recomendación

Required checks mínimos:

- typecheck;
- tests;
- architecture;
- security;
- runtime verify;
- token budget real.

---

## CI2-002 — token dashboard check

Cubierto por TOK2-003.

---

## CI2-003 — manifests generator check

**Clasificación:** `MEJORA**

Añadir:

```text
generate-from-manifests --check
```

como required.

---

## CI2-004 — distinguir advisory vs blocking

**Clasificación:** `MEJORA**

Actualmente algunos checks están en modo `--report`.

Documentar:

- cuáles bloquean;
- por qué;
- cuándo pasan a blocking.

---

## CI2-005 — workflow run evidence

**Clasificación:** `MEJORA**

Una proposal que se mueve a review debería guardar:

- commit;
- gates ejecutados;
- resultado;
- si fue local o CI.

No afirmar "CI verde" basándose solo en comandos locales.

---

# 20. Coverage / tests

## TEST2-001 — preservar pure-barrel exclusion

**Clasificación:** `NO CAMBIAR`

La solución actual es mejor que blanket `**/index.ts`.

---

## TEST2-002 — tests de invariantes transversales

**Clasificación:** `MEJORA**

Crear suites compartidas:

### Filesystem contract

Todo plugin con filesystem path input debe pasar:

- traversal;
- absolute outside;
- symlink outside;
- Windows outside.

### Output contract

Todo tool con `outputSchema`:

- successful result conforms;
- `_meta` no altera structured payload.

### Byte contract

Todas las responses bounded:

- ASCII;
- emoji;
- large arrays;
- objects;
- tiny maxBytes.

### Plugin lifecycle

- dep fail;
- timeout;
- cancel;
- rollback;
- disposer;
- cycle.

---

## TEST2-003 — property-based tests

**Clasificación:** `MEJORA**

Especialmente:

- containment;
- redact/privacy validator;
- mutex state machine;
- truncation;
- path normalization.

---

# 21. Dependency/toolchain policy

## TOOL2-001 — mantener lint de versiones

**Clasificación:** `NO CAMBIAR`

Ya existe.

---

## TOOL2-002 — definir exceptions explícitas

**Clasificación:** `MEJORA**

Si web/core/cli necesitan versiones distintas, usar allowlist razonada.

No drift silencioso.

---

# 22. Core

## CORE2-001 — no dividir paquetes todavía por estética

**Clasificación:** `REVISAR`

La separación interna ha mejorado mucho.

No crear:

```text
runtime
plugin-sdk
authoring
setup
analyzer
```

hasta que los límites internos estén maduros.

### Señal para split

- APIs públicas estables;
- ciclos casi cero;
- consumers claramente distintos;
- build/package size justifica separación.

---

## CORE2-002 — `SafeWorkspaceReader` público

**Clasificación:** `MEJORA / P1 ENabler**

Extraer una API central usada por nuevos plugins.

Ejemplo conceptual:

```ts
interface ISafeWorkspaceReader {
  resolve(relativeOrAbsolute: string): ContainedPathResult;
  readText(path: string): Promise<string>;
  stat(path: string): Promise<...>;
  list(path: string): Promise<...>;
}
```

Debe ser symlink-aware.

---

## CORE2-003 — `SafeProcessRunner` como única vía

**Clasificación:** `MEJORA**

Plugins no deberían spawn directo salvo excepción auditada.

---

## CORE2-004 — `SafeNetworkClient` como única vía

**Clasificación:** `MEJORA**

Centralizar:

- allowlist;
- ports;
- redirects;
- timeouts;
- bytes;
- logging redaction.

---

# 23. Web/API security

## NET2-001 — preservar host+port allowlist

**Clasificación:** `NO CAMBIAR`

---

## NET2-002 — DNS rebinding / private IP review

**Clasificación:** `REVISAR`

Hostname allowlist reduce SSRF, pero revisar si un allowlisted hostname puede resolver a:

- loopback;
- link-local;
- RFC1918;
- metadata endpoints.

Decidir policy.

No bloquear automáticamente casos empresariales legítimos sin config.

Posible:

```text
allowPrivateNetwork: false default
```

si el producto lo necesita.

---

## API2-001 — request body puede contener secretos

**Clasificación:** `REVISAR`

`api_call` redacted headers están bien.

Pero el returned request puede incluir:

```ts
body: request.body
```

Si el body contiene password/token, el agente lo verá de vuelta.

Esto no es "public error-reporting"; sigue siendo respuesta local al caller que ya suministró el dato.

Por tanto no es necesariamente vulnerabilidad.

Revisar si logs/instrumentation almacenan ese body.

### Regla

No copiar request body a logs persistentes salvo redacción explícita.

---

# 24. Logs

## LOG2-001 — privacidad local de logs

**Clasificación:** `REVISAR`

El reporting público ya está mucho mejor.

Auditar por separado logs locales:

- args;
- outputs;
- paths;
- secrets;
- retention;
- permissions.

Los logs locales pueden contener datos del proyecto porque son locales, pero deben:

- redacted secrets;
- no salir por red;
- retention clara.

---

## LOG2-002 — `logHint line=0`

**Clasificación:** `REVISAR`

La instrumentación puede inyectar un `logHint` con `line: 0` antes de conocer la línea real.

Verificar UX:

- si `line=0` significa unknown, tiparlo así;
- idealmente sink devuelve pointer real.

---

# 25. Registry / presets / source of truth

## REG2-001 — eliminar mezcla manual+generated

Cubierto por manifests.

---

## REG2-002 — auto-plugin-selector candidates

**Clasificación:** `MEJORA**

Una vez todos los manifests existan, selector debe consumir directamente el catálogo generado completo.

---

## REG2-003 — one-source rule

**Clasificación:** `PRINCIPIO`

No mantener manualmente el mismo dato en más de un sitio:

- plugin id;
- summary;
- permissions;
- presets;
- version;
- maturity;
- token budget.

---

# 26. Proposal workflow

## PROP2-001 — `done` no equivale a verified

**Clasificación:** `MEJORA**

El workflow actual ya usa `review`, lo cual está bien.

Regla:

```text
implementation done → review
review + evidence → done
```

---

## PROP2-002 — acceptance tests deben ser ejecutables

**Clasificación:** `MEJORA**

Preferir criterios:

```text
bun run test -- path
bun run lint:foo
expected byte threshold
expected rejected path
```

sobre texto narrativo.

---

## PROP2-003 — cerrar finding con reason code

**Clasificación:** `MEJORA**

Cada finding debería terminar con:

```yaml
resolution:
  status: implemented|already-fixed|not-reproducible|accepted-risk|deferred
  evidence:
    - commit
    - test
    - file
```

---

# 27. Todos los plugins — checklist de revisión

> Esta sección NO afirma que todos tengan bugs. Es el checklist que debe usar el agente antes de declarar terminada la auditoría global.

## adaptive-optimizer

- verificar budgets;
- scoring común;
- no experimentos heavy sin consent;
- no almacenar prompts privados en telemetry;
- manifest correcto;
- output bounded.

## api

- headers sensibles ya redacted;
- revisar body/logging;
- allowlist;
- response cap;
- spec fetch boundaries;
- errors no filtran auth.

## audit

- budgets;
- concurrency;
- model selection;
- no publicar contexto privado;
- self-audit no auto-crea loops infinitos.

## auto-agent-selector

- model cost metadata;
- provider failures;
- deterministic fallback;
- privacy de prompts;
- cost-quality dial;
- token-aware scoring.

## auto-plugin-selector

- consumir manifests;
- token tax;
- permission risk;
- no recomendar plugin unavailable;
- diff exacto.

## browser

- opt-in;
- network policy;
- page content cap;
- screenshots/files boundaries;
- secrets/cookies;
- process cleanup.

## cache

- containment;
- dry-run;
- eviction ownership;
- memory results no borrados accidentalmente;
- race with writers.

## changelog

- git read bounded;
- no giant output;
- conventional commit parsing;
- branch safety.

## completion

- idempotence;
- duplicate completion;
- notification integration;
- no false task completion;
- state machine tests.

## container

- process runner;
- Docker/K8s command caps;
- no arbitrary shell;
- secrets in env/output;
- platform behavior.

## context-for-change

- **P1 containment**;
- benchmark vs separate calls;
- peer dependencies;
- memory access;
- bounded sections;
- no accidental source dump.

## conventions

- path-only;
- false positives;
- configurable roots;
- no project-specific assumptions.

## database

- read-only guarantee;
- credentials;
- URLs;
- schema size caps;
- no arbitrary SQL mutation.

## deps

- network/write flags;
- package manager detection;
- bounded tree;
- license/CVE freshness.

## diagram

- graph size;
- path containment;
- renderer subprocess;
- output bounds.

## docs

- roots;
- containment;
- pagination;
- generated vs human docs;
- search quality.

## env

- never return secret values;
- only keys/schema/state;
- `.env` containment;
- logs.

## error-reporting

- ER2-001;
- ER2-002;
- version;
- adversarial privacy;
- safe DTO only.

## external-mcps

- explicit human ack;
- child process bounds;
- tool list explosion;
- trust boundary;
- network/process permissions.

## forge

- destructive actions require explicit intent;
- token handling;
- repo target validation;
- rate limits;
- bounded API responses.

## git

- argv-only;
- write permissions;
- commit author;
- branch policy;
- worktree boundaries;
- huge diff caps.

## i18n

- glob bounds;
- JSON parse errors;
- no huge locale dump;
- project detection.

## impact-analysis

- **P1 containment**;
- benchmark;
- false negatives;
- test selection;
- bounded symbols.

## issues-triage

- private visibility;
- no accidental registry/public package exposure;
- GitHub data bounds.

## issues

- repo target;
- write confirmation model;
- issue body privacy;
- pagination.

## link-check

- local vs remote behavior;
- network policy;
- response bounds.

## logs

- secret redaction;
- retention;
- local-only;
- pagination;
- exact logHint.

## memory

- watcher dispose;
- BM25;
- TTL;
- maxNotes;
- compaction;
- no transcript ingestion;
- event-driven refresh.

## notification

- lock waiting;
- heartbeat;
- no busy polling;
- cancellation;
- contention.

## observability

- overlap with metrics/logs;
- bounded snapshots;
- no project data telemetry unless local;
- labels low-cardinality.

## orchestrator-runner

- process safety;
- cost bounds;
- agent cancellation;
- cleanup;
- recursion limits.

## perf

- benchmark isolation;
- subprocess caps;
- no uncontrolled profiler files;
- baseline drift.

## project-health

- cheap summary really cheap;
- lazy domains;
- no hidden heavy commands;
- bounded output.

## prompt-eval

- fixture/synthetic data;
- secret prompts;
- token budgets;
- deterministic scoring where possible;
- provider cost controls.

## prompts-pack

- prompt size lint;
- project data injection;
- versioning;
- avoid large static descriptions.

## proposals

- 76 KB static cost;
- state machine;
- lock correctness;
- write atomicity;
- branch policy;
- schema consolidation;
- round context compactness.

## quality

- process runner;
- command detection;
- configurable gates;
- not hardwired to Bun for third parties.

## quality-policy

- summary-only;
- no heavy commands;
- reflect actual project tests;
- output <= configured bound.

## refactor

- containment;
- rename safety;
- preview before write;
- atomic mutations;
- symbol correctness.

## rules

- plugin-specific policy leakage;
- config overrides;
- bounded violations.

## search

- manifest canonical;
- roots;
- regex DoS;
- max results;
- semantic index cost;
- token-efficient output.

## security

- no secret values;
- safe CVE fetching;
- false positives;
- path containment;
- output caps.

## skills-pack

- static token cost;
- lazy skill content;
- version/maturity;
- not inject all skill bodies at bootstrap.

## status-marker

- file races;
- containment;
- stale state;
- compact output.

## tech-debt

- heuristics;
- no gigantic scan output;
- no false "exact" metrics;
- path bounds.

## test-convention

- detected test runners;
- no project assumptions;
- concise result.

## test-policy

- derive current policy;
- no heavy execution;
- compatibility with external repos.

## usage-tracking

- local aggregate only;
- no content capture;
- anonymized event model;
- persistence bounds;
- feed optimizer safely.

## web-fetch

- host+port allowlist;
- redirect revalidation;
- streaming cap;
- timeout;
- DNS/private IP policy review;
- fail closed.

---

# 28. Bugs/ideas que YA NO deben abrirse de nuevo

Cerrar como `ALREADY_FIXED` si reaparecen:

- loader ignora `parsed.data`;
- dependencies solo "resolved" y no active;
- output metadata rompe schemas;
- client hardcoded 0.1.0;
- memory refresh global;
- metrics `.length` en vez de UTF-8;
- errors cost 0;
- independent stdout/stderr cap;
- process timeout no mata descendientes;
- generic truncation corta JSON arbitrariamente;
- blanket index coverage exclusion;
- registry no contiene auto-plugin-selector;
- error-reporting copia stack/message raw directamente.

---

# 29. KPIs que faltan o deben consolidarse

Medir localmente:

## Tool surface

- static tools/list bytes;
- schema bytes;
- description bytes;
- input/output schema split;
- active tool count;
- activation count.

## Runtime

- P50/P95 latency;
- P50/P95 response bytes;
- error rate;
- cancel rate;
- timeout rate.

## Optimización

- selector recommendation accepted rate;
- optimizer candidate success;
- tokens saved by adaptive surface;
- utility/1k tokens;
- average active tools per task.

## Memory

- recall hit rate;
- compaction ratio;
- note count;
- stale advisory frequency.

## Privacy

- privacy gate blocked reports count;
- safe reports submitted count;
- zero project-data property tests.

No enviar contenido privado.

---

# 30. Privacy classes

## Class A — MCP Vertex internal

Permitido para reporting público si está tipado y validado:

- package id;
- component id;
- internal error code;
- normalized internal frame;
- MCP Vertex version.

## Class B — coarse environment

Permitido solo si necesario:

- `node|bun|unknown`;
- `windows|linux|macos|unknown`.

## Class C — project data

Nunca en reporting público:

- paths;
- repo;
- branch;
- filenames externos;
- tool args;
- tool outputs;
- project code;
- project tool names;
- URLs privadas.

## Class D — secrets / PII

Nunca:

- tokens;
- passwords;
- emails;
- credentials;
- cookies;
- API keys;
- JWT;
- private keys.

---

# 31. Synthetic examples

Ejemplos de issue deben construirse de cero.

Temas válidos:

- bakery;
- books;
- pets;
- planets;
- inventory ficticio.

Dominios:

```text
example.invalid
api.example.invalid
docs.example.invalid
```

IDs:

```text
demo-123
fixture-001
synthetic-user
```

No:

```text
real data → redact()
```

Sí:

```text
safe schema → synthesize()
```

---

# 32. Pipeline de issue seguro recomendado

1. tool/hook failure ocurre.
2. raw error permanece local.
3. classifier decide origen.
4. si no es Vertex → stop.
5. resolver package interno.
6. resolver error code.
7. extraer solo frames internos permitidos.
8. normalizar frame a package-relative.
9. resolver safe tool identity.
10. generar synthetic example.
11. construir DTO cerrado.
12. redactar defensivamente.
13. validar DTO.
14. serializar.
15. validar serialized string.
16. fingerprint seguro.
17. scheduler/rate-limit/dedupe.
18. submit.
19. success/failure store separado.

Cualquier unknown:

```text
DO NOT SEND
```

---

# 33. Fingerprint seguro

Usar únicamente:

```text
mcpVertexVersion
packageId
componentId
errorCode
topInternalFrameRelative
failureClass
```

No usar:

- raw message;
- args;
- paths;
- project tool id;
- workspace;
- repository.

---

# 34. Rate limits

Mantener:

- daily max;
- dedupe window;
- exponential backoff;
- jitter;
- circuit breaker.

Añadir tests de:

- clock skew;
- multiple simultaneous same fingerprint;
- persistence corruption.

---

# 35. Plugin permissions

Una vez todos tengan manifest:

```text
plugin permissions
→ union de sus tools
```

y preferiblemente:

```text
toolPermissions
```

más preciso.

El selector debe penalizar permisos altos cuando la tarea no los necesita.

---

# 36. Adopción segura en terceros

Antes de escribir:

```text
analyze
→ assessment
→ preview
→ explicit write
```

Mantener dry-run default.

Nunca:

```text
adopt_project
→ overwrite everything
```

sin explicit opt-in.

---

# 37. Prioridad de implementación propuesta

## P0 — si aparece evidencia de fuga real

- cualquier reporter enviando Class C/D;
- filesystem outside workspace con datos retornados;
- secrets en issue público.

## P1

- FS2-001;
- FS2-002;
- MUT2-001;
- TOK2-001;
- TOK2-002;
- ER2-001.

## P2

- ER2-002;
- TOK2-003;
- TOK2-004;
- TOK2-005;
- manifests completos;
- scoring común;
- branch health;
- SafeWorkspaceReader lint.

## P3

- UTF-8 process edge;
- adoption exact count;
- reporter runtime version;
- preset summaries;
- watcher disposal;
- local metrics.

---

# 38. Descomposición recomendada en proposals

No crear una única proposal gigante.

## Track A — seguridad filesystem

- `a-fs-safe-reader`
- `a-context-containment`
- `a-impact-containment`
- `a-filesystem-invariant-lint`

## Track B — concurrencia

- `b-mutex-race-repro`
- `b-mutex-reclaim-redesign`
- `b-mutex-property-tests`

## Track C — tokens

- `c-real-preset-budget-gate`
- `c-token-dashboard-check`
- `c-proposals-schema-diet`
- `c-adaptive-default-evaluation`
- `c-vertex-budget`

## Track D — privacidad

- `d-safe-tool-identity`
- `d-remove-internalOnly-false`
- `d-runtime-version-source`
- `d-privacy-adversarial-regression`

## Track E — manifests

- `e-manifest-autodiscovery`
- `e-migrate-all-public-plugins`
- `e-generated-registry`
- `e-generated-docs-web-permissions`

## Track F — quality

- `f-adoption-exact-count`
- `f-process-utf8-edge`
- `f-memory-dispose`
- `f-preset-summary-drift`

---

# 39. Template obligatorio de proposal

```markdown
---
id: ...
title: ...
kind: fix|feature|refactor|quality
status: ready
track: ...
---

# Problem

Qué ocurre.

# Evidence

Archivo, función, medición, reproducción.

# Classification

CONFIRMADO / PROBABLE / REVISAR / MEJORA / IDEA.

# User impact

Qué se rompe o qué mejora.

# Privacy impact

A/B/C/D classes afectadas.

# Token impact

bytes/tokens before/target.

# Scope

Archivos permitidos.

# Out of scope

Qué NO debe tocarse.

# Design

Arquitectura elegida.

# Tests

Tests unit/integration/e2e/property.

# Acceptance criteria

- [ ] criterio ejecutable
- [ ] criterio ejecutable

# Regression guards

Qué evita que vuelva.

# Resolution evidence

Commit/gates/metrics.
```

---

# 40. Checklist global de aceptación

Antes de declarar esta auditoría "cerrada":

## Seguridad

- [ ] context-for-change no abre rutas exteriores.
- [ ] impact-analysis no abre rutas exteriores.
- [ ] symlink escape bloqueado.
- [ ] reporter no envía tool ids externos.
- [ ] `internalOnly:false` no permite ampliar reporting.
- [ ] privacy adversarial suite verde.

## Concurrencia

- [ ] stale reclaim race reproducido o descartado con test determinista.
- [ ] nunca dos holders simultáneos.

## Tokens

- [ ] real swarm <= hard.
- [ ] CI falla si real swarm > hard.
- [ ] token dashboard tracked está fresco.
- [ ] proposals static cost reducido o justificado.
- [ ] vertex tiene budget explícito.
- [ ] decisión de default adaptive documentada.

## Manifests

- [ ] todos los plugins públicos con manifest.
- [ ] no `MIGRATED_PLUGIN_IDS`.
- [ ] registry generado.
- [ ] web catalog generado.
- [ ] docs generated.
- [ ] permissions generated.
- [ ] preset compatibility gate.

## Quality

- [ ] process UTF-8 test.
- [ ] adoption count exact/renamed.
- [ ] memory watcher cleanup.
- [ ] preset summaries coherentes.
- [ ] required branch health policy decidida.

---

# 41. Diez principios que deben quedar como guardrails del repo

1. **Privacy by construction, no by redaction.**
2. **Unknown data stays local.**
3. **Synthetic examples over sanitized real examples.**
4. **One source of truth for machine-readable metadata.**
5. **Budgets are constraints, not numbers to auto-increase.**
6. **Load only capabilities useful for the current task.**
7. **Measure real runtime surfaces, not synthetic subsets.**
8. **Fail closed on security boundaries.**
9. **Internal invariants must be APIs/lints, not tribal knowledge.**
10. **A proposal is not done until the acceptance evidence exists.**

---

# 42. Norte de producto recomendado

MCP Vertex no debería aspirar a "tener muchísimas tools".

Debería aspirar a:

```text
49 capabilities installed
≈ 5 capabilities visible for this task
≈ 1–3 tools actually called
minimum context necessary
measured quality
measured cost
```

El valor diferencial es:

```text
task
→ understand project
→ choose capability set
→ choose model
→ build compact context
→ execute
→ verify
→ measure
→ improve policy
```

No el catálogo bruto.

---

# 43. Qué no hace falta añadir ahora

Antes de crear más plugins, terminar:

- containment;
- adaptive surface;
- token real gate;
- manifests;
- optimizer integration;
- mutex;
- branch health.

Hay suficiente catálogo para demostrar extensibilidad.

---

# 44. Estado comparativo con la primera auditoría

## Cerrado / sustancialmente resuelto

- parsed.data;
- lifecycle dependencies;
- rollback cooperativo;
- process bytes;
- process tree kill;
- metrics bytes;
- error bytes;
- truncation;
- output schema metadata;
- client version;
- memory refresh;
- coverage index;
- CI decomposition;
- registry auto-plugin-selector;
- error reporter arquitectura principal.

## Parcial

- mutex;
- manifests;
- token costs;
- dynamic surface;
- project-agnostic defaults;
- permission model;
- adaptive optimization.

## Nuevo

- context-for-change containment;
- impact-analysis containment;
- real swarm hard-budget breach;
- synthetic E2E vs real preset mismatch;
- stale token dashboard;
- adoption "exact 25";
- external toolId provenance.

---

# 45. Regla para el agente que procese este documento

Para cada item:

```text
1. leer código actual
2. escribir/reproducir test
3. confirmar clasificación
4. decidir fix mínimo correcto
5. implementar
6. ejecutar gate específico
7. ejecutar gates globales relevantes
8. medir before/after
9. mover a review
10. registrar evidence
```

No hacer:

```text
leer TODO
→ asumir cierto
→ cambiar código
```

---

# 46. Definition of Done de esta auditoría

Esta auditoría queda realmente cerrada cuando:

- todos los `CONFIRMADO` tienen resolución;
- todos los `PROBABLE` tienen test de reproducción o descarte;
- todos los `REVISAR` tienen una decisión documentada basada en mediciones;
- todos los `MEJORA` P1/P2 están implementados o diferidos con razón;
- ningún P1 queda simplemente "accepted" sin aprobación explícita;
- los generated artifacts están sincronizados;
- el branch audited pasa los gates acordados;
- una tercera auditoría no vuelve a encontrar las mismas clases de bug.

---

# 47. Mensaje final para el agente

La prioridad no es "marcar este archivo como completado".

La prioridad es que después de ejecutar el trabajo:

```text
filesystem boundaries sean imposibles de saltar,
public reporting no pueda transportar datos del proyecto,
mutex no pueda tener dos holders,
real token budgets sean gates reales,
manifests sean la única fuente,
adaptive surface sea una decisión medida,
y cada proposal tenga evidencia verificable.
```

Si un punto de este documento ya está arreglado en el HEAD actual, no lo reimplementes.

Ciérralo con evidencia.

Si un punto no se reproduce, no inventes un bug.

Si una solución aumenta tokens, superficie o permisos, documenta el coste.

Si una solución toca privacidad y hay duda:

```text
NO SE ENVÍA.
```

---

# 48. Resultado esperado después de esta ronda

Con los P1 y P2 resueltos, MCP Vertex debería quedar aproximadamente en esta posición:

```text
Arquitectura:          9.3+
Correctitud:           9.1+
Privacidad:            9.4+
Tokens estrategia:     9.7+
Tokens ejecución:      8.8+
CI:                    9.3+
Adopción:              9.5+
Mantenibilidad:        9.2+
```

Sin añadir ninguna feature nueva.

Ese debería ser el objetivo de esta ronda.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.
