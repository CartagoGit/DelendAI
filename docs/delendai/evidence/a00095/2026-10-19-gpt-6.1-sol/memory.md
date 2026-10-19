# Ficha individual: memory

Auditor: gpt-6.1-sol. Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`. Lectura completa de los 32 archivos de `src`, manifiesto, package y configuración; tres specs completas seleccionadas, no todos los tests leídos. Ledger: `evidence/completion-root/coverage.json.txt`. No modifica producto.

## Funcionalidad y madurez

Implementa memoria de proyecto en JSON, ranking léxico BM25, export/import, TTL y digest explícito. Las nueve herramientas se listan y llaman mediante composición real de core y SDK MCP. El compactador es determinista: no controla ni borra la ventana del host; el ahorro depende de que el host deje de reenviar el contexto anterior. No requiere embeddings, proveedor ni red. La etiqueta stable es defendible para CRUD básico, pero las identidades de notas y la frescura de checkpoints requieren corrección antes de confiarles continuidad sin supervisión.

## Contratos MCP

Registro efectivo native: compact, compaction_check, checkpoint_packet, save, recall, list, forget, export e import. Las llamadas SDK save/list usadas aquí respetan outputSchema y ambas escrituras contestan éxito, aunque la segunda sustituye otra nota por colisión. No se certifican todas las combinaciones de error ni los tres modos. Límites de título/cuerpo/tags se comprueban dentro del handler; los esquemas aceptan inicialmente cadenas sin esos máximos. Los campos unknown de compact/packet ofrecen un contrato menos informativo que sus helpers internos.

El knowledge de `src/index.ts` concatena `_memory_save` al namespace que el builder usa directamente con `_save`: con el prefijo observado `delendai_memory`, anunciaría un nombre repetido. El manifiesto todavía describe cinco herramientas con search/summarise; la superficie real tiene nueve y esos dos sufijos no existen. No confundir este drift textual con una herramienta que el SDK haya listado.

## Aislamiento y persistencia

Las mutaciones save/remove/import/TTL mantienen el RMW bajo el mutex del store y escriben mediante reemplazo atómico. La cuota se decide dentro de esa sección, fortaleza confirmada por fuente y specs. La lectura normal conserva JSON corrupto en cuarentena y falla explícitamente; el sweep TTL lo interpreta como lista vacía (coincido con D90). Import valida solo parte de cada registro (D88); no extrapolo que todos los lectores validen filas individuales.

La redacción ocurre antes de persistir título/cuerpo/tags. El digest no persistido y las secciones de la respuesta no deben considerarse automáticamente redactados por la promesa de redacción **al guardar**. No se inspeccionaron datos personales ni secretos: todas las pruebas usan un directorio temporal propio.

## Calidad y pruebas

Se leyeron completas export-import, store-concurrency y checkpoint-freshness. La concurrencia usa Promise.all dentro de un proceso; es útil para cuota y RMW, pero no demuestra por sí sola comportamiento entre procesos o recuperación de un propietario muerto. Estas suites ya formaban parte del barrido global; no se cuentan nuevamente. Las reproducciones nuevas ejercitan la API de producción y, para la colisión, también el SDK con core real, sin mocks de persistencia.

## Economía de tokens

`tools/list` real native: nueve objetos de herramientas, array JSON de **8.212 B UTF-8**. Solo inputSchemas suman 2.342 B y outputSchemas 3.930 B. La captura de builders con zod.toJSONSchema suma 12.120 B por otra proyección: **no** es el mismo payload y no se usa para inflar el coste real. El manifiesto anuncia staticBytes 4.500 / cap 5.400 con fecha antigua; hay deriva que debe remedirse mediante el comando propietario, sin asumir que su método es idéntico a esta suma.

save y list devuelven el dato por content y structuredContent; el log conserva ambos canales y _meta. Son bytes transportados, no factura ni tokens de conversación. El índice barato y recall selectivo son ventajas reales; compact/repetición del digest y la métrica bytesAvoided no demuestran ahorro frente a un baseline observado.

## Producto y valoración

Configuración pequeña y funcionamiento offline útil; reutilizar el mismo store para checkpoints evita otro almacén. Nota provisional **6,5/10**: buena separación de IO, CRUD, ranking y portabilidad, con cuotas y escritura protegidas; pierde confianza por sobrescritura entre títulos distintos, avisos stale tras actualizar y una métrica llamada ahorro que mide contenido devuelto. Corregir esas invariantes y actualizar catálogo/knowledge aporta más que introducir un nuevo servicio de memoria.

## G61-MEM01 — P2: títulos distintos sustituyen la misma nota

**Confirmado**, API de producción y servidor MCP compuesto, persistencia real en fixture. `deriveNoteId` (`store-records.ts`) normaliza título a kebab y save busca por ese id, sin verificar identidad del título. Guardar `release/v1` y después `release-v1` da dos éxitos, mismo id y una sola nota final: se pierde el primer hecho. La promesa pública es upsert por título. Regresión: títulos distintos con igual normalización deben coexistir o producir conflicto explícito; el mismo título debe seguir actualizándose. No es una carrera ni se resuelve añadiendo otro mutex.

## G61-MEM02 — P2: un checkpoint actualizado sigue considerándose antiguo

**Confirmado**, API real con reloj de entrada inyectado soportado por saveNote. Crear session-digest:work a las 10:00 y actualizarlo a las 11:59 conserva createdAt 10:00 y cambia updatedAt 11:59. El asesor de las 12:00 usa createdAt, declara edad 7.200.000 ms y STALE_CHECKPOINT, aunque el contenido tiene un minuto. Selección y frescura necesitan una noción coherente de revisión del digest. No afirma pérdida del contenido ni compactación automática real del host.

## G61-MEM03 — P2: bytesAvoided cuenta bytes entregados sin baseline

**Confirmado**, lectura real y snapshot de métricas: una llamada devuelve una nota de 53 B (proyección título/cuerpo/tags) y añade exactamente 53 a bytesAvoided. No se mide ninguna lectura evitada; recordSessionDigestReuse suma también el digest entregado. El contador es global al módulo. Es evidencia de uso/bytes recuperados, no ahorro causal. Renombrar o calcular un baseline explícito; no sumar este contador a ahorros económicos. Relacionado con TOK-01/TOK-02 y D36, pero distinto productor y fórmula.

## Repetición y límites

Desde la copia congelada: `bun /tmp/delendai-audit-completion-root/repro-memory.ts` y `bun /tmp/delendai-audit-completion-root/repro-memory-wire.ts`; ambos exit 0. Scripts y logs se conservan en `evidence/completion-root/` con sufijo `.ts.txt` para fuentes de reproducción. El primer comando usa API pública/interna; el segundo conecta SDK Client y servidor mediante InMemoryTransport, llama save dos veces y list. No se probaron transporte remoto, host comercial, Windows ni facturación.
