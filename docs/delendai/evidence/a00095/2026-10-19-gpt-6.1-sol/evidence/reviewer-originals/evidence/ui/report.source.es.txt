# Auditoría independiente: UI, red y contabilidad de tokens

Firma: agente ui_seguridad_tokens, modelo heredado GPT-6/Codex, host Codex, fecha de cliente 2026-10-19 (Europe/Madrid). Snapshot único: `514758e783620c8953079be4d71fceccacb3de8b`, fuente extraída en `/tmp/delendai-audit-20261019-L2whP7`. Fase A independiente; **no se consultaron conclusiones de auditorías ni propuestas anteriores**. El coordinador debe hacer el contraste posterior. No hay cambios de producto ni llamadas a proveedores. La única red de los repros es un servidor efímero en 127.0.0.1 con datos artificiales. Las pruebas usan seams/mocks del proyecto y la dependencia externa enlazada; las fuentes @delendai están en el snapshot.

## Alcance y límites

Este es un bloque especializado, **no una auditoría exhaustiva terminada**. Se leyeron completamente los entrypoints y manifiestos de los seis plugins asignados y los archivos críticos citados; se examinaron tests relevantes y se ejecutaron sus suites locales. No se leyeron semánticamente todos los archivos de web/extensión ni de los seis plugins. El coordinador mantiene el inventario total. Bootstrap, reglas de repo y playbook se leyeron; la lectura del playbook se produjo después de comenzar la inspección (limitación de procedimiento); preflight global delegado al coordinador para no repetir ejecución masiva.

| Área / ruta | Función y dependencias | Estado verificado | Evidencia / responsable |
|---|---|---|---|
| `apps/web` | Astro estático, i18n compartida, catálogo generado | Analizado estáticamente: configuración Astro, Search, rutas SSE, logs/recovery. Resto pendiente | UI-WEB-01; ui_seguridad_tokens |
| `extensions/vscode` | Host, comandos, webview IPC | Analizado estáticamente: bridge, dashboard, toolbar, knowledge, docs, settings; 3 specs focales ejecutadas. Activación completa pendiente | UI-01 y fortalezas; ui_seguridad_tokens |
| `packages/ui-extension` | Renderers HTML/CSS independientes de host | Defecto confirmado en detalle dashboard; 38 specs / 258 tests verdes; no browser real | UI-01; ui_seguridad_tokens |
| `packages/client` | Cliente stdio, modelos dashboard | Defecto confirmado en KPI ahorro fijo | TOK-01; ui_seguridad_tokens |
| `plugins/web-fetch` | Fetch HTTP restringido | Defecto confirmado en redirect malformado; 4 specs / 35 tests verdes | NET-02; ui_seguridad_tokens |
| `plugins/api` | OpenAPI caller, validator, mocks | Dos defectos confirmados; 9 specs / 85 tests verdes | NET-01, API-01; ui_seguridad_tokens |
| `plugins/browser` | Planner sobre driver inyectado | Analizado estáticamente; 6 specs / 29 tests verdes; sin Chromium real | Ficha; ui_seguridad_tokens |
| `plugins/external-mcps` | Composición subprocess lazy/acks | Defecto confirmado de contrato missing-env; 22 specs / 158 tests verdes, sin servidor externo real | Ficha; ui_seguridad_tokens |
| `plugins/execution-env` | Library local/Docker/SSH | Analizado estáticamente; 13 specs / 110 tests verdes; Docker/SSH reales pendientes | Ficha; ui_seguridad_tokens |
| `plugins/usage-tracking` | Métricas MCP, NDJSON, pricing/rollup | Defecto confirmado en etiqueta estimación; 24 specs / 137 tests verdes | TOK-02; ui_seguridad_tokens |
| Core `metrics`, `surface`, `subagents` + dispatch adapter | Bytes/costos, discovery, delegación host | Analizado estáticamente y micro-repro bytes; límites end-to-end host sin verificar | Sección tokens; ui_seguridad_tokens |

Suites: comando efectivo por componente `cd <ruta> && bunx --no-install vitest run --config vitest.config.ts --maxWorkers=1 --reporter=dot`, salida en `tests-*-local.log`, `tests-{api-local,external,execution,usage,ui,vscode}.log`. VSCode selección: open-toolbar-allowlist, open-knowledge, webview-csp, open-dashboard (3 archivos existentes / 9 tests). Hay intentos iniciales inválidos documentados: cargar config desde raíz usa includes relativos y ejecutó suites ajenas para web/browser, o 0 tests para API; **no se cuentan esos resultados**. Resultado correcto agregado del bloque: 119 archivos de specs / 821 tests, todos verdes (suma de suites aisladas; no cobertura de líneas ni garantía de integración).

## Medición de herramientas (SDK real, sin llamadas de negocio)

`measure.ts` crea McpServer + Client enlazados con InMemoryTransport, registra entrypoints reales en workspace vacío, llama tools/list y cierra ambos. Uso se registra mediante su builder para evitar refresh de precios. `measure.log` contiene salida bruta. La medición es UTF-8 de JSON serializado por definición; envelope lista añade comas/corchetes/claves; no mide framing JSON-RPC. No son tokens del tokenizador de un proveedor.

| Plugin | Tools realmente listadas | Bytes definiciones | inputSchema bytes | outputSchema bytes | Estimación ceil(bytes/4) |
|---|---:|---:|---:|---:|---:|
| web-fetch | 1 | 1277 | 309 | 459 | 320 |
| api | 3 | 4634 | 1886 | 1533 | 1159 |
| browser | 8 | 7706 | 2243 | 2913 | 1927 |
| external-mcps | 8 | 12804 | 1731 | 6541 | 3201 |
| execution-env | 0 | 0 | 0 | 0 | 0 |
| usage-tracking | 3 | 3164 | 978 | 499 | 791 |

Execution-env declara `availability: library` y devuelve tools vacías: un servidor SDK que no registra ninguna herramienta responde -32601 a tools/list; no se clasifica como defecto del plugin. Los demás outputSchema, incluidas uniones discriminadas del browser/API, se serializan correctamente con el SDK instalado. Esto refuta convertir automáticamente un comentario histórico de web-fetch sobre uniones Zod en un defecto vigente de browser.

## Hallazgos confirmados

### NET-01 — P1 — La carga OpenAPI del caller evade restricciones de red y tamaño

Estado: confirmado con fixture local. Componente: api. Snapshot arriba. Ubicación: `plugins/api/src/lib/spec/openapi.ts:365` (especialmente 369-370 y 385-395); llamada productiva `plugins/api/src/lib/tools/api-call.tool.ts:143`.

Esperado: la carga specUrl usa la misma allowList y límites que web-fetch; no conecta con host/puerto no autorizado ni lee respuesta ilimitada. Observado: `const f = options.fetch ?? (fetch as unknown as IFetchLike); const res = await f(options.url, {});` usa fetch nativo, sigue redirects por defecto, no consulta allowList, maxBytes o timeoutMs y acumula todos los chunks.

Reproducción: `bun /tmp/delendai-audit-evidence-ui/repro.ts`. Un HTTP server loopback entrega redirect `/redirect` -> `/spec` y spec >512 B; se solicita allowList `[approved.example]`, maxBytes=1 y timeoutMs=1. Salida `API_SPEC_BYPASS {hits:2,title:local-fixture,status:200,...}`. No se visitan servicios internos reales. La llamada de producción es alcanzable con specUrl y cualquier allowList no vacía, aun si no coincide con specUrl; se obtiene el spec antes de buscar operationId.

Impacto: SSRF contra destinos no aprobados dentro de los permisos de red del host; consumo ilimitado de cuerpo/memoria y espera sin deadline. La reproducción acredita bypass de allowlist y maxBytes; timeout ignorado está probado por trazado (no se hizo servidor que cuelgue). Causa: una segunda implementación de fetch divergente del helper seguro. Solución mínima: resolver specs con webFetch, respetar failures y parsear body capado; mantener un único seam seguro. Regresión: endpoint bloqueado recibe cero hits; redirect a host/puerto bloqueado cero hits posteriores; stream cancela al cap; timeout cubre cuerpo. Confianza alta. Relación anterior: nuevo en fase independiente, contraste pendiente.

### API-01 — P2 — El parser elimina reglas que el validador anuncia soportar

Estado: confirmado. Ubicación: `plugins/api/src/lib/spec/openapi.ts:130`/`parseSchema` hasta 187; consumidor `plugins/api/src/lib/validate/response-validator.ts:95`, 98-105, 234-260; contrato anunciado `plugins/api/src/lib/tools/api-validate.tool.ts:185` y entrypoint knowledge.

Esperado: nullable=true admite null; additionalProperties=false rechaza extras; oneOf/anyOf no soportados generan advertencia explícita. Observado: parseSchema copia una selección de campos y descarta nullable/additionalProperties/oneOf/anyOf. El validador sí sabe interpretar/rechazar estos campos, pero solo funciona si recibe un schema ya construido que evade el parser.

Repro: `bun .../repro-parser.ts`, salida en `repro-parser.log`. Schema de objeto cerrado, name string nullable y choice oneOf llega al validador como `{type:object,properties:{name:{type:string},choice:{}}}`; null produce high type-mismatch; `{injected:true}` genera `[]`; choice objeto inválido genera `[]`. Impacto: falsos positivos y falsa conformidad de contratos; tests del validador aislado no cubren la pérdida al cargar OpenAPI habitual. Causa: contrato IJsonSchema demasiado estrecho + casts de extensiones que no sobreviven normalización. Solución: preservar campos soportados y los marcadores de no soporte en el único parser; introducir test parse->validate por cada feature. Confianza alta. Relación anterior: contraste pendiente.

### NET-02 — P2 — Redirect Location malformado rompe el contrato never-throws

Estado: confirmado. Ubicación: `plugins/web-fetch/src/lib/services/engine.ts:316`. Quote: `const next = parseUrl(new URL(location, currentUrl).toString());`. El `new URL` está fuera de try/catch; parseUrl no puede recuperar una excepción que ocurre antes de su llamada.

Esperado: `{ok:false,reason:'invalid-url'}`. Observado: fetch fake devuelve 302/Location `http://[`; `webFetch` rechaza con `TypeError: Invalid URL`. Repro `repro.ts`, salida `MALFORMED_REDIRECT_THROW`. Impacto: error de herramienta/handler en vez de fallo tipado recuperable; un servidor permitido controla Location. No se demuestra caída global del MCP (hay wrappers). Solución: incluir resolución de Location en parse seguro y devolver el error tipado. Test regresión: relativo válido sigue funcionando, URL inválida retorna failure sin reject. Confianza alta; contraste pendiente.

### UI-01 — P2 — Los detalles inline de dashboard fallan por funciones serializadas sin dependencias

Estado: confirmado con VM limpia equivalente al ámbito global browser; Chromium real pendiente. Ubicación: `packages/ui-extension/src/dashboard/render-dashboard.ts:680` serializa `renderToolDetailBody.toString()` y `renderProposalDetailBody.toString()`. Mensajes se consumen en 506-513. Las funciones cierran sobre `DEFAULT_TOOL_DETAIL_COPY`, `resolveMetric`, `escapeHtml`, `renderOutputSchema` (`render-tool-detail.ts:87`), o `renderCards` y default copy (`render-proposal-detail.ts:455`). Ninguna dependencia se exporta al script webview.

Cadena productiva: `extensions/vscode/src/providers/dashboard-webview-view-provider.ts:256` -> `postMessage({command:hostToolDetail|hostProposalDetail,model})` -> listener -> llamada a función sin cierre. Provider devuelve true en 270 porque postMessage terminó; no recibe confirmación de render, por lo que el fallback host tampoco detecta el fallo.

Esperado: click de herramienta/propuesta abre detalle en shell. Observado: `runInNewContext('('+fn.toString()+')(model)',{model})` da `ReferenceError: DEFAULT_TOOL_DETAIL_COPY is not defined` para tool y `ReferenceError: renderCards is not defined` para proposal. Repro `repro.ts`. Impacto UX: overlay no abre pese datos correctos; tests HTML string pasan porque no ejecutan el código emitido. Solución mínima: host renderiza el HTML con el renderer existente y envía fragmento HTML de confianza, o bundle cliente con imports resueltos; evitar convertir closures con toString. Regresión: ejecutar el HTML emitido, enviar ambos mensajes y comprobar DOM renderizado sin errores console. Confianza alta. No se afirma XSS por este hallazgo. Contraste pendiente.

### TOK-01 — P2 — El dashboard anuncia 18% de ahorro sin medir baseline

Estado: confirmado. Ubicación: `packages/client/src/lib/services/dashboard.service.ts:76`, 271-285 y 222; UI `packages/ui-extension/src/dashboard/render-panel-tokens.ts:38`; copy `apps/shared/src/i18n/langs/en.ts:552` / es.ts:558 dice «vs compact:false baseline».

Esperado: ahorro medido con baseline comparable o marcado explícitamente como estimación no observada. Observado: `Math.round(tokensFromBytes(totalBytes) * 0.18)` se aplica a todo total de texto, sin condición de modo, baseline ni comparación real. Modelo no porta status/basis. Repro `repro-dashboard.ts` inyecta métricas nativas de 4000 bytes y cero baseline; `getTokensModel()` devuelve 1000 tokens usados estimados, **180 ahorrados, 18%**. Impacto: KPI de producto engañoso, no acredita reducción end-to-end ni dólares ahorrados. Causa: heurística ilustrativa convertida en contador visible. Solución: consumir tokenAccounting con measured/estimated/unavailable; mostrar n/a sin baseline; separar bytes, tokens estimados y provider usage. Regresión: native/compact sin baseline nunca inventa ahorro, baseline pareado tiene suma y ratio correcto. Confianza alta. Contraste pendiente.

### TOK-02 — P2 — tokenTax marca exacta una estimación de schema

Estado: confirmado. Ubicación: `plugins/usage-tracking/src/lib/token-tax.helper.ts:4`, 42-46 y 54-57. Quote: `ESTIMATED_PLUGIN_SCHEMA_OVERHEAD_BYTES + toolCount * ESTIMATED_TOOL_SCHEMA_BYTES`; `estimated: toolCount === 0 || compactTypicalBytes === null || p95ResponseBytes === null`.

Esperado: staticSchemaBytes derivado del tools/list real o siempre etiquetado heurístico. Observado: basta una llamada con responseBytes para estimated=false, aunque se calcula 768+640*N con N de herramientas **invocadas**, no de registradas/servidas. Repro `repro.ts`, one tool +10 bytes -> staticSchemaBytes 1408, estimated=false, sources derived-from-observed-distinct-tools. Medición real independiente: web-fetch completo 1277 y browser 7706 bytes; la cantidad de invocaciones no cambia esos esquemas. Impacto: cold-start, utility y dynamicActivationSavings heredan una base no medida y comparaciones sesgadas. Solución: usar el observer real de tools/list / registry para bytes estáticos por plugin; si no están disponibles etiquetar estimated=true en cada magnitud, sin tratar la invocación como activación. Regresión: esquema grande y pequeño con mismo N deben reflejar diferencia; un plugin no invocado sigue costando en native; sin list no se presenta exactitud. Confianza alta. Contraste pendiente.

### EXT-01 — P2 — El proxy externo invalida su propio error missing-env

Estado: confirmado usando servidor+cliente MCP reales en memoria. Ubicación: `plugins/external-mcps/src/lib/subprocess/server-registry.ts:334` incluye ExternalCallFailureCode missing-env y `call` lo devuelve en catch de MissingEnvError; `plugins/external-mcps/src/lib/tools/invoke-proxy.ts:92` enum CallOutputSchema NO incluye missing-env, aunque el handler reenvía outcome.code.

Esperado: si falta variable declarada, no arrancar proceso y devolver `{ok:false,code:missing-env,hint:...}` conforme al contrato. Observado: la registry falla cerrado correctamente pero la llamada MCP produce isError con `Output validation error: Invalid structured content ... Invalid option ... at code`; el hint original no llega como fallo tipado. Repro `bun .../repro-external.ts`, salida `repro-external.log`. Fixture hostEnv vacío y variable artificial SYNTHETIC_NOT_SET; spawner lanza si se invoca, y no se invoca. Registro directo responde missing-env; call a través SDK falla output validation.

Impacto: integración/configuración usual sin credencial pierde diagnóstico útil y rompe contrato público; no es filtración de secreto (no se usa ninguno). Causa: dos enumeraciones de códigos sin autoridad única. Solución mínima: derivar schema de la unión canónica incluyendo missing-env y probar todos los códigos en proxy con SDK real. Regresión: cliente validando tools/list recibe missing-env estructurado, cero spawns, hint nombra referencia sin valores. Confianza alta. Relación anterior: contraste pendiente.

## Hipótesis probable o pendiente

**UI-WEB-01, P2 probable, bucle reload en recovery durante desarrollo**. `apps/web/src/pages/api/events/[topic].ts:10` responde en cada GET `event: agent-dead` con bootstrap:true aunque no murió ningún agente; `apps/web/src/pages/status/recovery.astro:24-26` recarga ante cualquier agent-dead sin filtrar bootstrap. `repro-web.ts` invoca tres cargas sucesivas y cada una produce de nuevo el mismo evento; ver log. Esto demuestra el contrato de producer/consumer incompatible; falta una captura browser real para contar recargas y comprobar MIME según hosting estático (un host estático podría enviar otro content-type y EventSource fallaría antes de consumir el evento). Solución: no emitir eventos de muerte en bootstrap, filtrar inicialización y servir stream desde runtime real cuando exista. No confundir estas rutas estáticas con supervisión viva de agentes. No elevarlo a defecto browser confirmado sin ejecutar allí.

**ACK autenticidad, pendiente**: `plugins/external-mcps/src/lib/tools/ack.tool.ts:156` acepta accept/ackedBy del caller y anota «HUMAN» por descripción; no se comprobó una frontera de identidad del host antes de registrar ack. No se ejecutó aprobación ficticia de un servidor real ni se afirma bypass del consentimiento del host. La garantía de aprobación humana está condicionada al host/política, además del ledger.

## Fichas individuales de plugins

### web-fetch — 7.5/10 provisional

Función real: fetch restringido y texto capado; opt-in, no necesita proveedor externo, necesita red. Manifiesto estable/network. Contratos: una herramienta, input estricto y límites numéricos; schema salida cubre éxitos/fallos; metadata effects network. No herramientas duplicadas internas. Seguridad: allowlist hostname+puerto (sin puerto solo 80/443), HTTP(S), validación cada redirect y cancel de stream al cap; timeout sigue armado durante cuerpo. NET-02 es un fallo de robustez concreto; no se encontró bypass del allowlist en **este motor**. DNS rebinding/IP resuelta no se prueba y no es promesa de aislamiento de red de sistema. Calidad: 35 tests verdes cubren límites/host/red. Tokens: 1277 B definiciones, salida normal hasta 50 KiB por defecto (límite configurable 10 MiB), duplicación JSON texto+structured del helper; errores cortos. Lazy útil en native si no se usa red. Producto: falla cerrado si allowList vacía, configuración clara aunque descripción todavía dice `plugins.web.options.allowList` frente al nombre actual web-fetch (deuda copy). Recomendación: reuse aquí desde API, fix redirect; no añadir otra capa.

### api — 4.5/10 provisional

Función implementada: parsear subset OpenAPI, construir request HTTP (GET/POST/etc.), validar response, generar mock. No servidor REST/GraphQL entrante pese resumen de manifiesto «REST/GraphQL API surface». 3 herramientas reales, dependencias core/web-fetch. Contratos esquemas sí se listan; caller y validator dan hints cuando falta spec. No se probó gasto API real. Seguridad: request dispatch usa allowlist y redacción headers sensibles, pero spec load de caller es NET-01 y caller permite allowList pasada como argumento (no tratarlo como política de host inmutable). Calidad: 85 tests verdes no impiden NET-01/API-01; existe doble validador/walker con semánticas diferentes y parser pierde campos. Tokens: 4634 B total; inline spec y request/response pueden duplicar contexto; maxBytes engine llega a body de operación, no spec en camino defectuoso. Producto: inline spec funciona; `api_mock` specUrl necesita seam que entrypoint no inyecta, por tanto host JSON normal devuelve install-required para ese caso; madurez stable excede integración comprobada. Prioridad: unificar carga segura y parse->validate. No afirmar soporte completo $ref/GraphQL.

### browser — 6/10 provisional

Función real: 8 planners sobre driver inyectado, navegación/screenshot/query/click/fill/assert/a11y/verify. El driver **no se construye instalando Playwright**: `browser-inspect.tool.ts:149` siempre devuelve available:false sin `options.driver`, incluso si probe encuentra playwright; entrypoint availability sí informa needs-host-adapter. Opciones JSON normales no pueden contener funciones, requiere host programático. Dependencias externas: host driver y eventualmente Playwright. Contratos reales listados correctamente incluidas uniones; URL de inspect/verify restringida HTTP(S) sin credenciales, schema estricto; screenshot en private plugin cache, writeRoot host-state. Calidad: 29 tests verdes con drivers falsos/fixtures; verify `mode:fixture` distinto de `real` es fortaleza; no prueba rendering real, style computado o a11y real de browser. Seguridad URL no es política egress: drivers son frontera de aislamiento; no probé navegación a recursos internos. Tokens 7706 B; open devuelve HTML sin cap del planner, query matches sin cap local pese summary bounded: el host driver debe limitarlo. Producto: corregir hint que solo manda instalar Playwright cuando falta un adaptador, documentar contrato host/driver y que instalación sola no basta. Nota condicionada a planners, no funcionalidad autónoma demostrada.

### external-mcps — 6.5/10 provisional

Función real: composición de MCP terceros, catálogo, validación config, discovery, suggest/ack, status/call y verificación de respuesta: 8 tools. Entry sin servidores no arranca procesos; servidores lazy o eager explícito. Dependencias core/zod, binarios/red/credenciales externos según config. Contratos: esquemas listados, EXT-01 confirma error missing-env fuera de outputSchema; otros errors `{ok:false,code,hint}`, selección declared tool cuando existe manifest, MCP handshake initialize antes tools/call. Seguridad: spawn argv sin shell, cwd workspace inyectado, env filtrado (base allowlist más claves declaradas), stderr drenado sin persistir; gates activación + ledger duradero compartido; ack de capabilities destructivas adicional cuando caller las nombra. Riesgo autenticidad ACK y frames/resultados grandes pendientes; no afirmar que `capability` opcional constituye autorización fuerte de cada tool externa. Calidad 158 tests verdes, lifecycle/dispose/timeout cubiertos, sólo mocks y fixture e2e existente; no servidor externo real levantado en auditoría. Tokens 12804 B (6541 salida), es el mayor del bloque; raw respuestas normalizables mediante capability+gateway y handle, o proxy devuelve resultado bruto duplicable. Producto: hints de missing-env/unknown-server útiles; parte de describe sigue diciendo ack «lands in S3» aunque está integrado. Recomendación: manter registro común sin copiar transportes; consolidar transporte mirrored con orchestrator-runner si pueden compartir contrato sin acoplar dominios.

### execution-env — 7/10 provisional

Función implementada: library de ambientes local/Docker CLI/Compose/SSH/Docker exec consumida por runner, no MCP tools propias; manifiesto experimental coherente y fuera de presets. Contratos TypeScript compartidos, registry, disponibilidad library; tools/list bytes cero. Seguridad: spawn shell:false argv, guardEffectCapability y dry-run, quoted POSIX/PowerShell, env names validados, secrets en memoria con redactor por valores + redactSecrets; lectura local SafeWorkspaceReader y putFile resolveWorkspaceContainedEffective/atomic. Local env declara expresamente que no aísla y hereda env real al ejecutar; `env()` es vista redactada, no sandbox. Calidad 110 tests verdes, falsos runners para Docker/SSH; no probar container runtime/ssh network real ni Windows. Tokens no discovery tools; stdout/stderr se acumula sin cap en spawn-process-runner (riesgo recursos a valorar en consumidores, no reproducción agotamiento). Producto: requiere host/orchestrator/runner elegir ambiente; library sola no ejecuta tarea de usuario. Mejoras: caps stdout/stderr y procesos hijos con deadline; no añadir herramientas públicas redundantes a una librería.

### usage-tracking — 6.5/10 provisional

Función real: instrumenta tools MCP, NDJSON metadata, report/clear/session hygiene (3), pricing snapshot/cache y rollups/delegación. Core/SDK/zod/fs/network para precios. Contratos compact outputSchema limita coste, status measured/estimated/unavailable para baseline tokens y usage provider; suscripción coste marginal null en computeCostUsd, correcto no fabricar dólares. Seguridad: RecordBuffer redacta antes write, mutex de fichero + append + fsync; helper pricing escribe mutex/atomic; clear requires confirm true y writeRoot host-state. Esa bandera no es identidad humana en sí. Calidad 137 tests verdes, races/lifecycle/buffer/circuit breaker; sin medir cuotas host ni proveedores reales. TOK-02 y divergencia text-only persistido frente core wire estimate impiden presentar contabilidad completa. Tokens 3164 B; responseBytes persistido es texto por contrato, usage/provider se extrae de structuredContent. Producto: report útil local; etiquetar origen exacto y métricas desconocidas en UI. Mejor simplificación: almacenar breakdown core común en vez de reconstruir ahorro/cold-start heurísticos en capas diferentes.

## Tokens de principio a fin: qué se mide y qué falta

Fortaleza confirmada: `packages/core/src/lib/metrics/metrics-registry.ts:339` estima explícitamente texto + JSON structured y separa contentTextBytes/structuredJsonBytes/wireEstimateBytes. `repro-dashboard.log`: resultado de texto 2 B más structured payload 4014 B -> wireEstimateBytes 4016 y estimate 1004 tokens; usage-tracking.responseBytes=2 **por contrato texto-only**, no es prueba de que structuredContent nunca se cuente. Helper toolJson (`packages/core/src/lib/shared/tool-response.ts:79`) manda representación textual y structured de objetos: una duplicación de payload real en el wire; cuánto usa cada host en contexto es externo y desconocido. Wire estimate excluye JSON envelope, imágenes/audio y metadatos, correctamente llamado estimate.

`usage-tracking/index.ts:409` persiste estimateResponseBytes (texto); higiene/percentiles/KPI posteriores usan ese campo. Core cost breakdown no se conserva en el invocation log. Structured usage/model sí se extrae (`record.ts:45-85`), distinguible de tokens de la respuesta. Costos API son cálculo usage por tabla de precios, no factura del proveedor; suscripción null (sin coste marginal inventado). Tabla snapshot/cache puede ser stale; no consulta cuotas privadas.

| Etapa requerida | Evidencia actual | Medido/estimado/desconocido |
|---|---|---|
| Descubrimiento tools/list | SDK wire definitions y observer session surface | Bytes JSON medidos; tokens ÷4 estimados; framing/host cache no medidos |
| Contexto inicial e instrucciones | bootstrap y tool schemas existen, pero host añade política propia | No se midió contexto host completo ni repetición exacta |
| Selección/planificación | fuera del log MCP si ocurre en razonamiento host | Desconocido |
| Delegación | manifestBytes y path prompt/enforced en port-resolution helper | Bytes manifiesto medibles; coste conversación heredada depende host |
| Contexto subagente | IHostSubagentRuntime.enforcesManifest (contracts:59), fallback bounded prompt | Autodeclaración host; no demostración límite efectivo a nivel host |
| Tools/respuestas | metrics core y hooks usage | Latencia/calls/errores y bytes locales; tokens provider solo cuando result usage lo reporta |
| Retries/errores/comunicación | llamadas MCP se registran, comunicación fuera MCP no | Parcial; no imputar totalidad a plugin |
| Verificación/persistencia/recuperación | tools visibles registrables, buffer/fsync y receipts | No end-to-end real pagado aquí |
| Respuesta final al usuario | pertenece al host | No observada por servidor |

Native/managed/adaptive: `surface/decide-mode.ts` respeta override, perfiles conocidos managed, desconocido sin signal native; el router se registra en todos y sólo cambia visibilidad. `tool-surface-runtime.service.ts` materializa lazy y conserva callable oculto. No inferir ahorro sólo por número visible: managed agrega tool_search/knowledge/router, cambios warm-set y retries. Para estos seis plugins las definiciones suman **29585 B**, 7397 tokens estimados si se sirven todas una vez (estimación sobre 23 tools; cero execution). No representa bootstrap global. Escenario comparable propuesto pendiente: misma tarea de lectura API local con native vs managed vs adaptive, medir lista inicial y relist, búsqueda+schemas, todas llamadas/respuestas (incluido structured), latencia, reintentos, objetivo y error finales; tokenizador real y precios obtenidos de usage de proveedor sólo con consentimiento. Ningún dato de esta tanda demuestra reducción real end-to-end, calidad igual o dólares ahorrados.

El fallback `renderDelegationPrompt` sólo contiene objetivo, identificador/hash del manifiesto, herramientas, inputBudget, acceptance y output schema; evita añadir conversación explícitamente. No lista bodies de referencias; el objeto task sigue llegando por request. IHostSubagentRuntime puede ignorar presupuesto o añadir contexto; repo no lo puede impedir. No se auditó conector de host real y su política de fork. Rollup de delegación mantiene input/output observados aparte de totals informados, pero las filas agrupan por tags+delegation y no separan prompt de enforced: no utilizar ese agregado solo como prueba causal de ahorro.

## Resultados negativos y fortalezas verificadas

- Diferencia entre escapeHtml de format (escapa ambas comillas) y render-output-schema (no apóstrofe) **no acredita XSS**. En las rutas leídas se inserta texto o atributos de doble comilla; no se halló entrada apóstrofe hacia atributo single-quoted ejecutable. No se registró bug por estilo de función.
- knowledge preview construye DOM con textContent para title/id/body (`render-knowledge-navigator.ts:73`), y host valida command/id antes fetch; payload usuario no se evalúa como HTML ahí.
- toolbar limita executeCommand al catálogo de acciones canónico y no reenvía args arbitrarios; test allowlist pasado. Dashboard valida mensajes con schema antes despachar comandos fijos (`open-dashboard.ts:249`); host bridge no es ejecución arbitraria por sí mismo.
- CSP deny-default existe con opt-ins enumerados; unsafe-inline documentado para renderers. No atribuir vulnerabilidad explotable sólo por ese permiso. `open-docs.ts` no inyecta CSP, pero URL pasa EmbedService, atributo escapado, iframe sandbox y no tiene message handler privilegiado propio: riesgo residual no exploit demostrado.
- Browser salida union se listó correctamente; no se hereda diagnóstico de comentario histórico sobre SDK antiguo.
- Web-fetch sí revisa host y puerto cada salto y cap de stream/timeout cuerpo. El bypass NET-01 pertenece al parser API divergente, no al motor seguro.
- execution-env no vende local como sandbox; argv quoting/dry-run probados con fake runners; no hubo lectura de credenciales.
- Se distingue modo fixture del real y coste de suscripción desconocido/marginal no fabricado.

## Prioridades, simplificación y KPIs verificables

1. P1 NET-01: reutilizar webFetch para specUrl y eliminar fetch duplicado. KPI cero requests a endpoint no allowlisted, streams cancelados al cap, deadline cuerpo efectivo.
2. P2 API-01/UI-01: tests de integración parse->validate y HTML emitido->mensaje->DOM. KPI todos casos de schema soportado conservan semántica; ambos paneles reales abren sin console error.
3. P2 TOK-01/TOK-02: única fuente de bytes/baseline con provenance por campo, UI sin ahorro inventado; conservar core cost breakdown en logs. KPI toda cifra de ahorro tiene baseline y estado; coverage structured visible en report; cantidades desconocidas n/a.
4. P2 NET-02 y EXT-01: parse redirect seguro y enum único de códigos de error; KPI todo Location arbitrario termina en resultado tipado sin throw.
5. Pendientes UI-WEB-01 + browser driver real + lifecycle completo extensión + e2e 3 modos. KPI misma calidad final, menos coste total observado y límites host acreditados, no sólo menor tools/list.

Nota por subsistema de este bloque: red/API 5.5/10; UI host/shared 6/10; contabilidad tokens 5.5/10; execution/composición 7/10. Opiniones provisionales derivadas de los hallazgos y cobertura limitada, **no nota global del repositorio**. No hay P0 demostrado.

Siguiente componente exacto para continuidad: ejecutar prueba browser de recovery y del HTML dashboard emitido, luego revisar lifecycle activate/deactivate y todas las rutas web restantes; completar matriz end-to-end por modo y contraste con auditorías previas bajo control del coordinador. Artefactos fuente/repro/logs en el mismo directorio; sin modificar bloques ajenos ni publicar producto.

Actualización final de evidencia: Playwright, @playwright/test, jsdom y happy-dom no están instalados (`require.resolve` devuelve unavailable), por lo que no se lanzó navegador real ni se descargó uno. Tests `packages/client/tests/services/dashboard.service.spec.ts:62-63` afirman explícitamente la heurística 18%, un ejemplo concreto de test que confirma implementación sin acreditar ahorro. No se consultó ninguna conclusión previa durante esta actualización.
