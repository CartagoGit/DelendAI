# Fase B — contraste acotado con el libro de auditoría conjunta

Snapshot de esta tanda: `514758e783620c8953079be4d71fceccacb3de8b`. Primero se guardaron inventario y hallazgos propios. Después se leyó el libro conjunto del snapshot, con revisiones de otros SHA. Ningún resultado antiguo se transporta a éste sin comprobarlo. Este contraste sigue parcial; no se actualiza reviewers-completed ni se suma a los subagentes como modelos distintos.

## D1 y D2: arbitraje por cadena completa y procesos

**D1, carrera de purga alegada: no confirmada en el camino público inspeccionado.** `engine.ts:151` toma `withFileMutex(getFileLockTablePath(deps), () => executeLockAction(...))` antes del read-modify-write de las acciones mutadoras. `execute-lock-action.ts:61` llama a readSynchronizedLock dentro de ese callback. La helper lock-store no toma mutex por sí misma, pero ésa no es evidencia de que su caller lo omita. Los callsites de `readSynchronizedLock` localizados son claim y heartbeat en el dispatcher; cleanup y session release toman el mismo mutex en lock-lifecycle. Status no usa esa helper ni persiste el lock principal; readLock filtra en memoria y barre temporales.

**D2, claims de taskIds distintos pisan snapshots por falta de mutex exterior: refutado para esa ruta/escenario en este snapshot.** Prueba con dos procesos reales al mismo archivo devuelve una concesión y un lock-conflict; contador bajo withFileMutex conserva 2 actualizaciones y cola 40 enqueues. Esto no prueba que todos los writers existentes del universo sean correctos. No se ejecutó una inyección de caída exactamente entre tabla y registro principal; esa transacción entre archivos sigue pendiente de evaluación.

**El defecto nuevo C1 sí existe y es distinto.** Dos procesos con la misma slice generan igual taskId; la segunda acción entra después del mutex y toma la rama refresh sin comparar existing.agent con caller. Ambos reciben slice-claim y terminan con propietario principal A y tabla de archivos B. No es «ausencia de mutex», sino idempotencia asociada al identificador incompleto. Fuente, PIDs, ambas respuestas y estado final: evidence/concurrency/{extra-results.json,extra.ts,worker.ts}.

**Tests existentes:** la afirmación absoluta «ningún test de dos claims concurrentes» no se sostiene sin precisar snapshot y semántica. Existe `plugins/proposals/tests/src/lib/locks/concurrent-claims.spec.ts`; sus actores/concurrencia deben distinguirse de procesos independientes. Esta tanda aporta esa prueba de procesos y la variante misma slice. No se usa un conteo de archivos spec como demostración de ausencia de cobertura.

**Consecuencia de consenso:** no añado mi nombre a seenBy de D1/D2 como confirmación de sus carreras originales. Tampoco declaro resuelto el subsistema: C1 y C5 permanecen confirmados y se documentan por separado. La recomendación es comprobar identidad y reconstruir resultados bajo la sección crítica existente, sin introducir una nueva capa de coordinación por un diagnóstico incorrecto.

## Contraste adicional

| Afirmación anterior | Dictamen en este snapshot | Evidencia propia / límite |
|---|---|---|
| G15/G16: sin hallazgos de concurrencia/seguridad en aquel barrido | Resultado negativo limitado a aquel alcance, no garantía | ORCH-01/02/03, C1/C2 y NET-01 reproducidos en esta tanda |
| D7/G38: rollback y migraciones mezclan primitivas de escritura | Ampliado por fallo de ámbito de restauración | ORCH-01 demuestra borrado de .git mediante CLI pública y defaults. No es sólo atomicidad de writeFile |
| G25: CLI hereda todo el entorno | Matizado/corregido para CLI de cuenta; API tiene problema distinto | accountEnvironment construye allowlist y valida automation. C2 en factory API con cuenta/proveedor validados omite esa guardia |
| G30: tres selectores de modelos independientes | Matizado | adaptive-optimizer optimize-run.service.ts importa rankProviders del selector; scoreOptimizationCandidate es otra etapa multidimensional. Runner conserva scorer propio. No llamar duplicado a cualquier puntuación distinta |
| G31: cuentas personales sólo en archivo compartido | Resuelto parcialmente en este snapshot, aceptación total pendiente | personal-layer.service.ts y migrador están integrados; guía Batuta ya indica archivo externo. G61-CONFIG-01 demuestra colisión de identidad de remotos por puerto, no inexistencia de capa |
| G32: no observa cuota y trabajo real no probado | Sigue declarado como limitación y no se ha probado lo contrario | guía Batuta «Not proved yet», plan q00034 S3/S7 pendientes. Ledger reserva observaciones inyectadas; no se invocó proveedor real |
| G4: costes/tokens requieren control | Confirmado en problemas específicos distintos de presupuesto histórico | TOK-01/TOK-02 y token-comparison.md. Las cifras antiguas 2433/79900 B no se repitieron para el mismo preset/snapshot |
| G42/D17: escape distinto y unsafe-inline | No se confirma XSS explotable por esos datos solos | Se trazaron contextos de texto/doble comilla y uso textContent; no hubo cadena a atributo ejecutable single-quoted |
| G43: cifras LOC históricas incomparables | Se aporta base nueva reproducible, no se extrapola entre SHA | snapshot: 942104 líneas .ts físicas, incluye 382049 de tests y 8612 bajo patrón generated; otro-ts 551443. No equivale a LOC productivas ni complejidad semántica |
| G44: duplicación de D17 y acuerdos inconsistentes | Observado documentalmente; se conserva texto ajeno | Dos filas D17 visibles en Scoreboard. No se corrigen ni se actualizan votos por otros revisores |

## Contraste aún pendiente

Todos los IDs anteriores de a00095 están indexados en `prior-findings.json` con estado individual: lo no verificado conserva pendiente. No se han revalidado exhaustivamente las auditorías históricas a00001–a00094, ni se reabren documentos congelados. Sus 1175 propuestas done no equivalen a 1175 implementaciones correctas verificadas.

Prueba adicional de contraste: `evidence/root/repro-purge-disjoint.log` conserva tres rondas, dos procesos independientes por ronda con claim antiguo a purgar; en las tres se conservan ambas nuevas claims disjuntas y desaparece sólo la antigua. No prueba ventanas de caída entre archivos ni comportamientos de writers ajenos al engine.

## Actualización tras integrar `develop` (no cambia el snapshot auditado)

La rama de revisión se puso al día con `origin/develop` (`bdaa0905a`, PR #1256; merge de rama `ca1774da3`). El snapshot de esta auditoría sigue siendo `514758e...`; el código posterior y las propuestas f00767/f00768 se consideran contexto del consenso, no evidencia retroactiva de ese snapshot.

El bloque nuevo G51, de glm-5.3-flash, aporta una reproducción más estrecha que las pruebas resumidas arriba: dos procesos ejecutan doble claim del mismo archivo por `runAgentLockEngine`; reporta 21/30 doble concesiones y 3 lecturas vacías/3965 bajo escritura atómica, atribuidas a `loadLock` convirtiendo errores de lectura —incluido ENOENT transitorio del rename— en `emptyLock`. qwen-3.8-flash informa que su storm de 50 rondas por el mismo tool público dio 0/50, aunque confirmó TOCTOU en `tryAcquireFileLocks` exportado y lost-update por `readSynchronizedLock`. Nuestra reproducción previa usó claims disjuntas con purga de una claim antigua; no cubre el caso concurrente del mismo archivo ni refuta G51.

**Reproducción propia contra el snapshot fijado:** el artefacto `evidence/concurrency/g51-same-target.repro.ts.txt` ejecuta 30 rondas de dos procesos independientes, task IDs distintos, claim del mismo archivo y `holder: 'agent'` para que el fin de cada proceso de prueba no se interprete como muerte del dueño. Resultado guardado: 0 doble concesiones y 30 controles correctos (una concesión + un conflicto). El mismo artefacto reemplaza un archivo poblado 1.000 veces con `writeFileAtomic` mientras cuatro lectores usan `SafeWorkspaceReader`; una ejecución produjo 86 `ENOENT` (35 `stat`, 51 `open`) en 169.359 lecturas; la repetición previa, 112 errores en 164.866 lecturas. El log reproducible está en `evidence/concurrency/g51-same-target.repro.result.json.txt`. La ventana de ENOENT sí existe en este filesystem y su orden de magnitud coincide con el 3/3965 de G51. Esto confirma la fragilidad del lector/error mapping, pero no reproduce una doble concesión pública: el stress del tool serializa los writers y no genera los errores en el read-modify-write protegido.

**Arbitraje actualizado:** el código de `loadLock` convierte cualquier error de `SafeWorkspaceReader.readText` en `emptyLock`, y la lectura paralela durante rename atómico reproduce ENOENT. La sección crítica exterior serializa las mutaciones públicas y nuestro test controlado no confirmó el salto de esa lectura vacía a un doble grant en `runAgentLockEngine`; el resultado de glm (21/30) y los re-tests de qwen y esta tanda (0/50, 0/30) discrepan sobre explotabilidad/frecuencia según carga/FS/caso. D1/D2 quedan disputados en cuanto al vector público; no se deben etiquetar como refutados ni como frecuencia establecida. El defecto del helper exportado y C1 siguen siendo rutas separadas. El repro está fijado para que se comparen el mismo input, filesystem, duración del proceso y política de holder.

La tanda nueva también registra G56 sobre el cap de tokens del subagente. Nuestro examen de `BudgetTracker` y `LinearDispatcher` coincide: `subagentExhausted()` existe, pero el loop no lo consulta; el límite se pasa al host y el uso se registra después. Por tanto lo tratamos como confirmación independiente de ese hallazgo y no contamos ORCH-08/09 como duplicados de G56.
