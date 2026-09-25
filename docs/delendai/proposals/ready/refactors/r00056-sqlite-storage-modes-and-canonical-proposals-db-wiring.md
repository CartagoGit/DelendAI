---
id: r00056
title: "SQLite storage modes and canonical proposals DB wiring"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-08
---

# r00056 — SQLite storage modes and canonical proposals DB wiring

## Goal

Centralizar la ruta de proposals.sqlite y hacer explícita la política de fallback/error durante el cutover.

## why

Hay dos problemas distintos y la proposal cubre los dos porque el segundo es
imposible de razonar sin el primero.

**La ruta.** x00533 introdujo `resolveProposalsDbPaths()` y fijó la ubicación
canónica en `<workspace>/.delendai/state/proposals.sqlite`. El reconciliador ya
la usa. El reader SQL que monta el plugin, no: sigue construyendo
`join(workspaceRoot, 'proposals.sqlite')` a mano. Mientras existan dos rutas, el
sistema puede reconciliar contra una base y leer de otra, y todo el aparato de
paridad mide entonces dos cosas que no tienen por qué coincidir. Una divergencia
así no se manifiesta como error sino como datos viejos, que es la forma más cara
de fallar.

**El modo.** Hoy no existe ningún interruptor. Buscar `sql-primary-compare` en el
código no encuentra nada, y `sql-only` aparece únicamente como una variable de
entorno que el propio gate se fijaba a sí mismo para después comprobarla — una
aserción que no podía fallar (x00537 S2). Sin modos declarados, "activar SQLite"
no es una operación: es un conjunto de ediciones dispersas por los call sites, y
no hay vuelta atrás en una línea.

Los tres modos tienen que significar cosas distintas y verificables:

- `shadow` — el legacy responde; SQL sólo compara. Es el estado actual.
- `sql-primary-compare` — SQL responde; el legacy se conserva para comparar y
  regenerar. **Aquí es donde SQLite pasa a ser la autoridad operacional oficial**,
  y no hace falta esperar al mes de soak para llegar.
- `sql-only` — SQL responde y no hay legacy en el camino de lectura. Una base
  ausente o corrupta es un error explícito, nunca un fallback silencioso.

Esa última cláusula es la que da valor a todo lo demás. Un fallback silencioso
convierte cualquier fallo de la base en "funciona pero con datos legacy", que es
exactamente el estado que impide detectar si el cutover está funcionando. Si el
modo dice `sql-only`, tiene que fallar cerrado.

Nada de lo anterior es reversible con seguridad mientras el doctor no pueda
decir en qué modo está, contra qué ruta, cuántos fallbacks se han producido y si
hay paridad. Por eso el doctor forma parte de esta slice y no de una posterior.

## non-goals

- No implementar aquí el cambio completo de autoridad de r00049.
- No migrar el State Engine general.
- No borrar legacy files.

## Slices

- global_gate: none

### S1 — Resolver única de rutas, storage modes y doctor
- **Status**: in-progress — ruta y modos resueltos; la decision de vocabulario esta registrada abajo (2026-09-25)
- **Files**: `plugins/proposals/src/lib/contracts/constants/proposal-index-source.constant.ts`, `packages/proposals-sqlite/src/lib/db-path.ts`, `plugins/proposals/tests/src/lib/services/db-doctor/storage-mode.spec.ts`, `plugins/proposals/tests/src/lib/services/db-doctor.spec.ts`
- **Gate**: type
- acceptance:
  - "Plugin, reconciler, CLI, doctor, exporter y tests usan la misma resolución de DB activa/staging."
  - "No quedan joins ad hoc a proposals.sqlite en los paths operacionales."
  - "shadow permite fallback documentado; sql-primary-compare sirve desde SQLite; sql-only convierte DB missing/corrupt en error explícito y nunca cae silenciosamente a JSON/Markdown."
  - "doctor informa mode, canonical path, fallback count y parity status."

## acceptance

- Plugin, reconciler, CLI, doctor, exporter y tests usan la misma resolución de DB activa/staging.
- No quedan joins ad hoc a proposals.sqlite en los paths operacionales.
- shadow permite fallback documentado; sql-primary-compare sirve desde SQLite; sql-only convierte DB missing/corrupt en error explícito y nunca cae silenciosamente a JSON/Markdown.
- doctor informa mode, canonical path, fallback count y parity status.

## notes

### Estado del arbol frente a este documento (2026-09-14)

Verificado contra `develop`.

**La ruta ya no es el problema que este documento describe.** El unico
literal `'proposals.sqlite'` que queda en el arbol es
`PROPOSALS_DB_FILENAME` dentro de `db-path.ts`; no hay ni un `join(...)`
ad hoc en ningun camino operacional. El lector SQL que monta el plugin
resuelve por `resolveProposalsDbPaths` (con precedencia explicita:
`options.databasePath` → `DELENDAI_PROPOSALS_DB_PATH` → resolucion
canonica desde el workspace), igual que el reconciliador, `db-rebuild`
y `resurrect`. Esa mitad de S1 esta entregada.

**La mitad de los modos necesita una decision antes que codigo.**
`index-reader.ts` ya publica un interruptor de tres valores —
`DELENDAI_PROPOSAL_INDEX_SOURCE` con `json` / `sql` / `auto`, por
defecto `sql` desde f00535 S3 — y `decideIndexSource` ya hace la
comparacion de paridad antes de servir. Escribir ahora un segundo
vocabulario (`shadow` / `sql-primary-compare` / `sql-only`) en un
`storage-mode.ts` nuevo dejaria el repositorio con **dos interruptores
que responden la misma pregunta de forma distinta**, que es exactamente
el defecto que la ADR 0020 se escribio para cerrar.

La pregunta que hay que responder primero, y que no es del implementador
sino del que decide la superficie:

1. ¿`sql-primary-compare` es otro nombre para lo que hoy hace `sql`
   (servir de SQL y comparar paridad antes)? Si lo es, el trabajo es
   **renombrar y documentar**, no anadir.
2. `sql-only` si aporta algo que hoy no existe: hoy una base ausente cae
   al JSON en silencio en todos los modos. Un modo que convierta eso en
   error explicito es la unica parte de este documento sin equivalente
   en el arbol.
3. El `doctor` no informa hoy ni del modo ni del conteo de fallbacks.
   Eso tambien falta, y no depende de como se resuelva (1).

Mientras (1) no se responda, implementar S1 tal como esta escrito
anadiria el problema que dice venir a resolver.

### Punto 3 entregado y correccion del punto 2 (2026-09-15)

**Punto 3 — doctor.** `proposals_db_doctor` anade ahora el check
`storage_mode` al final de su informe. Informa:
- el modo configurado (`DELENDAI_PROPOSAL_INDEX_SOURCE`, resuelto con el
  mismo `resolveProposalIndexSource` que usa el lector);
- la ruta canonica (`resolveProposalsDbPaths`);
- el conteo de fallbacks de este proceso;
- el estado de paridad observado en la ultima lectura: `parity`,
  `divergent`, `unverified`, `not-compared` o `not-observed`.

Los contadores viven en `index-read-stats.ts`. `readProposalIndex`
registra el desenlace de cada lectura; el log solo avisa una vez por
ruta, asi que no podia dar el numero. El check no necesita la base
abierta, de modo que aparece tambien cuando falta, que es cuando mas
importa el modo. Un fallback o una divergencia lo marcan como
`warning`.

Evidencia:
- `storage-mode.spec.ts` (vitest) recorre los siete desenlaces a traves
  de `readProposalIndex` real con un lector SQL inyectado, y fija el
  mensaje y la severidad del check.
- `db-doctor.spec.ts` (`bun test`, base real) fija que el doctor lo
  incluye con base presente y ausente, y que respeta el entorno.

**Correccion del punto 2.** La nota anterior esta desfasada en dos
cosas:
- El modo por defecto ya es `auto`, no `sql`.
- `sql` ya no cae al JSON: si la proyeccion no puede servir, o no esta
  sellada, lanza `ProposalIndexSqlUnavailableError`. Ademas, sirve SQL
  aunque el JSON difiera e informa de la divergencia.

Es decir, el `sql-only` que pedia este documento existe hoy con el
nombre `sql`. El `shadow` existe como `auto`.

Queda solo la pregunta (1) de vocabulario: renombrar o documentar, no
anadir un segundo interruptor. Por eso S1 sigue `in_progress`.

### Decision de vocabulario (2026-09-25)

Documentar, no renombrar ni anadir. `DELENDAI_PROPOSAL_INDEX_SOURCE`
(`json` / `auto` / `sql`) es el unico interruptor; los nombres de este
documento son descripciones de sus valores:

| Este documento | Interruptor | Comportamiento |
| --- | --- | --- |
| `shadow` | `auto` | sirve SQLite y cae al JSON cuando SQL no puede servir o discrepa |
| `sql-primary-compare` | `sql` | sirve SQLite, compara paridad e informa la divergencia |
| `sql-only` | `sql` | base ausente o ilegible es un error explicito; nunca cae al JSON |

Renombrar romperia la configuracion de todo consumidor sin ganar
comportamiento, y un segundo interruptor es el defecto que la ADR 0020
existe para cerrar. La correspondencia queda escrita junto al
interruptor, en `proposal-index-source.constant.ts`.
