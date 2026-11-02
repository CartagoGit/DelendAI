---
id: a00092
title: "MCP Vertex — Auditoría integral de `develop` y TODO maestro de mejora"
kind: audit
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md
---

# a00092 — MCP Vertex — Auditoría integral de `develop` y TODO maestro de mejora

## Goal

> **Documento de trabajo para convertir en propuestas ejecutables**
>
> Rama auditada: `develop`
> Referencia observada durante la auditoría: `0a2ed223838372c15501bf5c6c2e43fce6640338`
> Fecha del documento: 2026-08-24
> Objetivo: convertir cada hallazgo, riesgo, deuda, mejora, hipótesis y propuesta de producto en trabajo trazable, verificable y cerrable.
>
> **Nota de archivo:** este documento es una auditoría externa (producida por un modelo externo al repo) que se conserva como referencia legada. No es código, no es spec vinculante; es el material de entrada del plan `q00003` y de sus propuestas hijas. Cada TODO aquí referenciado se cierra con evidencia (reproducido+arreglado / ya arreglado / no reproducible / comportamiento intencional / riesgo aceptado / superado por cambio de arquitectura).

---

# 0. Cómo debe usarse este documento

Este documento **no debe interpretarse como una lista de 100 % bugs confirmados**.

La auditoría mezcló cuatro tipos de observaciones:

- **CONFIRMADO**: comportamiento, inconsistencia o riesgo derivado directamente del código/configuración observados.
- **PROBABLE**: el código sugiere un problema, pero hace falta reproducirlo o ejecutar tests específicos.
- **REVISAR**: área que merece comprobación sistemática; puede resultar correcta tras la revisión.
- **MEJORA**: propuesta de arquitectura, rendimiento, producto, tokens, seguridad, DX o mantenibilidad.
- **IDEA**: ampliación de utilidad que no corrige necesariamente un defecto actual.

Esto es importante porque el objetivo no es "demostrar que todo está mal", sino **hacer imposible que una observación razonable quede sin verificar**.

Cada agente que derive propuestas a partir de este documento debería:

1. Crear una propuesta por problema o grupo coherente.
2. Confirmar primero si el problema sigue existiendo en el commit actual.
3. Añadir reproducción o test que falle antes de cambiar código.
4. No modificar comportamiento observable sin documentarlo.
5. Marcar explícitamente:
   - `confirmed`
   - `not reproducible`
   - `already fixed`
   - `accepted risk`
   - `implemented`
6. Mantener el principio de "una fuente de verdad" siempre que sea viable.
7. No subir presupuestos de tokens automáticamente para hacer pasar tests: justificar cualquier aumento.
8. Tratar privacidad, seguridad y no recopilación de datos de terceros como invariantes de producto.

---

# 1. INVARIANTE DE PRODUCTO NO NEGOCIABLE: privacidad del reporting automático

## 1.1 Decisión de producto

**MCP Vertex SÍ debe poder enviar automáticamente issues de errores propios de MCP Vertex y puede estar habilitado por defecto.**

Pero existe una condición absoluta:

> **NUNCA debe recopilarse, transmitirse ni publicarse información del proyecto del usuario, de su empresa, de su máquina, de sus rutas, de sus repositorios, de sus archivos, de sus datos, de sus clientes, de sus secretos, de sus identificadores o de terceros.**

La issue automática debe contener exclusivamente información necesaria para diagnosticar **un defecto de MCP Vertex**.

No se quiere telemetría del proyecto.

No se quiere recopilar contexto del usuario.

No se quiere observar qué está desarrollando.

No se quiere subir código.

No se quiere subir prompts.

No se quiere subir documentos.

No se quiere subir rutas locales.

No se quiere subir nombres de repositorio.

No se quiere subir ramas.

No se quiere subir nombres de empresa.

No se quiere subir nombres de usuario.

No se quiere subir URLs privadas.

No se quiere subir variables de entorno.

No se quiere subir stack frames pertenecientes al proyecto consumidor.

No se quiere subir argumentos de herramientas cuando esos argumentos pueden proceder del proyecto.

No se quiere subir outputs de herramientas del proyecto.

No se quiere subir logs completos.

**La privacidad no es una opción configurable del usuario que pueda fallar: debe formar parte de la arquitectura.**

---

# 2. Arquitectura propuesta para `error-reporting`

## TODO ER-001 — Mantener reporting automático por defecto, pero rediseñarlo como "MCP-Vertex-only"

**Tipo:** CONFIRMADO + REDISEÑO
**Prioridad:** CRÍTICA
**Severidad:** P0

### Problema

El objetivo actual del plugin es correcto: saber qué errores propios de MCP Vertex están ocurriendo en instalaciones reales.

El riesgo está en utilizar datos de excepciones/logs sin una frontera fuerte entre:

- información generada por MCP Vertex;
- información procedente del proyecto consumidor.

### Objetivo

Crear una arquitectura en la que sea técnicamente difícil o imposible construir una issue que contenga datos externos.

### Diseño requerido

Separar completamente:

```text
Raw runtime failure
        ↓
Local-only classifier
        ↓
MCP Vertex frame extractor
        ↓
MCP Vertex safe diagnostic model
        ↓
Privacy sanitizer
        ↓
Privacy validator / deny-by-default
        ↓
Synthetic context builder
        ↓
Issue payload
```

Nunca:

```text
Raw Error / raw stack / raw args
        ↓
GitHub issue
```

### Criterio de aceptación

El módulo que ejecuta `gh issue create` o cualquier futuro HTTP reporter **no debe aceptar `Error`, `args`, `stack`, `workspace`, `cwd` ni strings arbitrarios del host**.

Debe aceptar solamente un DTO previamente seguro, por ejemplo:

```ts
interface ISafeMcpVertexReport {
  reporterVersion: string;
  mcpVertexVersion: string;
  packageId: string;
  toolId?: string;
  errorCode?: string;
  failureClass: SafeFailureClass;
  fingerprint: string;
  mcpFrames: readonly ISafeMcpFrame[];
  syntheticExample?: ISyntheticExample;
  environmentClass?: {
    runtime: 'node' | 'bun' | 'unknown';
    platformFamily: 'windows' | 'linux' | 'macos' | 'unknown';
  };
}
```

No permitir propiedades como:

```ts
message: string
stack: string
args: unknown
workspace: string
path: string
repo: string
cwd: string
hostName: string
```

salvo strings **producidos internamente a partir de vocabulario controlado**.

---

## TODO ER-002 — Clasificación fuerte de "error interno de MCP Vertex"

**Tipo:** CONFIRMADO
**Prioridad:** CRÍTICA

### Problema observado

Una detección basada en substrings amplios puede clasificar erróneamente un error de un proyecto consumidor como interno.

Los indicadores genéricos como:

```text
/plugins/
```

no son suficientemente fuertes.

### Cambio propuesto

Un error solo puede considerarse reportable si existe evidencia positiva de origen MCP Vertex.

### Estrategia recomendada

Aceptar un error como interno únicamente si se cumple al menos una condición fuerte:

1. El frame pertenece a una ruta del paquete instalado `@mcp-vertex/*`.
2. El frame pertenece a una ruta interna registrada durante el arranque del runtime.
3. El código de error ha sido creado mediante una clase/constructor MCP Vertex conocido.
4. El error transporta un `mcpVertexErrorCode` emitido por código propio.
5. Existe un boundary interno que captura errores antes de mezclarlos con errores del host.

### Mejor diseño

Introducir errores tipados:

```ts
class McpVertexInternalError extends Error {
  readonly code: McpVertexErrorCode;
  readonly packageId: string;
  readonly componentId: string;
  readonly safeContext?: Record<string, SafeScalar>;
}
```

Y preferir reportar solamente estos errores.

Para errores no tipados:

- almacenar localmente;
- intentar clasificar;
- **no transmitir** si hay duda.

### Regla

> En privacidad, "no sé si esto es nuestro" significa "no se envía".

---

## TODO ER-003 — No enviar `error.message` crudo

**Tipo:** CONFIRMADO
**Prioridad:** CRÍTICA

### Razón

Un mensaje de error puede contener:

- rutas;
- nombres de repos;
- líneas de código;
- endpoints;
- tokens;
- payloads;
- nombres de tablas;
- nombres de clientes;
- URLs;
- nombres de archivos.

### Solución

Crear un catálogo de mensajes seguros.

Ejemplo:

```ts
throw new McpVertexInternalError({
  code: 'PLUGIN_REGISTER_TIMEOUT',
  packageId: '@mcp-vertex/core',
  componentId: 'plugin-loader',
});
```

La issue mostraría:

```text
Failure class: PLUGIN_REGISTER_TIMEOUT
Component: plugin-loader
Package: @mcp-vertex/core
```

No:

```text
Could not register plugin at /Users/alice/work/acme-secret-project/...
```

### Fallback para errores desconocidos

Generar una versión semánticamente reducida:

```text
TypeError
Operation: plugin registration
Origin: @mcp-vertex/core
```

No enviar el mensaje original.

---

## TODO ER-004 — No enviar stack completo

**Tipo:** CONFIRMADO
**Prioridad:** CRÍTICA

### Nuevo comportamiento

Extraer únicamente frames MCP Vertex.

Ejemplo raw local:

```text
Error ...
 at foo (/Users/x/company-secret/src/app.ts:42)
 at callPlugin (/Users/x/project/node_modules/@mcp-vertex/core/dist/loader.js:212)
 at main (/Users/x/company-secret/src/main.ts:8)
```

Payload permitido:

```text
@mcp-vertex/core/dist/loader.js:212
```

Nada más.

### Normalización

Toda ruta de paquete debe convertirse a:

```text
@mcp-vertex/<package>/<relative-file>:<line>:<column>
```

Nunca conservar:

```text
/Users/*
/home/*
C:\Users\*
workspace root
node_modules parent
repo root
```

---

## TODO ER-005 — Sustitución automática por ejemplos sintéticos

**Tipo:** REQUISITO DE PRODUCTO
**Prioridad:** CRÍTICA

### Requisito

Si para comprender el error se necesita un ejemplo completo, **no se debe publicar el ejemplo real**.

Debe generarse un caso sintético que preserve la forma del fallo pero cambie por completo la idea de negocio.

### Ejemplo

Si localmente el fallo ocurrió con:

```json
{
  "customer": "Empresa Real",
  "invoiceId": "INV-93402",
  "endpoint": "https://private.company.com/billing",
  "amount": 9842.12
}
```

la issue podría usar:

```json
{
  "customer": "Example Bakery",
  "invoiceId": "EXAMPLE-001",
  "endpoint": "https://example.invalid/orders",
  "amount": 42
}
```

Pero preferiblemente **ni siquiera construir el ejemplo desde los datos reales**.

### Diseño recomendado

Generar ejemplos a partir de:

- schema de la tool;
- tipo del argumento;
- código de error;
- fixture genérica mantenida por MCP Vertex.

No mediante "redactar parcialmente el valor real".

### Principio

> Sanitizar es segunda línea de defensa. La primera es no usar el dato real.

---

## TODO ER-006 — `privacy gate` bloqueante antes de cualquier envío

**Tipo:** MEJORA CRÍTICA

Crear una función:

```ts
validateSafeReport(report): SafeReportValidationResult
```

que rechace cualquier payload que contenga patrones de riesgo.

### Debe detectar

- paths Unix absolutos;
- paths Windows;
- URLs que no pertenezcan a dominios explícitamente permitidos;
- emails;
- IPs;
- UUIDs potencialmente externos;
- tokens conocidos;
- secretos;
- JWT;
- headers Authorization;
- home directories;
- nombres de host;
- `.git`;
- branches;
- hashes de archivos externos;
- cadenas excesivamente largas;
- fragmentos de código;
- JSON arbitrario;
- XML arbitrario;
- SQL;
- env assignments;
- tokens de GitHub, OpenAI, Anthropic, AWS, etc.

### Comportamiento

```text
si validator duda → NO ENVÍA
```

y registra localmente únicamente:

```text
report blocked by privacy validator: <safe reason code>
```

---

## TODO ER-007 — Test suite adversarial de privacidad

**Tipo:** TESTING CRÍTICO

Crear tests con al menos:

- `/Users/alice/client-x/...`
- `/home/bob/acme/...`
- `C:\Users\Carol\work\secret\...`
- repos GitHub privados;
- emails;
- nombres de empresas;
- AWS keys;
- GitHub PAT;
- JWT;
- OpenAI keys;
- Anthropic keys;
- connection strings;
- URLs internas;
- IPs privadas;
- nombres de bases de datos;
- stack traces mixtos host/MCP;
- errores con JSON incrustado;
- errores con source code incrustado;
- errores con SQL;
- errores con GraphQL;
- errores con nombres de clientes;
- Unicode;
- strings enormes.

### Criterio de aceptación

El payload final enviado debe ser idéntico aunque cambien todos los datos privados del fixture, siempre que el error interno MCP Vertex sea el mismo.

Esto es una propiedad muy poderosa.

Ejemplo:

```text
Project A private data + same MCP bug
Project B private data + same MCP bug
```

deben generar:

```text
same safe fingerprint
same public issue body
```

salvo versión/runtime/clase de plataforma si se considera necesario.

---

## TODO ER-008 — Separar `lastAttemptAt` de `lastSuccessAt`

**Tipo:** CONFIRMADO
**Prioridad:** ALTA

### Problema

Un envío fallido no debe impedir reintentos durante toda la ventana de deduplicación.

### Modelo sugerido

```ts
interface IReportRecord {
  fingerprint: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureCode?: SafeReporterFailureCode;
  issueNumber?: number;
}
```

La deduplicación pública debe usar `lastSuccessAt`.

---

## TODO ER-009 — Notice claro, opt-out simple, sin convertirlo en opt-in

**Tipo:** PRODUCTO / LEGAL / UX

La decisión de producto es mantenerlo activo por defecto.

Aun así debería existir transparencia explícita:

- documentación visible;
- `report_status`;
- config simple para deshabilitar;
- descripción exacta de qué campos se pueden enviar;
- afirmación clara de que no se envía contenido del proyecto.

### Recomendación jurídica

Antes de publicar reporting automático por defecto a terceros, revisar con asesoría legal:

- política de privacidad;
- documentación de datos transmitidos;
- bases legales relevantes según mercados objetivo;
- tratamiento de direcciones IP inevitable por la propia conexión de red;
- retención de issues públicas;
- posibles metadatos añadidos por GitHub/CLI.

**Este documento no constituye asesoramiento legal.**

La arquitectura debe minimizar el problema antes de que llegue a la capa jurídica.

---

# 3. Plugin loader y lifecycle

## TODO PL-001 — Aplicar `parsed.data` de Zod

**Tipo:** CONFIRMADO
**Prioridad:** ALTA

### Hallazgo

`optionsSchema.safeParse(ctx.options)` valida las opciones, pero el contexto original continúa utilizándose.

### Riesgo

Schemas con:

- `.default()`
- `.transform()`
- `z.coerce`
- `.trim()`

pueden validar y aun así no entregar al plugin el valor normalizado.

### Solución

El loader debe crear el contexto final a partir de `parsed.data`.

### Criterio de aceptación

Añadir plugin fixture:

```ts
z.object({
  retries: z.coerce.number().default(3)
})
```

Config:

```json
{ "retries": "5" }
```

Dentro de `register` debe observarse:

```ts
ctx.options.retries === 5
typeof ctx.options.retries === 'number'
```

---

## TODO PL-002 — Evitar doble validación dispersa

**Tipo:** MEJORA

Hoy algunos plugins vuelven a hacer `safeParse` dentro de `register`.

### Objetivo

- loader = frontera de validación;
- plugin = consume opciones ya tipadas.

### Beneficio

- menos duplicación;
- errores coherentes;
- menos branches;
- menos tests redundantes;
- una sola semántica de defaults.

---

## TODO PL-003 — Dependencias deben estar `active`, no solo `resolved`

**Tipo:** CONFIRMADO
**Prioridad:** ALTA

### Caso

```text
A dependsOn B
B resolves
B register fails
A register succeeds
```

### Resultado deseado

```text
B → failed
A → blocked-by-dependency
```

### Implementación

Crear grafo de dependencias y estados:

```text
discovered
resolved
validated
registering
active
failed
blocked
disposed
```

Registrar topológicamente.

---

## TODO PL-004 — Detectar ciclos de dependencias

**Tipo:** REVISAR / MEJORA

Con un DAG explícito debe comprobarse:

```text
A -> B
B -> C
C -> A
```

### Criterio

Error claro antes de ejecutar side effects.

---

## TODO PL-005 — Timeout cancelable

**Tipo:** CONFIRMADO
**Prioridad:** ALTA

`Promise.race` no cancela el trabajo subyacente.

### Cambio

Introducir `AbortSignal` en lifecycle:

```ts
register(ctx, signal)
```

### Para plugins que no soporten abort

- marcar capability;
- esperar teardown;
- avisar de lifecycle no cancelable.

---

## TODO PL-006 — `dispose()` de plugins

**Tipo:** MEJORA ARQUITECTÓNICA

Necesario para:

- activación dinámica;
- desactivación;
- tests aislados;
- reload;
- shutdown;
- rollback tras fallo parcial.

```ts
interface IPluginRuntime {
  registrations: ...
  dispose?: () => Promise<void>
}
```

---

## TODO PL-007 — Rollback transaccional de registro

**Tipo:** MEJORA

Si un plugin registra:

1. timer;
2. tool;
3. listener;
4. falla en el paso 4;

debe poder deshacer 1–3.

---

# 4. Filesystem y contención

## Valoración

La estrategia actual de:

- contención léxica;
- `realpath`;
- roots autorizados;
- atomic write;
- mutex;

es una fortaleza.

Debe conservarse.

---

## TODO FS-001 — Revisar TOCTOU restante

**Tipo:** REVISAR

El propio diseño reconoce que no es TOCTOU-proof.

### Explorar

- operaciones basadas en file descriptors;
- `O_NOFOLLOW` donde sea portable;
- abrir padre y operar relativo;
- sandbox del host;
- documentación explícita de threat model.

No necesariamente convertirlo en requisito para 0.1.x si el coste es alto.

---

## TODO FS-002 — Tests Windows específicos

**Tipo:** REVISAR

Cubrir:

- drive letters;
- UNC;
- junctions;
- case-insensitive paths;
- symlinks/junctions;
- separators.

---

# 5. Mutex / concurrencia

## TODO MX-001 — Reclaim seguro de stale lock

**Tipo:** CONFIRMADO/PROBABLE
**Prioridad:** ALTA

### Carrera a cubrir

```text
waiter stat
holder heartbeat
waiter rm
```

### Objetivo

No borrar un lock cuya identidad/lease haya cambiado desde la observación.

### Opciones

- token + mtime + revalidación;
- rename de sidecar a reclaim path;
- lease generation;
- PID liveness;
- lock backend específico de plataforma.

### Test requerido

Test de carrera controlada con barreras:

```text
waiter observa stale
holder heartbeat
waiter intenta reclaim
```

El waiter no debe entrar.

---

## TODO MX-002 — Métricas de contention

**Tipo:** MEJORA

Registrar:

```text
waitMs
contentionCount
staleReclaims
failedAcquisitions
```

Sin paths privados.

Solo agregados o IDs internos.

---

# 6. Ejecución de procesos

## TODO PR-001 — `maxOutputBytes` debe ser realmente bytes

**Tipo:** CONFIRMADO

Usar buffers y `Buffer.byteLength`.

---

## TODO PR-002 — No añadir chunks enteros si superan el restante

**Tipo:** CONFIRMADO

Recortar al número exacto de bytes restantes.

---

## TODO PR-003 — Límite combinado stdout+stderr

**Tipo:** MEJORA

Decidir semántica:

```text
maxOutputBytes = total
```

o:

```text
maxStdoutBytes
maxStderrBytes
```

No dejar nombre ambiguo.

---

## TODO PR-004 — Matar árbol de procesos en `runArgv`

**Tipo:** PROBABLE / MEJORA

Alinear `runArgv` con el comportamiento de process-group del runner shell.

### Test

Proceso padre que crea hijo duradero y excede timeout.

Tras timeout no debe quedar ninguno vivo.

---

## TODO PR-005 — No utilizar shell si no es imprescindible

**Tipo:** PRINCIPIO

Mantener `argv-first` como default.

`runCommand(string)` debe considerarse capa de compatibilidad/último recurso.

---

# 7. Métricas

## TODO MET-001 — Corregir `estimateResultBytes`

**Tipo:** CONFIRMADO
**Prioridad:** ALTA

Usar:

```ts
Buffer.byteLength(text, 'utf8')
```

---

## TODO MET-002 — Medir respuestas de error

**Tipo:** CONFIRMADO

Actualmente no deben considerarse coste cero.

---

## TODO MET-003 — Separar tipos de coste

**Tipo:** MEJORA

```ts
interface ToolCost {
  contentTextBytes: number;
  structuredJsonBytes?: number;
  wireEstimateBytes?: number;
  estimatedTokens?: number;
}
```

---

## TODO MET-004 — Definición canónica de "token estimate"

**Tipo:** MEJORA

La regla `~4 bytes/token` es útil para presupuestos rápidos pero no debe mezclarse con tokens reales.

Distinguir:

```text
estimatedTokens4B
actualModelTokens (cuando exista fuente fiable)
```

---

## TODO MET-005 — Agregados sin datos privados

**Tipo:** PRIVACIDAD

Cualquier métrica persistida o reportable debe contener:

- IDs de tools MCP Vertex;
- números;
- timings;
- tamaños.

Nunca:

- paths;
- queries;
- args;
- outputs;
- nombres de archivos.

---

# 8. Truncación y outputs grandes

## TODO OUT-001 — Manejar `maxBytes` menor que el envelope mínimo

**Tipo:** CONFIRMADO/PROBABLE

Debe definirse el comportamiento:

- error de configuración;
- envelope mínimo alternativo;
- clamp a mínimo válido.

Nunca afirmar `finalBytes <= maxBytes` si no se cumple.

---

## TODO OUT-002 — Evitar algoritmo decremental byte a byte

**Tipo:** MEJORA DE EFICIENCIA

Usar:

- búsqueda binaria;
- cálculo de overhead;
- buffers;
- truncación estructural.

---

## TODO OUT-003 — No meter JSON serializado parcialmente en `head`

**Tipo:** MEJORA

Preferir estructuras reales:

```json
{
  "items": [],
  "truncated": true,
  "nextCursor": "..."
}
```

---

## TODO OUT-004 — Paginación universal

**Tipo:** MEJORA ALTA EN TOKENS

Aplicar patrón común:

```ts
{
  items,
  page: {
    cursor,
    nextCursor,
    hasMore
  }
}
```

para:

- search;
- logs;
- docs;
- dependencies;
- catalogs;
- memory;
- audit findings;
- git history.

---

## TODO OUT-005 — Reducir default global de 256 KiB

**Tipo:** MEJORA ALTA

Propuesta inicial para benchmark:

```text
general compact: 4–8 KiB
search/docs/logs: 8–16 KiB
explicit full: configurable
hard emergency ceiling: 64 KiB
```

No imponer números definitivos sin benchmark.

---

# 9. Tokens: principal línea estratégica

## TODO TOK-001 — Tratar `tools/list` como coste de primer orden

**Tipo:** CONFIRMADO / ESTRATÉGICO
**Prioridad:** MUY ALTA

Los budgets actuales observados muestran una superficie estática muy grande.

### Acción

Crear dashboard/generated report:

```text
preset
tool count
schema bytes
description bytes
inputSchema bytes
outputSchema bytes
marginal bytes per plugin
```

---

## TODO TOK-002 — Presupuestos absolutos y relativos

**Tipo:** MEJORA

No usar solamente:

```text
+20% vs baseline
```

Agregar:

```text
hard absolute ceiling
warning ceiling
relative release ceiling
marginal plugin ceiling
```

---

## TODO TOK-003 — No subir budgets automáticamente

**Tipo:** PROCESO

Una feature que rompe un budget debe:

1. justificar el coste;
2. mostrar beneficio;
3. intentar compensar;
4. si se aumenta el budget, documentar decisión.

---

## TODO TOK-004 — Generar `TOKEN-BUDGETS.md`

**Tipo:** CONFIRMADO

La documentación y los tests han divergido.

### Solución

No mantener números manualmente.

Generar Markdown desde la misma fuente que usa el test.

---

## TODO TOK-005 — Token tax por plugin

**Tipo:** MEJORA ESTRATÉGICA

Cada plugin debería declarar o generar:

```json
{
  "staticSchemaBytes": 4200,
  "compactTypicalBytes": 1500,
  "p95ResponseBytes": 6000
}
```

---

## TODO TOK-006 — Activación dinámica de tools

**Tipo:** MEJORA DE ALTO IMPACTO

### Bootstrap sugerido

Exponer inicialmente:

```text
overview
project_context
tool_search
plugin_search
plugin_activate
configuration_center
```

Cargar tools de dominio bajo demanda.

### Fallback

Mantener modo estático para clientes MCP que no gestionen bien cambios dinámicos.

---

## TODO TOK-007 — `--surface=native|adaptive|compact`

**Tipo:** IDEA

- `native`: todas las tools seleccionadas.
- `adaptive`: carga por necesidad.
- `compact`: router mínimo.

---

## TODO TOK-008 — Router compacto opcional

**Tipo:** IDEA

```ts
vertex({
  domain: 'git',
  action: 'diff',
  args: {}
})
```

Solo para hosts/contextos donde el coste del catálogo sea más importante que la ergonomía.

No convertirlo en la única interfaz.

---

## TODO TOK-009 — Descripciones en dos niveles

**Tipo:** MEJORA

`tools/list`:

```text
summary corta
```

Knowledge/resource:

```text
explicación completa
ejemplos
edge cases
```

---

## TODO TOK-010 — Evitar ejemplos largos dentro de schemas/descriptions

**Tipo:** MEJORA

Mover ejemplos a resources consultables bajo demanda.

---

## TODO TOK-011 — Utility per 1K tokens

**Tipo:** IDEA ESTRATÉGICA

Medir:

```text
task success contribution / context cost
```

por plugin.

---

## TODO TOK-012 — Auto-selector sensible a coste

**Tipo:** IDEA ESTRATÉGICA

Score:

```text
utility
+ relevance
+ confidence
- tokenTax
- latencyTax
- permissionRisk
```

---

# 10. Registry y fuente de verdad

## TODO REG-001 — Añadir/confirmar `auto-plugin-selector` en registry

**Tipo:** CONFIRMADO EN SNAPSHOT OBSERVADO

Verificar en HEAD actual.

Si sigue faltando, corregir.

---

## TODO REG-002 — Sustituir arrays manuales por manifests

**Tipo:** MEJORA ARQUITECTÓNICA MUY ALTA

Crear por plugin:

```text
plugin.manifest.ts
```

Con:

```ts
definePluginManifest({
  id,
  package,
  version,
  visibility,
  summary,
  tags,
  maturity,
  permissions,
  presets,
  tokenBudget,
  dependencies,
  capabilities
})
```

---

## TODO REG-003 — Generar desde manifests

Generar:

- `FIRST_PARTY_PLUGIN_INDEX`;
- documentación;
- web catalog;
- preset validation;
- auto-plugin candidates;
- logos inventory;
- package inventory;
- token tables;
- permissions table;
- compatibility matrix.

---

## TODO REG-004 — Lint de "plugin directory not represented"

**Tipo:** MEJORA

Reglas:

```text
public package -> manifest obligatorio
private package -> explicit internal manifest
```

No permitir paquetes invisibles por accidente.

---

# 11. Presets

## TODO PRE-001 — Eliminar comparaciones "a mano"

**Tipo:** CONFIRMADO/MEJORA

Si el código comenta que cierta sincronización debe hacerse manualmente, convertirla en lint.

---

## TODO PRE-002 — Verificar `vertex` vs config real

**Tipo:** REVISAR

Generar membership desde manifests/config o test exacto.

---

## TODO PRE-003 — Revisar drift de `backend-api`

**Tipo:** CONFIRMADO EN DOCUMENTACIÓN OBSERVADA

La knowledge del plugin API y el catálogo observado no describen lo mismo.

Decidir una sola verdad y generar el resto.

---

## TODO PRE-004 — Redefinir rol de `standard`

**Tipo:** IDEA

Evaluar si `standard` carga demasiado.

Propuesta:

```text
minimal  = orientación
lean     = trabajo habitual
standard = adaptive/task-aware
swarm    = coordinación multiagente explícita
full     = diagnóstico / desarrollo
```

---

## TODO PRE-005 — Preset budget

**Tipo:** MEJORA

Cada preset debe tener:

```text
tool count
schema bytes
expected cold-start tokens
permissions
process/network/write capabilities
```

---

# 12. Core

## TODO CORE-001 — Revisar responsabilidades de `core`

**Tipo:** MEJORA ARQUITECTÓNICA

El core contiene muchas áreas.

Explorar división:

```text
@mcp-vertex/runtime
@mcp-vertex/plugin-sdk
@mcp-vertex/authoring
@mcp-vertex/setup
@mcp-vertex/analyzer
```

---

## TODO CORE-002 — Definir qué significa "core"

**Tipo:** DOCUMENTACIÓN

Core debería contener únicamente invariantes runtime.

---

## TODO CORE-003 — Reducir imports no necesarios en runtime

**Tipo:** PERFORMANCE

Medir:

- cold startup;
- module count;
- memory;
- bundle/package size.

---

## TODO CORE-004 — Mantener pocas dependencias externas

**Tipo:** PRINCIPIO

La situación observada de MCP SDK + Zod es positiva.

No degradarla sin necesidad.

---

# 13. Configuración project-agnostic

## TODO CFG-001 — Revisar defaults específicos de MCP Vertex

**Tipo:** CONFIRMADO/MEJORA

Ejemplos observados:

```text
docs/mcp-vertex
bun run validate
```

### Objetivo

Defaults del paquete deben ser genéricos.

Config específica de este repositorio debe vivir en el repo.

---

## TODO CFG-002 — Project analyzer como fuente de defaults

**Tipo:** IDEA

Detectar:

- package manager;
- language;
- test runner;
- lint command;
- typecheck command;
- docs roots;
- source roots.

---

## TODO CFG-003 — No materializar defaults que empeoran otros stacks

**Tipo:** PRINCIPIO

Ya existe buen precedente en `search`.

Generalizar ese criterio.

---

# 14. Memory

## TODO MEM-001 — Evitar refresh en cada tool call

**Tipo:** CONFIRMADO/MEJORA

Actualizar freshness solamente cuando:

- cambia memory;
- cambia checkpoint;
- cambia store;
- expira TTL;
- se solicita explícitamente.

---

## TODO MEM-002 — Debounce de invalidaciones

**Tipo:** PERFORMANCE

Evitar lecturas simultáneas repetidas.

---

## TODO MEM-003 — Métrica de hit-rate

**Tipo:** IDEA

Medir localmente:

```text
recall calls
notes returned
digest reused
bytes avoided
```

Sin guardar queries.

---

## TODO MEM-004 — Evaluar BM25 vs hybrid según coste real

**Tipo:** IDEA

No asumir que vector siempre mejora.

Bench por tipo de repo/tarea.

---

# 15. Output metadata / contracts

## TODO MCP-001 — Revisar inyección posterior de metadata

**Tipo:** PROBABLE

Campos como:

```text
logHint
checkpoint
__stuck_detected
handoffPath
```

pueden interactuar con `outputSchema`.

### Trabajo

1. Inventariar todas las tools con `outputSchema`.
2. Ejecutar cada tool con cada advisory posible.
3. Validar el resultado final contra schema.
4. Comprobar comportamiento del SDK y clientes.

---

## TODO MCP-002 — Envelope/meta universal

**Tipo:** MEJORA

Explorar:

```ts
{
  data: ...,
  meta?: {
    logHint?,
    checkpoint?,
    stuck?
  }
}
```

o `_meta` si encaja con el contrato MCP aplicable.

---

## TODO MCP-003 — Compatibility tests contra varias versiones/clientes MCP

**Tipo:** MEJORA

Matriz:

- SDK usado por server;
- SDK usado por client;
- host VS Code;
- otros clientes principales.

---

# 16. Client

## TODO CLIEN-001 — Eliminar versión hardcoded

**Tipo:** CONFIRMADO MENOR

El cliente observado anuncia `0.1.0` aunque el paquete observado estaba en `0.1.1`.

Generar desde build/package metadata.

---

## TODO CLIEN-002 — Runtime payload validation opcional

**Tipo:** MEJORA

`payloadFromResult<T>()` hace cast.

Ofrecer API con Zod/schema opcional:

```ts
request(tool, args, outputSchema)
```

---

## TODO CLIEN-003 — Mejor clasificación de transport errors

**Tipo:** IDEA

Separar:

- timeout;
- cancellation;
- invalid payload;
- protocol;
- tool error;
- server exit.

---

# 17. Toolchain y dependency versions

## TODO VER-001 — Política de versiones del monorepo

**Tipo:** REVISAR

Versiones observadas de TS/SDK no eran totalmente uniformes.

No necesariamente incorrecto.

### Acción

Crear allowlist:

```yaml
typescript:
  default: X
  exceptions:
    apps/web: Y
```

---

## TODO VER-002 — `lint:dependency-versions`

**Tipo:** MEJORA

Fallar solo ante drift no justificado.

---

# 18. CI

## TODO CI-001 — Asegurar que los lints arquitectónicos son required checks

**Tipo:** CONFIRMADO/REVISAR

El workflow observado no ejecutaba literalmente todo `bun run validate`.

### Acción

Mapear cada validación local a un job CI.

---

## TODO CI-002 — No usar un job llamado "lint" que valide solo una subárea

**Tipo:** DX

Nombres claros:

```text
lint:biome
lint:architecture
lint:presets
lint:docs
lint:security
```

---

## TODO CI-003 — Parallelizar `validate`

**Tipo:** PERFORMANCE

DAG de jobs.

---

## TODO CI-004 — Required checks en `develop`

**Tipo:** GOBERNANZA

Si `develop` es rama de integración frecuente, protegerla.

---

## TODO CI-005 — Required checks en `main`

**Tipo:** GOBERNANZA

Más estrictos aún.

---

## TODO CI-006 — Mantener pack smoke bajo Node

**Tipo:** FORTALEZA

No eliminar.

---

## TODO CI-007 — Mantener tarball install e2e

**Tipo:** FORTALEZA

Muy valioso.

---

## TODO CI-008 — Mantener site build real

**Tipo:** FORTALEZA

`astro check` no sustituye build.

---

# 19. Testing / coverage

## TODO TEST-001 — Revisar exclusión global de `index.ts`

**Tipo:** CONFIRMADO/MEJORA

Mucho wiring real vive ahí.

### Propuesta

Excluir barrel-only index files por detección, no todos.

---

## TODO TEST-002 — Coverage de apps/web

**Tipo:** MEJORA

Si V8/Astro sigue siendo problemático:

- tests de lógica TS;
- Playwright;
- component tests;
- build snapshots.

---

## TODO TEST-003 — Tests específicos de plugin lifecycle

Cubrir:

- dependency fail;
- register timeout;
- register abort;
- partial registration;
- dispose fail;
- cycle;
- duplicate plugin;
- transformed options.

---

## TODO TEST-004 — Property-based tests para paths y redaction

**Tipo:** IDEA

Muy apropiados para:

- containment;
- redactor;
- privacy validator;
- truncation;
- parsers.

---

# 20. Documentación

## TODO DOC-001 — Reducir información mantenida manualmente

**Tipo:** CONFIRMADO

Generar tablas y catálogos.

---

## TODO DOC-002 — Generar `TOKEN-BUDGETS.md`

Ya mencionado.

---

## TODO DOC-003 — Generar lista de plugins del README

**Tipo:** MEJORA

No permitir que el README represente solo una parte sin dejar claro que es selección.

---

## TODO DOC-004 — Distinguir "documentación humana" de "datos generados"

**Tipo:** ARQUITECTURA DOCS

Humano:

- visión;
- tutoriales;
- rationale;
- decisiones.

Generado:

- versiones;
- plugins;
- presets;
- budgets;
- tool lists;
- capabilities;
- permissions.

---

## TODO DOC-005 — Reducir historia incrustada en comentarios

**Tipo:** MANTENIBILIDAD

Mantener:

```text
por qué
invariante
riesgo
```

Mover a ADR/proposal:

```text
historial completo de bumps
IDs antiguos
cronología
```

---

# 21. Plugin manifests: propuesta detallada

## Estructura

```ts
export default definePluginManifest({
  id: 'search',
  package: '@mcp-vertex/search',
  visibility: 'public',
  maturity: 'stable',

  summary: '...',
  tags: ['search', 'code'],

  dependencies: [],

  permissions: {
    filesystem: {
      read: 'workspace',
      write: false,
    },
    network: false,
    process: false,
    gitWrite: false,
    forgeWrite: false,
  },

  tokenProfile: {
    staticSchemaBudgetBytes: 6000,
    compactResponseBudgetBytes: 3000,
  },

  presetHints: {
    minimal: 'recommended',
    lean: 'recommended'
  }
});
```

## TODO MAN-001 — Schema del manifest

**Prioridad:** ALTA

## TODO MAN-002 — Lint de manifest

## TODO MAN-003 — Generator de registry

## TODO MAN-004 — Generator web

## TODO MAN-005 — Generator docs

## TODO MAN-006 — Generator token budgets

## TODO MAN-007 — Generator permission catalog

## TODO MAN-008 — Auto-plugin-selector desde manifests

## TODO MAN-009 — Detectar paquetes sin manifest

## TODO MAN-010 — Detectar manifests sin paquete

---

# 22. Permission model

## TODO PERM-001 — Declarar permisos por plugin

**Tipo:** IDEA ESTRATÉGICA

Categorías:

```text
filesystem-read
filesystem-write
process
network
git-read
git-write
forge-read
forge-write
env-read
secrets
browser
container
database
```

---

## TODO PERM-002 — Permisos por tool

Mejor que solo por plugin.

---

## TODO PERM-003 — Mostrar coste de permisos al activar

Ejemplo:

```text
container requires:
- local process execution
- Docker socket access (when used)
```

---

## TODO PERM-004 — Auto-selector penaliza riesgo innecesario

Si dos plugins resuelven la tarea, preferir el de menos permisos.

---

# 23. Nuevas capacidades de utilidad

## TODO IDEA-001 — `context_for_change`

Combinar:

- diff;
- símbolos;
- referencias;
- tests;
- docs;
- memory;
- conventions.

Output compacto y task-oriented.

---

## TODO IDEA-002 — `impact_analyze`

Output:

```json
{
  "changedSymbols": [],
  "dependents": [],
  "affectedPackages": [],
  "recommendedTests": [],
  "risk": "medium"
}
```

---

## TODO IDEA-003 — `tests_for_change`

Seleccionar tests relevantes.

---

## TODO IDEA-004 — `project_health`

Agregador de:

- quality;
- security;
- deps;
- debt;
- tests.

Primero resumen; details lazy.

---

## TODO IDEA-005 — `quality_policy`

Unificar conceptualmente:

- quality;
- rules;
- test-policy;
- test-convention;
- conventions.

No necesariamente fusionar paquetes.

---

## TODO IDEA-006 — Optimización adaptativa de modelo/plugin/prompt

Conectar:

```text
prompt-eval
usage-tracking
perf
auto-agent-selector
auto-plugin-selector
```

Objetivo:

```text
maximize success
minimize tokens
minimize latency
minimize cost
minimize permissions
```

---

# 24. Revisión específica de cada plugin

> Esta sección es un **checklist de auditoría**, no una afirmación de que cada plugin tenga un bug.
>
> El agente debe revisar cada uno por los ejes indicados y convertir solo hallazgos demostrables en fixes.

---

## `api`

**Valor funcional estimado:** muy alto.

### Revisar

- drift entre preset/knowledge;
- allow-list real;
- SSRF;
- redirects;
- auth headers;
- mutating consent;
- OpenAPI parser edge cases;
- schema refs;
- response validation;
- output budgets;
- spec URLs privadas;
- que reporting/logging no incluya spec del usuario.

### Mejoras

- cache de specs por hash local;
- summaries compactos;
- lazy schema traversal;
- fixtures sintéticos.

---

## `audit`

### Revisar

- coste en tokens;
- fan-out multi-model;
- consolidación;
- deduplicación de findings;
- modelos fallidos;
- privacy de prompts;
- qué datos salen a proveedores.

### Mejoras

- budget explícito;
- max auditors;
- stop early;
- voting/confidence;
- audit local-only modes.

---

## `auto-agent-selector`

### Revisar

- scoring;
- fallback;
- coste real;
- qué ocurre sin provider;
- provider privacy.

### Mejoras

- quality/cost frontier;
- per-task telemetry local;
- confidence threshold;
- escalado automático.

---

## `auto-plugin-selector`

### Revisar

- presencia en registry;
- candidatos completos;
- scoring;
- defaults;
- aplicación de config;
- dependencia opcional con agent selector.

### Mejoras

- token tax;
- permission risk;
- dynamic activation;
- marginal utility.

---

## `browser`

### Revisar

- sandbox;
- network boundaries;
- downloads;
- filesystem;
- process cleanup;
- timeouts;
- secrets in page content/logs.

### Mejoras

- read-only modes;
- host allowlist;
- headless lifecycle;
- snapshot truncation.

---

## `cache`

### Revisar

- namespaces;
- accidental deletion;
- durable vs rebuildable data;
- concurrent GC.

### Mejoras

- quotas;
- dry-run;
- ownership manifests.

---

## `changelog`

### Revisar

- conventional commits;
- huge histories;
- generated file paths;
- release boundaries.

### Mejoras

- compact summary;
- scoped package changelogs.

---

## `container`

### Revisar

- Docker/K8s command safety;
- process tree timeout;
- socket access;
- destructive actions;
- output size.

### Mejoras

- explicit read/write modes;
- command allowlist;
- dry-run.

---

## `conventions`

### Revisar

- false positives;
- language assumptions;
- monorepo roots.

### Mejoras

- per-stack profiles;
- generated fixes preview.

---

## `database`

### Revisar

- read-only guarantees;
- accidental credentials;
- connection strings;
- schema dump sizes.

### Mejoras

- metadata-only mode;
- redact identifiers if exported externally;
- pagination.

---

## `deps`

### Revisar

- network disabled by default;
- package-manager detection;
- lockfile handling;
- license detection.

### Mejoras

- affected-package mode;
- compact risk summary.

---

## `diagram`

### Revisar

- huge graphs;
- generated sensitive labels;
- output size.

### Mejoras

- depth;
- node cap;
- package-level default;
- resource output.

---

## `docs`

### Revisar

- pagination;
- root defaults;
- symlink safety;
- giant docs.

### Mejoras

- hierarchical retrieval;
- headings first;
- excerpt mode.

---

## `env`

### Revisar

- NUNCA devolver secret values;
- env key listing;
- schema inference.

### Mejoras

- presence/type only;
- masked diagnostics.

---

## `error-reporting`

**Ver sección crítica completa.**

---

## `external-mcps`

### Revisar

- trust boundary;
- capability import;
- namespace conflicts;
- third-party tool descriptions;
- dynamic tools;
- consent.

### Mejoras

- MCP trust manifest;
- per-server permissions;
- schema/token budget.

---

## `forge`

### Revisar

- destructive operations;
- PR/comment issue data;
- external network.

### Mejoras

- explicit write consent policy;
- operation preview.

---

## `git`

### Revisar

- writes;
- destructive resets;
- worktrees;
- huge diffs;
- binary files.

### Mejoras

- diff summaries;
- line caps;
- affected scopes.

---

## `i18n`

### Revisar

- locale drift;
- interpolation;
- huge locale files.

### Mejoras

- changed-keys mode;
- affected locale mode.

---

## `issues-triage`

### Revisar

- mantener claramente `private/internal`;
- bot disclosure;
- auto-comment safety;
- no confundir con plugin público.

---

## `issues`

### Revisar

- remote writes;
- user confirmation;
- data included in issue.

### Mejoras

- template validation;
- preview before publish.

---

## `link-check`

### Revisar

- network behavior;
- private URLs;
- concurrency;
- retries.

### Mejoras

- local-only default;
- domain allowlist.

---

## `logs`

### Revisar

- redaction;
- logHint;
- retention;
- output limits;
- paths.

### Mejoras

- structured error codes;
- local paths only;
- never externalize raw logs.

---

## `memory`

**Ver sección Memory.**

---

## `notification`

### Revisar

- polling;
- heartbeat;
- event loss;
- cross-process behavior.

### Mejoras

- event-driven;
- bounded queues;
- dedupe.

---

## `observability`

### Revisar

- metric cardinality;
- accidental PII;
- persistence.

### Mejoras

- IDs internos;
- no args;
- no project names.

---

## `orchestrator-runner`

### Revisar

- process lifecycle;
- cancellation;
- retries;
- partial state;
- token fan-out.

### Mejoras

- checkpointing;
- cost budget;
- DAG execution.

---

## `perf`

### Revisar

- benchmark noise;
- reproducibility;
- warmup;
- environment deltas.

### Mejoras

- percentiles;
- baseline metadata.

---

## `prompt-eval`

### Revisar

- golden prompt privacy;
- model variability;
- scoring.

### Mejoras

- token-normalized scores;
- regression thresholds.

---

## `prompts-pack`

### Revisar

- static token tax;
- duplicate instructions;
- host instruction overlap.

### Mejoras

- lazy prompt bodies;
- concise catalog.

---

## `proposals`

### Revisar

- state transitions;
- multi-agent concurrency;
- proposal locks;
- stale state;
- token cost.

### Mejoras

- proposal DAG;
- automatic decomposition;
- verification agents;
- rollback.

---

## `quality`

### Revisar

- commands;
- timeouts;
- shell;
- monorepo affected packages;
- output limits.

### Mejoras

- incremental mode;
- relevant checks only.

---

## `refactor`

### Revisar

- rename safety;
- references;
- language coverage;
- atomicity.

### Mejoras

- preview;
- impact analysis;
- rollback.

---

## `rules`

### Revisar

- frameworks;
- false positives;
- dogmas.

### Mejoras

- severity/confidence;
- stack-aware packs.

---

## `search`

### Revisar

- roots;
- extensions;
- ignore;
- symlinks;
- huge files;
- hybrid weighting;
- index invalidation.

### Mejoras

- incremental index;
- symbol-first;
- query-independent cache;
- token-aware ranking.

---

## `security`

### Revisar

- secret scanning;
- SAST;
- env handling;
- CVE network behavior.

### Mejoras

- changed-files security scan;
- confidence levels.

---

## `skills-pack`

### Revisar

- catalog token tax;
- loading strategy;
- duplicate knowledge.

### Mejoras

- lazy skill body;
- search by task.

---

## `status-marker`

### Revisar

- consistency;
- race conditions;
- lifecycle.

### Mejoras

- tiny/compact payload only.

---

## `tech-debt`

### Revisar

- false positives;
- TODO semantics;
- generated files.

### Mejoras

- changed-file scan;
- age by git.

---

## `test-convention`

### Revisar

- stack differences;
- path conventions;
- false positives.

### Mejoras

- auto-detection.

---

## `test-policy`

### Revisar

- overlap con quality;
- policy enforcement boundaries.

### Mejoras

- unified quality policy summary.

---

## `usage-tracking`

### Revisar

- depende de métricas correctas;
- estimated vs actual tokens;
- cardinality;
- persistence.

### Mejoras

- utility per 1K;
- per-plugin marginal cost;
- local-only privacy.

---

## `web-fetch`

### Revisar

- redirects;
- DNS rebinding;
- allowlist matching;
- localhost;
- private networks;
- schemes;
- response caps.

### Mejoras

- strict URL parser;
- redirect revalidation;
- DNS/IP policy.

---

# 25. Web / UI

## TODO WEB-001 — Mantener generación desde datos vivos

**Tipo:** FORTALEZA

Seguir reduciendo duplicación.

---

## TODO WEB-002 — Coverage/test strategy específica

**Tipo:** MEJORA

- build real;
- component tests;
- critical E2E;
- i18n checks.

---

## TODO WEB-003 — Mostrar token/permission profiles

**Tipo:** IDEA

El sitio puede enseñar por plugin:

```text
cost
permissions
maturity
presets
```

---

# 26. Release / packaging

## TODO REL-001 — Mantener Node smoke

**Tipo:** FORTALEZA

---

## TODO REL-002 — Mantener tarball install

**Tipo:** FORTALEZA

---

## TODO REL-003 — Manifest correctness en paquete publicado

**Tipo:** MEJORA

Verificar que manifest/registry de cada package coincide con lo empaquetado.

---

## TODO REL-004 — Version injection

**Tipo:** MEJORA

No hardcodear versiones en runtime/client/plugins.

---

# 27. Comentarios y trazabilidad histórica

## TODO SRC-001 — Reducir comentarios cronológicos largos

**Tipo:** MANTENIBILIDAD

Los IDs de propuestas son útiles.

Pero el source debería priorizar:

```text
why
invariant
constraint
```

sobre:

```text
history of every budget bump
```

---

## TODO SRC-002 — ADR links compactos

Ejemplo:

```ts
// See ADR-TOK-003: compact tool catalogs.
```

---

# 28. Observaciones que deben VALIDARSE antes de tratarlas como bugs

Esta sección debe convertirse en tareas de comprobación, no fixes inmediatos.

## CHECK-001

¿La metadata inyectada después de ejecutar una tool puede violar `outputSchema`?

## CHECK-002

¿`runArgv` deja procesos descendientes vivos en todos los SO soportados?

## CHECK-003

¿La carrera stale-lock se reproduce de forma determinista con el filesystem objetivo?

## CHECK-004

¿Hay clientes MCP relevantes que fallen con dynamic tool list changes?

## CHECK-005

¿La división de core mejora startup/build de forma material o solo añade packages?

## CHECK-006

¿El default 256 KiB ha sido necesario para casos reales?

## CHECK-007

¿Cuánto cuestan realmente los schemas por preset usando tokenizer real de modelos frecuentes?

## CHECK-008

¿Cuáles son las features de plugins que casi nunca se usan y pagan token tax siempre?

---

# 29. Métricas que faltan

## TODO KPI-001 — Cold-start context cost

Por preset/host/model.

## TODO KPI-002 — Static tool schema bytes por plugin

## TODO KPI-003 — Invocation rate por plugin

Solo agregados locales.

## TODO KPI-004 — Success contribution

Definir proxy medible.

## TODO KPI-005 — P50/P95 response bytes

## TODO KPI-006 — P50/P95 latency

## TODO KPI-007 — Tool error rate

## TODO KPI-008 — Plugin activation rate

## TODO KPI-009 — Dynamic activation savings

## TODO KPI-010 — Memory compaction savings

## TODO KPI-011 — Context rehydration effectiveness

## TODO KPI-012 — Privacy gate blocked-report count

Solo contador, sin contenido.

---

# 30. Modelo de privacidad para todo MCP Vertex

No limitar la privacidad a `error-reporting`.

## Data classes

### Clase A — MCP Vertex internal

Permitido para diagnóstico:

- package/version;
- internal error code;
- internal relative frame;
- tool ID;
- plugin ID;
- timings;
- counts;
- byte sizes.

### Clase B — host environment coarse

Solo si está justificado:

- runtime family;
- OS family;
- architecture.

No:

- hostname;
- username;
- home path;
- process cwd.

### Clase C — project data

**Nunca transmitir externamente por reporting automático.**

Incluye:

- files;
- source;
- docs;
- repository;
- branch;
- commits;
- paths;
- dependencies específicas;
- env;
- prompts;
- URLs;
- schemas del proyecto;
- API specs;
- DB schemas;
- issue data;
- git remotes.

### Clase D — secrets/PII

**Nunca transmitir.**

---

# 31. Synthetic examples: diseño recomendado

## TODO PRIV-001 — Librería de fixtures sintéticas

Dominios:

- bakery;
- weather;
- books;
- pets;
- music catalog;
- fictional inventory.

No usar nombres reales de empresas.

---

## TODO PRIV-002 — `example.invalid`

Usar dominios reservados:

```text
example.invalid
example.com
```

No inventar dominios plausibles de empresas reales.

---

## TODO PRIV-003 — IDs sintéticos inequívocos

```text
EXAMPLE-001
DEMO-123
SYNTHETIC-42
```

---

## TODO PRIV-004 — No preservar longitudes o hashes si pueden filtrar

No hace falta que el ejemplo "parezca" el valor original.

---

## TODO PRIV-005 — Synthetic reproduction builder desde schema

Si existe schema:

```text
schema + internal failure point
        ↓
generate synthetic payload
```

Nunca:

```text
real payload
        ↓
replace strings
```

---

# 32. Propuesta de pipeline seguro de una issue

```text
1. Capturar error local.
2. Identificar boundary MCP Vertex.
3. Extraer solo error code interno.
4. Extraer solo frames pertenecientes a paquetes MCP Vertex.
5. Convertir path a package-relative.
6. Desechar raw error.message.
7. Desechar raw stack.
8. Desechar args.
9. Desechar result.
10. Desechar cwd/workspace/repo.
11. Crear fingerprint desde:
    package + component + safe error code + safe relative frame.
12. Crear ejemplo sintético si hace falta.
13. Ejecutar redactor por defensa en profundidad.
14. Ejecutar privacy validator.
15. Serializar DTO permitido.
16. Revalidar el string final.
17. Enviar.
18. Registrar solo success/failure code localmente.
```

---

# 33. Diseño del fingerprint

## Debe ser estable pero no derivar de datos de usuario

Ejemplo:

```text
sha256(
  mcpVertexVersionMajorMinor +
  packageId +
  componentId +
  errorCode +
  topInternalFrameRelative
)
```

No incluir:

- message;
- args;
- project path;
- repo;
- remote;
- branch.

---

# 34. Rate limits del reporting

## TODO ER-010

- max issues por instalación/día;
- dedupe global;
- backoff;
- no retry loop agresivo;
- circuit breaker.

## TODO ER-011

Antes de crear issue nueva:

- buscar fingerprint existente;
- comentar/actualizar solo con datos seguros;
- o incrementar contador local.

Evaluar qué opción expone menos metadatos.

---

# 35. Logging seguro

## TODO LOG-PRIV-001

Distinguir:

```text
local diagnostic log
public diagnostic report
```

Nunca reutilizar el mismo objeto.

## TODO LOG-PRIV-002

El report público debe construirse desde cero.

## TODO LOG-PRIV-003

No adjuntar log files.

## TODO LOG-PRIV-004

No incluir excerpts arbitrarios.

---

# 36. Seguridad de red para reporting

## TODO ER-NET-001

Destino fijo/allowlisted.

## TODO ER-NET-002

No aceptar `targetRepo` proveniente de datos del proyecto salvo configuración explícita del operador.

## TODO ER-NET-003

No reenviar headers/env del proyecto.

## TODO ER-NET-004

Timeouts/backoff.

---

# 37. Prioridades de implementación

## P0 — Antes de ampliar funcionalidad

1. Privacy architecture de `error-reporting`.
2. Internal-only classification.
3. No raw message/stack/args.
4. Synthetic examples.
5. Privacy gate adversarial.
6. Plugin dependency lifecycle.
7. Cancelación/cleanup de plugin register.
8. Stale-lock race.
9. Métricas de bytes correctas.

---

## P1 — Consolidación

10. Plugin manifests.
11. Registry generado.
12. Presets generados/validados.
13. TOKEN-BUDGETS generado.
14. CI required architecture gates.
15. Truncation/pagination.
16. Process output caps.
17. Version policy.
18. Coverage de wiring.

---

## P2 — Token efficiency

19. Static tool schema report.
20. Token tax.
21. Adaptive plugin activation.
22. Dynamic tool lists.
23. Compact surface experimental.
24. Utility per 1K.
25. Task-aware presets.

---

## P3 — Expansión de utilidad

26. `context_for_change`.
27. `impact_analyze`.
28. `tests_for_change`.
29. `project_health`.
30. Quality policy aggregation.
31. Adaptive optimization loop.

---

# 38. Cómo desglosar esto en propuestas

Recomendación de tracks:

```text
a — audit/verification
x — bug/fix
r — refactor
f — feature
s — security/privacy
p — performance/tokens
d — docs/devex
```

Ejemplo:

```text
sXXXXX — privacy-safe automatic error reporting
xXXXXX — plugin dependency lifecycle correctness
xXXXXX — stale mutex reclaim race
xXXXXX — UTF-8 byte metrics
rXXXXX — generated plugin manifests
pXXXXX — adaptive tool activation
pXXXXX — absolute token budgets
fXXXXX — context_for_change
```

---

# 39. Plantilla que debería usar cada propuesta

```md
# <ID> — <title>

## Problem

## Evidence

## Classification
confirmed / probable / review / improvement

## Scope

## non-goals

## Security/privacy implications

## Token impact

## Proposed design

## Alternatives considered

## Migration

## Tests

## Acceptance criteria

## Rollback

## Metrics

## Documentation changes

## Dependencies

## Open questions
```

---

# 40. Criterios de aceptación globales

El trabajo derivado de esta auditoría debería considerarse completado cuando:

- [ ] Cada TODO de este documento tiene una resolución explícita.
- [ ] Los falsos positivos están marcados como tales con evidencia.
- [ ] Los bugs confirmados tienen regression test.
- [ ] `error-reporting` no puede publicar datos del proyecto.
- [ ] Los reportes automáticos usan únicamente un DTO seguro.
- [ ] Los examples públicos son sintéticos.
- [ ] Existe una suite adversarial de privacidad.
- [ ] Plugin options normalizadas llegan correctamente a `register`.
- [ ] Dependencias fallidas bloquean dependientes.
- [ ] Timeouts de plugin tienen cancelación/cleanup.
- [ ] Mutex stale reclaim está protegido contra la carrera identificada.
- [ ] Todas las métricas llamadas bytes son UTF-8 bytes reales.
- [ ] Error responses cuentan en métricas.
- [ ] Process output caps son caps reales.
- [ ] `tools/list` tiene budget visible por preset/plugin.
- [ ] TOKEN-BUDGETS se genera.
- [ ] Registry/presets/docs no dependen de sincronización manual.
- [ ] CI obliga los gates arquitectónicos importantes.
- [ ] La coverage no excluye wiring real sin motivo.
- [ ] El runtime tiene una estrategia clara de activación dinámica.
- [ ] Existe una política de permisos de plugins.
- [ ] Existe una política de versiones del monorepo.
- [ ] Los datos de usuario/proyecto quedan fuera de cualquier reporting externo automático.

---

# 41. Principios que deberían quedar grabados en el proyecto

## Principio 1 — Privacy by construction

No "redactamos lo que creemos sensible".

Construimos el reporte exclusivamente con datos que sabemos que son nuestros.

---

## Principio 2 — Unknown means local-only

Si no se puede demostrar que un dato pertenece a MCP Vertex:

```text
NO se transmite.
```

---

## Principio 3 — Synthetic over sanitized

Para ejemplos:

```text
generar
```

es mejor que:

```text
redactar
```

---

## Principio 4 — One source of truth

Si un dato puede generarse, no mantenerlo cinco veces.

---

## Principio 5 — Budgets are constraints

Un budget no es un número que se sube hasta que el test pasa.

---

## Principio 6 — Load only what helps

Un plugin que no ayuda a la tarea no debería pagar coste de contexto.

---

## Principio 7 — Measure reality

Bytes reales.

Errores incluidos.

P95 además de media.

Cold-start además de outputs.

---

## Principio 8 — Fail closed on privacy/security

Ante duda:

```text
bloquear
```

---

## Principio 9 — Internal errors are typed

El mejor reporting no intenta adivinar un error interno leyendo strings.

El código lo sabe cuando lo crea.

---

## Principio 10 — Verification over assumption

Cada observación de esta auditoría debe reproducirse antes de convertirse en fix.

---

# 42. Resultado de producto al que apuntaría

La dirección recomendada no es añadir herramientas indefinidamente.

La dirección es:

```text
MCP Vertex observa la tarea
        ↓
entiende el proyecto localmente
        ↓
elige las capacidades necesarias
        ↓
activa solo esos plugins
        ↓
elige modelo según coste/calidad
        ↓
ejecuta
        ↓
mide coste/latencia/calidad
        ↓
compacta contexto
        ↓
mantiene memoria mínima
        ↓
detecta errores propios
        ↓
reporta únicamente información interna y sintética
        ↓
aprende qué configuración funciona mejor
```

Eso transforma el proyecto desde:

```text
"un MCP con muchas herramientas"
```

a:

```text
"una plataforma adaptativa de ingeniería para agentes"
```

sin sacrificar privacidad.

---

# 43. Checklist final resumido para el agente que reciba este documento

## Privacidad
- [ ] Reporting default-on, pero MCP-only.
- [ ] Raw args prohibidos.
- [ ] Raw results prohibidos.
- [ ] Raw project logs prohibidos.
- [ ] Raw error message prohibido.
- [ ] Raw stack prohibido.
- [ ] Solo internal frames.
- [ ] Package-relative paths.
- [ ] Synthetic examples.
- [ ] Privacy validator.
- [ ] Adversarial tests.
- [ ] Legal review/documentation.

## Core
- [ ] Zod parsed data.
- [ ] Dependency lifecycle.
- [ ] Abort.
- [ ] Dispose.
- [ ] Rollback.
- [ ] Output schema/meta audit.

## Concurrency
- [ ] Stale-lock CAS/revalidation.
- [ ] contention metrics.

## Processes
- [ ] Real byte caps.
- [ ] chunk truncation.
- [ ] combined stdout/stderr policy.
- [ ] process-tree termination.

## Metrics
- [ ] UTF-8.
- [ ] errors counted.
- [ ] token estimate nomenclature.
- [ ] plugin marginal cost.

## Tokens
- [ ] `tools/list` dashboard.
- [ ] absolute budgets.
- [ ] generated budgets.
- [ ] adaptive tools.
- [ ] token tax.
- [ ] utility per 1K.

## Registry/docs
- [ ] plugin manifests.
- [ ] generated registry.
- [ ] generated preset data.
- [ ] generated docs.
- [ ] no manual drift.

## CI/tests
- [ ] all critical lints required.
- [ ] branch protection.
- [ ] wiring coverage.
- [ ] lifecycle tests.
- [ ] privacy tests.

## Product
- [ ] context_for_change.
- [ ] impact_analyze.
- [ ] tests_for_change.
- [ ] project_health.
- [ ] permission model.
- [ ] adaptive optimizer.

---

# 44. Nota final

Este documento debe servir como backlog de investigación y mejora, no como sentencia.

Algunas observaciones pueden quedar invalidadas al reproducirlas contra un commit posterior.

Eso es correcto.

La forma adecuada de cerrar cada punto es con evidencia:

```text
reproduced + fixed
already fixed
not reproducible
intentional behavior
accepted risk
superseded by architecture change
```

El éxito de esta auditoría no consiste en implementar literalmente cada frase.

Consiste en que **ninguna pregunta importante sobre correctitud, privacidad, tokens, lifecycle, seguridad o mantenibilidad quede sin una respuesta verificable**.

Y por encima de cualquier otra cosa:

> **MCP Vertex puede y debe aprender de sus propios errores, pero no necesita conocer, recopilar ni publicar el proyecto de nadie para hacerlo.**
>
> **Los datos del usuario y de su empresa no son combustible de diagnóstico.**
>
> **El reporting debe construirse exclusivamente con datos internos de MCP Vertex y ejemplos sintéticos.**
>
> **Ante cualquier duda, no se envía.**

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.
