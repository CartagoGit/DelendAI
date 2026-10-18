# Índice de hallazgos, severidad y trazabilidad

Estos 22 hallazgos se refieren al mismo snapshot. Las reproducciones de permisos/cuentas usan valores ficticios y fetch simulado; no se consumieron cuotas ni se usaron credenciales reales. Los subagentes son del mismo modelo, no revisores adicionales de consenso. P0: ninguno demostrado.

Los detalles enlazados contienen esperado/observado, cadena y ubicación, código, reproducción/evidencia, impacto, causa, corrección y regresión. Toda corrección se difiere a propuesta hija, sin inventar IDs ni alterar estados. Confianza alta respecto del comportamiento acotado; los límites de integración se conservan en cada informe.

| ID | Prioridad | Hallazgo | Evidencia | Contraste |
|---|---|---|---|---|
| ORCH-01 | P1 | [Rollback borra .git](core-cli-migrations.md#orch-01) | [repro-cli-rollback.json](evidence/orchestrator/repro-cli-rollback.json.txt) | Ampliación de D7/G38: pérdida de ámbito, además de escritura atómica. |
| ORCH-02 | P1 | [Claim sobrescribe una ref destino ocupada](core-cli-migrations.md#orch-02) | [repro-cli-claim.log](evidence/orchestrator/repro-cli-claim.log) | Nuevo en contribución independiente; no se halló equivalente en a00095 leído. |
| ORCH-03 | P1 | [Mutex roba lock vivo tras TTL y release borra al nuevo dueño](core-cli-migrations.md#orch-03) | [repro-mutex.json](evidence/orchestrator/repro-mutex.json.txt) | Matiza positivos G15/D16; no afecta a la primitiva distinta withFileMutex. |
| C1 | P1 | [Misma slice concedida a dos agentes; ownership diverge](concurrency-batuta.md#c1) | [extra-results.json](evidence/concurrency/extra-results.json.txt) | Distinto de D1/D2: falta comparación de identidad dentro de sección crítica existente. |
| C2 | P1 | [Transporte API ignora política de cuenta y credentialEnv](concurrency-batuta.md#c2) | [repro-account-api-valid.log](evidence/root/repro-account-api-valid.log) | Matiza G25: CLI de cuenta sí aísla; esta ruta API omite la guardia. |
| NET-01 | P1 | [Carga OpenAPI elude allowlist y límite de tamaño](ui-security-tokens.md#net-01) | [repro.log](evidence/ui/repro.log) | Amplía seguridad G16: bypass en cargador distinto del motor seguro web-fetch. |
| ORCH-04 | P2 | [Provenance solicitado no se propaga al publicador npm](core-cli-migrations.md#orch-04) | [report.md](evidence/orchestrator/report.md) | Nuevo en contribución independiente, estado npm remoto no verificado. |
| ORCH-05 | P2 | [Plan CI omite gates para cambios en sus propios scripts](core-cli-migrations.md#orch-05) | [repro-ci-scope.json](evidence/orchestrator/repro-ci-scope.json.txt) | Nuevo escenario específico; no afirma ausencia de todo build en CI. |
| C3 | P2 | [Ledgers por workspace permiten reservar el mismo pool compartido](concurrency-batuta.md#c3) | [results.json](evidence/concurrency/results.json.txt) | Aceptación Batuta S4 promete ámbito máquina; código usa pluginCacheDir del workspace. |
| C4 | P2 | [Segundo intento tras cuarentena de ledger interpreta cuota vacía](concurrency-batuta.md#c4) | [extra-results.json](evidence/concurrency/extra-results.json.txt) | Nuevo caso de recuperación; primer rechazo sí cumple fail-closed. |
| C5 | P2 | [Corrupción de tabla de locks se vuelve vacía y se sobrescribe](concurrency-batuta.md#c5) | [extra-results.json](evidence/concurrency/extra-results.json.txt) | Diferente de carrera D1/D2; depende de registro principal vacío/desincronizado. |
| API-01 | P2 | [Parser pierde nullable y restricciones antes de validar](ui-security-tokens.md#api-01) | [repro-parser.log](evidence/ui/repro-parser.log) | Nuevo en contribución independiente; no se acepta test del validador solo como integración. |
| NET-02 | P2 | [Location malformado produce excepción sin resultado tipado](ui-security-tokens.md#net-02) | [repro.log](evidence/ui/repro.log) | Nuevo caso de error; sin demostrar caída global del servidor. |
| UI-01 | P2 | [Dashboard serializa funciones con dependencias ausentes](ui-security-tokens.md#ui-01) | [repro.log](evidence/ui/repro.log) | Nuevo defecto de ejecución de detalle; no es una alegación XSS por escape/CSP. |
| TOK-01 | P2 | [Dashboard anuncia ahorro fijo del 18% sin baseline](ui-security-tokens.md#tok-01) | [repro-dashboard.log](evidence/ui/repro-dashboard.log) | Amplía G4: calidad de medición, no presión de tools/list únicamente. |
| TOK-02 | P2 | [TokenTax presenta schema heurístico como dato exacto](ui-security-tokens.md#tok-02) | [repro.log](evidence/ui/repro.log) | Amplía G4: metadato estimated incorrecto; structuredContent sí cuenta en core. |
| EXT-01 | P2 | [Proxy no permite missing-env en outputSchema](ui-security-tokens.md#ext-01) | [repro-external.log](evidence/ui/repro-external.log) | Caso concreto de desalineación de schema, relacionado con familia D4/D10. |
| G61-ENV-01 | P2 | [Valor .env se devuelve en error enum](independent-scanners.md#g61-env-01) | [repro-env.log](evidence/root/repro-env.log) | Nuevo en fase independiente; sensibilidad depende de la variable validada. |
| G61-DEPS-01 | P2 | [Fallo/timeout de audit se presenta sin hallazgos](independent-scanners.md#g61-deps-01) | [repro-deps.log](evidence/root/repro-deps.log) | Nuevo en fase independiente; no demuestra vulnerabilidades actuales de dependencias. |
| G61-I18N-01 | P2 | [Catálogo corrupto desaparece e idioma base cambia](independent-scanners.md#g61-i18n-01) | [repro-i18n.log](evidence/root/repro-i18n.log) | Distinto de G8/D11 sobre cobertura de idiomas/gates; falla lectura JSON. |
| G61-CONFIG-01 | P2 | [Remotos en puertos distintos comparten archivo personal](independent-scanners.md#g61-config-01) | [repro-project-identity.log](evidence/root/repro-project-identity.log) | Nueva reproducción sobre observación pendiente de contribución core de este modelo. |
| ORCH-06 | P3 | [Bootstrap niega mirrors dist que el builder crea](core-cli-migrations.md#orch-06) | [report.md](evidence/orchestrator/report.md) | Incoherencia confirmada; descarta diagnosticar como inexistente el bin dist de smoke. |

## Pendientes de reproducción y descartes

- UI-WEB-01: probable P2, producer/consumer de eventos recovery incompatibles; navegador/hosting real pendientes.
- Identidad humana de ack externo: pendiente de comprobar en host; no se declara bypass por el booleano aceptado.
- Journal de migraciones read-modify-write: riesgo estático, barreras exteriores incompletas; no añadir como pérdida confirmada.
- D1/D2 tal como se alegan: no confirmados en el engine público por mutex exterior. La ausencia histórica de test de dos procesos deja de ser una generalización válida: el snapshot tiene concurrent-claims.spec.ts y esta tanda añade procesos reales. Véase contraste.
- Diferencias de escapeHtml: no se confirmó una cadena explotable; unsafe-inline por sí solo no prueba XSS.
- Fallo inicial database en build: dependencia de tipos por workspace no reconstruida; build focal con enlace restaurado exit 0. No se registra como defecto del producto.
- No se demostraron instalación limpia, proveedores reales, compatibilidad completa de Windows ni una nota global válida.
