# Reproducción segura de las evidencias

Todas las pruebas explícitas usan fixtures temporales, valores ficticios y como máximo HTTP loopback. Nunca ejecutarlas sobre un repositorio real ni cuentas personales. Los tests existentes usan sus fixtures. No se requiere proveedor ni cuota de pago.

## Preparar el código

Desde un clon que contiene el SHA, fija DELENDAI_AGENT_ID a tu identidad real según reglas actuales. Extrae con `git archive 514758e783620c8953079be4d71fceccacb3de8b` en un directorio temporal fuera del repo. Mantén sourceRoot separado del artefacto documental y de las fixtures. Instala las dependencias del snapshot con lock congelado, o reconstruye todos los enlaces por workspace; enlazar sólo node_modules raíz puede omitir tipos locales (como se observó con database). @delendai debe resolver al snapshot, no al checkout vivo. No ejecutes init/adopt/migraciones del proyecto real.

## Materializar scripts

Las fuentes y resultados JSON originales se conservan literalmente con sufijo adicional `.txt` para que sean evidencia documental y no entren como código de producto en compilación/lints. Los informes citan sus nombres originales, anteriores a ese sufijo. Copia evidence/ a un scratch propio, retira únicamente ese sufijo de `*.ts.txt` y `*.json.txt` y conserva subdirectorios root/ui/concurrency/orchestrator. Ajusta las cadenas siguientes en las copias, conservando los originales con sus hashes:

- `/tmp/delendai-audit-20261019-L2whP7` → raíz del snapshot reconstruido.
- `/tmp/delendai-audit-evidence-root` → scratch/root.
- `/tmp/delendai-audit-evidence-ui` → scratch/ui.
- `/tmp/delendai-audit-evidence-concurrencia` → scratch/concurrency.
- `/tmp/delendai-audit-evidence-orchestrator` → scratch/orchestrator.

Los scripts de concurrencia conservan barreras/estado: usa un scratch nuevo cada vez. Tras materializar, comandos básicos desde el snapshot con la identidad actual exportada:

```text
bun <scratch>/orchestrator/repro-cli-rollback.ts
bun <scratch>/orchestrator/repro-cli-claim.ts
bun <scratch>/orchestrator/repro-mutex.ts
bun <scratch>/root/repro-purge-disjoint.ts
bun <scratch>/concurrency/repro.ts
bun <scratch>/concurrency/extra.ts
bun <scratch>/concurrency/g51-same-target.repro.ts
bun <scratch>/root/repro-account-api-valid.ts
bun <scratch>/root/repro-project-identity.ts
bun <scratch>/root/repro-env.ts
bun <scratch>/root/repro-deps.ts
bun <scratch>/root/repro-i18n.ts
bun <scratch>/ui/repro.ts
bun <scratch>/ui/repro-parser.ts
bun <scratch>/ui/repro-external.ts
bun <scratch>/ui/repro-dashboard.ts
bun <scratch>/root/compare-surfaces.ts
```

`extra.ts` conserva el primer fixture de cuenta con etiquetas antiguas; la prueba de cuenta válida es repro-account-api-valid.ts. No reemplazar un test de proveedor real por esas simulaciones ni presentar sus salidas como llamadas facturadas.

`g51-same-target.repro.ts` stressa el tool público con dos procesos reales (30 rondas, IDs de tarea distintos, mismo archivo) y mide ENOENT del lector físico mientras `writeFileAtomic` reemplaza el fichero (1.000 writes/4 readers). Exporta `AUDIT_SOURCE_ROOT` al snapshot extraído y `DELENDAI_AGENT_ID` a la identidad real del auditor. Los errores de la segunda parte muestran la fragilidad del reader durante reemplazo; no son por sí solos evidencia de doble grant en el tool.

## Suites y mediciones

Las suites de plugin usan cwd del propio plugin para respetar includes relativos: `bunx --no-install vitest run --config vitest.config.ts --maxWorkers=1 --reporter=default`. Las suites focales de propuestas/runner y UI detallan selección exacta en sus informes y logs. La medición de cada definición usa SDK memoria; la comparación de modos usa composition root real. Incluir texto y structured evita excluir parte del resultado; JSON-RPC en memoria no mide cuotas ni el contexto privado del host.

Los hashes de files.json corresponden al git archive original anterior al build. Los de evidence-manifest.json corresponden a los documentos originales preservados, no a copias cuyos imports se ajustaron. No se garantiza reproducción idéntica de duración/PIDs/paths temporales; se comparan invariantes y resultados.
