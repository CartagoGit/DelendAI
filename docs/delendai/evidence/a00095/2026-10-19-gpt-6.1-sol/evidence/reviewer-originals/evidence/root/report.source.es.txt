# Fase A independiente — escáneres, configuración y superficie documental

Auditor gpt-6.1-sol · Codex · 2026-10-19 (Europe/Madrid). Snapshot único `514758e783620c8953079be4d71fceccacb3de8b`. Ninguna conclusión previa fue consultada antes de guardar estos hallazgos. Relación con auditorías anteriores: **pendiente de contraste**, no se atribuye novedad todavía.

## G61-ENV-01 — El validador devuelve valores de .env en errores enum

- **Severidad / estado / confianza:** P2, confirmado, alta: reproducción del handler MCP con archivo sintético real.
- **Componente:** env. **Ubicación:** `plugins/env/src/lib/validate/check-schema.ts:105`, `:130`, `:136`; `plugins/env/src/lib/tools/env-check.tool.ts:164` (retorno de findings).
- **Esperado:** informar clave, línea y categoría sin incluir valores de .env, como promete la descripción de la herramienta.
- **Real:** un valor que no pertenece al enum aparece en `content[0].text` y `structuredContent.findings[].message`.
- **Código:** `message: \`Value "${trimmed}" is not in the allowed enum values.\``. `validateEntry` conserva ese mensaje y el handler lo retorna sin eliminar el valor.
- **Reproducción:** `bun evidence/root/repro-env.ts`; crear `.env` con `MODE=AUDIT_SYNTHETIC_PRIVATE_VALUE` y pedir esquema enum `development|production`.
- **Evidencia:** `evidence/root/repro-env.log`, `syntheticValueLeaksToMcp:true`. Sólo se usaron datos artificiales; ningún secreto real leído.
- **Impacto:** divulgación de valores al contexto y a consumidores del resultado; la sensibilidad depende de qué variable se declare enum. No se ha demostrado persistencia ni exfiltración a un proveedor real.
- **Causa raíz:** construir el diagnóstico con el valor en vez de la clave/tipo. Además `check-schema.spec.ts` exige que el mensaje contenga `staging`: un test ratifica el comportamiento contrario a la promesa de privacidad.
- **Corrección mínima:** omitir el valor en esa rama; conservar clave/línea y conjunto de valores esperados sólo si su publicación es autorizada.
- **Regresión:** invocar handler con valor centinela para cada tipo inválido; verificar que no aparece en ningún canal del resultado. Mantener diagnóstico de clave/línea y validación correcta.
- **Resolución:** diferida; esta auditoría no modifica producto.

## G61-DEPS-01 — Timeout, fallo de red y JSON incompleto se presentan como análisis sin hallazgos

- **Severidad / estado / confianza:** P2, confirmado, alta para la normalización; la reproducción inyecta resultados de proceso, no realiza red.
- **Componente:** deps. **Ubicación:** `plugins/deps/src/lib/services/audit.ts:64`, `:74`, `:120`, `:127`; `packages/core/src/lib/external-tool/render-findings.ts:66`, `:91`.
- **Esperado:** distinguir análisis válido sin vulnerabilidades de análisis que no pudo producir un resultado válido.
- **Real:** exit 1 + `ECONNRESET`, exit 124 + timedOut y JSON truncado devuelven exactamente findings vacíos y todos los contadores cero, sin skipped/nota/error. El renderer produce `bun-audit: no findings`.
- **Código:** `if (run.unavailable) { ... skipped: true ... }` seguido de `return toScanResult('bun-audit', parseBunAudit(raw));`; el parseo erróneo retorna `[]`.
- **Reproducción:** `bun evidence/root/repro-deps.ts`, usando IArgvExec inyectado con tres desenlaces fallidos y control válido `{}`.
- **Evidencia:** `evidence/root/repro-deps.log`; los cuatro desenlaces tienen la misma representación de ausencia de hallazgos.
- **Impacto:** falsa tranquilidad o aceptación incorrecta si un consumidor decide por summary/worst sin comprobar la ejecución por otra vía. No se afirma que exista una vulnerabilidad real en las dependencias actuales.
- **Causa raíz:** la capa consumidora descarta `code`, `timedOut` y la validez del JSON. El protocolo actual del parser fusiona vacío válido y error.
- **Corrección mínima:** resultado de parseo discriminado y propagación explícita de fallo/incompleto. Conservar exit 1 válido con advisories como hallazgo normal.
- **Regresión:** red fallida, timeout, salida truncada, salida vacía, `{}` válido y advisories con exit 1 deben distinguirse. Comprobar resultado MCP y renderer.
- **Ampliación estática/repro:** `realLicenseDeps.listDependencyNames` captura manifiesto corrupto y devuelve []; `scanLicenses` da cero findings también. Confirmado con fixture en el mismo log; se mantiene como parte de la familia de pérdida de errores, no como una vulnerabilidad de licencias demostrada.
- **Resolución:** diferida, sin cambios funcionales.

## G61-I18N-01 — Un catálogo JSON corrupto desaparece del informe y puede cambiar silenciosamente el idioma de referencia

- **Severidad / estado / confianza:** P2, confirmado, alta: handler y adaptador reales sobre dos archivos temporales.
- **Componente:** i18n. **Ubicación:** `plugins/i18n/src/lib/i18n/real-deps.ts:87`, `:97`; `plugins/i18n/src/lib/tools/i18n-validate.tool.ts:114` y cálculo posterior de sourceLocale.
- **Esperado:** detectar un archivo de traducción que no puede parsearse e indicar que el chequeo está incompleto.
- **Real:** con en.json corrupto y es.json válido, ambos handlers devuelven únicamente locales:[es], findings:[], worst:none; validate informa sourceLocale:es.
- **Código:** `catch { // skip an unparseable locale file }` en listLocales.
- **Reproducción:** `bun evidence/root/repro-i18n.ts`; crea en.json `{broken` y es.json con greeting válido.
- **Evidencia:** `evidence/root/repro-i18n.log`, resultados MCP completos de ambos handlers.
- **Impacto:** una rotura de traducciones y de la referencia se presenta como consistencia de las traducciones restantes; puede pasar desapercibida a un agente o gate.
- **Causa raíz:** adapter elimina los errores antes de que checkLocales/validateInterpolation puedan distinguir un catálogo ausente de uno corrupto.
- **Corrección mínima:** entregar errores de lectura/parseo junto con catálogos válidos y propagar estado incompleto y finding con ruta, sin volcar contenido.
- **Regresión:** en.json inválido debe impedir informe limpio; otro idioma inválido no debe desaparecer; control con todos válidos conserva la referencia inglesa.
- **Resolución:** diferida, sin cambios funcionales.

## Fortalezas y resultados negativos

- docs/list/read usan contención física y lectura segura; los límites de catálogo, respuesta y búsqueda reducen salida. Se inspeccionaron engine y entradas de generación. No se afirma ausencia universal de carreras de symlinks ni seguridad de todos los formatos.
- env y ambas herramientas i18n validan el directorio/archivo mediante contención física antes de los adapters reales. No se confirmó escape de symlink en esas rutas. No se confunde la fuga enum con path traversal.
- cache aporta reglas al registro central y excluye unidades/estado del conjunto de políticas; preview es el valor por defecto de su handler. Pruebas existentes comprueban dry-run, aplicación e idempotencia. Aún falta revisión completa del motor central de eviction.
- link-check separa parser puro del filesystem, no recupera URLs externas y limita findings de respuesta a 200; su único spec contiene casos de rendimiento con 40.000 espacios. No demuestra conformidad de todos los dialectos Markdown ni slugging Unicode.
- Las declaraciones zod de FINDING se repiten en deps/env/i18n/link-check. Es una oportunidad de consolidación en un esquema compartido junto al contrato IFinding, no un defecto funcional demostrado.

## Alcance honesto

Se leyeron entradas y rutas relevantes de deps, docs, env, i18n, cache, link-check y perf; perf sólo entrada y superficie de schemas, no motor completo. Las pruebas y bytes se registran por separado. No se califican como verificados todos sus archivos ni todos los contratos negativos. El inventario de los demás plugins no constituye lectura semántica.

## G61-CONFIG-01 — Dos repositorios servidos en puertos distintos comparten archivo personal

- **Severidad / estado / confianza:** P2, confirmado, alta para colisión de identidad/ruta mediante dos repositorios Git temporales. No se consultó configuración personal real.
- **Snapshot:** el de la cabecera. **Componente:** core/personal layer. **Ubicación:** `packages/core/src/lib/plugins/personal-layer.service.ts:43`, `:47`, `:67`, `:93`.
- **Esperado:** repositorios diferentes conservan ámbitos personales diferentes; normalizar clones SSH/HTTPS del mismo repositorio no debe unir servidores distintos.
- **Real:** remotos sintéticos `https://fixture.invalid:3000/team/repo.git` y `:4000/team/repo.git` producen ambos `remote:fixture.invalid/team/repo` y el mismo personalLayerPath.
- **Código:** la expresión del remoto acepta `(?::\\d+)?` y retorna sólo host/path; el puerto se descarta antes del hash que nombra el archivo personal.
- **Reproducción / evidencia:** `bun evidence/root/repro-project-identity.ts`, log del mismo nombre; dos git init independientes, remote add local sin red, `unrelatedServerPortsSharePersonalFile:true`.
- **Impacto:** selección de cuentas/perfiles personales de otro servidor si coinciden host y path. No se demostró uso de credenciales ni gasto, ni se afirma colisión entre repositorios con distintos paths.
- **Causa raíz:** equivalencia de repositorios definida con pérdida de una parte de la autoridad de URL.
- **Corrección mínima:** conservar autoridad y puertos no predeterminados con regla explícita para equivalencia de transportes; migrar la clave personal conservando el archivo previo y evitando mezclar los casos ambiguos.
- **Regresión:** puertos distintos generan claves distintas; clones equivalentes según política documentada conservan clave; no se pierde la capa antigua al migrar.
- **Relación anterior:** reproducción nueva de una observación pendiente de la contribución core de este mismo modelo. Contraste global aún parcial.
- **Resolución:** diferida, ningún cambio funcional.

## Preflight: límite y corrección del entorno

El barrido general de tests se detuvo por límite declarado de 180 segundos; no hay resumen final y no se declara ni pase global ni fallo funcional por ese timeout. Las suites focales tienen logs/resultados propios.

El primer build global retornó 2 por TS2307 better-sqlite3 en el plugin database. Al seguir la dependencia se comprobó que el tipo estaba instalado en `plugins/database/node_modules/@types/better-sqlite3` del checkout original y no en el node_modules raíz enlazado al archivo Git. **Es una limitación de la reconstrucción del entorno**, no un defecto confirmado del producto. Se restauró únicamente ese enlace de tipos en el snapshot y se ejecutó el build focal de database: exit 0, Built 1 package(s). No se repitió ni se presenta verde el build global.

Biome directo retornó 1, con 1 error, 1 warning y 21 infos en 6747 archivos; no se aplicaron fixes. Este comando directo no equivale al wrapper de baseline de `bun run lint`, por lo que tampoco se afirma que el gate canónico falle. El resultado se conserva como medición del preflight exigido.
