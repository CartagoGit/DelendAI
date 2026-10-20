# Fichas de alcance parcial: plugins de lectura, configuración y coordinación

Snapshot `514758e783620c8953079be4d71fceccacb3de8b`. Estas notas son provisionales y no acreditan lectura de todos los archivos. `plugins.json` enumera individualmente los 61 plugins reales con manifiesto, permisos, dependencias y specs; las fichas todavía pendientes conservan nota null. No se fabrica una calificación para cerrar casillas.

Las medidas siguientes son definiciones serializadas por SDK real sin ejecutar handlers de negocio, antes de compaction de wire del core. Preset/opciones pueden cambiar el conjunto. Tokens por bytes/4 serían una estimación; no se confunden con tokenizador ni uso facturado. Pruebas: suites locales, cwd de plugin, logs en evidence/root/tests-*.log.

| Plugin | Tools default | Definiciones B | Input B | Output B | Tests locales | Nota provisional del alcance leído |
|---|---:|---:|---:|---:|---:|---:|
| deps | 5 | 7102 | 773 | 3855 | 73 | 5.5/10 |
| docs | 4 | 3570 | 694 | 1628 | 42 | 7.5/10 |
| env | 2 | 4112 | 650 | 2506 | 64 | 5.5/10 |
| i18n | 2 | 3252 | 230 | 2072 | 20 | 6/10 |
| cache | 1 | 1462 | 156 | 911 | 6 | 7.5/10 |
| link-check | 1 | 1608 | 85 | 1028 | 13 | 7/10 |
| perf | 3 | 4192 | 1152 | 2083 | 21 | N/E: sólo entrada y schemas |

## deps

**Funcionalidad:** inventario/health, licencias, polyglot y árbol implementados; outdated/audit se registran con allowNetwork, install/scripts con allowWrite. Funciona offline por defecto, CVEs necesitan binario Bun y registro. Maturity stable no garantiza recuperación correcta ante fallo.

**Contratos:** schemas de cinco herramientas default se serializan; opciones gatean realmente network/write. Se trazó audit result hasta renderer, que pierde fallos (G61-DEPS-01). Input negativo exhaustivo y todos los errores SDK pendientes. Descripción/readme no sustituyen el conjunto efectivo.

**Seguridad:** lectura de manifiesto y lockfile usa contención física y SafeWorkspaceReader. Network audit y scripts sólo opt-in. No se invocaron scripts ni red de registry. Licencias silencian parseo de manifiesto; no hay CVEs actuales demostradas.

**Calidad:** 9 specs/73 tests verdes; parser audit sólo prueba corrupto->[] y no semántica de ejecución incompleta. Falta regresión que distinga ausencia de hallazgos y ausencia de análisis.

**Tokens:** 7102 B default; payload list compact omite filas y preserva counts; árvore recursivo usa any en salida y su semántica/cap merece lectura ulterior. Audit/installed deps pueden aumentar mucho respuesta. Lazy útil para herramientas ocasionales; no se midió coste completo de instalaciones.

**Producto y nota:** gates claros y uso externo plausible; 5.5 por falsa tranquilidad del análisis fallido. Consolidar outcomes scan sin añadir otro runner.

## docs

**Funcionalidad:** listar, leer, buscar Markdown y generar resúmenes TypeScript. No requiere LLM ni red. Generador retorna documentos; no se confunde con escritura aplicada. Roots/extensions/configurables.

**Contratos:** cuatro herramientas reales; lectura devuelve found/reason/truncated, catálogo con diagnóstico vacío, búsqueda ordenada. Input positivo y contención tienen specs; no todos los schemas negativos fueron recorridos.

**Seguridad:** engine usa contención física y reader seguro, rechaza lectura no Markdown; catálogo stat filtra tamaño. Generación valida cwd y lee por reader. No se afirma prevención de todas las carreras TOCTOU.

**Calidad:** 6 specs/42 tests verdes; se leyeron entrypoint, engine, generador y boundaries. Quedan dialectos, límites de grandes árboles y equivalencia extensiones/listado-lectura.

**Tokens:** 3570 B default, catálogo capado 200 por defecto, read 256Ki caracteres tras lectura; snippets 200 caracteres. Generación devuelve por defecto todo src sin paginación, por valorar antes de utilizar sobre repositorios enormes. Lazy y catálogo antes de body son ventajas concretas.

**Producto y nota:** 7.5 provisional por utilidad externa y límites explícitos; evitar que descripción de «catálogo» oculte el generador. No hallazgo grave confirmado en rutas leídas.

## env

**Funcionalidad:** parseo y validación dotenv, reglas de schema y explicación de capacidades. Sin red/proveedor. Env_explains requiere catálogo inyectado, entrypoint por defecto no lo conecta; vacío es resultado estructural, no descubrimiento real de capacidades externas.

**Contratos:** dos tools, salida zod válida. Handler público con enum inválido contradice promesa «values never included» (G61-ENV-01); mismos valores en texto y structured. No todos los inputs inválidos SDK probados.

**Seguridad:** path validado físicamente y adapter repite guardia. La fuga es de diagnóstico, con lectura autorizada de .env en workspace; no traversal. Fixture artificial demuestra que el valor cruza salida MCP sin red externa.

**Calidad:** 9 specs/64 tests verdes; una aserción del test enum exige que valor aparezca. Hace falta cambiar propiedad de privacidad, no aumentar tests idénticos al código.

**Tokens:** 4112 B; outputSchema de explanation domina 2506 B combinados; findings no tienen cap local. Respuestas ordinarias/error no medidas por tokenizador. Lazy apropiado para diagnóstico ocasional.

**Producto y nota:** 5.5 por contrato de privacidad roto; quitar valor del error y documentar catálogo vacío/no conectado. No añadir redacción heurística que oculte la clave útil.

## i18n

**Funcionalidad:** contraste de claves, uso en fuente, placeholders e ICU. Adapters leen JSON; no traduce textos ni verifica idiomas TypeScript arbitrarios.

**Contratos:** dos schemas se listan; retorno sourceLocale se decide tras lectura. JSON corrupto desaparece y puede cambiar base sin aviso (G61-I18N-01). Token/ICU anidado y dialectos no auditados exhaustivamente.

**Seguridad:** localesDir usa contención física; reader limita las lecturas. Scans de fuente no son ejecución. No se confirmó escape de symlink en tool boundary.

**Calidad:** 5 specs/20 tests verdes; fallos de lectura/parseo deben llegar al resultado. Una matriz superficial sin parse failures no acredita integridad de catálogos reales.

**Tokens:** 3252 B; findings y lista de claves pueden crecer sin cap. Recorrido de todos los archivos fuente puede ser caro en monorepo; no se midió RSS/tiempo de gran proyecto. Lazy no soluciona payload una vez llamado.

**Producto y nota:** 6 por función útil y aislada con falso resultado limpio ante corrupción; propagar estado incompleto y paths fallidos.

## cache

**Funcionalidad:** contribuye políticas declarativas TTL al registro central y ofrece preview/apply. No crea scheduler propio ni elimina unidades por la lista de staticRules.

**Contratos:** una herramienta con outputSchema serializable y error tipado cuando falta registro. dryRun true por defecto; false cambia efecto de una misma herramienta y requiere que el host la autorice según su política, no basta clasificarla como read-only porque default no borre.

**Seguridad:** se inspeccionaron reglas estáticas y el boundary de tool; exclusiones de unidades/datos son ventaja. El motor general de contención/GC sigue pendiente de lectura completa; no certificar seguridad de cualquier regla aportada por otro plugin.

**Calidad:** 1 spec/6 tests reales de filesystem prueban preview/aplicación/idempotencia y preservación de unidades antiguas. Número de archivos spec no mide por sí solo suficiencia.

**Tokens:** 1462 B, reporte removed puede crecer; no se midió sweep grande. Lazy reduce discovery si el host no hace mantenimiento en sesión.

**Producto y nota:** 7.5 en política/tool leídos; claros defaults e integración en autoridad central. Mejorar metadatos de efectos según operación antes de exponer apply a hosts genéricos; pendiente de comprobar protección global actual.

## link-check

**Funcionalidad:** parser puro y enumeración filesystem; detecta links relativos/anchors vacíos y destinos faltantes. URLs externas no se consultan; no valida disponibilidad HTTP.

**Contratos:** una herramienta devuelve resumen total y sólo 200 findings, con truncated explícito. Docs se limitan a 5000 en adapter sin campo de cobertura truncada específico: el truncado de findings no equivale a cobertura de todo repo. No se reprodujo ese límite.

**Seguridad:** lectura mediante SafeWorkspaceReader, excludes deps/cache y sin spawn ni red. No se atribuye injection a texto Markdown analizado como datos.

**Calidad:** 1 spec/13 tests, incluyendo largas secuencias de espacios. Reglas de fence/slug simples no son un parser CommonMark completo; Unicode/escaped parenteses pendientes de comparar con renderer real.

**Tokens:** 1608 B, máximo 200 findings limita respuesta pero resumen/scan no prueban límite de bytes. Esquema común IFinding repetido en varios plugins; consolidación pequeña posible.

**Producto y nota:** 7 provisional; útil externamente, exige explicar dialecto/límites y conectar gate conforme a prioridades del proyecto. No convertir diferencia de parser no demostrada en vulnerabilidad.

## proposals — 5/10 provisional del subsistema de locks y cola

**Funcionalidad:** propuestas, slices, locks y cola implementados; el entrypoint completo y todos los writers no se han leído. **Contratos:** mismos taskIds entre agentes se aceptan por ruta de refresh y devuelven dos slice-claim (C1), distinto de error de schema. **Seguridad:** exclusividad rota y corrupción permisiva C5; taskIds distintos sí se serializaron con mutex. **Calidad:** 82 tests focales verdes y procesos independientes; cola conservó 40 enqueues y mutex recuperó SIGKILL. **Tokens:** no se midió todo el plugin; inventario de catálogo no basta, no se publica coste actual estimado como medido. **Producto:** coordinación extensa, pero no certifica dos dueños; solución mínima comparar identidad bajo mismo mutex y reconciliar corrupción. Falta ficha exhaustiva de authoring/review/GC/SQLite.

## orchestrator-runner — 4.5/10 provisional del alcance Batuta

**Funcionalidad:** routing, adaptadores, consentimiento, reservas y journal implementados con límites expresos; guía reconoce ausencia de invocación real. **Contratos:** schemas/opciones y 209 tests del proyecto, sin recorrer cada input por MCP real. **Seguridad:** C2 confirma con esquemas válidos la omisión de guardia de cuenta en API; C3/C4 comprometen reserva entre roots/recuperación. CLI de cuenta sí aplica allowlist/env/automation, no generalizar bypass a CLI. **Calidad:** proceso ficticio es distinto de proveedor real; ninguna cuota privada ni gasto se observó. **Tokens:** coste total del plugin y selección de modelo no medidos aquí; las heurísticas no acreditan ahorro. **Producto:** no hay prueba consentida de tarea real end-to-end; con cuotas desconocidas rechaza. Unificar política de cuenta por transporte y ledger por pool antes de prometer multicuenta desatendida.

## auto-agent-selector — N/E, lectura parcial

Se inspeccionaron entrypoint, descubrimiento/ranking/eligibilidad y handoffs por el equipo. Ranking coste-dial + calibración es real; default auto-run construye handoff, no prueba una ejecución real. Falta suite propia ejecutada, todos los errores/schemas, coste efectivo y wiring de elegibilidad en cada ruta. No asignar nota ni tratar PATH instalado como cuenta utilizable. `plugins.json` conserva esta limitación y siguiente archivo `src/lib/tools/auto-run.tool.ts`.

## Fichas de los otros seis plugins inspeccionados

`ui-security-tokens.md` contiene fichas individuales de web-fetch (7.5), api (4.5), browser (6), external-mcps (7), execution-env (7) y usage-tracking (6.5), con funcionalidad, contratos, seguridad, calidad, tokens y producto. La validación EXT-01 posterior reduce la confianza en el contrato del proxy externo; su nota sigue siendo provisional y no se interpreta como certificación. Los demás plugins sólo inventariados mantienen nota null y ficha pendiente: no están auditados por tener manifiesto o tests existentes.
