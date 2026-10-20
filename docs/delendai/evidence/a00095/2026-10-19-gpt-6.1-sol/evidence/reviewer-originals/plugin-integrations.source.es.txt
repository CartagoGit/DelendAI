# Cobertura complementaria de integraciones — tanda persistente

Modelo/host: GPT-6 heredado, Codex; fecha cliente 2026-10-19 Europe/Madrid. Snapshot único `514758e783620c8953079be4d71fceccacb3de8b`, fuente `/tmp/delendai-audit-20261019-L2whP7`. Responsable `ui_seguridad_tokens`. No cambios producto, proveedores ni credenciales. Fixtures destructivos únicamente SQLite :memory: y Git efímero creado y borrado en /tmp. Los identificadores de credenciales en tests son artificiales y ningún valor real se leyó. Fase A previa guardada `/tmp/delendai-audit-evidence-ui/report.md`; aún no se han leído conclusiones ajenas.

`coverage.json` enumera todos los archivos fuente/specs/manifiestos/metadata de 17 plugins, SHA256, líneas y rangos efectivamente leídos en esta tanda. `read-full` significa lectura semántica completa del fichero, **no prueba de ausencia de defectos**. Las salidas truncadas se completaron mediante nuevas lecturas de los fragmentos ausentes. El estado pending es explícito. No se importan automáticamente lecturas parciales del bloque anterior como si fueran lectura exhaustiva.

## Progreso efectivo del lote

- issues-triage: 14 archivos producción completos, seis specs completos, README/package completos. Ficha guardada. Repros SDK reales con gh falso; cero red externa.
- database: 13 archivos producción completos, siete specs completos, README/package completos. Ficha guardada. Repro ejecuta motor real con adapter bun:sqlite :memory:; better-sqlite3 no instalado, factory real bloqueada por dependencia.
- security: 24 archivos producción completos, 14 specs completos, README/package completos. Ficha guardada. Repro de listFiles usa Git real efímero + lector real; audit usa stdout falso. Semgrep/ast-grep/npm audit/OSV reales no ejecutados.
- api, browser, execution-env, external-mcps, usage-tracking, web-fetch: fichas iniciales previas disponibles, lectura íntegra pendiente en este ledger nuevo. Se corrigió aquí la afirmación sobre unions. Las suites verdes anteriores permanecen como evidencia específica y no se repitieron.
- container, forge, github, gitlab, issues, observability, remote-provider-core, error-reporting: pendientes de lectura semántica en este lote; inventariados. No existe ficha final aún. Siguiente componente exacto: container, luego remote-provider-core y consumidores forge/github/gitlab.

Tests globales los ejecuta el coordinador; no se declaran verdes suites nuevas por haberlas leído. Los repros son controles adicionales fuera del árbol. Los tests existentes son mayormente fakes y no reemplazan control de SDK real, SQL real o herramientas CLI auténticas.

## Datos medidos de coste (no facturación ni tokens reales)

`measure-three.ts` registra entrypoints reales en SDK in-memory y obtiene tools/list sin ejecutar scanners/DB/GitHub. Los bytes son UTF-8 JSON por definición, sin envelope RPC. El valor outputSchema=0 cuando SDK lo omite, **no** significa coste correcto de un contrato funcional.

| Plugin | Tools | Definiciones bytes | Input bytes | Output bytes | Estimación ceil(total/4) |
|---|---:|---:|---:|---:|---:|
| database | 5 | 4631 | 1091 | 2218 | 1158 |
| security | 4 | 6837 | 810 | 4153 | 1710 |
| issues-triage | 3 | 2773 | 676 | 1249 | 694 |

Datos brutos en `measure-three.log`; suites/repros y cálculos separados. Coste USD y cuota host desconocidos, no inferidos de bytes. Cardinalidad de filas/findings/issue.body causa coste variable; no se midió latencia proveedor real.

## Hallazgos nuevos y corrección de evidencia

### INT-DB-01 — P1 confirmado — WITH mutante evita allowWrite/confirm

Componente: database. Ubicación `plugins/database/src/lib/query/query-engine.ts:50-57,161-167,337-372`; adaptador `query/sqlite-query-driver.ts:96-107`; handler `tools/db-query.tool.ts:169`. SHA único arriba. Esperado: writes requieren ambas banderas y dryRun:false; CTE no convierte DELETE en lectura. Observado: READ_KEYWORDS contiene with, classifySql sólo mira primera palabra y executeGuardedQuery invoca driver.execute si es read. Quote `if (READ_KEYWORDS.has(keyword)) return 'read';`.

Repro `bun .../repro-db.ts`: SQLite real :memory: crea una fila artificial; SQL `WITH marker AS (SELECT 1) DELETE FROM fixture RETURNING id`, sin allowWrite ni confirm, dryRun:false. Resultado `{ok:true,classification:read,rows:[{id:1}]}` y count(*) pasa 1->0. Driver de reproducción es bun:sqlite sobre la interfaz del motor; no se afirma ejecución de better-sqlite3 ausente. La fábrica de producción abre RW y usa statement.all para with; no existe protección readonly adicional. Incluso donde output SDK falla (INT-MCP-01), el efecto se produce antes de validar output.

Impacto: borrado o actualización fuera de la autorización que promete el query guard. Causa: clasificación léxica insuficiente como frontera de escritura. Solución mínima: conexión readonly real para vía lectura y parser/statement.readonly para determinar mutación; no autorizar todas las PRAGMA/WITH por palabra inicial. Regresión real SQLite: CTE DELETE/UPDATE/INSERT y PRAGMA mutante rechazados sin flags; SELECT CTE permitido; dryRun no muta. Confianza alta sobre motor y trazado productivo; ejecución nativa better-sqlite3 pendiente. Relación previa: nuevo independiente, contraste pendiente.

### INT-DB-02 — P2 confirmado — La normalización modifica literales y comentarios SQL

Ubicación `query/query-engine.ts:80-81,267,280`: `value.replace(/\s+/g, ' ').trim()`. Esperado: el query ejecutado conserva semántica de entrada salvo sustitución de parámetros. Observado/repro-db.log: `SELECT 'two  spaces' AS text` devuelve `two spaces`; `SELECT 1 AS first -- ignored comment\n, 2 AS second` debería devolver dos columnas pero llega al driver en una línea y sólo devuelve first. También afecta escritura explícitamente autorizada. Causa: regex global aplicada dentro de strings/comments. Solución: no compactar SQL enviado al driver, o lexer que preserve spans literal/comentario; compactar sólo visualización. Regresión: valores Unicode/whitespace/literales escapados y comentarios lineales idénticos al SQLite directo. Confianza alta, nuevo.

### INT-MCP-01 (canónico coordinador G61-MCP01) — P2 confirmado — Unions output rompen llamadas válidas con SDK instalado

Defecto de contrato/indisponibilidad nativa; managed/adaptive por broker no necesariamente fallan. El coordinador confirmó composición real para api_validate: native falla, managed/adaptive resuelven correctamente. Ubicaciones: `plugins/database/src/lib/tools/db-query.tool.ts:42,67`; `plugins/api/src/lib/tools/api-validate.tool.ts:67`; `plugins/browser/src/lib/tools/browser-inspect.tool.ts:56,70,83` (schemas union/discriminatedUnion). SDK instalado `@modelcontextprotocol/sdk/dist/esm/server/zod-compat.js:79` normaliza sólo objetos; server/mcp.js:89 omite outputSchema si no normalizable y :200 pasa undefined a safeParseAsync al validar respuesta.

Repro `repro-union.ts` registra query/explain reales, driver falso inocuo devuelve fila, Cliente MCP real en memoria: tools/list carece outputSchema y SELECT válido termina isError `undefined is not an object (evaluating 's._zod')`. `measure-six-output-schemas.log`: browser open/screenshot/query, api_validate y DB query/explain sin schema en wire. No es ausencia inferida de grep ni comentario histórico. Respuesta se pierde tras ejecución y SDK devuelve error.

**Corrección explícita del bloque inicial:** el informe UI anterior afirmó «uniones ... se serializan correctamente» al observar éxito de tools/list; esa inferencia era incorrecta. El listado tiene éxito porque **omite** dichas schemas. Los bytes medidos inicialmente siguen siendo correctos para la superficie defectuosa, pero no acreditan contratos funcionales. Esta nota sustituye la conclusión negativa previa sin ocultarla.

Solución: outputs MCP raíz z.object, con payload union bajo propiedad o shape plano que describa ambos casos; mantener output contract fuerte. Test regresión SDK Client.listTools y callTool normal/error para las seis herramientas, no FakeServer que salta normalización. Impacto: herramientas aparentemente registradas que fallan para cada resultado exitoso, reintentos/contexto y posible efecto remoto previo al error. Confianza alta, alcance de cada path brokered todavía a contrastar con wrappers host; llamada SDK nativa demostrada.

### INT-TRI-01 — P2 confirmado — Contratos de error de triage_list y triage_run no coinciden con outputSchema

Ubicación `plugins/issues-triage/src/lib/tools/triage.tools.ts:41-55,75-79,108-121,150-154`. Esperado: fallo gh conserva reason tipado, schema conforme o isError real. Observado: devuelve `{ok:false,error:{reason}}` por toolJsonBounded sin isError pero schema strict exige repo/open o issueNumber/category/etc. Repro SDK `repro-triage.ts` con exec falso fallido: LIST_FAILURE/RUN_FAILURE son Output validation error que ocultan diagnóstico original. Specs 121-127 y184-190 llaman handlers capturados y comprueban substring, no frontera SDK. Solución: unión bajo objeto o shape success/failure explícito, o toolError con isError y contrato de error canónico; regression MCP real con gh 401/rate limit/not found. Impacto: UX y recuperación, gasto extra de reintentos; confianza alta, nuevo.

### INT-TRI-02 — P2 confirmado — Confirmación prometida no existe en schema ni handler

Ubicación `triage.tools.ts:99-106,139,204,265-270,294,299`. Descripción de run/comment dice «Requires confirm:true», pero input strict no contiene confirm y handler no la comprueba. Repro SDK fake: COMMENT_NO_CONFIRM efectúa llamada fake y retorna éxito; COMMENT_WITH_CONFIRM es Input validation error Unrecognized key confirm. No se publicó comentario real, ni se afirma bypass de permisos del host externo (que puede gatear la herramienta completa). El defecto confirmado es la falsa garantía del contrato plugin y que el caso documentado es inválido. Run además comenta por defecto `args.comment !== false`. Solución: decidir contrato explícito de confirmación y aplicarlo; no prometer una bandera imposible. Prueba: sin confirm ninguna operación fake de publicación; confirm:true permite el camino. Confianza alta.

### INT-SEC-01 — P2 confirmado — Errores JSON de audit se convierten en inventario limpio

Ubicación `plugins/security/src/lib/deps/audit.ts:171-203` ignora result.code tras parsear JSON; parsers.ts:220-228 trata objeto error como formato Bun sin advisories y retorna []. Esperado: failure de CLI no se presenta como escaneo válido sin vulnerabilidades. Repro `repro-audit-error.ts`: exec falso code1 stdout `{error:{code:ENOLOCK,summary:...}}` -> runAuditCommand `{ok:true,raw:...}` -> FINDINGS []. Handler deps usa estos outputs para ok:true/worst:none. No se ejecutó audit de red. Causa: confusión entre exit1 de vulnerabilidades y cualquier JSON error. Solución: detectar error envelope y validar formato de cada package manager; preserva exit1 con advisories reales. Regresión ENOLOCK/auth/network/malformed deben skipped/error, no clean. Confianza alta, nuevo.

### INT-SEC-02 — P2 confirmado, alcance documentado — Filtro omite archivos habituales con credenciales

Ubicación `secrets/run-scan.ts:15-16,38-44` lista positiva terminal de extensiones excluye `.env.local`, `.env.production` y `.py`. Repro `repro-security.ts` inyecta mismo token completamente artificial en cada archivo: `.env` scanned1/findings1; otras tres scanned0/findings0, incluso includeTests:true y scope tracked. Esperado: escáner de secretos de fuente/config revisa formatos textuales comunes de stacks que anuncia soportar o declara omisiones explícitas; no mostrar una inspección completa si no se leyó candidato. Causa regex de extensión terminal. Solución: incluir dotenv variants y lenguajes soportados o clasificador binario con exclusiones concretas; contar skipped por razón. Regresión fixtures `.env.*`, Python, Rust, Go, extensionless private key; no filtrar binarios como texto indiscriminadamente. Confianza alta de omisión y media de severidad contractual (no se promete búsqueda universal).

### INT-SEC-03 — P2 confirmado como punto ciego — scope changed pierde contenido staged

Ubicación `secrets/real-deps.ts:21-27`: `git ls-files --modified --others --exclude-standard` no incluye staged-only. Repro Git real efímero con staged.ts añadido al índice: changedFiles=[], scan0/findings[]; trackedFiles=[staged.ts], mismo fichero produce finding1. No secretos reales, sin commits. docs dicen working-tree changes, de modo que se deja explícita la ambigüedad entre cambios unstaged estrictos y todos los cambios por entregar: no se declara regresión contra garantía de staged que no está escrita. Recomendación: unir staged diff + unstaged + untracked y deduplicar, o nombrar scope unstaged y ofrecer staged aparte; tests con rename, deletion, espacio y newline en nombre (git output actual usa separador newline). Confianza alta de comportamiento, media de defecto producto; coordinador puede clasificar como limitación documentable si scope es deliberadamente unstaged.

## Otras observaciones sustentadas que requieren control posterior

- Database factories crean conexión cada llamada y no exponen close en IDatabaseDriver/IQueryDriver aunque db.close existe en tipos privados; probes y schema nunca la cierran. No se atribuye fuga fd cuantificada sin better-sqlite3 ni carga real. Path dsn es config de host, no argumento de herramienta; no etiquetar cualquier ruta DB fuera workspace como traversal.
- Database tiene dos renderers ER distintos: público renderErd sanea nombres de tabla; herramienta db_erd usa buildMermaidEr que emite nombres de tablas/columnas directamente. Un nombre SQLite con espacios/reservadas puede romper diagrama; no se afirma XSS ni escape a JS. Falta ejecutar parser Mermaid real sobre esas entradas.
- Triage `_draft` se calcula y descarta cuando writeProposal=false; respuesta dice «draft ready — pass it...» pero no incluye draft en payload. hasBotReply se calcula y nunca evita repetir respuestas; reintento puede duplicar comentarios/propuestas. No se reintentó contra servicio externo.
- Security deps declara includeOsv «only network call» y entry knowledge «offline unless includeOsv», mientras ejecuta audit CLI sin offline flag; audit aggregate sí documenta network. No se hizo tráfico npm para demostrar privacidad. CLI effects y manifiesto no deben prometer offline inconsistente.
- Security OSV usa versión mínima extraída por regex del rango package.json (no lockfile resuelto), errores/timeout retornan [] sin skipped. Es enriquecimiento best-effort, no prueba del estado de la versión instalada.
- Security audit aggregate real ejecuta secrets+dependency CVEs+licenses, no SAST pese README/entry copy que lo afirma. Security SAST fallback se distingue internamente por source pero tool omite source; no se comparó calidad real semgrep/ast-grep ni validez config CLI externa. Fakes existentes no prueban esas integraciones.

## Fortalezas y negativos

Database: parametrización por array y named args, rechazo DDL explícito, dryRun predeterminado true; redactDsn tiene algoritmo lineal y casos prolongados, quoting de identificadores SQLite evita interpolación arbitraria en PRAGMA de introspección. No impide INT-DB-01 ni normalización incorrecta. ER filtros mantienen relaciones entre tablas seleccionadas.

Triage: privado y fuera de presets, no llama LLM ni consume tokens de proveedor; gh argv array sin shell, máquina declarada en todos comentarios mediante withBotNotice; counter id compartido y path caller checkout. Analizador se presenta honestamente como keyword mechanical, no inteligencia semántica.

Security: patrones conocidos y matches parcialmente redactados; regex nueva por regla evita lastIndex compartido; guard zero-width. Cwd de scanners resuelto effective containment incluye symlinks; tests escape/symlink/nested existen y se leyeron. Real lector seguro evita dereferenciar fuera del workspace. Audit output procesa stdout/stderr con redactSecrets antes parse. CLI boundaries no evalúan contenido como comandos shell.

## Siguiente acción / continuidad

El lote no está cerrado: completar container, remote-provider-core, forge/github/gitlab, issues, observability/error-reporting, y lectura remanente de seis plugins iniciales. Después contraste con auditorías previas, pruebas de integraciones no instaladas y reconciliar scores. No declarar 17 plugins auditados con sólo tres fichas nuevas completas. Ledger por fichero es la autoridad de lectura de esta tanda.

## Lote container — lectura completa y evidencia previa preservada

Lectura íntegra 32 archivos de producción + 19 specs (incluye una integración Docker condicional que **no se ejecutó**), README/package. `fichas/container.md` contiene las seis dimensiones. No se repitió suite. Desde la instrucción posterior del coordinador no se ejecutarán nuevas pruebas de seguridad: prosigue revisión estática de funcionalidad/calidad/contratos/producto/costes.

### INT-CON-01 — P1 confirmado mediante fake antes de restricción posterior — Compose pierde flags de riesgo

SHA común. Ubicación `plugins/container/src/lib/compose/compose-parser.service.ts:50-70` proyecta name/image/build/ports/environment/mounts y descarta privileged/network_mode/pid/ipc; `plugins/container/src/lib/tools/container-docker.tool.ts:274-277` calcula riesgos sólo desde mounts. Expected contrato README:138 y descripción tool :180: compose up aplica confirmRisk a todos los servicios peligrosos. Observado: flags de alto riesgo nunca llegan a containerRisks; un `confirm:true` ordinario basta para camino de ejecución.

Repro **ya realizado** `repro-container.ts/.log`: compose.yaml en Git/filesystem temp con privileged:true, network_mode:host, pid:host; parseCompose retorna sólo cinco campos inocuos y handler up con confirm:true sin confirmRisk llama exec falso `docker compose -f compose.yaml up -d unsafe`, resultado ok:true. No daemon, red, imagen ni privilegio real ejecutado. Prueba acredita decisión del gate/argv; impacto real condicionado a daemon y servicios de compose. Causa pérdida de información antes de autorización. Solución mínima preservar campos de riesgo en IComposeService y pasarlos al mismo containerRisks; dependencias iniciadas por compose también deben contemplarse. Regresión propuesta (no ejecutada en esta tanda): todos flags de riesgo directos/compose, ausencia confirmRisk -> cero exec; confirmRisk aprobado -> argv exacto. Confianza alta del gate y trazado. Relación previa: nuevo independiente, contraste pendiente.

G61-MCP01 (alias local INT-MCP-01) también aplica a `container-inspect.tool.ts:51`, `container-lint.tool.ts:57` (logs), y `container-build.tool.ts:93-94`: outputSchema raíz union. Análisis estático SDK ya demostrado en otro componente; no se ejecuta nuevo repro container SDK. Root confirmó path native falla y managed/adaptive brokered puede funcionar; no generalizar indisponibilidad a todos los modos.

Observaciones de producto/calidad: entrypoint describe sólo inspection y package summary read-only pese 11 tools de escritura/lectura. `container_build` usa un camino exec diferente sin workspaceRoot/cwd inyectado, por lo que contexto '.' depende del cwd proceso del host; docker tools nuevas sí usan callerCheckout executionRootOr. Es una inconsistencia de contrato funcional; no se accedió archivo externo. Manifest budget static6200 B es declarado y fechado, no medido en esta tanda. Dos parsers Docker/K8s paralelos con contratos rows/skipped vs items sin skipped; la ruta pública tool utiliza los parsers simples, cuyas specs sólo prueban vacío/malformed. Tres specs legacy contienen literalmente expect(true).toBe(true), no verifican runtime. Hay integración real Docker condicional que crea/limpia redes y volúmenes propios; no se cuenta como ejecutada.

## Tanda estática retomada — remote-provider-core

Lectura completa de producción y seis specs cerrada; ficha `fichas/remote-provider-core.md`, nota6/10. Nuevos hallazgos estáticos INT-RPC01 timeout retirado antes del cuerpo (`http-client.ts:538`); INT-RPC02 replay concurrente de una mutación fallida se transforma en ok:true duplicado (`mutations.ts:324`, `duplicateFromReplay:179`); INT-RPC03 maxRelevantJobs positivo trunca evidencia/jobs aunque su comentario lo niega (`diagnostics.ts:452–461`), con artifacts sin parcialidad propagada. No ejecuciones nuevas ni tráfico. Certeza causal alta por ramas explícitas, comportamiento integrado y magnitud pendientes de ensayo autorizado. La biblioteca no aporta schemas MCP propios: límites bytes/lines son post-descarga y no dan un presupuesto de transporte.

## Cierre de parcial inicial — web-fetch

Producción completa7 archivos y4 specs leídos; ficha7/10. Se conserva NET-02 (Location malformado throw) de faseA. Nuevos detalles estáticos de calidad: generado omite nullable contentType, opción no strict aunque comentario promete rechazo, descripción señala key obsoleta `plugins.web`, documentación de presets difiere manifiesto. Streaming sí mantiene timeout durante cuerpo, contraste favorable con remote-provider-core. Cero ensayos nuevos.

## Cierre estático — observability

Todos producción/specs/metadata leídos. Ficha4/10: cálculo local razonable, integración remota insuficiente. INT-OBS01 doble fetch (primero sin auth, luego directo sin cap ni comprobar status); INT-OBS02 Datadog parser siempre[], Sentry ruta projects frente mapper issues envelope (compatibilidad API no consultada); INT-OBS03 orden desc archivos+slice cola selecciona diarios antiguos cuando limit pequeño. Medición p95 cuenta payload JSON previo a envelope, no wire total. Lecturas y errores se silencian como vacío, falta parcialidad. Sólo hallazgos estáticos, sin ejecución nueva.

## Cierre de parcial inicial — browser

Lectura producción completa +6 specs/metadata; ficha5/10. G61-MCP01 conserva alcance modo native. Defectos/limitaciones estáticos: instalar Playwright no aporta adapter aunque hint lo sugiere; entry copia métodos sin bind; query dice bounded pero no pasa límite ni usa planner; sin caps HTML/axe/assertions ni timeout propio. Screenshot timestamp puede colisionar. Verify es heurística de cadenas, no prueba de render. Sin ejecuciones nuevas.

## Cierre de parcial inicial — execution-env

Toda producción +13 specs/helper/metadata leídos; ficha6/10. Hallazgos estáticos INT-EX01 deps Compose pueden quedar tras teardown no-op; INT-EX02 límites cacheados prepare sin vínculo al archivo leído por exec; INT-EX03 env docker-exec no pasa dryRun con runner inyectado. Cero herramientas propias. Coste proceso: buffer output sin cap y timeout opcional, arranque por comando Compose. No Docker/SSH nuevos ni ejecución de pruebas esta tanda.

## Cierre estático — forge

Producción completa y28 specs+metadata leídos; ficha4.5/10. INT-FOR01 release omite draft/prerelease/target/notesFile y éxito viola schema;02 timeout config ignorado;03 filtros path/page/kind búsqueda ignorados;04 finalize requiere SHAs que reader normal no devuelve;05 transaction run considera éxito retorno business ok:false;06 error CLI JSON puede dar éxito vacío. G61-MCP01 union transversal sin duplicar. Promoción release con target policy/gates es fortaleza; falta adapter real. No CLI remoto, tests nuevos ni coste externo.


## Cierre github (lectura completa)
30 archivos / 8870 líneas, siete specs, ficha fichas/github.md nota5/10. INT-GH01 prefijo Enterprise perdido en mutaciones; INT-GH02 maxMs logs no limita tiempo; INT-GH03 búsqueda de diagnóstico sin hidratación y error PR perdido. Hallazgos estáticos, sin nuevas suites/proveedores. G61-MCP01 y INT-RPC01/02 referenciados como transversales. Ledger ahora 11/17 completos; pendientes api, external-mcps, usage-tracking, gitlab, issues, error-reporting.
