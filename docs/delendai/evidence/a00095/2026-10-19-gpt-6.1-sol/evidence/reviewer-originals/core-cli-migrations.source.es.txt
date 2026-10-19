# Investigación independiente — core, CLI, migraciones y publicación

Auditor: gpt-6.1-sol (subagente orquestador del mismo modelo; no constituye un revisor adicional).
Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`, archivo inmutable `/tmp/delendai-audit-20261019-L2whP7`.
Fecha local del encargo: 2026-10-19 Europe/Madrid. El reloj de ejecución produjo timestamps UTC 2026-10-18T22:40–22:43; corresponden al día local 19.
Fase A: no se leyeron conclusiones de otros auditores. Únicamente se leyó el frontmatter/protocolo y Slices/Acceptance de la auditoría conjunta.

## Verificación y alcance real

Lectura dirigida de módulos de implementación y specs, además del bootstrap, playbook y workflows de CI/release; no se usa el número de archivos abiertos como prueba de cobertura exhaustiva. Este informe NO declara exhaustivamente leído el core ni todo el repositorio: el inventario completo y la cobertura por fichero corresponden al coordinador. Se investigaron cadenas públicas CLI → core, migraciones automáticas frente a transaccionales, persistencia, creación/reclamación/publicación/recolección de unidades y release npm.

No se modificó producto. Repros y fixtures en `/tmp`; ninguna llamada a proveedores, credenciales ni publicación externa. La unidad documental autorizada se creó por el flujo local, preservando `develop` en el checkout compartido. Ref: `refs/heads/delendai/wip/gpt-6.1-sol/review/a00095-S6-g1/auditoria-forense-20261019`; worktree `/tmp/delendai-audit-unit-gpt61-20261019`; claim documental `docs/delendai/evidence/a00095/2026-10-19-gpt-6.1-sol`.

## Hallazgos confirmados

<a id="orch-01"></a>

### ORCH-01 — P1 alto: rollback elimina el directorio Git que el backup excluye

**Estado:** defecto confirmado por ejecución de la entrada pública CLI con dependencias reales por defecto, y por transacción con fallo intencionado. **Componentes:** CLI migrate, core workspace-migration. **Resolución:** documentada para propuesta correctiva hija; no implementada.

**Cadena:** `packages/cli/src/commands/migrate.command.ts:90` → `runMigrationTransaction(createDefaultPhases({ migrations: DEFAULT_MIGRATIONS, journal }))`; rollback explícito en `migrate.command.ts:182` → `rollbackLatestMigration` (`migration-transaction.ts:427`) → `rollback.ts:68`. El rollback automático al fallar apply llega al mismo helper (`migration-transaction.ts:208,270`). El arranque ordinario utiliza `runPendingMigrations` y no esta transacción: no se afirma que cualquier arranque ejecute este borrado.

**Evidencia:** `packages/core/src/lib/workspace-migration/transaction/rollback.ts:46,52,90`:

```ts
const DEFAULT_EXCLUDES = ['.git', '.delendai/migration-manifests'] as const;
const excludes = options?.excludePrefixes ?? DEFAULT_EXCLUDES;
// ... el backup utiliza excludes ...
for (const current of await scanFiles(ctx.workspaceRoot, '', [])) {
    if (expectedFiles.has(current)) continue;
    await rm(join(ctx.workspaceRoot, current), { force: false });
}
```

Backup y restauración tienen ámbitos distintos. Todo `.git` está ausente de expectedFiles y el rollback borra `.git/HEAD`, configuración, hooks, objetos y refs; posteriormente elimina los directorios vacíos. La exclusión no protege ese contenido durante rollback.

**Reproducción:** `repro-cli-rollback.ts` usa `git init` en fixture, crea únicamente `delendai.config.json` con `{ "version": 1 }`, ejecuta `createMigrateCommand().run(['run'],ctx)` y luego `run(['rollback'],ctx)` sin sustituir dependencias. Resultado `repro-cli-rollback.json`: runCode=0; rollbackCode=4; `.git/HEAD` ausente; `removed` contiene `.git`, `.git/HEAD`, `.git/config`, hooks, objetos y refs; errors=[]. Segundo repro `repro-rollback.ts` induce error de apply: status="rolled-back", rollbackErrors=[], `.git/HEAD` ausente. Es un repositorio fixture recién inicializado; no se destruyó historial del repositorio del usuario. La consecuencia sobre objetos reales se deriva de la misma enumeración, y debe cubrirse con un test de regresión antes de corregirlo.

**Impacto:** pérdida del repositorio local al recuperar una migración; eliminación de archivos creados tras el snapshot por terceros; falsa confianza en "rolled-back". **Corrección propuesta:** registrar y respetar el mismo ámbito/exclusiones en backup y rollback; restaurar solo paths propiedad de la migración, preservar `.git` de forma incondicional y probar rollback automático y manual en repositorio con commits y trabajo concurrente. **Limitación:** no se ejecutó con repositorio de producción.

<a id="orch-02"></a>

### ORCH-02 — P1: `work claim` sobrescribe una referencia destino existente

**Estado:** defecto confirmado en comando público; no depende de concurrencia. **Resolución:** pendiente de propuesta correctiva hija.

**Cadena pública:** `packages/cli/src/commands/work.command.ts:91` → `runWorkUnit` (`work-unit.service.ts:145`) → `claimed` → `planWorkClaim`/`applyWorkClaim` (`work-unit-claim.service.ts:70–83`, `work-claim.service.ts`) → `renameUnitRef`. El plan incrementa la generación original en uno, sin elegir una generación libre para el nuevo dueño ni verificar el tip destino. Ningún mutex ni CAS del destino envuelve la llamada.

**Evidencia:** `packages/core/src/lib/work-units/unit-ref-rename.service.ts:48–51`:

```ts
const to = `refs/heads/${rename.to}`;
const from = `refs/heads/${rename.from}`;
git(root, ['update-ref', to, rename.sha]);
```

La verificación posterior solo comprueba que el destino quedó en rename.sha; acepta como éxito la sobrescritura. El borrado del origen SÍ comprueba SHA esperado más adelante: esa protección es asimétrica.

**Reproducción pública:** `repro-cli-claim.ts`: fixture política `shared-checkout-pr`, origen old/S1-g1 en A y destino gpt-6.1-sol/S1-g2 ya en B; `createWorkCommand().run(['claim','--agent=gpt-6.1-sol','--ref=...old...'],ctx)` devuelve code=0 y "the same commit, a different name". `repro-cli-claim.log` registra destinationBefore=03228397a4a43869cb7261771752973744e82d87 y destinationAfter=86bd1cf42c4c1ee9f3ec774cdb6b7975850b5da7, overwritten=true. `repro-rename.ts/.json` confirma el mismo helper por separado.

**Impacto:** una reclamación legítima puede desplazar el trabajo previo del reclamante y quitar su nombre durable; el objeto podría recuperarse por reflog u otras refs, pero el flujo no lo garantiza. Una carrera entre reclamaciones también es posible; no se afirma haberla ejecutado. **Corrección:** crear destino con SHA esperado cero (CAS create-only), elegir/rechazar generación ocupada y mover/refuse worktrees solo tras verificar origen/destino conjuntamente.

<a id="orch-03"></a>

### ORCH-03 — P1: el mutex de arranque/work-ref roba un lock vivo al vencer TTL y un release antiguo borra al nuevo dueño

**Estado:** exclusión rota confirmada con tres procesos reales; no se atribuye este defecto a `withFileMutex`, que es otra implementación. **Resolución:** pendiente de propuesta correctiva hija.

**Cadena:** `runStartupGate` (`packages/core/src/lib/startup-gate/run-startup-gate.ts:91`) crea `createStartupMutex` con TTL por defecto 120000ms. `holdWorkRef` (`wip-engine/work-ref-lock.ts:59`) reutiliza el mismo mutex con TTL 600000ms. Protege entrada a unidades (`work-unit-enter.service.ts:139`), publicación (`work-publish.service.ts:336`, `withWorkRefHeld`) y el publisher de checkouts (`work-checkout-publisher.ts`). Estos caminos tienen I/O/red y pueden durar más que el TTL; no hay renovación del lease.

**Evidencia:** `packages/core/src/lib/startup-reconciler/startup-mutex.ts:97–98,115–131`:

```ts
const release = async (): Promise<void> => {
    await rm(options.path, { force: true });
};
const deadHere = held !== undefined &&
    held.machineId === options.machineId && !isAlive(held.pid);
if (age <= ttlMs && !deadHere) return { kind: 'busy', ... };
await release();
await write();
```

Cuando age>ttlMs, un PID vivo ya no impide el robo. La función release no comprueba token/propietario; la liberación del dueño antiguo elimina el lock del nuevo. El helper principal `withFileMutex` ya implementa liveness, ownership token y heartbeat: hay duplicación de primitivas con garantías distintas.

**Prueba adversarial real:** `repro-mutex.ts` lanza A/B/C como procesos Bun independientes con TTL de prueba 100ms. A adquiere y sigue vivo; tras 150ms B adquiere; A libera; C adquiere inmediatamente aunque B continúa dentro de la sección. `repro-mutex.json`: A pid316982=acquired, B pid317003=acquired, C pid317021=acquired, BStillAliveBeforeRelease=true. Misma máquina, PID real, sin falsificar isAlive; solo se acorta el TTL por parámetro. No se esperaron 120/600s ni se ejecutaron publicaciones concurrentes reales. La vigencia por defecto y ausencia de heartbeat están confirmadas estáticamente.

**Impacto:** reconciliaciones, entrada/publicación y push periódico que deberían excluirse pueden ejecutarse juntos y volver a crear/borrar refs. **Corrección:** usar lease único con ownership token y renovación/liveness; liberar únicamente la adquisición propia; preservar el mismo mecanismo a través de la operación completa y probar tres procesos con expiración/pausa/muerte real.

<a id="orch-04"></a>

### ORCH-04 — P2: la opción `--provenance` desaparece antes de `npm publish`

**Estado:** defecto confirmado estáticamente en cadena completa; no se publicó ni se consultó npm. **Resolución:** pendiente de propuesta correctiva hija.

**Cadena:** `.github/workflows/release.yml` invoca `bun run release --set="$VERSION" --write --publish --tool=npm --provenance`. `tools/scripts/release/release.script.ts:144` parsea provenance=true y `:422` pasa ese booleano a publishAll; `:286–295` solo lo usa para advertir con Bun. `:336–343` construye IPublishTarballsInput sin provenance y llama publishTarballs. El contrato no tiene campo provenance.

```ts
// tools/scripts/release/release.script.ts:336
const publishInput: IPublishTarballsInput = {
    pkgDir: ROOT, tarballPaths, tool,
    registry: readRegistryOverride(),
};
// tools/scripts/release/publish-tarballs.ts:82
['publish', tarballPath, ...registryArgs(input.registry)]
```

**Impacto:** la ruta publicada no transmite la solicitud de attestation que el workflow declara. No se demuestra ausencia de provenance en un paquete real: podría existir configuración npm externa que la habilite; el código y workflow no la configuran por otra vía observada. **Corrección:** transportar provenance a IPublishTarballsInput e incluir `--provenance` en npm; prueba que capture argv sin publicar. El spec actual comprueba solo arrayContaining(['publish',tarballPath]) y no esta propiedad.

## Observaciones adicionales y pendientes

- `createFileSystemJournal` (`workspace-migration/migration-registry.ts:213–245`) implementa read→append→writeFile sin mutex/atomic write. Los migradores de cuentas personales también hacen read→merge→write por separado (`personal-accounts.migrator.ts`). Riesgo estático de pérdida de actualizaciones bajo arranques paralelos; NO se incorpora como defecto reproducido adicional ni se deduce que las barreras exteriores falten sin terminar esa cadena.
- Personal layer deriva clave por remote y fusiona cuentas por accountId; los overrides sustituyen la cuenta completa y preservan separación shared/personal en memoria. `normalizeRemoteUrl` elimina puerto: dos servidores diferentes bajo un mismo host/owner/repo y puertos distintos convergen en misma identidad. Falta fixture de uso real; pendiente.
- La migración de cuentas escribe `writeFileAtomic(target,...)` y no fija 0600 explícitamente. La primitiva usa modo final existente o 0666&~umask. No se leyeron archivos personales reales; no se afirma fuga de secretos ni se incorporó como hallazgo reproducido. Evaluar permisos de directorio raíz y contrato exacto de contenido.
- `work-unit-enter` crea refs/worktrees sin mover el checkout compartido; probado durante preparación. La policy local difiere de la del MCP conectado: el informe usa CLI/config local para coordinación. Contaminación de contexto del host debe documentarse a nivel de cobertura operativa.
- CI tiene aggregate obligatorio con required-run-freshness y decisiones explícitas de NA; quality-gate completo está programado y no equivale a un gate obligatorio en cada PR. No se consultó estado vivo de GitHub/Actions ni se declara CI verde.
- Release es explícito por tag/manual y staging/tarballs verificados; no debe confundirse con publicación al hacer merge a main. El bootstrap conserva texto "versioning automatic on main" que no describe el trigger actual.

## Matriz de concurrencia

| Escenario | Protección observada | Prueba | Resultado / límite |
| --- | --- | --- | --- |
| Arranque/publicación larga con lock vivo expirado | startup mutex wx + TTL, sin token/heartbeat | 3 procesos independientes | Defecto confirmado ORCH-03 |
| `work claim` hacia nombre ya ocupado | update-ref destino sin SHA esperado | comando público con dos tips | Defecto confirmado ORCH-02 |
| Rollback mientras existe `.git` excluido de backup | ámbito de backup y delete discrepantes | comando público/defaults y fallo apply | Defecto confirmado ORCH-01 |
| Dos escritores del journal migraciones | read→writeFile | lectura estática; barrera exterior pendiente | No confirmado |
| Tabla general protegida por withFileMutex | ownership token/heartbeat/liveness/reentrancia | leído, sin repetir pruebas de otro subagente | No extrapolar ORCH-03 a esta primitiva |

## Fichas de componentes de esta contribución

| ID | Ruta | Función / dependencias | Estado declarado | Estado verificado | Tests/evidencias | Riesgo | Auditor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| core-work | packages/core/src/lib/work-units | Unidad aislada y ciclo de refs; git, policy, leases | coordinación segura | Defecto confirmado | CLI claim/repro, creación unidad | sobrescritura ref | gpt-6.1-sol |
| core-mutex | packages/core/src/lib/startup-reconciler | Exclusión de reconciliación y work refs; filesystem | un proceso por operación | Defecto confirmado | 3 procesos reales | exclusión rota tras TTL | gpt-6.1-sol |
| core-migration | packages/core/src/lib/workspace-migration | Migración/backup/rollback/journal | rollback transaccional | Defecto confirmado | CLI rollback/defaults | pérdida .git | gpt-6.1-sol |
| cli-work | packages/cli/src/commands/work.command.ts | entrada pública unidad; core/cli | checkout compartido inmóvil | Defecto confirmado | entrada real y fixture claim | hereda ref overwrite | gpt-6.1-sol |
| cli-migrate | packages/cli/src/commands/migrate.command.ts | status/run/rollback/host; core/cli | rollback explícito | Defecto confirmado | fixture CLI con defaults | borrado .git | gpt-6.1-sol |
| release | tools/scripts/release | staging/versionado/tarball/publicación | provenance solicitada | Analizado estáticamente, defecto de propagación confirmado | código + spec argv | attestation no garantizada | gpt-6.1-sol |
| ci | .github/workflows | matrices, aggregate, release explícito | guards/NA/gates | Analizado estáticamente | workflows + composite | estado remoto sin verificar | gpt-6.1-sol |
| config-personal | packages/core/src/lib/plugins/personal-layer.service.ts | cuentas personales por remote/path | aislamiento por proyecto | Analizado estáticamente | helper y migrador | puerto/ACL pendientes | gpt-6.1-sol |

## Inventario de evidencia y repetición

Desde checkout de snapshot con dependencias instaladas, actualizar el import absoluto del encabezado de los repros si cambia su ubicación, ejecutar:

```text
DELENDAI_AGENT_ID=gpt-6.1-sol bun repro-cli-rollback.ts
DELENDAI_AGENT_ID=gpt-6.1-sol bun repro-cli-claim.ts
DELENDAI_AGENT_ID=gpt-6.1-sol bun repro-mutex.ts
```

Fixtures autocontenidas en tmpdir, sin red y sin tocar repo fuente. Scripts, stdout JSON/log y este informe se entregan al coordinador para copia durable en el claim documental. Los specs globales/build/biome son propiedad del coordinador; no se duplicó esa validación ni se atribuyeron sus resultados aquí. No se emiten nota global ni cierre de auditoría completa a partir de esta contribución parcial.


## Ampliación CI y documentación (fase A, antes de cualquier contraste)

<a id="orch-05"></a>

### ORCH-05 — P2: el plan CI omite cambios a los propios scripts de build/smoke

**Estado:** defecto de selección confirmado con funciones reales; no se ejecutó workflow remoto. **Resolución:** pendiente de propuesta correctiva hija.

**Evidencia:** `tools/scripts/ci/job-scope.constant.ts:201–229` declara:

```ts
{ job: 'pack-smoke', touches: [
    'packages/', 'plugins/', 'apps/shared/', 'tsconfig.base.json',
    'package.json', 'bun.lock',
] },
{ job: 'build-clean', touches: [
    'packages/', 'plugins/', 'apps/', 'extensions/', 'tsconfig.base.json',
    'package.json', 'bun.lock',
] },
```

`tools/scripts/ci/job-scope.script.ts:51` retorna solo si algún prefix coincide; no hay fallback para un fichero desconocido. `.github/workflows/ci.yml:954,1112` usa esa salida como condición de job y el aggregate excusa los skips declarados por plan-scope. Sin embargo `pack-smoke` ejecuta `bun run build` y `bun tools/scripts/smoke/pack.script.ts` (`ci.yml:970,990`); package.json define build con `tools/scripts/compile/build.script.ts` y build:clean con `tools/scripts/compile/build-clean.script.ts`, rutas excluidas del scope que pretende cubrirlas.

**Repro sin mutaciones:** `repro-ci-scope.ts/.json` importa jobMustRun/planJobs del snapshot. Para cada cambio individual `tools/scripts/compile/build.script.ts`, `tools/scripts/compile/build-clean.script.ts`, `tools/scripts/smoke/pack.script.ts`, ambos jobs retornan false y aparecen como notApplicable. También un cambio solo a `.github/workflows/ci.yml` los marca NA.

**Impacto y límites:** un PR que cambia el código de esos gates no ejecuta su job específico y puede recibir el aggregate aceptando su omisión. Otros jobs, en particular metrics-gate y la suite general, pueden ejecutar partes de build: NO se afirma que toda CI omita cualquier build ni que un fallo concreto haya llegado a develop. **Corrección:** incluir las dependencias transitivas reales (scripts de compile/smoke, inputs de build y workflow/composite relevantes), y prueba de regresión con rutas de scripts, además de verificar solo presencia de job ids.

<a id="orch-06"></a>

### ORCH-06 — P3: las instrucciones de build contradicen el mirror efectivo de dist

**Estado:** incoherencia documental confirmada estáticamente. **Resolución:** corrección documental posterior, no editada durante auditoría.

`docs/delendai/AGENT-BOOTSTRAP.md:562–577` afirma:

```text
There is no persistent packages/*/dist/ or plugins/*/dist/
No dist/ is ever written back into the repo.
```

Pero `tools/scripts/compile/build.script.ts:470–483` ejecuta:

```ts
// Mirror the canonical tree into the package's own dist/.
mirrorBuildIntoPackageDist(outRoot, join(dir, 'dist'));
```

El builder mantiene copias gitignored en cada paquete para resolver exports. Los smoke de CI sí pueden usar `packages/core/dist/cli.js` gracias a este mirror. Se descarta explícitamente el diagnóstico inicial de path inexistente al seguir toda la cadena. **Impacto:** agente/operador diagnostica erróneamente imports, limpia outputs equivocados o cree incumplida la estructura del repo. **Corrección:** documentar build canónico + mirror compatible y staging npm con la misma descripción en bootstrap y scripts; no añadir otra autoridad.
