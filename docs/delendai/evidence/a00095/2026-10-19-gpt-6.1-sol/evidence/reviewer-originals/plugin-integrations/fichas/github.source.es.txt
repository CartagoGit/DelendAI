# github — ficha completa de lectura, nota provisional 5/10

Fuente SHA 514758e783620c8953079be4d71fceccacb3de8b. Leídos íntegros los 30 archivos del inventario (20 producción con manifest, siete specs y tres metadatos), 8870 líneas; SHA256/rangos por archivo en coverage.json. Revisión estática de esta tanda: ninguna suite nueva, ningún proveedor ni credencial real. Nota integra fortalezas y defectos funcionales demostrables por fuente; no certifica GitHub.com/Enterprise real.

## Funcionalidad

23 herramientas de lectura y nueve mutaciones opt-in, contexto, repositorios/issues/PR/commits/checks/workflows/jobs/artifacts/releases/tags/deployments. Las lecturas preservan prefijo Enterprise y entregan pagination/rate/request metadata. Mutaciones comparten ejecución auditada, confirm:true y clasificación de duplicados. Diagnóstico exportado adapta evidencia al motor remoto.

**INT-GH01 P2, estático:** mutaciones Enterprise pierden `/api/v3`: mutations.ts:395 usa ejecutor genérico con baseUrl=context.apiBaseUrl y rutas absolutas `/repos/...`; remote-provider-core/src/lib/http-client.ts:209 hace new URL(path,base). Read client.ts:223 elimina slash inicial y sí conserva el prefijo. Ejemplo deductivo: base https://ghe.example/api/v3 y /repos/o/r/issues/1 produce https://ghe.example/repos/o/r/issues/1. Tests de escritura usan sólo api.github.com; prueba Enterprise cubre lectura, no mutación.

**INT-GH02 P2, estático:** jobs_logs anuncia maxMs hasta 60s (catalog.ts:1539) pero sólo comprueba maxMs<=1 después de descargar todo (1589); el resto de valores no influye en plazo, señal ni truncamiento. HTTP limpia timeout antes del body (client.ts:565–567; mismo patrón INT-RPC01). La opción no limita tiempo/bytes de descarga; maxLines/maxBytes recortan únicamente resultado ya buffered.

**INT-GH03 P2, estático y documentado por specs:** diagnóstico sin runId selecciona run y detail pero no hidrata jobs/artifacts/logs (diagnostics.ts:563–602); PR-only retorna null con comentario referido a mocks (553–560). specs diagnose-github-workflow:973–997 fijan explícitamente run.jobs=[] para búsqueda. La ruta runId sí hidrata:440–550. El fallo de lookup PR se pierde, deja review.errors=[] (spec288–308). Se necesita trasladar errores y reutilizar hidratación tras seleccionar run.

## Contratos

Todos los sobres raíz union están afectados por G61-MCP01 transversal en NATIVE; MANAGED/ADAPTIVE resuelto según repro del core, sin duplicar hallazgo. Specs capturan registerTool falso, llaman handler y safeParse Zod: no cubren transporte SDK real. El cliente admite responseSchema, pero catálogo usa any y mapea valores inválidos a id0/strings vacíos; un 200{} puede parecer entidad válida. context.readOnly=true se mantiene aun al habilitar mutaciones. Pagination de muchas listas sí es explícita; PR comentarios/reviews y workflow_run jobs sólo primera100 y no señalan parcialidad; input limit200 puede devolverse como perPage200 aunque query clamp100 (catalog:711).

## Seguridad y control (sólo lectura estática)

Token desde env, fuera de contexto/salida normal; errores redaccionados y pruebas con token sintético. Variables de repositorio se proyectan sin value. Mutaciones no se registran por defecto y exigen confirm antes de transporte; no se ejecutó ninguna. El idempotency cache es por instancia, sin TTL/persistencia: no garantiza exactly-once tras reinicio; INT-RPC02 concurrente fallido heredado. Payloads/logs exitosos se devuelven tal cual: promesa README de redacción no debe interpretarse como sanitización universal de texto remoto. persist escribe cache aunque lectura declara network-only; no se probó bypass de política.

## Calidad y pruebas

Siete specs completos leídos: configuración/precedencia Enterprise, cliente retry/error/schema, catálogo pagination/truncation/persistencia, confirm/idempotencia y diagnóstico con errores/mapping. La suite de diagnóstico extensa reconoce varios comportamientos defectuosos y los fija como actuales, no como corrección. No ejecución en esta tanda. Cliente HTTP copia más de600 líneas del motor común y hereda su body-timeout; duplicación de entity schemas/mappers y barrels de una línea complica mantener parity. index.ts:167–175 captura toda resolución inválida como ausencia de token, degradando mensajes de configuración. No prueba real externa de API/rate/Enterprise, paquete publicado ni política core para persistencia.

## Tokens y costes

Sin gasto ni medición tokenizer/USD. Esquemas de32 herramientas si allowWrite y todas visibles implican tax significativo; no atribuir ahorro a este plugin. Envoltorio toolJsonBounded limita salida serializada después de pedir datos completos; descarga logs sin cap propio y recorte byte-a-byte con Buffer.byteLength en bucle puede ser cuadrático. Diagnóstico runId hasta10 logs paralelos por defecto; sólo primeras100 jobs/artifacts. maxLogDurationMs clasifica a posteriori, no aborta; duration en bucle tras Promise.all puede incluir espera de hermanos (diagnostics493–513). Cache de logs usa jobId sin owner/repo; snapshots repo.json/artifacts por runId pueden colisionar/sobrescribir entre repos o páginas. Sin TTL de snapshots/idempotency.

## Producto y valoración

Superficie REST amplia, opciones strict, read-only por defecto y recibos de escritura son fortalezas utilizables con validación adecuada del modo. Manifest describe read-only/future tools aunque entry ya publica mutaciones; contexto readOnly siempre true confunde observabilidad. Prioridad: prefijo Enterprise, presupuestos de logs reales, composición NATIVE y diagnóstico completo/error-preserving. Nota provisional 5/10: amplitud y pruebas locales sólidas, contratos y límites publicitados todavía inconsistentes. Pendiente validar API real y empaquetado sin credenciales/gasto no autorizado; ausencia de esa validación explícita.
