# Auditoría de utilidades — contribución incremental

Snapshot inmutable `514758e783620c8953079be4d71fceccacb3de8b`. Auditor gpt-6.1-sol, mismo revisor que informe inicial; no cuenta como voto independiente extra. Libro conjunto y producto sin modificar. Cobertura por fichero/rango/hash en `coverage.json`: solo `read-complete` significa lectura íntegra; los demás siguen pendientes. Este documento se amplía por lotes hasta completar los 28 plugins asignados. Suites globales ejecutadas por coordinador; aquí únicamente reproducciones locales precisas y medición MCP in-memory sin proveedores, credenciales ni red.

## Hallazgos nuevos

### UTIL-01 — P2: las seis plantillas MCP ignoran sus argumentos

**Confirmado en protocolo real SDK.** `plugins/prompts-pack/src/prompts/shared.ts:95` registra solo description:

```ts
server.registerPrompt(`${options.namespacePrefix}_${options.name}`,
    { description: options.description },
    async (rawArgs: unknown) => {
        const parsed = options.argsSchema.safeParse(rawArgs ?? {});
```

Falta `argsSchema` en el contrato de registro. SDK instalado (`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:428–445`) distingue callbacks con argumentos y sin argumentos; sin esquema llama `cb(extra)` con metadatos de request, no con params.arguments. El schema sí existe en cada plantilla pero queda fuera del registro SDK.

**Repro:** `repro-prompts.ts/.json`: McpServer + Client + InMemoryTransport reales, registra explain-this-code y solicita file=src/example.ts. `prompts/list` no anuncia arguments. `prompts/get` devuelve "Invalid prompt arguments: file ... received undefined" y claves inesperadas signal/sessionId/etc. Todas las seis plantillas usan el mismo helper. El spec `prompts.spec.ts` llama fake handler(args) directamente y no descubre esa diferencia.

**Impacto:** casos normales anunciados no funcionan por MCP; la información de argumentos no llega al host. **Remediación propuesta:** pasar un shape SDK válido en registerPrompt (con conversión explícita de strings para números opcionales) y probar list/get por transporte real para cada prompt y errores. **Track:** pendiente de propuesta correctiva, sin producto editado.

### UTIL-02 — P2: `release_plan` no puede producir un plan al cargar changelog normalmente

**Confirmado en registro real SDK.** `plugins/changelog/src/index.ts:29` crea builder únicamente con namespacePrefix; `release-plan.tool.ts:160` hace:

```ts
const publishOrder = options.publishOrder ?? [];
// handler:
if (publishOrder.length === 0) return toolError('publish-order-missing', ...);
```

OptionsSchema es objeto vacío; index no transmite publishOrder ni commits desde contexto. README promete snapshot proporcionado por host, pero no existe ese cableado al cargar plugin.

**Repro:** `measure-small.ts/.jsonl`, registro estándar plugin.register y client.callTool(release_plan,{}) devuelve isError=true/publish-order-missing. Añadir commits no cambia la condición porque es anterior al parseo. Specs de release-plan inyectan directamente un publishOrder al builder y validan una ruta que el entrypoint real no usa.

**Impacto:** una de sus dos herramientas es una promesa incompleta. **Remediación:** contrato agnóstico para recibir inventario de paquetes desde host/adopter o argumentos; omitir herramienta si no existe capacidad e informar la dependencia; test por plugin.register real. **Track:** pendiente de propuesta correctiva.

### UTIL-03 — P2 probable en superficie SDK directa: los outputSchema union de changelog desaparecen

Ambas herramientas declaran `z.union([SUCCESS,ERROR])` en outputSchema, mientras el SDK solo publica el shape de objeto normalizable. Medición real directa `measure-small.jsonl`: 2 herramientas, inputSchemaBytes=678, outputSchemaBytes=0; se ven ambas herramientas en tools/list sin outputSchema. Es evidencia confirmada de la ruta directa usada aquí, pero queda **pendiente contrastar el wrapper de composición core** antes de convertirlo en defecto sistémico: no se afirma que toda superficie gestionada elimine el schema. Source anchors `changelog-generate.tool.ts:77`, `release-plan.tool.ts:102`. Conservar éxitos como schema objeto y errores por isError, o envolver unión en un objeto, y probar por protocolo efectivo.

## Fichas completas de producción — lote 1

### skills-pack — Analizado estáticamente; nota provisional 8/10

**Funcionalidad.** Seis playbooks de debugging/performance/PR/seguridad/incidentes/migración; implementación de orientación pura, no motor que ejecute pasos. Leídos todos los tres TS, README/manifiesto, seis SKILL.md y spec de coherencia. Depende de herramientas de otros plugins solo cuando el host siga instrucciones. `src/index.ts`, `src/skills/catalog.ts`.

**Contratos MCP.** No registra tools ni prompts; entrega seis skill pointers y knowledge. Es correcto que no tenga input/outputSchema de herramientas propias. Catálogo tipado concuerda con frontmatter; spec comprueba nombres/headers e IDs contra catálogo generado y búsqueda de source. Esta búsqueda regex puede aceptar IDs que no se registran realmente; la disponibilidad efectiva de cada dependencia no está probada aquí.

**Seguridad y aislamiento.** No acceso OS, procesos, red ni estado; documentos instruyen diagnóstico previo a repair y respetar locks. Riesgo de instrucciones compuestas que requieren capacidades externas no activadas, no autoridad adicional del skill.

**Calidad.** Un spec real leído cubre estructura y referencias; no hay lifecycle/dispose ni recursos que cerrar. Textos incident/migrate no tienen newline final y PR checklist arrastra "action." suelto: deuda editorial menor, no fallo operacional confirmado.

**Economía de tokens.** Medición SDK: 0 tools, 0B de esquemas; seis pointers, knowledge 794B JSON UTF-8. Cuerpos skills se cargan a demanda y duplican listas tools en metadata/referencias; reducir repeticiones sin quitar pasos útiles. No se confunde tamaño de documentos con consumo real de una tarea LLM.

**Producto.** Fácil opt-in, neutral a proveedor; adecuado a repos externos con herramientas pertinentes. No ejecuta remedios solo por activarse. Nota8 por implementación pequeña coherente; resta por referencias estáticas/contexto repetido y escasa comprobación de disponibilidad efectiva.

### tech-debt — Analizado estáticamente; nota provisional 7/10

**Funcionalidad.** Un escáner offline de marcadores de comentarios FIXME/BUG/etc, ranking por severidad, filtro only; implementación real en `real-deps.ts`, `scan-markers.ts`, tool y barrel. Leídos todos los seis TS producción, manifiesto/README y spec del scanner.

**Contratos MCP.** Una tool con input only opcional y output objeto explícito. filesScanned/total/findings/truncated/summary/worst coherentes con handler; total es número de hallazgos filtrados, no cobertura del repo. Max200 resultados; only desconocido produce cero hallazgos en vez de error, semántica permisiva.

**Seguridad y aislamiento.** SafeWorkspaceReader para contenido, sin escrituras/red; límite4000 archivos y 512KiB/archivo. Excluye vendored/build/cache/VCS, archivos desaparecidos/no legibles se omiten. Bun.Glob es dependencia de runtime: no asumir Node compatible sin adapter. No se leen secretos por ejecución durante esta ficha.

**Calidad.** Pure scanner y deps inyectables. Spec normal/severidad/posición/orden/identificador; no prueba límites de FS ni protocolo. Regex no es parser de lenguaje y puede detectar una cadena que contenga "// TODO"; es heurística, no prueba de deuda semántica. Archivos omitidos y límite4000 no se anuncian como scan incompleto, aunque truncated solo mide hallazgos.

**Economía de tokens.** SDK directo definición1580B/input134B/output1030B; knowledge522B. Hasta200 hallazgos, mensaje120 chars: respuesta acotada pero podría dominar contexto; recomendable paginación/summary-first. Sin medición de tokens de una tarea completa.

**Producto.** Útil como inventario de comentarios; no equivale a análisis de bugs. Configuración nula y filtro simple. Nota7 por límites y pureza, resta por omisiones silenciosas/heurística y falta de integración de límites en informe.

### cache — Analizado estáticamente; nota provisional 8/10

**Funcionalidad.** Contribuye seis reglas TTL al registry core y una tool GC; no scheduler propio. Producción seis TS íntegros, README/manifiesto y spec E2E registry leídos. Dependencia explícita ctx.cacheEvictionRegistry; las garantías de borrado dependen del core, no reimplementadas aquí.

**Contratos MCP.** dryRun por defecto true; onlyOwner opcional; output de report tipado. Sin registry retorna toolError/isError con acción explicada (no se afirma que cumpla schema de éxito; errores MCP son vía separada). generated/tool-outputs incluye reconcile además de GC aunque plugin solo registra GC: tipo histórico extra no demuestra capacidad cargada.

**Seguridad y aislamiento.** Reglas excluyen .worktrees, records y state; parámetros reducen TTL con min, no lo aumentan. core registry es quien contiene rutas y aplica; no hace procesos/red ni accede secretos. Tool apply permite borrado solicitado con dryRun=false. No se realizó sweep real sobre cache del usuario.

**Calidad.** Spec usa tempdir y registry real: dryRun, apply, idempotencia y preservación de unidades por muy viejas que sean. Opción worktrees heredada se acepta/ignora, documentada. Sin timers ni recursos de plugin; no hay dispose que retirar reglas del registry: activar/desactivar merece verificar contrato core de ownership antes de atribuir fuga.

**Economía de tokens.** Reutiliza medición previa coordinador: definición1462B/input156B/output911B, 1 tool. Report puede listar cada entrada eliminada/saltada, sin límite en plugin; tamaño depende registry y cache. Lazy loading interesante para mantenimiento ocasional.

**Producto.** Reglas de vida útil claras, opt-in, preview seguro para petición ordinaria. README dice boot apply default, knowledge del index dice dry-run default; incoherencia editorial que debe resolver autoridad core, no se elige por README. Nota8 por separación y pruebas reales; resta por ambigüedad de default anunciado y respuestas no acotadas en capa plugin.

### prompts-pack — Defecto confirmado; nota provisional 4/10

**Funcionalidad.** Seis plantillas texto para código/tests/PR/seguridad/perf; ninguna llamada a modelo ni efecto. Leídos los nueve TS producción, manifiesto/README y único spec completo. Los renderers son reales pero vía MCP normal se rompe UTIL-01.

**Contratos MCP.** Metadata interna describe argumentos, pero registerPrompt no recibe argsSchema; prompts/list omite argumentos y prompts/get recibe metadata en su lugar. Repro transporte real confirma fallo de caso válido. Falta validación cruzada de startLine<=endLine y coerción desde argumentos MCP string para números, que deberá contemplar reparación.

**Seguridad y aislamiento.** Template puro: el texto no valida ruta como FS porque no lee archivo; no implica escape de escritura. Inputs se insertan en instrucciones y deben tratarse como datos por el host; no hay secreto persistido ni runtime externo.

**Calidad.** Buen aislamiento de cada template, strict Zod y helpers reutilizados. Tests fakeServer llaman handler con una firma distinta a SDK real y declaran renderizado funcional sin probar contrato. Ciclo de vida trivial sin recursos.

**Economía de tokens.** 0 tools/esquemas de tools; 6 prompts listados, envelope961B; knowledge762B. Repro error devuelve metadata inesperada repetida y desperdicia contexto; instrucciones se expanden a demanda, apropiado para lazy prompts. No se llama proveedor al medir.

**Producto.** Descripciones útiles pero flujo principal anunciado no funciona actualmente. La configuración es vacía; host no puede arreglar la falta de schema. Nota4 por defecto transversal que invalida uso normal aunque composición pura sea sencilla.

### changelog — Defecto confirmado; nota provisional 5/10

**Funcionalidad.** Parser convencional, agrupación/render Markdown y semver preview puros; git log real para generar changelog. Leídos nueve TS producción, manifiesto/README y release-plan spec. Preview de release sin orden por entrypoint es inutilizable (UTIL-02); parser y render siguen disponibles por API pública.

**Contratos MCP.** Dos tools: changelog_generate exige range incluso si se usan from/to, no acepta scope/types prometidos README; strict schema. release_plan recibe commits pero no publishOrder; sin inyección siempre error. Uniones source outputSchema no se exponen por SDK directo (UTIL-03 pendiente composición core). Errores de git/empty-range explícitos.

**Seguridad y aislamiento.** execFile git sin shell, timeout15s/maxBuffer8MiB. range es argumento de git sin separador contra flags: entrada --all/--since puede alterar alcance, no se demuestra ejecución arbitraria ni escritura. No publish/red del plugin. Markdown incorpora subject/scope no escapados: consumidor HTML debe sanear, aquí entrega Markdown.

**Calidad.** Separación parser/bump/group/render y pruebas puras. nextVersion duplicado respecto release-plan tooling; inferBump trata revert como patch mientras derive-version tool lo ignora: autoridades de previsualización y publicación divergen semánticamente. Specs inyectan orden en builder y omiten entrypoint. No recursos permanentes.

**Economía de tokens.** SDK directo definición1406B/input678B/output0B, 2 tools; knowledge556B. Respuesta de changelog duplica commits en markdown y sections sin paginación y permite git log hasta8MiB: coste potencialmente alto para rangos grandes. Medición no incluye transformación por composition root.

**Producto.** Documentación promete filtros y defaults/inyección inexistentes, más allá de utilidad del parser. Paquete privado en este snapshot (también roadmap): no inferir que debe estar en publish order npm. Nota5 porque mitad de superficie no funciona normal y contrato anunciado diverge.

## Continuación

Producción pendiente de lectura completa: audit, auto-plugin-selector, conventions, diagram, framework-knowledge, git, logs, memory, notification, refactor, roadmap, rules, search, status-marker, style-convention, test-convention, test-policy, deps, docs, env, i18n, link-check, perf. No se declara lote ni auditoría global terminados hasta completar ledger y fichas.

## Hallazgos y fichas — lote 2

### UTIL-04 — P2: ICU anidado no compara los placeholders de las ramas

**Defecto confirmado por función real, sin mocks.** `plugins/i18n/src/lib/validate/validate-interpolation.ts` analiza el bloque exterior de plural/select pero solo registra `{variable,kind}`; parseIcuOptions comprueba delimitadores y presencia de other, sin analizar variables de cada body. `analyzeMessage` avanza directamente a `block.end+1`.

```ts
const normalized = normalizeBraceToken(block.content);
if (normalized.malformed) malformed = true;
if (normalized.token !== undefined) placeholders.add(normalized.token);
index = block.end + 1;
```

`repro-i18n.ts/.json`: source `{count, plural, other {Hello {name}}}` y traducción `{count, plural, other {Hola {nombre}}}` → validateInterpolation=[] aunque la variable interior cambia. El error de render o variable faltante depende del consumidor; no se ejecutó framework externo. **Corrección:** análisis recursivo del AST ICU (o parser ya disponible adecuado), comparación de placeholders dentro de ramas y pruebas para select/plural anidados; no basta token del selector. **Track:** propuesta correctiva pendiente.

### UTIL-05 — P3: cuando no se usa ninguna traducción, i18n no marca ninguna como no usada

**Defecto confirmado.** `plugins/i18n/src/lib/i18n/check-i18n.ts` crea usedKeys y exige `usedKeys.size>0` para reportar unused-key:

```ts
if (usedKeys !== undefined && usedKeys.size > 0) {
    // ... reporta cada clave sin uso ...
}
```

El contrato distingue escaneo ausente (`undefined`) de escaneo ejecutado que no encuentra usos (`[]`), pero el guard los vuelve equivalentes. `repro-i18n.ts/.json`: `checkLocales([{locale:'en',data:{neverUsed:'hello'}}],{usedKeys:[]})` → []. La entrada tool sí pasa Set vacío cuando ha leído source files sin llamadas t(). **Corrección:** solo condicionar a usedKeys!==undefined y probar 0/1 usos; conservar explícito cuándo no existe cobertura de uso. **Track:** propuesta correctiva pendiente.

### link-check — Analizado estáticamente; nota provisional 7/10

**Funcionalidad.** Lectura completa de seis TS producción, README/manifiesto y spec principal: descubre markdown, extrae links inline, headings ATX y comprueba path/fragment/empty. No evalúa enlaces externos, imágenes, references ni Markdown completo; scanner regex determinista, implementación real offline.

**Contratos MCP.** Una tool sin parámetros, output objeto findings/summary/worst con total y truncation200. max5000 docs y tamaño1MiB se aplican en adapter, pero truncation solo habla de findings, no de documentos omitidos; docsScanned no expresa cobertura total. Target se decodifica como path, mientras fragment no se decodifica: anchors percent-encoded pueden generar falsos positivos. slugify usa `\w` ASCII y es una aproximación a GitHub, no parser completo.

**Seguridad y aislamiento.** SafeWorkspaceReader limita contenido a workspace, sin network, exec ni writes. Recorrido de paths con dot=true puede enumerar muchos archivos ocultos; docs dot=false no inspecciona esos markdown. Límite de docs no limita número de knownPaths; árbol grande puede costar memoria. Bun.Glob liga el adapter al runtime Bun; compatibilidad Node no probada aquí.

**Calidad.** Piezas puras y DI, una suite con casos de filtros, anchors duplicados, fences y regresión regex lineal. No fixtures de Unicode/colisiones de slugs contra implementación renderer real ni cobertura de adapters FS. No timers/teardown. Heurística de fences alterna al ver cualquier triple delimitador, no distingue apertura/cierre/tipo/longitud.

**Economía de tokens.** Medición real previa coordinador: definición1608B/input85B/output1028B. Max200 findings con mensajes/fix repetitivos; lazy scan útil para fase documental. Toda enumeración FS se ejecuta aunque solo necesite un doc; sin scope/summary-only input.

**Producto.** Opt-in trivial y útil como lint de enlaces inline comunes; debe describir lenguaje soportado y cobertura omitida para evitar confundir cero findings con docs correctas. Nota7 por aislamiento/pureza y tests, resta por parsing limitado y omisiones no declaradas al usuario.

### i18n — Defectos confirmados; nota provisional 6/10

**Funcionalidad.** Nueve TS producción completos: flatten keys, source key usage, check cross-locale y validate ICU; README/manifiesto y specs de ICU/containment leídos. Real para JSON bajo localesDir, no adaptador del objeto TS de traducciones usado por la propia web. Las rutas auxiliares dependen de core reader/contained/listDir, no de servicio externo.

**Contratos MCP.** Dos tools de lectura con outputSchema objeto y parámetros localesDir opcional. sourceLocale=en o primera lexical para validate; check simple usa primer locale ordenado como referencia para placeholders. UTIL04/05 demuestran falsos negativos. Locale inválido/ilegible se salta silenciosamente: report de locales vacío/worst none no acredita parseo exitoso; conservar como riesgo semántico y medir escenario si se eleva a hallazgo independiente.

**Seguridad y aislamiento.** resolveExistingWorkspaceContained antes de construir adapter, SafeWorkspaceReader para contenido; specs rechazan symlink externo tanto check como validate. No procesos/red/escrituras; no acceso a cuentas reales durante auditoría. Recorrido fuente async, pero acumula contenido de todo árbol soportado; .cache no aparece en IGNORED_DIRS y puede aumentar coste inútil.

**Calidad.** Helpers puros, cinco specs totales, relevantes ICU/containment leídos sin ejecutarlos de nuevo. ICU parser manual no recurre en ramas y no cubre semántica ICU completa; extractUsedKeys regex ignora claves dinámicas y puede encontrar texto en comentarios/cadenas. arrays/non-string se convierten a String: formato de catálogo soportado limitado, debería documentarse.

**Economía de tokens.** Medición previa SDK definición3252B/input230B/output2072B. Findings sin límite/paginación; locale grande multiplica claves×locales. Key extraction lee fuente completa aun para check sin necesidad de informar uso; conviene input que desactive scan y summary/limit.

**Producto.** Sin dependencias externas ni setup complejo, mensajes/fixes concretos. Nota6 por soporte de JSON y aislamiento comprobado en specs, reducida por UTIL04 y falsos verdes de cobertura/formato; zero findings no implica traducciones válidas en todo runtime.

### docs — Analizado estáticamente; nota provisional 7/10

**Funcionalidad.** Ocho TS producción completos: índice markdown, lectura contenida y generación sintética de documentación para exports TS; búsqueda pública helper conservada, tool search deprecada. README/manifiesto y specs containment/pagination/generate leídos. Cuatro tools realmente registradas; README aún dice dos y omite generación.

**Contratos MCP.** List permite roots/limit/offset, devuelve totales y cursor solo dentro del catálogo ya capado (default200/max1000); truncated declara ese recorte, no número total real repo. Read devuelve found/reason sin tirar exception; solo md/mdx independientemente de extensions configuradas para index: un host que indexa otra extensión puede ver entradas que docs_read rechaza. Search devuelve deprecation isError deliberada; output schema omite replacementArgs que sí entrega el envelope. Generate returns Markdown, no escritura.

**Seguridad y aislamiento.** Contención física de roots/path/cwd y reader workspace; specs prueban symlink/traversal externos. Read cap256KiB se aplica a caracteres tras lectura completa, no bytes (unicode puede exceder bytes anunciados); list stat rechaza archivos mayores antes de leer. Generate walk async y Promise.all sin máximo de módulos, por lo que repos grandes pueden cargar muchas fuentes; no red/modelos/procesos.

**Calidad.** Pruebas reales de tempdir y adapters para paginación, deprecation, generación/scopes y contención; no se reejecutaron suites del coordinador. engine.ts mezcla list/read y búsqueda pública deprecada relativamente extensa, candidato a simplificación sin nueva capa. Generador regex no analiza AST y no detecta reexports, overloads complejos ni funciones arrow como Functions, aunque sí las lista como variables.

**Economía de tokens.** Medición previa definición3570B/input694B/output1628B, cuatro tools. List50 por página evita volcado; read256Ki caracteres; generate todos módulos con source-derived Markdown sin límite puede crecer mucho. Mantener search deprecado en catálogo cuesta tokens hasta migrar clientes; carga lazy ya etiquetada.

**Producto.** Útil para orientación curada y configuración roots/extensiones, pero metadata/paginación deben distinguir total catalogado de total existente. Nota7 por contratos explícitos/contención/tests, resta por README atrasado, cap de bytes incorrectamente descrito y generación no acotada.

## Hallazgos y fichas — lote 3

La omisión de outputSchema union se consolida en hallazgo transversal **G61-MCP01** del coordinador: composición native falla, managed/adaptive funciona en la reproducción core. UTIL03 no se cuenta como hallazgo adicional.

La fuga enum env se consolida en **G61-ENV01** ya existente. `repro-env.ts/.json` aporta reproducción independiente solo con valor sintético, sin abrir credenciales; no constituye voto extra. El propio spec check-schema exige que el error incluya `staging`, por lo que la suite fija el comportamiento contrario a la promesa "never values".

### UTIL-06 — P2: el grafo de módulos pierde imports sin extensión

**Confirmado con adapter real.** `plugins/diagram/src/lib/graph/real-modules.ts:80` enumera candidatos `importedAbs`, `${importedAbs}.ts`, etc, pero retorna el primero dentro root sin verificar existencia:

```ts
for (const candidate of candidates) {
    const rel = relative(rootAbs, candidate);
    if (!rel.startsWith('..')) return rel;
}
```

Posteriormente `allSet.has(resolved)` solo contiene archivos .ts/.tsx, así que import './b' se resuelve como src/b y desaparece. `repro-diagram.ts/.json`: adapter sobre tempdir con a.ts→'./b' y c.ts→'./b.ts'; a devuelve [], c devuelve ['src/b.ts']. Patrón sin extensión es habitual en el propio código analizado. **Impacto:** diagrama anuncia estructura sin dependencias que sí existen. **Remediación:** resolver contra el conjunto de archivos existentes antes de retornar o stat; cubrir extensión implícita/index.ts y ruta inexistente con filesystem real. **Track:** propuesta correctiva pendiente.

### UTIL-07 — P2: benchmark acepta cero y produce una salida MCP inválida

`plugins/perf/src/lib/tools/perf-bench.tool.ts:15` permite samples z.number().nonnegative, mientras `bench-runner.ts:26` devuelve Infinity si meanMs=0. Output ops exige z.number finito.

```ts
const ops = meanMs === 0 ? Number.POSITIVE_INFINITY : 1000 / meanMs;
```

**Confirmado por protocolo SDK real:** `measure-next.ts/.jsonl`, petición benches=[{name:'zero',samples:[0]}] es válida según inputSchema; respuesta isError=true, MCP -32602 Output validation error, received Infinity at results[0].ops. **Corrección:** definir semántica de resolución/cero como salida finita o nullable con causa, o rechazar muestras cero; cubrir en protocolo. No se ejecutó benchmark de un proveedor ni gasto.

### UTIL-08 — P2 estático: el profiler mide un workload sintético y no ejecuta el proyecto solicitado

`plugins/perf/src/lib/profile/real-perf-profile-deps.ts` crea inlineWorkload con readdirSync sobre hasta250 directorios y bucle checksum4M; Node --prof ejecuta exclusivamente ese string. `cwd` del usuario es argumento de esa enumeración, no programa o función objetivo. Además runProfiler(_profilerId,input) ignora selección0x/clinic y siempre llama runNodeProf:

```ts
args: ['--prof', '-e', inlineWorkload(), cwd],
// ...
runProfiler: async (_profilerId, input) =>
    runNodeProf(ctx, input.cwd, input.timeoutMs),
```

**Impacto:** hotspots de scanner/checksum pueden parecer rendimiento de aplicación; selección de backends anunciada no determina qué se ejecuta. README reconoce flamegraph todavía devuelve hotspots, pero no explica workload artificial ni que0x/clinic no se usa. **Corrección:** declarar diagnóstico sintético con nombre/métricas adecuados o aceptar entrypoint/comando explícitamente autorizado, seleccionar backend implementado y registrar workload exacto. **Límite:** lectura completa de la cadena; no se lanzó profiling real durante esta contribución. **Track:** propuesta correctiva pendiente.

**Observación env adicional confirmada de función pura:** explain.varPresent retorna true ante cualquier ocurrencia no vacía; `TOKEN=first\nTOKEN=` resulta unlocked aunque checkEnv documenta que la última asignación gana. `repro-env.json` guarda ambas entradas y falsa capacidad. Precedencia de runtime externo no se ejecutó: el desacuerdo ya existe entre semánticas del propio plugin. También env_explains normal se construye sin requirements en index y queda vacío; schema-derivation solo está exportado para otros callers. Coordinar con hallazgos previos env para no duplicar IDs.

### env — Defecto confirmado; nota provisional 5/10

**Funcionalidad.** Trece TS producción completos, README/manifiesto y spec schema leído. Parser .env, tipos, explicación y extracción de requisitos implementados; entrypoint no inyecta requisitos al explainer. API de derivación importaría módulos de plugins cuando la invoque otro caller, no la tool normal.

**Contratos MCP.** Dos tools outputSchema objeto; check soporta schema/required aunque metadata de description enfatiza lista required. README env_explains muestra shape variables/blockedCapabilities diferente de capabilities/blocked/unlocked real. found=false distingue adapter sin texto, pero check boundary trata missing path como "not allowed" antes del adapter; mensajes no uniformes. Fuga enum G61-ENV01 y false unlocked en duplicates.

**Seguridad y aislamiento.** Contención física en adapter y check boundary; no lectura de archivos reales de proveedor. checkSchema error muestra valor sintético rechazado, por lo que no garantiza secreto oculto. Ninguna escritura/red en herramientas; derivación dinámica exportada es capacidad distinta. Lectura env usa readFile completo sin límite, acotar ficheros enormes.

**Calidad.** Pure seams, nueve specs; leído schema muestra test explícito de value en mensaje: pasar tests no comprueba intención privacidad. Quoting/inline comments dotenv se conservan en raw values, enum/number pueden discrepar de dotenv real. Optional Zod de requisitos se aproxima buscando palabra optional en descripción, no inspeccionando wrapper. Sin recursos que cerrar.

**Economía de tokens.** Definición4112B/input650B/output2506B,2tools; findings/capabilities sin paginar. No emite valores salvo defecto citado; reparar privacidad también evita amplificar valores en logs/contexto. Requisitos/lists explican duplicado de información entre capabilities y unlocked/blocked.

**Producto.** Útil check básico offline, pero documentación y wiring de explainer incompletos; nota5 por privacidad y estado de capacidades que no corresponde al uso real. No se infiere entorno desplegado desde archivo local.

### perf — Defectos confirmados; nota provisional 5/10

**Funcionalidad.** Doce TS producción completos; medición bundle real por stat, cálculo de samples aportados (no ejecuta benchmark del programa), profiler sintético UTIL08. README/manifiesto y spec adapter profiling leídos.

**Contratos MCP.** Tres tools; schemas explícitos, union profile bajo G61-MCP01 native. samples0 produce salida inválida UTIL07. Profile responde skipped cuando probe sin backend, failure con hint y success top10. timeoutMs es positivo sin límite máximo, por lo que "bounded" depende del caller.

**Seguridad y aislamiento.** cwd profile con contención física, scratch ephemeral y cleanup finally. Ejecuta binarios locales Node/probes, no proveedores. Bundle usa Bun.Glob y stat(join(root,rel)) sin guard por-glob: scope traversal requiere reproducción antes de elevarlo a defecto; no se leyó fuera del workspace. No benchmark/profiler real del usuario durante auditoría.

**Calidad.** Ocho specs; adapter spec solo prueba orden/probes, no ejecución de backend seleccionado ni workload correcto. Pure comparación/budgets útil; coste runtime de stat todos archivos sin límites. Perfil parsea porcentajes de texto y top10, no formato flamegraph real.

**Economía de tokens.** Definición4192B/input1152B/output2083B,3tools por SDK directo; profile union omitida en conteo. Top10 hotspots/largest, pero findings bundle sin límite. Benchmark repite una fila por conjunto aportado y no limita número de muestras/benches.

**Producto.** Bundle presupuestos claro; benchmark debe llamarse análisis de muestras y profiler diagnóstico sintético para evitar promesas de medir código que no se ejecuta. Nota5 por ausencia de workload real y zero válido que rompe contrato.

### test-policy — Analizado estáticamente; nota provisional 8/10

**Funcionalidad.** Seis TS producción completos, README/manifiesto y policy-store spec leído. Cuatro modos con resolver pure, override durable y knowledge inicial; cumplimiento guiado por agente expresamente documentado, no enforcement mecánico de TDD.

**Contratos MCP.** Dos tools get/set objeto con ok/error opcionales. allowSetTool=false rechaza escrituras; input admite clear y mode juntos, clear gana, coherente handler pero susceptible a confusión del caller. Stale override cambia al config vigente con explicación, en vez de aplicar a nueva configuración.

**Seguridad y aislamiento.** withFileMutex+writeFileAtomic en escritura y rm clear; reason pasa redactSecrets. CacheDir inyectado; ningún proceso/red. Lectura corrupta produce quarantine, así que get no es absolutamente sin efectos si hay corrupción. No se atribuye carrera de quarantine sin reproducir lectura/reemplazo concurrentes.

**Calidad.** Tres specs totales; store spec lee roundtrip, redaction, JSON durable y corrupt/schema. Resolver tiene rama configMode redundante ya inalcanzable: deuda pequeña sin defecto funcional demostrado. Knowledge snapshot puede quedarse antiguo tras set pero manda consultar tool live. Sin timers/dispose.

**Economía de tokens.** SDK definición2515B/input365B/output1195B,2tools; guidance acotada (cuatro frases/mode), extraGuidance2000 y reason500. Repetir instrucciones policy cada orientación consume contexto, mejor referencias/payload compacto si ya leído.

**Producto.** Configuración clara, precedencia y override con backoff a config; host decide quién puede cambiar política y puede congelarla. Nota8 por atomicidad/redaction/tests y límites, resta por enforcement solo declarativo y doble snapshot/live.

### diagram — Defecto confirmado; nota provisional 6/10

**Funcionalidad.** Once TS producción completos, README/manifiesto y module-graph spec leído. Cuatro tools reales graph deps/modules/ERD/DFA; README documenta solo deps. ERD reusa database, DFA reusa transición proposals; módulos actualmente pierde imports idiomáticos UTIL06.

**Contratos MCP.** Schemas objeto definidos, límites graph opcionales; ERD valida tables/arrays pero columns/indexes/FKs z.unknown puede aceptar elementos que renderer no soporta: evaluar renderer database antes de dar validez completa. status union local de7 duplica vocabulario aunque renderer importa autoridad transitions. No se validó Mermaid real renderer en esta contribución.

**Seguridad y aislamiento.** packageRoot explícito contenido físicamente; default root propia instalación deliberado, no workspace. read adapter usa SafeWorkspaceReader, sin exec/network/writes. Display name se introduce en Mermaid sin escapado genérico; filenames especiales podrían romper render, pendiente fixture.

**Calidad.** Cinco specs totales; builder specs inyectan mapa ya resuelto y pasan sin ejercer adapter defectuoso. ShortName colapsa scope npm y nodeId cambia '-'/'/' a '_', con riesgo de colisiones en adopters. real-modules memoiza files al construir deps: cambios posteriores no aparecen hasta nuevo adapter; default se construye al registrar plugin.

**Economía de tokens.** Definición5348B/input1435B/output1606B,4tools. Devuelve mermaid+nodes+edges duplicados; limit opcional, sin límite por defecto. Scan se ejecuta antes de aplicar limit, por tanto limita output, no I/O.

**Producto.** Útil visualización, pero neutralidad limitada por WORKSPACE_ROOTS fijos packages/plugins/apps/extensions y default módulo de plugin instalado sin src. Nota6 por composición reusable y contención, reducida por grafo módulos incompleto.

### auto-plugin-selector — Analizado estáticamente; nota provisional 7/10

**Funcionalidad.** Trece TS producción completos, README/manifiesto y specs index/token-tax leídos. Ranker determinista+config diff real; signals caller, no análisis automático de manifest/git a pesar de texto comercial. refine prepara handoff/ranking con roster suministrado: no llama LLM ni verifica disponibilidad auténtica.

**Contratos MCP.** Una tool input signals requerido, output recommendations/diff/refineRequested/rationale; args scopes validados. Entry sí conecta catálogo first-party (spec regression leído). Usage aggregation exportada pero index no pasa observaciones, así que señales históricas son coldstart por herramienta normal. taskHint solo se usa en prompt, no score.

**Seguridad y aislamiento.** Pure por llamada, sin OS/red/write; diff es preview no aplica nada. Roster supplied no demuestra autenticación/cuotas/precio actual; reachable significa candidato elegible en roster, no ejecución confirmada. IDs/taskHint interpolados en prompt deben tratarse como datos por eventual host.

**Calidad.** Nueve specs, seams pequeñas y DI. Token-tax compara techo caps.hard con referencia3000 y puede penalizar ceiling alto en lugar de consumo staticBytes; spec fija ese comportamiento, requiere revisar semántica de contrato core antes de llamarlo defecto. Pesos permiten negativos y no normalizan suma; host puede alterar escala. DEFAULT_DIAL7 contradice comentario defaults3/escala1..5, código y tool usan0..10.

**Economía de tokens.** SDK definición4298B/input1227B/output2300B. Sin limit devuelve catálogo completo con candidatos, reasons y fit repetido dentro diff; total puede crecer mucho. Primera parte de medición es metadata estática, no coste de tarea/rationale real.

**Producto.** Consent-ready diff seguro, pero límite topN convierte no incluidos en removes aunque fueran útiles; rationale "no positive fit" no distingue truncation. Nota7 por funcionamiento puro sin gastos y wiring real catálogo, resta por señales no conectadas/calibración y lenguaje de disponibilidad demasiado fuerte.

## Hallazgos y fichas — lote 4

### UTIL-09 — P2: status-marker acepta un estado textual contradictorio

**Confirmado, pureza real.** `plugins/status-marker/src/lib/validate.ts` deriva state exclusivamente del primer codepoint emoji y solo comprueba que exista '[' y algún ']'; nunca valida contenido de brackets contra estado ni locale:

```ts
const state = table.emojiToState.get(emoji);
const bracketEnd = afterEmoji.indexOf(']');
if (bracketEnd < 0 || !afterEmoji.startsWith('[')) ...;
```

`repro-test-convention-status.ts/.json`: `validateCloseMarker('🟩 [BLOQUEADO]')` → ok=true,state=HECHO sin razón. También cualquier bracket arbitrario con emoji válido puede pasar. **Impacto:** auditor de cumplimiento valida señal contradictoria y puede reportar terminación cuando el texto dice bloqueo. **Remediación:** casar bracket con locale admitido de la tabla efectiva y razón/emoji de ese mismo estado; cubrir mismatch y emojis compuestos. El mismo repro prueba newline final→missing pese tolerancia de whitespace documentada; problema separado menor. **Track:** propuesta correctiva pendiente.

### UTIL-10 — P2: scan_drift rechaza specs/imports válidos y contradice layout configurado

**Confirmado con filesystem real** en `repro-test-convention-status.ts/.json`: src/a.ts exporta a; tests/a.spec.ts importa vitest y '../src/a', tiene describe top-level, configuración tests-mirror. Devuelve missing-top-level-describe(error), orphan-spec(warning) y missing-spec-for-export(warning) aunque el spec existe en ubicación que el propio suggestSpecPath recomienda.

```ts
// plugins/test-convention/src/scan.ts
if (convention.requireDescribe && !/^\s*describe\(/u.test(contents)) ...;
const expected = path.replace(/\.tsx?$/u, () => `.${specExt}`);
// resolveFrom:
if (normalized.includes('..')) return undefined;
```

RequireDescribe exige primera instrucción describe, incompatible con imports normales y con knowledge que pide imports al comienzo. Scanner ignora specLayout y siempre busca colocate. Resolver rechaza todo parent import incluso interno; no normaliza .. contra árbol conocido. **Remediación:** analizar statements de spec o ignorar imports/comentarios; reutilizar suggestSpecPath con convención; resolver paths/candidatos contra all antes de emitir warning. **Track:** propuesta correctiva pendiente. Languages configurable no guía isTsSource hardcoded; maxFiles recorta sin campo truncated, quedan riesgos adicionales explícitos.

### UTIL-11 — P2: framework knowledge ignora cambios al pack y mantiene una regla retirada

**Confirmado con entrada real runFrameworkGuidance.** `guidance.tool.ts` lee pack actualizado para provenance/patterns, pero solo si !summary.hit reescribe cache. `knowledge-cache.service.ts` valida meta únicamente con lockEntry (framework+versión/source); no hash pack, TTL ni generación.

```ts
if (!summary.hit && pack !== undefined && pack.records.length > 0) {
    await writeKnowledge(...);
}
```

`repro-framework-cache.ts/.json` crea fixture Angular exactpin17.3.2, pack recommended/OLD, obtiene guidance y actualiza pack a removed/NEW sin cambiar framework. Segunda llamada responde OLD/recommended/resolved y provenance apunta al pack cambiado. **Impacto:** editar evidencia y retirar recomendación no cambia instrucciones efectivas, con provenance aparente de archivo actual. **Remediación:** cache key/generación incluya digest pack y validez relevante, seed/read del mismo snapshot; probar edición/eliminación de pack y writers concurrentes. **Track:** propuesta correctiva pendiente. No depende de red o instalación Angular.

### status-marker — Defecto confirmado; nota provisional 5/10

**Funcionalidad.** Siete TS producción completos, README/manifiesto y validate spec leído; formatea ocho estados, locale es/en y tabla extendida; enforcement por agente, no hook automático. Helpers formatos/casos reason missing reales, no semántica de haber terminado una tarea.

**Contratos MCP.** Tres tools close/validate/ping. Close enum se adapta a custom markers; ValidateOk/Fail conserva enum builtin, y union afectada G61-MCP01 native. UTIL09 valida mismatch estado y trailing newline devuelve missing. Opciones invalidas safeParse fallan y se sustituyen por builtin silenciosamente antes de merge, pese comentario que promete error config.

**Seguridad y aislamiento.** No FS/red/exec por tool; ping expone paths configurados del host; no secretos registrados deliberadamente. Razón devuelta en texto, no persistida por plugin; un host log puede guardarla y debe sanear como cualquier texto caller.

**Calidad.** Tres specs; validator suite cubre happy path/formato/razones/dashes/extra prose, omite mismatch bracket y newline completo. User emoji acepta hasta8UTF16 chars pero parser toma primer codepoint, limita símbolos compuestos sin aviso. Knowledge repite tabla builtin aunque haya overrides deshabilitados.

**Economía de tokens.** SDK definición2522B/input573B/output1076B; union validate omitida en esta medición directa, consolidada G61-MCP01.120chars línea, reason input160. Tres tools+knowledge e instrucciones bootstrap para una convención: coste repetido relevante frente a utilidad mecánica pequeña.

**Producto.** Fácil config, idioma/conjunto extensible, pero README ejemplo disable usa estado inglés inexistente y fallaría merge. Nota5 por validador que puede certificar marca incorrecta y config silenciosa, manteniendo valor del formatter determinista.

### style-convention — Analizado estáticamente; nota provisional 7/10

**Funcionalidad.** Dieciocho TS producción completos, README/manifiesto y checkStyle spec leído. Tres tools solo si styleRoots configurado, grafo clases/consumidores/tokens y checks sin editar. Parser CSS/SCSS/nesting y markup únicamente Astro; CSS-modules/tailwind/legacy son perfiles declarados, no compiladores de esos lenguajes.

**Contratos MCP.** Output schemas objeto parseados explícitamente, errores tipados. content input permite revisar antes de guardar. No roots devuelve cero tools y availability needs-configuration, coherente. styleImpact exige exactamente selector o file; marker graph/counts claros.

**Seguridad y aislamiento.** SafeWorkspaceReader para list/read, maxDepth12, sin network/exec/write. callerCheckout selecciona unidad actual, buena separación multiworktree. Scan source failures se omiten; ausencia de datos puede parecer clean. utilityMajor se toma de package.json range, no versión instalada real: no confundir promesa con observación lock/node_modules.

**Calidad.** Cuatro specs; checkStyle cubre tokens, foreign/forked/shared/legacy/tailwind. CSS-modules/Astro scoped .class homónima se agrega por nombre global y podría producir forked-selector legítimo; preocupación estática a probar contra compilación, no se declara defecto confirmado. Tokens solo declarations monoline que terminan ';', dynamic classes descartadas. Reparse completo por petición sin cache evita stale, cuesta I/O.

**Economía de tokens.** SDK directo con roots configurado: definición4161B/input547B/output2387B,3tools; sin config0. Constante interna declara3500B desde composición previa, comparar mismo modo antes de tacharla obsoleta. Findings/consumers sin cap; graph interno solo salida pedida reduce coste frente a volcado entero.

**Producto.** Config explícita evita inventar arquitectura; contención y copy de remedio útiles. Nota7 por utilidad/aislamiento/tests, resta por alcance Astro estrecho, heurísticas y ambigüedad de scopes/versión.

### test-convention — Defecto confirmado; nota provisional 5/10

**Funcionalidad.** Doce TS producción completos, README/manifiesto y scan spec leído; convención, runner detection, path/skeleton y scanner. Suggest calcula correctamente tres layouts; scanner no comparte esa autoridad UTIL10.

**Contratos MCP.** Tres tools schema objeto. languages/coverage aparecen como policy, no coverage ejecutada; lenguajes scanner hardcoded TS. maxFiles default500/máx5000 cap trabajo de contenido, sin indicar truncation. sourcePath rechaza substring '..' pero solo devuelve sugerencia, no escribe.

**Seguridad y aislamiento.** Listing y reader contienen físicamente paths, sin procesos/red/writes. ForbiddenPatterns host compila RegExp arbitraria, puede bloquear event loop con patrón patológico al escanear texto; input host-config, no explotación remota demostrada. Excerpts120chars pueden contener datos fuente, uso esperado scanner.

**Calidad.** Siete specs; scanner fixtures happy path empiezan describe sin imports y no cubren mirror/import parent válidos. Reutilizar calculator/resolver reduce divergencia. Missing-describe false error puede hacer gate inusable; empty describe regex exige1char y rama length0 nunca se alcanza.

**Economía de tokens.** Definición3950B/input689B/output2015B,3tools. Get duplica structured+markdown y múltiples knowledge copian convención; scan violations sin cap independiente, maxFiles no acota findings por archivo. Esquemas/metadatos no equivalen coste tarea.

**Producto.** Convención configurable útil; nota5 porque drift principal produce falsos positivos normales, con scopes monorepo propios fuera src/ que no chequea como source. Hasta reparar, usar guía/suggest y no tratar scan.ok como certificación universal.

### framework-knowledge — Defecto confirmado; nota provisional 6/10

**Funcionalidad.** Veintidós TS producción completos, manifiesto y framework-tools spec leídos; no README.md existente aunque files lo anuncia. Dos tools sirven knowledge pack local por framework/versión, convenciones contadas y resolución; no fetch framework docs ni corpus externo automático. Agencia conserva autoridad de packs.

**Contratos MCP.** Outputs objeto con estados unresolved/no-knowledge/resolved explícitos; evidence bajo demanda. Version exactpin admitida sin lock; lockEntry construido con source/package/version, no identidad íntegra lock. UTIL11 pack cache stale. Policy helper soporta user/project preferencias pero guidance normal solo inyecta detected/framework/default; capacidad pública más amplia que wiring tool.

**Seguridad y aislamiento.** Reader seguro por roots, IDs y segmentos validados, sin red/procesos. Guidance cache escribe tres JSON atómicos sin mutex/set generation; meta-last solo protege primer seed, no lectores concurrentes de replacement; registrado como riesgo estático, sin repro multiwriter adicional. Datos pack no pasan redactSecrets al persistir: validar si contiene texto usuario sensible antes de prometer durabilidad privada.

**Calidad.** Nueve specs totales, framework-tools leído cubre semilla/cachemiss/lockversion/source; no actualiza pack misma versión. Helpers puros y datos extensibles, parser range parcial (comparators/*; prerelease ignorada documentada). Detector≥5 y≥0.6 limita anécdotas, pero patrones actuales con reglas cached viejas pueden mezclar generaciones.

**Economía de tokens.** Definición3359B/input500B/output2041B,2tools; summaries sin evidence y topic selectivo buena economía. Resolved rules sin cap y scan hasta2000files por patrón cuesta I/O. Cache separa ficheros pero provenance debe reflejar versión de pack efectiva.

**Producto.** Útil cuando adopter prepara packs con fuentes; no out-of-box docs actualizadas. Nota6 por transparencia misses y pureza, reducida por cache que sigue recomendando regla retirada y falta README/distribución documentada.

### conventions — Analizado estáticamente; nota provisional 8/10

**Funcionalidad.** Veintidós TS producción completos, README/manifiesto y scan spec leído; cinco tools reales classify/check/suggest/explain/architecture, README aún dice dos. TypeScript reusa core rules; Python/Rust/Go perfiles nativos; arquitectura de capas está centrada en este repo.

**Contratos MCP.** Schema objeto para cinco; check reporta count/omitted roots y cap100unmatched, architecture cap200 findings+sample por detector. toolOk de reporte no es gate booleano de no-drift: interpretar newCount. Unknown profile error claro; classifier input string puro, no paths FS realmente abiertos.

**Seguridad y aislamiento.** FsDirReader contención física, source reader seguro; sin writes/red/exec. Scan roots repetidos/solapados no deduplican y pueden inflar counts, preocupación de calidad de reporte sin reproducción. Excepción nested dir omite lectura sin flag por-subárbol; root total0 explica diagnóstico.

**Calidad.** Doce specs totales, scanner leído cubre traversals/skip/missing y profiles. Detectores copian semántica de lints por diseño y parity spec existe; duplicación justificada por boundary tooling/plugin pero requiere mantenimiento. Constantes vocabulario @delendai dentro plugin permitido, no core agnostic claim. Scope enforcement depende de package paths registrados, no autodetección de repos externos.

**Economía de tokens.** Definición6541B/input950B/output3333B,5tools. Classification paths input sin max, output matching cardinalidad; report caps controlan volumen pero counts tree completo. explain con reglas/fuentes evita instrucciones enormes al orientar cada vez.

**Producto.** Convenios multiidioma útiles, APIs pequeñas, diagnostica roots absent. Nota8 por claridad/contención/fuentes coherentes y ausencia de defecto confirmado nuevo, resta por README histórico y architecture hardcoded poco transferable.

### UTIL-12 — P1: codemod permite leer fuera del workspace mediante cwd symlink

**Confirmado, entrada pública registrada normal.** `refactor-codemod.tool.ts:32–46,88–114` valida contención léxica, no física; `codemod-runner.ts` crea el SafeWorkspaceReader con ese cwd como nueva raíz. Workspace/linked→outside pasa y la readdir raíz sigue el enlace. Repro `repro-refactor.ts/.json` usa únicamente fixture sintética externa: cwd linked/recipe ts/strict-equal devuelve diff con `SYNTHETIC_PRIVATE` y archivo completo externo. No escrituras ni datos reales. Nav/rename tienen contención física y sus tests no cubren codemod. **Impacto:** exposición de TS/JS externo alcanzable mediante symlink existente, si contiene transformación aplicable; el diff incluye antes/después completos. **Remedio:** resolver cwd físicamente bajo raíz original antes de recorrer y conservar misma raíz de confianza en lector; añadir caso symlink al spec público. Propuesta correctiva pendiente.

### UTIL-13 — P2: rename anunciado AST-safe altera literales y bindings ajenos

**Confirmado helper productivo usado por tool sin validación semántica adicional.** `rename-planner.ts` emplea tokenizer y comparación textual; regex no se salta y keyword solo pasa regex de identifier. `repro-refactor.ts/.json`: renombrar x→y cambia `/x/g` a `/y/g`; x→class devuelve ok con `const class = 1`; sombra local también se renombra. Spec acepta expresamente corrupción del regex como limitación y no aserta conservación del binding interno. **Impacto:** plan + apply puede cambiar lógica o invalidar sintaxis pese contrato AST-safe. **Remedio:** parser/binding real o limitar promesa y rechazar casos ambiguos/keywords; probar preservación regex y scopes. Propuesta correctiva pendiente. Adicional posición nav tras comentario multilinea reporta declaración línea2 y uso3 frente a líneas reales3 y4, reproducido mismo script: tokenizer no actualiza línea al saltar bloque.

### refactor — Defectos confirmados; nota provisional 3/10

**Funcionalidad.** Nueve TS producción íntegros; manifiesto y cuatro specs de nav/rename/contención/codemod leídos. No README existente aunque files lo declara. Seis tools: referencias/definición/símbolos, codemod, rename y apply; tokenizer propio, no compiler API pese descripción AST-safe. Codemod devuelve preview incluso dryRun false.

**Contratos MCP.** Esquemas objeto, resultado con diff/hunks y errores tipados; apply exige consentToken no vacío, no ligado criptográficamente a plan/versiones. Rename scopePaths omitido intenta leer root como fichero en planner; consumidores deben dar scope concreto. Plan contiene before/after/hunks internos, tool retorna paths/hunks. No afirmar gates ejecutados: apply solo retorna instrucción de reejecutar validate.

**Seguridad y aislamiento.** UTIL12 contención codemod incompleta con fuga externa real en fixture. Nav/rename/apply resuelven físicamente root; writes atómicos por fichero en apply, sin transacción multiarquivo ni comparación de baseline antes de sobrescribir. Consentimiento es campo caller; autoridad efectiva depende del host.

**Calidad.** UTIL13 confirma corrupción regex, keyword y scope; specs documentan limitación pero producto promete AST-safe. Nav positions incorrectas reproducidas tras comentario multilinea. Apply procesa hunks contra contenido actual sin verificar líneas '-' originales: riesgo estático de contenido cambiado, no ejecución adicional. No suite repetida, parent cubre suite global.

**Economía de tokens.** SDK real directo seis tools: definición7861B/input2116B/output3916B. Codemod emite fichero completo antes/después en diff sin cap y rename hunks de línea completa: sensible a tamaño del árbol/ficheros. Limitadores de paginación no presentes. Son bytes de registro, no coste de tarea/tokens.

**Producto.** Buen patrón preview/apply y tipos de error pero aislamiento y promesa semántica no sostenidos. Nota3 provisional por dos defectos confirmados con impacto de lectura externa/código alterado. No recomendable automatizar apply sin revisión humana y gates efectivos; valoración estática con reproducciones mínimas, no certificación runtime integral.

### G61-DEPS-01 — evidencia adicional (UTIL-14 consolidado): deps audit presenta error/timeout como escaneo sin hallazgos

**Confirmado con seam runner productivo sin red.** `audit.ts:118–127` solo distingue unavailable; ignora code/timedOut y parseBunAudit devuelve [] ante texto no JSON. `repro-deps.ts/.json` inyecta code1/stderr fallo registro con timedOut false y true: ambos producen findings[], summary0, sin skipped/note. Tool público con allowNetwork true envuelve como worst none. No afirma haber probado proveedor. **Impacto:** indisponibilidad de registro/timeout aparenta ausencia de CVE; gate consumidor puede interpretar falso limpio. **Remedio:** diferenciar ejecución válida/advisories, fallo transporte/proceso y parseo; resultado skipped/error explícito y tests error/timeout/JSON inválido. Propuesta correctiva pendiente.

### UTIL-15 — P2: inventario Python rompe constraints PEP508 con coma

**Confirmado helper productivo de deps_polyglot.** `polyglot.ts arrayLiterals` hace split(',') antes de desentrecomillar, separando coma dentro de requirement válido. `repro-deps.ts/.json`: dependencies=["requests>=2.0,<3.0","click"] produce nombres `"requests>=2.0` y `<3.0"`, ranges '*' en vez requests/range >=2.0,<3.0. Spec solo cubre constraints de un comparador. **Remedio:** lexer de strings/array o TOML parser, preservar requirement antes splitPep508; test múltiples comparadores/extras/markers. Propuesta correctiva pendiente.

### deps — Defectos confirmados; nota provisional 6/10

**Funcionalidad.** Once TS producción íntegros, manifiesto/README y tres specs audit/polyglot/tree leídos. Cinco tools default offline list/check/licenses/polyglot/tree, dos network opt-in y dos write opt-in. Health solo lockfile/range laxo/duplicación, no CVE offline; README omite licenses/tree y audit ya implementados. Polyglot es subset declarado, pero UTIL15 rompe requirement corriente.

**Contratos MCP.** Objetos Zod para todos, detail compacto preserva counts/suprime filas. Tree children usa z.any profundo y totalNodes solo cuenta árbol recortado pese descripción que promete profundidad extra; raíz deps version null aunque lock tenga instalada. Generated outputs borran nullable (`lockfile.kind`, wanted/latest, tree.version), discrepancia contractual estática remitida a root para generador transversal. audit G61-DEPS-01 distingue solo binary missing.

**Seguridad y aislamiento.** Manifest/polyglot físicamente contenidos, lectura mediante SafeWorkspaceReader. Licenses construye raíz desde nombre manifest sin validar nombre; symlink node_modules legítimo external hace lectura de metadato instalado, no se afirma fuga de secretos. Installs requieren flag explícito, quoting spec correcto, lock manifest; script args allowlist y cwd físico/caller checkout. Package script puede hacer red aunque effects solo write/spawn, descrito en summary; no se ejecutaron procesos/red para auditar.

**Calidad.** Repros audit error/timeout + Python comparador confirman dos defectos. Nueve specs existentes, tree prueba real solo count/finite y no transitivas correctas, ausencia de excepción no certifica parser lock. License classifier heurístico SPDX, sin evaluación legal, unknown se reporta low. Declared peers+dev no rompe default loader evidenciado aquí.

**Economía de tokens.** Medición SDK anterior root no repetida: cinco tools definición7102B/input773B/output3855B. Compact evita dep rows pero traversal completo; outdated cap50 explícito/truncated. Tree depth20 sin maxNodes puede expandir exponencialmente DAG aun con cycle stack, riesgo estático; counts no incluyen omitidos. Salida licencias/inventario sin page cap.

**Producto.** Útil orientación offline e instalación explícita, buena separabilidad de riesgo. Nota6 por diagnóstico operativo de seguridad ambiguo y parser inventario incorrecto, con delimitación de subset y opciones transparentes. Runtime integral/suite global corresponden root; no se llama registro real.

### UTIL-16 — P1: notification borra un claim vigente de proceso vivo tras 30 segundos sin heartbeat

**Confirmado bridge real por defecto, sin servidor repo.** `agent-events.ts` decide agent-dead con edad≥3×heartbeatMs (default10s), sin PID/host/stale_after_minutes; `agent-events-bridge.ts` default autoReleaseDeadAgents true elimina entrada bajo mutex y locks/registry/lease relacionados. `tools.ts` activa bridge en registerTool sin opt-in autoRelease ni effects de escritura. `repro-notification.ts/.json`: claim fixture con PID actual vivo, host actual, last_seen31s y stale10min; readInFlight lo considera aún held; bridge.watcher.check emite agent-dead y deja in_flight[]. No espera/timeout ni modifica repo. **Impacto:** tarea larga que no renueve antes30s pierde exclusión10min, otro agente puede escribir mientras sigue trabajando. No equivale startup mutex ORCH03. **Remedio:** autoridad expiry única core con PID/host/TTL y revalidar última generación/heartbeat dentro mutex antes borrar; declarar efectos background y política autoRelease explícita. Tests existentes certifican eliminación a3beats sin proceso vivo/política actual. Propuesta correctiva pendiente.

### UTIL-17 — P2: lectura corrupta del lock se publica como liberación

**Confirmado watcher real fixture.** `readInFlight` devuelve empty map ante missing/corrupt; `createReleaseWatcher.check` lo compara con baseline previo y emite diffReleased. Repro anterior guarda claim, hace check baseline, escribe '{torn', check devuelve released live aunque no hubo release. `awaitLockRelease` utiliza mismo empty→free. Comentario afirma no false releases pero falta estado de lectura. **Impacto:** signal falso/await prematurely success, reintento claim posiblemente falla; autoridad de claim final limita escritura si host la revalida. **Remedio:** conservar último snapshot bueno y distinguir unavailable de empty; await no certificar free con parse fallo. Propuesta correctiva pendiente.

### notification — Defectos confirmados; nota provisional 4/10

**Funcionalidad.** Diecisiete TS producción íntegros, manifiesto/README y agent-events spec leído. Push de lock-release/handoff y await bounded con diagnóstico de próximo paso y wait graph TTL5min. Registro inicia tres watchers, no necesita invocación de tool. Se declara lector pero bridge elimina estado, UTIL16.

**Contratos MCP.** Dos tools objetos Zod; timeout clamp1–120s, signal abort al cerrar servidor, seguimiento waits finally. Diagnosis contiene holder/state/nextAction concreto. Missing/corrupt interpretado free UTIL17. Timestamp heartbeat persistido no genera alive al inicio ni recuperación; idle≥10beats queda inalcanzable tras rama dead≥3beats, observado estáticamente (legacy sin timestamp sí emite alive/dead/idle).

**Seguridad y aislamiento.** Paths watch físicos al registrar, escrituras bridge revalidan realpath. Wait registry writes no effects declarados, usa mutex/atomic. Liberación automática pierde autoridad frente engine/PID vigente UTIL16. Logging safeSend tolera stubs/canales cerrados, datos filenames/agent/reason esperados sin redactar texto arbitrario handoff.

**Calidad.** Lifecycle tests cubren legacy y persistidos pero no retorno alive/PID vivo/TTL ni corrupción después baseline. Watchers con timers unref y close encadenado; register twice conserva closures últimas y puede dejar watchers iniciales hasta cerrar. Wait snapshots casts no validación filas completas, parse error degrada sin visibilidad. No suite redundante.

**Economía de tokens.** SDK directo2tools definición2615B/input331B/output1198B. Wait reduce roundtrips; event ring200 limita historial y último release batch se reemplaza. Watcher polling2s y event-driven fs.watch; coste CPU/I/O fuera de tokens no medido. Handoff seenFiles sin poda acumula nombres durante sesión.

**Producto.** API de esperar una vez y diagnóstico concreta es valiosa para coordinación; nota4 por eliminación prematura de claims y falsos libres, justamente frontera que pretende hacer fiable. Estado con reproducciones mínimas reales de servicios, no prueba de integración swarm completa.

### git — Analizado estáticamente; nota provisional 6/10

**Funcionalidad.** Diecisiete TS producción íntegros, README/manifiesto y specs extended/options leídos. Ocho tools orientación, commit/push allowWrite, pr_list/view allowForge; allowStash además activa pr create/view/list y bisect (más que el permiso anunciado). Librerías release prepare/store/finalize no están expuestas como tools de plugin normal. reconcileRelease produce receipt completed sin merge, dato de planificación que necesita consumidor ejecutor; no demuestra release real.

**Contratos MCP.** Objetos Zod, git extended collapse union explícito evita G61-MCP01. Reader checkRepo distingue no-git pero comandos posteriores status/diff/log/worktree ignoran result.ok y pueden devolver clean/vacío si fallan; estático, no reproducido adicional. parseStatus porcelain sin -z deja quote/rename `old -> new` en path. Show ref/range changelog se añaden como argv sin validar prefijo '-' (posible interpretación de opciones), requiere prueba no realizada por límite de alcance. Generated outputs omit commit/push/extended por generación default y config flags.

**Seguridad y aislamiento.** Commit/push exigen ctx.effects y caller-checkout, mensajes Conventional y amend agent, push bloquea destino explícito/implicit y +force. Extended stash/bisect no effects write ni writeRoot/callerCheckout, usa runExternalTool directamente en workspaceRootAbs: riesgo estático serio de gate dryRun/checkout distinto cuando allowStash; specs afirman effects bisect undefined. PR create solo effects network y nace por allowStash aunque allowForge false. No nuevas reproducciones, no se ejecutó git/red.

**Calidad.** Trece specs existentes, dos leídos; tests de opciones rechazan allowWrite tipo incorrecto/falta effects, no ejercitan allowStash con root de unidad/efectos reales. Release store in-memory no persistencia/mutex entre procesos; prepare execute reserva metadata, no crea rama. Promotion hardcode main pese release target parametrizable en helpers. Conservar distinción biblioteca vs wiring público al priorizar cambios.

**Economía de tokens.** Medición directa ya guardada8tools definición5844B/input900B/output2781B. Diff/show stat reduce patch, log cap100; blame sin cap de líneas, status/changed/worktree sin pagination y runner8MiB buffer. Changelog limit sin clamp con range arbitrario puede volcar historia extensa. No costes tarea ni red medidos.

**Producto.** Orientación barata con opt-ins y autor central útil; README omite changelog y alcance real allowStash. Nota6 provisional por incoherencia permiso/efectos de extended y diagnóstico vacío tras errores, con buena frontera fail-closed en commit/push. Hallazgos de extended quedan estáticos pendientes validación, no afirmación de bypass dinámico del host.

### logs — Analizado estáticamente; nota provisional 5/10

**Funcionalidad.** Diecisiete TS producción íntegros, README/manifiesto e incidents-search spec leído. Nueve tools, timeline/error stream diarios, hooks start/completion/cancel y adapter capturado. log tool solo escribe mainStore aunque severity critical/error, mientras ctx.logs helper sí fanout; docs prometen error stream para ambos. Adapter sigue kind log-warning pese nueva constante incident-error, discrepancia con contrato de ese kind.

**Contratos MCP.** Objetos Zod envoltorio, eventos z.unknown y incidents/gaps unknown debilitan validación. Query cursor offset correcto, search corta cada stream antes de unir y recalcula matched/hasMore de página descartando metadata total de servicios: potencial falso hasMore false cuando streams coinciden. Tail consulta máximo últimos3d aun con más días retenidos y filtro sin resultados recientes; no avisa de omitidos. Evidencia estática sin nuevas pruebas por instrucción parent.

**Seguridad y aislamiento.** Normaliza summary, redacta strings recursivas, sanitiza error público a fingerprint/hasStack. Redacción string-only ignora nombre de clave para valores opacos; no equivale garantía universal de secretos. Resumen largo se trunca pero archivos/identity sin límite pueden sobrepasar cap. Logs normaliza args/result completos antes de persistir; aplicar minimización en vez basarse solo regex. Background startup/log escribe sin effects tool declarados; lectura segura raíz store pero append open sigue symlinks si store está alterado, integridad host no probada.

**Calidad.** Nueve specs, leído uno cubre roundtrip/context/error sanitization/regex; recentLimit0 solo aserta redacción, no que recentEvents vacío: slice(-0) devuelve todos. normalizeEvent ignora override severity/incidentType en payload y los deriva siempre pese comentario; helper construye evento directo. onToolCall toma error thrown, no isError del resultado por sí solo; composición root decide qué error entrega. Tests no sustituyen validación real de carga.

**Economía de tokens.** SDK9tools definición9854B/input3016B/output2775B. Detail compact/normal útil; full defecto en query/search y tool-log de lecturas puede replicar payload, volumen significativo. Limita líneas8KiB/32KiB e historial10files pero query/search leen retenidos completos para página; regex JS sin timeout/ReDoS guard. Correlate/incident clusters sin cap total, recentLimit0 expande todo. Bytes de registros, no ahorro sesión demostrado.

**Producto.** Timeline e incident clustering son buenos instrumentos de auditoría, datos de fallos explícitos/locales. Nota5 por incoherencias error fanout/paginación/caps y knowledge desactualizado (meta query no existe, errors_tail default normal), a validar con pruebas dirigidas posteriores. No se ejecutaron nuevas reproducciones ni suites.
