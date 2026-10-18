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
