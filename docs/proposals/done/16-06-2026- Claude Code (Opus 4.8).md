# Auditoría exhaustiva de `@cartago-git/mcp-vertex` — Claude Code (Opus 4.8)

> Fecha: 16-06-2026. Análisis independiente del monorepo `mcp-vertex`
> (`packages/core` + 9 plugins: `proposals`, `rules`, `memory`, `git`,
> `quality`, `search`, `docs`, `deps`, `notification`).
> Hecho desde cero leyendo el código real (no las auditorías previas).
> Estado verificado: **typecheck verde**, **415 tests pasan + 10 skipped (425)**,
> 63 ficheros de test, ~20k LOC de fuente.

---

## 0. Veredicto rápido

Esto ya **no es** el proyecto que describían las auditorías de hace dos días.
Los tres agujeros estructurales que se señalaban entonces están **cerrados**:

1. **Coherencia de rutas resuelta.** `proposals` ya deriva su layout de
   `ctx.cacheDir`/`ctx.docsDir` vía `buildSwarmPaths(ctx.cacheDir, ctx.docsDir)`
   ([index.ts:67](../../../plugins/proposals/src/index.ts#L67)). Si reubicas
   `--cacheDir`/`--docsDir`, **todo** el store (locks, cola, índice, round-context)
   se mueve como una unidad. El `DEFAULT_PATH_LAYOUT` horneado queda solo como
   fallback de engine suelto.
2. **El flujo de propuestas está completo.** Existen `create_proposal`,
   `close_slice` y `proposal_board` ([authoring.tool.ts](../../../plugins/proposals/src/lib/tools/authoring.tool.ts)).
   Ya no hay que escribir el `.md` a mano con un regex frágil.
3. **El bucle suave de `auto_work` tiene freno.** Cuando todo está reclamado
   devuelve `state: "idle"` con `nextAction` explícito en vez de re-seleccionar la
   misma propuesta ([auto-work.tool.ts:41-52](../../../plugins/proposals/src/lib/tools/auto-work.tool.ts#L41-L52)).

La base es **excelente**: núcleo puro + plugins por CLI, contratos limpios,
salidas JSON compactas, concurrencia cross-proceso correcta (mutex + escritura
atómica), cuarentena de ficheros corruptos, SDK de tipos generado con guarda de
drift, CI con pack-smoke. Es eficiente en tokens y está bien planteado.

**No está en 11/10 todavía.** Lo que falta ya no son agujeros: son **acabados de
producto** — falta una **puerta de lint/formato** (no hay ESLint/Biome en todo el
repo), la **cobertura de tests es muy desigual** (proposals 34 specs vs. 1 por
plugin satélite), persisten **riesgos finos de TOCTOU** en el robo de locks, y hay
**drift residual** en `prepareServerBlueprintOnStart`. Honestamente está en un
**9.0/10** sólido. El salto a 11/10 es disciplina de cierre, no rearquitectura.

---

## 1. Por capas (fatal / mal / regular / bien / muy bien / perfecto)

### Núcleo (`packages/core`)

- **Perfecto:**
  - `planRegistrationOrder` ([create-mcp-project.ts:26](../../../packages/core/src/lib/project/create-mcp-project.ts#L26)):
    determinista, falla rápido ante ids duplicados y anchors desconocidos,
    soporta `registerAfter` con orden estable. Es la pieza que garantiza que el
    servidor no “derive” en silencio.
  - El **loader de plugins** ([load-plugins.ts](../../../packages/core/src/lib/plugins/load-plugins.ts)):
    `withTimeout` en import **y** en `register()`, dedup por especificador y por
    nombre resuelto, aislamiento total de fallos (un plugin malo nunca tumba al
    resto), orden determinista. Esto es exactamente lo que necesita un swarm.
  - **Concurrencia I/O**: `writeFileAtomic` (temp en el **mismo** dir → sin EXDEV,
    rename atómico) + `withFileMutex` (advisory lock con `O_CREAT|O_EXCL`,
    GC de stale, anti-deadlock por timeout). El comentario que explica la
    diferencia entre “torn file” y “lost update” es de manual.
- **Muy bien:** `assembleCliConfig` puro salvo importer/reader inyectables;
  lectura **única** del config file reutilizada por el doctor (N21); namespacing
  cualificado de tools (`ns_tool`) con la guarda de unicidad sobre el id ya
  cualificado (R12); `--check`/`--doctor` que **ensambla el servidor real** para
  cazar errores de registro; `--verbose` a stderr (stdout reservado al transporte).
- **Bien:** bootstrap híbrido (analyze/plan/create) fuera de la ruta crítica de
  arranque (N8); colector de status core integrado para que `_status` sirva sin
  colectores del host; cuarentena de ficheros corruptos como utilidad compartida.
- **Regular:** `prepareServerBlueprintOnStart`
  ([assemble.ts:336-358](../../../packages/core/src/lib/cli/assemble.ts#L336-L358))
  **recalcula `cacheDir` a mano** (`args.tokens['cacheDir'] ?? DEFAULT_CORE_PATHS`)
  e **ignora el `cacheDir` del config file**. Si pones `cacheDir` en
  `mcp-vertex.config.json` (sin flag), el blueprint se escribe en `.cache/mcp-vertex`
  mientras el resto va a tu ruta del config. Drift de bajo impacto pero real:
  debería derivar de `assembleCliConfig` en vez de duplicar la precedencia.

### Plugin `proposals` (el corazón del swarm)

- **Perfecto:** `agent-lock-engine` — toda la secuencia read→mutate→write va
  bajo `withFileMutex`, GC de stale claims, detección de solape de ficheros, y
  un `nextAction` **anti-bucle** en cada respuesta de conflicto (“no reintentes
  el mismo claim; enruta otro slice o pide reclamación tras evidencia”). Es el
  diseño correcto para multi-agente.
- **Muy bien:** `create_proposal`/`close_slice` atómicos con disjointness
  validada en creación; `delegate` (nombre + lock en un paso); `auto_work` que
  devuelve un plan ordenado compacto, no prosa; cuarentena de `closed-tasks.json`
  corrupto (visible en el log de tests: preserva el `.corrupt-*` y sigue con log
  vacío — exactamente lo que quieres bajo entradas hostiles).
- **Bien:** prompts `work`/`orchestrate` y knowledge `multi-agent-loop` que
  enseñan el lazo correcto (claim→slice→validate→sync→release) en pocas líneas.
- **Regular:** **tamaño/cohesión**. 11.3k LOC y ~16 tools en un solo paquete.
  El subsistema `swarm/` tiene 25 ficheros (round-context, continuity, recovery,
  closure…) cuya frontera con `agents/` no es obvia desde fuera. No es deuda
  grave, pero es el único punto del repo donde la navegabilidad cuesta. Candidato
  a documentar un mapa interno o a extraer `swarm-runtime` como sub-paquete.
- **Regular (cosmético):** nombres internos `subagent-*` (`subagent-registry.json`)
  conviven con la tool pública `agent_names`. Confunde a quien lea el cache dir.

### Plugin `rules`

- **Muy bien:** presets por framework como **datos** (cero deps pesadas),
  detección por área, modo de enforcement (strict/mixed/none/proposal) con
  guidance por modo, y **la config del proyecto siempre gana** (project-first en
  el orden de `eslint[]`).
- **Regular:** lee `dependencies`/`devDependencies` del manifest
  ([rules-tools.ts:106-108](../../../plugins/rules/src/lib/tools/rules-tools.ts#L106-L108))
  pero **emite comandos `eslint …` sin avisar si ESLint no está instalado**. Como
  es advisory (“tú ejecutas los pasos”) no rompe nada, pero un `apply_rules` en un
  repo sin eslint produce pasos que fallarán. Falta un finding tipo
  `eslint-not-installed` con el comando de instalación sugerido.

### Plugin `memory`

- **Perfecto para su alcance:** `rankNotes` BM25-lite (title×2, K1/B, suelo de
  substring para `mysql`⊂`mysql2`), **cero deps, offline**, stats de corpus por
  llamada (auto-contenido). La decisión de NO meter embeddings está bien
  argumentada en el propio código (rompería el contrato agnóstico/offline).
- **Bien:** save/recall/list/forget sobre store JSON con escritura atómica.

### Plugins `git`, `search`, `docs`, `deps`, `quality`, `notification`

- **Muy bien:** todos siguen el mismo molde — engine puro sobre raíz inyectada,
  runner/IO inyectable, salidas JSON compactas, read-only donde corresponde,
  límites de tamaño/conteo (search capa a 50 hits, 1 MB/fichero; quality capa
  output a 64 KB). `notification` es event-driven (`fs.watch` sobre el dir, no el
  inodo, porque el rename atómico cambia el inodo) **con fallback de polling** y
  `timer.unref()` para no mantener vivo el proceso. Esto último es un detalle
  excelente.
- **Bien:** `deps` health offline (lockfile, rangos sueltos, secciones
  duplicadas) sin red; `quality` runner async que nunca bloquea el event loop,
  con timeout→SIGKILL (code 124) y error→127 distinguibles.
- **Regular:** **`search` es solo substring**, sin regex ni filtros glob de
  inclusión. Para “orientación barata” cumple, pero un agente que busca un
  patrón (`foo\(.*bar`) no puede. Es el plugin con menos techo.
- **Regular:** **`quality` ejecuta shell arbitrario** (`spawn(..., {shell:true})`)
  con comandos que vienen del `validationMatrix` del config. Es **por diseño**
  (el host define la puerta), pero conviene documentar explícitamente que la
  frontera de confianza es “quien escribe `mcp-vertex.config.json`”. Hoy no está
  dicho en ningún sitio prominente.

---

## 2. ¿Es eficiente en tokens? (sí, con matices)

Está **muy bien pensado** para gastar pocos tokens:

- **Punto de entrada único**: `overview` da el mapa del servidor en 1 llamada;
  `auto_work` devuelve “qué hacer ahora” como lista de pasos, no prosa.
- **Salidas JSON compactas** (sin `null, 2` en las tools en caliente; el pretty
  solo en doctor/verbose, que no van al LLM).
- **Knowledge lazy** (resources cacheables; no se inyecta todo de golpe).
- **`notification`** reemplaza N agentes haciendo polling de `agent_lock status`
  por **un** watcher local → ahorro real de round-trips.
- **`compact_status`** existe precisamente para resumir estado en mínimos tokens.

Matiz: el plugin `proposals` expone **~16 tools**. Un cliente con muchos servidores
puede notar el coste del *tool manifest* en el contexto. La mitigación correcta ya
existe (namespacing + `overview`), pero valdría la pena un modo de **carga por
perfil** (cargar solo el subconjunto de tools que el rol necesita) para swarms muy
grandes.

---

## 3. ¿Hay bucles o bloqueos posibles?

Análisis dedicado, porque es el requisito que más importa en multi-agente:

- **Deadlock de locks: NO.** `withFileMutex` roba el lock tras `timeoutMs` y tras
  `staleMs`, así que un peer colgado no puede bloquear al swarm indefinidamente.
- **Bucle de `auto_work`: MITIGADO.** El estado `idle` con `nextAction` rompe el
  ciclo “re-selecciono la misma propuesta”. **Pero** no hay un detector de
  *“sin progreso”* duro: si un agente ignora el `idle` y vuelve a llamar, no hay
  contador de no-progreso que escale a un error. Es guidance, no enforcement.
- **TOCTOU fino en el robo de lock (riesgo residual):**
  en [with-file-mutex.ts:63-77](../../../packages/core/src/lib/shared/with-file-mutex.ts#L63-L77),
  entre `stat` (ver que está stale) y `rm`+recrear, **dos** esperadores podrían
  ambos decidir robar y ambos crear el sidecar (el segundo `open('wx')` fallaría,
  reintentaría, vería el nuevo, y en el peor caso ambos acaban creyendo que lo
  tienen durante una ventana de microsegundos). En la práctica es advisory y el
  daño se acota con la escritura atómica posterior, pero **no es un mutex
  formalmente correcto bajo robo concurrente**. Para 11/10: añadir un token de
  propiedad (escribir pid+nonce, releer tras crear, y ceder si el nonce no
  coincide).
- **Bloqueo de event loop: NO.** Todo el I/O en caliente es async; el único `*Sync`
  es `writeFileAtomicSync`, usado fuera de la ruta de respuesta.
- **Recursión sin fondo en `search`/`docs`: NO** observada (walk con ignoreDirs y
  corte por `truncated`), aunque **no hay guarda explícita contra symlinks
  cíclicos**. En un repo con un symlink que apunta a un ancestro, el walk podría
  recorrer de más. Bajo riesgo (los dirs de build están en la ignore-list), pero
  es el único punto donde un bucle de filesystem es teóricamente posible.

Veredicto: **diseño esencialmente libre de bloqueos**, con dos asteriscos finos
(TOCTOU del robo de lock, symlinks en el walk) que hoy no causan daño pero impiden
el “perfecto”.

---

## 4. ¿Faltan skills / tools / agentes?

El proyecto cubre **orientación, trabajo, coordinación, calidad, memoria y
notificación**. Lo que falta para “11/10” es selectivo, no masivo:

**Tools que aportarían valor real:**
- `search` con **regex/glob** (o una tool hermana `search_regex`). Hoy es el techo
  más bajo del repo.
- `proposals_release_all` / `gc_locks` programático ya existe como acción `gc`,
  pero falta una tool de **“abort/handoff”** que un agente pueda llamar para ceder
  limpiamente todos sus slices al morir (en vez de depender del stale GC temporal).
- `deps_outdated` (comparar rango vs. última versión) — hoy es solo health
  offline; un check de obsolescencia (con red opcional y desactivable) cerraría el
  plugin más flojo.
- Una tool de **observabilidad del swarm**: `swarm_timeline` (qué claim/release/close
  ha pasado y cuándo) leyendo `closed-tasks` + locks, para depurar rondas sin
  reconstruirlo a mano.

**Skills / prompts:** los prompts `work`/`orchestrate` son buenos. Faltaría un
prompt **`finish`** (cerrar la ronda: correr la puerta global una vez, archivar
propuestas done, escribir el resumen) — hoy esa lógica vive en knowledge/engines
pero no hay un prompt de un clic que la dispare.

**Agentes:** no hace falta un agente nuevo en el core. El modelo “orquestador +
subagentes por slice disjunto” ya está bien servido por `delegate`/`plan`/`close_slice`.

**Puerta de calidad del propio repo (lo más importante):** no hay **ESLint ni
Biome** en todo el monorepo. Para un proyecto cuyo *producto* es enseñar a otros a
escribir código limpio (plugin `rules`), no auto-aplicarse un linter es la
incoherencia más visible. Añadir Biome (rápido, cero-config, una sola dep) + un
job de CI `lint` sería el cambio de mayor relación valor/esfuerzo del repo.

---

## 5. Lo que falta para 11/10 (lista accionable, por impacto)

1. **Puerta de lint/formato** (Biome o ESLint) + job CI. *Mayor impacto.*
2. **Cobertura de tests pareja**: subir los plugins satélite de 1 spec a una
   suite real (cada uno tiene engine puro fácil de testear). Hoy `proposals`
   acapara 34 de los 63 ficheros de test.
3. **Mutex con token de propiedad** para cerrar el TOCTOU del robo de lock.
4. **`prepareServerBlueprintOnStart` derivado de `assembleCliConfig`** (eliminar el
   drift de precedencia de `cacheDir`).
5. **`search` con regex/glob** y guarda anti-symlink-cíclico en los walks.
6. **`rules`: finding `eslint-not-installed`** con comando de instalación.
7. **Frontera de confianza de `quality` documentada** (shell arbitrario desde el
   config) en el README del plugin.
8. **Carga de tools por perfil/rol** para swarms grandes (reducir el tool manifest).
9. **Mapa interno de `proposals/swarm`** (25 ficheros) o extracción de sub-paquete.
10. **Detector de no-progreso** en `auto_work` (contador que escala a error tras N
    `idle` consecutivos del mismo agente) — convierte el anti-bucle de guidance a
    enforcement.

Nada de esto es rearquitectura. Son acabados.

---

## Tabla de calificaciones

| Dimensión | Nota |
|---|---|
| Arquitectura general | ⭐⭐⭐⭐⭐ Perfecta |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐½ Muy bien (TOCTOU fino) |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐⭐ Perfecta |
| Diseño libre de bucles/bloqueos | ⭐⭐⭐⭐½ Muy bien |
| TypeScript / tipado | ⭐⭐⭐⭐⭐ Perfecta |
| Testing | ⭐⭐⭐½ Regular-Bien (muy desigual) |
| CI / Release | ⭐⭐⭐⭐ Bien (falta gate de lint) |
| Documentación (README/docs) | ⭐⭐⭐⭐ Bien |
| Linting / formato del repo | ⭐⭐ Mal (inexistente) |
| Plugin `proposals` | ⭐⭐⭐⭐½ Muy bien (tamaño/cohesión) |
| Plugin `memory` | ⭐⭐⭐⭐⭐ Perfecta |
| Plugin `rules` | ⭐⭐⭐⭐ Bien |
| Plugin `git` | ⭐⭐⭐⭐½ Muy bien |
| Plugin `search` | ⭐⭐⭐½ Regular-Bien (solo substring) |
| Plugin `quality` | ⭐⭐⭐⭐ Bien |
| Plugin `docs` | ⭐⭐⭐⭐ Bien |
| Plugin `deps` | ⭐⭐⭐½ Regular-Bien (sin outdated) |
| Plugin `notification` | ⭐⭐⭐⭐⭐ Perfecta |
| Scaffold / Blueprint | ⭐⭐⭐⭐ Bien (drift de cacheDir) |
| SDK de tipos generados | ⭐⭐⭐⭐⭐ Perfecta |
| Extensibilidad / futuro | ⭐⭐⭐⭐½ Muy bien |

**Nota global honesta: 9.0 / 10.**

---

## Qué añadiría y cuántas estrellas movería

Ordenado por **estrellas ganadas / esfuerzo** (de más a menos rentable):

| Añadido | Mueve | De → a |
|---|---|---|
| **Biome + job CI `lint`** | Linting | ⭐⭐ → ⭐⭐⭐⭐⭐ · CI/Release ⭐⭐⭐⭐ → ⭐⭐⭐⭐⭐ |
| **Suite real en los 6 plugins satélite** | Testing | ⭐⭐⭐½ → ⭐⭐⭐⭐⭐ |
| **`search` regex/glob + guarda symlink** | Plugin `search` | ⭐⭐⭐½ → ⭐⭐⭐⭐½ |
| **Mutex con token de propiedad** | Concurrencia + bucles/bloqueos | ⭐⭐⭐⭐½ → ⭐⭐⭐⭐⭐ (ambas) |
| **`deps_outdated` (red opcional)** | Plugin `deps` | ⭐⭐⭐½ → ⭐⭐⭐⭐½ |
| **Blueprint sin drift de `cacheDir`** | Scaffold/Blueprint | ⭐⭐⭐⭐ → ⭐⭐⭐⭐⭐ |
| **Finding `eslint-not-installed`** | Plugin `rules` | ⭐⭐⭐⭐ → ⭐⭐⭐⭐½ |
| **Detector de no-progreso en `auto_work`** | Bucles/bloqueos | ⭐⭐⭐⭐½ → ⭐⭐⭐⭐⭐ |
| **Mapa interno / split de `proposals/swarm`** | Plugin `proposals` | ⭐⭐⭐⭐½ → ⭐⭐⭐⭐⭐ |
| **Doc de frontera de confianza de `quality`** | Plugin `quality` + Docs | ⭐⭐⭐⭐ → ⭐⭐⭐⭐½ |

**Lo que MÁS valor da:** el linter (1) y la cobertura pareja (2) — porque elevan la
**credibilidad del producto entero**, no una sola dimensión. Un repo que enseña
calidad debe lucir su propia puerta de calidad.

**Lo que MENOS valor da (pero acerca al “perfecto”):** el token de propiedad del
mutex y el detector de no-progreso — son seguros teóricos contra fallos que hoy no
se materializan, pero son la diferencia entre “muy bien” y “perfecto” en las dos
dimensiones que un sistema multi-agente no puede permitirse fallar.

> **Resumen de una línea:** ya no quedan agujeros, quedan acabados. Cierra el
> linter y la cobertura y este proyecto pasa de un 9.0 honesto a hablar en serio
> de 11/10.

---

## Estado actual

> ## ⭐⭐⭐⭐½ — **9.0 / 10 · Excelente, a un par de acabados del “perfecto”**
>
> Base arquitectónica perfecta, multi-agente sin agujeros estructurales, eficiente
> en tokens y esencialmente libre de bloqueos. Lo que separa del 11/10 ya no es
> arquitectura: es **disciplina de cierre** (puerta de lint + cobertura de tests
> pareja + dos seguros finos de concurrencia).
