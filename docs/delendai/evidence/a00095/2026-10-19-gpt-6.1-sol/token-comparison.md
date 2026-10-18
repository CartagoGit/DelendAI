# Comparación reproducible de superficies y límites del coste total

Snapshot `514758e783620c8953079be4d71fceccacb3de8b`. Medición de protocolo local, sin modelo ni proveedor ni coste facturado.

## Escenario y resultado

El mismo README temporal se lee con servidor/producto reales y Client SDK en memoria. Native recibe schemas con tools/list y llama directamente; managed/adaptive hacen búsqueda, recuperación del schema mediante resolver/knowledge y llamada mediante resolver. Se incluyen initialize/instrucciones del servidor, JSON-RPC de requests/responses, notificaciones y ambos canales de resultado. Todos devuelven el texto esperado. Los campos son bytes de JSON serializado UTF-8; no incluyen framing stdio/TCP.

| Modo | Tools iniciales | RPC requests (sin notificación initialized) | Bytes enviados | Bytes recibidos | Total JSON-RPC | Tokens estimados ceil(B/4) | Latencia local ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| native | 35 | 4 | 554 | 58427 | 58981 | 14746 | 227.932 |
| managed | 7 | 6 | 930 | 21125 | 22055 | 5514 | 51.137 |
| adaptive | 7 | 6 | 930 | 21126 | 22056 | 5514 | 39.631 |

La reducción de bytes managed/native es 62.6% en **este** escenario; no es un ahorro de tokens observado en un host. Se requieren 2 llamadas RPC adicionales. Una sola pasada y orden fijo no permiten atribuir mejoras de latencia (caches/imports calientes). Las notificaciones list_changed se contaron pero el cliente no hizo relist automático: un host que recargue esquemas necesita su propio escenario.

## Cobertura del ciclo completo

`ui-security-tokens.md` distingue las 14 etapas exigidas. Esta reproducción cubre el subciclo MCP de lectura local. No cubre el contexto privado del host, el razonamiento y planificación de un LLM, conversaciones heredadas por subagentes, tokenización real, gasto/API, recuperación prolongada ni respuesta generada final. No se declara completo el análisis económico de principio a fin.

La factura de proveedor es desconocida; no se asigna $0 a la cuota de una suscripción ni se inventa precio actual. La prueba no invocó proveedores y su consumo de cuota de inferencia externa fue ninguno. Los tokens de esta conversación de auditoría y de los subagentes pertenecen al host, no se midieron y no se incluyen en las cifras.

Core mide texto+structured JSON como wireEstimateBytes; invocation logs guardan responseBytes texto-only. TokenTax reconstruye schemas heurísticos y dashboard fabrica ahorro fijo del 18%: son bases diferentes. Consolidar el desglose medido de core y estado measured/estimated/unavailable por campo, sin ocultar la porción no observable al host.

## Repetición

Fuente y salida íntegra: `evidence/root/compare-surfaces.ts`, `.log`, `.stderr.log`. Ajustar la raíz absoluta del snapshot en el script según `REPLAY.md`. No hay red ni secretos en este escenario.
