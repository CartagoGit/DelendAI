# api — SHA `514758e783620c8953079be4d71fceccacb3de8b`

Ficha individual con lectura de las 2.396 LOC de producción del plugin, sus ocho specs (1.861 LOC), `plugin.manifest.ts`, `package.json`, `README.md` y `src/index.ts`. El source del plugin y `web-fetch` coincide con `develop` en esta revisión. Pruebas focales en checkout actual: `bun run --cwd plugins/api test` — 9 archivos, 85/85 tests aprobados en 5,87 s. También se ejecutaron dos repros locales con dobles de `fetch`; no se contactó red real. Las cifras de test son observadas; la ficha no certifica hosts ni servicios externos.

## Funcionalidad y madurez

Resuelve construcción de solicitudes REST a partir de OpenAPI, validación de respuestas JSON y generación de mocks. La implementación real registra `api_call`, `api_validate` y `api_mock`, además de tres entradas de knowledge. La manifest declara `stable`, permisos `process` y `network`, y dependencias `core` + `web-fetch`. El alcance del parser es deliberadamente parcial: no resuelve grafos `$ref`; el comentario de `openapi.ts` declara el límite.

`api_call` construye URL, headers y body de forma pura y envía la llamada de operación mediante `webFetch`. `api_validate` usa ese wrapper por defecto. `api_mock` es puro si recibe un spec inline, pero el plugin entrypoint no inyecta `specFetch`; por tanto `specUrl` se rechaza como `install-required` en el uso normal del plugin (D71). El knowledge ofrece además un shape de salida distinto al contrato renderizado de la tool (D81).

## Contratos

Las tres herramientas usan input estricto y schemas de salida. `api_validate` declara una unión de éxito/error. `api_call` y `api_mock` declaran solo éxito aunque retornan `toolError` en varios caminos; es un caso del hueco de congruencia handler/schema D20, no un hallazgo duplicado nuevo. La prueba de `api_mock` que dice validar N muestras solo confirma `count` y la lista de respuestas por status; no inspecciona una lista de muestras generadas.

El parser conserva un subconjunto de OpenAPI/JSON Schema. Confirmo API-01: elimina `nullable`, `additionalProperties`, `oneOf` y `anyOf` antes de que el validador que sabe interpretarlos los reciba; la reproducción y ubicación detallada están en `ui-security-tokens.md#api-01`. Esto da falsos positivos y falsa conformidad frente a specs ordinarias.

## Seguridad y aislamiento

**P1 confirmado: D40 / NET-01.** `api_call` exige una allow-list no vacía, pero `specUrl` entra por `fetchAndParseSpec`, que llama al `fetch` global con `{}` y no aplica allow-list, redirect manual, `timeoutMs` ni `maxBytes`. La request de operación posterior sí pasa por `webFetch`; el wrapper seguro no protege la descarga previa de la spec. Repro aislado: un `fetch` global doble recibió `http://127.0.0.1:9876/openapi.json` pese a `allowList: ["api.example.com"]`; el stub posterior recibió la operación `https://api.example.com/ping` con su allow-list. No hubo tráfico de red. Esto confirma la ruta alcanzable y el bypass, no demuestra acceso a un servicio interno concreto ni el entorno de red de cada host. Ver D40 y NET-01 para impacto, causa y regresión propuesta.

**P2 confirmado: API-02.** `count: 3` recorre y crea tres valores pero la respuesta serializa solo `samples[0]`, informa `count: 3` y no devuelve colección de muestras. Reproducción de herramienta con spec inline devuelve una sola `selectedBody` y ninguna clave `samples`. La prueba existente pasa porque comprueba el número reportado y `allResponses` por status, no el número de variantes devueltas. Ver `ui-security-tokens.md#api-02`.

La llamada de operación de `api_call` usa allow-list, revisa redirects por salto, limita bytes y tiempo a través del helper compartido. Headers sensibles se redactan antes de incluir request metadata, aunque URL/body/respuesta forman parte intencional del resultado visible al modelo. No encontré persistencia propia, subprocess ni lectura/escritura de archivos en la implementación inspeccionada; el campo `Writes: .../.delendai/cache/api/` de `AGENT.md` no se corresponde con estos sources.

## Calidad, pruebas y cobertura

Los límites entre parser, request builder, validator y mock engine son legibles y las pruebas cubren paths normales y varios errores. 2.396 LOC de producción tienen ocho archivos spec, más un noveno en el conteo ejecutado. Áreas que requieren cubrir integración, aunque el suite actual pase: `api_call` con `specUrl` real contra el mismo wrapper de red, pérdida de límites al parsear specs remotos, y contrato de `count` verificando muestras completas. Los casos de `api_mock.specUrl` del test usan inyección, no demuestran wiring desde el entrypoint de producción.

No añado los problemas D40/NET-01 ni API-01 como votos nuevos: ambos ya están descritos y contrastados por separado. D71, D81 y D20 son hallazgos relacionados del snapshot/contexto de consenso y se conservan como referencias; API-02 es nuevo.

## Tokens y coste

Medición guardada en `ui-security-tokens.md`: definiciones serializadas de tres tools 4.634 bytes; input schemas 1.886 bytes; output schemas 1.533 bytes. Estimación no tokenizada `ceil(bytes/4)`: 1.159 tokens para definiciones. La cifra depende del host y no es factura ni coste por llamada. Las respuestas pueden incluir cuerpo remoto capado para el request real; el fetch crudo de `specUrl` no tiene cap.

## Nota provisional

**5,0/10.** Utilidad concreta, capas razonables y 85 tests focales verdes. La nota baja por el bypass de red/tamaño al cargar specs, la pérdida de keywords de schema que debilita el objetivo de validación y el contrato de `count` que no devuelve las muestras prometidas. No es una certificación de runtime externo.

## Contraste adicional por SDK de la continuación raíz

`evidence/completion-root/repro-api-mock-count.ts.txt` y su log confirman API-02 por core+SDK native, fixture inline, sin red: count3, ninguna colección samples y un único status en allResponses. No es solo callback capturado. G61-MCP01 documenta por separado que api_validate con output Zod union falla en native y tiene éxito por resolver managed/adaptive; esta ficha no certifica la usabilidad uniforme de las tres tools en los tres modos. Los errores isError del servidor compuesto pueden omitir structuredContent incompatible: declarar schema de éxito no prueba por sí solo que todo error viole el protocolo. La cobertura global de api permanece pendiente hasta reconciliar el ledger con esta lectura/ficha; no se eleva automáticamente el total49.
