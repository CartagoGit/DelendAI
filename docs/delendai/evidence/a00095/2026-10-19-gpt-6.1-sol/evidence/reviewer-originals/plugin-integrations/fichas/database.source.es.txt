# database — ficha de cobertura completa de fuente

SHA `514758e783620c8953079be4d71fceccacb3de8b`; Codex/GPT-6, 2026-10-19. Lectura completa 13 archivos producción y siete specs en coverage.json. Runtime real better-sqlite3 bloqueado por dependencia ausente; motor real ejecutado con bun:sqlite :memory:. No se repite suite global del coordinador.

**Funcionalidad.** Cinco tools: esquema, probe, query, explain, ERD. Entrypoint y factories sólo implementan SQLite; postgres/mysql son contratos extensibles e identificadores de explain, no drivers actuales. No servidor externo por defecto. README slices done y maturity stable exceden funcionamiento demostrado debido defectos críticos de guardia y SDK.

**Contratos MCP.** Todos registran input/output en fuente, pero query/explain output z.union no se anuncian en wire y SDK falla al validar respuestas válidas (INT-MCP-01). Schemas de esquema/ERD son objetos y proyectan cada campo. Errores de dependencia usan toolError; factory createDriver que arroja ocurre fuera de try/catch en adapters y probe que promete never throws no captura error de open (análisis estático, no factory ejecutada). namedParams y params mutuamente excluidos; explain no declara esa refine, pero motor la rechaza.

**Seguridad/aislamiento.** INT-DB-01 P1: WITH mutante evita allowWrite+confirm; SQL normalización cambia datos/literales (INT-DB-02). Ctor SQLite RW no asegura readonly en conexión; PRAGMA classified read requiere revisión. DSN es configuración del host, no input arbitrario de herramienta. No se probaron archivos ni credenciales reales. Introspección usa quoteIdent, errores engine pasan redactDsn. Conexiones no tienen close público: lifecycle pendiente de medición nativa.

**Calidad.** Dos renderers ERD públicos con fuentes de normalización distintas, buildMermaidEr usado por tool no sanea nombres como renderErd. Tests prueban guard de primeras palabras simples, proyecciones, filtros y errores DSN; faltan CTE/PRAGMA reales, whitespace/comments SQL, ciclo open/close y MCP SDK válido. Siete specs leídos completos, ninguna suite nueva se declara verde por lectura.

**Tokens/coste.** SDK real in-memory tools/list: 4631 B total (1091 input,2218 output), ~1158 tokens estimados ÷4. Cifra reducida por schemas omitidos y por tanto no ahorro sano. Query trae todas rows sin limit/maxRows/paginación y ERD/esquema pueden ser grandes, duplicados texto+structured; no hay medición proveedor ni dólares. Foco de tablas reduce diagramas, no queries.

**Producto.** Missing DATABASE_URL y dependency devuelven hints; ejemplos file:./app.db usan ruta relativa a proceso de factory, no workspace inyectado. Mejoras mínimas: contrato SQL read/write a nivel engine, no reescritura semántica, outputs objetos, conectar lifecycle close y un único renderer ERD seguro; evitar prometer Postgres/MySQL autónomos aún inexistentes.

**Nota provisional: 4/10.** Motor/planners reales, tests y redacción útiles, pero guard mutante burlable y consulta SDK nativa falla; condición para subir: regresiones reales SQL y SDK, dependencia nativa/lifecycle validados. Referencias/evidencias en report INT-DB-01/02, INT-MCP-01 y repros anexos.
