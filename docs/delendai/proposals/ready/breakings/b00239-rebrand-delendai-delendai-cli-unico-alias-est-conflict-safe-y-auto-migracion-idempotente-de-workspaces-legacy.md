---
id: b00239
title: "Rebrand delendai → DelendAI: CLI único, alias est conflict-safe y auto-migración idempotente de workspaces legacy"
kind: breaking
status: ready
type: proposal
track: general
date: 2026-09-04
priority: P0
classification: BREAKING / IDENTIDAD DE PRODUCTO
breaking-change: true
related:
    - f00500 # limpieza de attribution en la superficie de GitHub (mismo objetivo: qué ve un visitante)
---

# b00239 — Rebrand `delendai` → **DelendAI**

## Goal

Cambiar la identidad del producto de `delendai` a **DelendAI**, con un
único paquete de CLI `@delendai/cli`, binario canónico `delendai` y alias
humano `est`, **sin que ningún proyecto que ya usa `delendai` tenga que
migrarse a mano**.

El criterio de éxito no es "el repo dice DelendAI". Es: *un proyecto
existente que hoy arranca `delendai` se autocura en su primera ejecución
después del rebranding, y su dueño solo nota que todo sigue funcionando.*

Eso convierte el propio rebranding en la primera demostración real de la
arquitectura que este proyecto vende.

## Why

Dos razones, y conviene no confundirlas.

La primera es de marca: "vertex" se ha comoditizado en los últimos meses
—han aparecido varios proyectos con ese nombre— justo cuando el proyecto
necesita diferenciarse. En prealfa y con un solo usuario, la ventana para
un hard cut limpio está abierta y se cierra sola con cada adopción nueva.

La segunda es de producto, y es la que justifica el tamaño de esta
propuesta: **la migración automática no es un accesorio del rebranding, es
la funcionalidad**. Un rebranding que obligue al usuario a perseguir
referencias a mano es exactamente el trabajo que este proyecto existe para
eliminar.

## Non-goals

Esta propuesta NO hace el hard cut hasta que S1-S9 estén probados, NO
mantiene dos productos en paralelo, NO crea un segundo paquete para el
alias `est`, NO reescribe prosa histórica (una frase como "delendai
0.1.x hacía X" se conserva por ser cierta) y NO toca un ejecutable ajeno
llamado `est`.

## Architecture

### Inventario cuantificado

Medido sobre el árbol real (`git grep` / `git ls-files`, 5.828 ficheros
versionados, 2026-09-04):

| Superficie | Ficheros | Ocurrencias |
| --- | ---: | ---: |
| `delendai` | 3.605 | 22.326 |
| `@delendai` (imports y deps) | 2.351 | 8.383 |
| `delendai` (binario y prefijos CSS/tool) | 351 | 3.667 |
| `delendai-*` (prefijo de UI compartida) | 174 | 2.973 |
| `DelendAI` (prosa) | 78 | 179 |
| `DELENDAI` (constantes, env) | 45 | 101 |
| `delendai` | 13 | 23 |
| `delendai` | 11 | 17 |
| **Rutas** que contienen el nombre | **1.157** | — |

Manifiestos: **72** `package.json`, de los cuales **67** declaran un nombre
`@delendai/*`.

**Nada se ha publicado nunca en npm.** Comprobado contra el registro el
2026-09-04: `@delendai/core`, `/cli`, `/contracts` y `/client` devuelven
todos HTTP 404, y no existe ningún paquete bajo `@delendai`.

Eso elimina la mitad más cara del plan. No hay ningún consumidor que haya
instalado el scope viejo desde el registro, así que no hay nada de lo que
puentear en npm, ninguna ventana de deprecación que planificar y ningún
`workspace:*` publicado que corregir. El cambio de scope es gratis: la
primera publicación que haga este proyecto será, sin más, `@delendai/*`.

Lo que sí queda real es la migración de **workspaces en disco**: este
repositorio y cualquier proyecto donde ya se haya adoptado tienen
`delendai.config.json`, `.cache/delendai/`, `.vscode/mcp.json` y
configuraciones de host que existen como ficheros. Esos no los arregla el
registro, y son exactamente lo que S2, S4, S5 y S6 automatizan.

**Contratos públicos afectados** (lo que rompe para un consumidor):

1. Scope npm `@delendai/*` → `@delendai/*` (5 paquetes publicables:
   `cli`, `core`, `contracts`, `client`, y los plugins que se publiquen).
2. Binarios `delendai` y `delendai` (`packages/cli/package.json#bin`) →
   `delendai` (+ `est` por alias, nunca por `bin`).
3. Fichero de configuración `delendai.config.json` →
   `delendai.config.json`.
4. Raíz de caché `.cache/delendai/` → `.cache/delendai/`.
5. Raíz de documentación `docs/delendai/` → `docs/delendai/`.
6. Nombre del servidor MCP y **namespace de tools** (`delendai_*`), que
   es el contrato que ve el LLM.
7. Prefijo `delendai-*` de la UI compartida (clases CSS y custom elements).
8. Extensión de VS Code: `publisher`, `name`, ids de comandos y claves de
   settings.
9. Variables de entorno `DELENDAI_*`.

### Decisiones ya tomadas (no reabrir)

- **Nombre**: DelendAI.
- **Un solo paquete de CLI**: `@delendai/cli`. No existe `@delendai/est`.
- **`delendai` es el único contrato garantizado.** `est` es UX de
  conveniencia.
- **Todo lo que genere software usa `delendai`**: configuraciones MCP
  generadas, CI, Docker, scripts. `est` es solo para que lo teclee una
  persona. Una colisión futura de `est` no puede romper un proyecto.
- **Hard cut**, no marca dual: los paquetes viejos se deprecan tras una
  única release puente.

## Slices

- global_gate: validate

### S1 — `AliasManager` conflict-safe dentro de `@delendai/cli`
- **Status**: done
- **Files**: `packages/cli/package.json`, `packages/cli/src/lib/alias/alias-manager.ts`, `packages/cli/src/lib/alias/shim-posix.ts`, `packages/cli/src/lib/alias/shim-windows.ts`, `packages/cli/src/lib/alias/shim.spec.ts`, `packages/cli/src/commands/alias.command.ts`
- **Gate**: validate

Un único paquete. `package.json#bin` declara **solo** `delendai`: declarar
`est` incondicionalmente haría que una colisión previa reventase la
instalación entera, y el alias es conveniencia, no contrato.

Comportamiento: `delendai` siempre se instala. Tras la instalación, si los
lifecycle scripts están permitidos, se provisiona `est` en best-effort — y
la corrección **no depende de eso**: la primera ejecución de `delendai`
reconcilia el alias igualmente.

Reglas de conflicto, en orden:

1. `est` no existe → crear alias/wrapper que ejecute exactamente el mismo
   CLI.
2. `est` ya es de DelendAI → no hacer nada (idempotente).
3. `est` pertenece a otro software → **no tocarlo**: ni modificar, ni
   borrar, ni sobrescribir. Informar de forma clara y **no fatal**;
   DelendAI queda plenamente funcional por `delendai`.

Global y local; Windows, macOS y Linux. En Windows, shims reales, no una
solución Unix-only. Todo alias creado por DelendAI queda marcado de forma
inequívoca para poder retirarlo sin tocar ejecutables ajenos.

Comandos: `delendai alias status|install|remove`. `delendai doctor` informa
de la ubicación del CLI canónico, la disponibilidad de `est`, si `est` es
alias de DelendAI y si está ocupado por otro ejecutable.
- acceptance:
  - "`@delendai/cli` declara únicamente el binario `delendai` en `package.json#bin`."
  - "`AliasManager` cubre los cuatro casos (ausente, propio, ajeno, reinstalación) y jamás sobrescribe un `est` ajeno."
  - "La reconciliación ocurre también en la primera ejecución de `delendai`, sin depender del lifecycle script."
  - "Shims de Windows implementados y probados, no solo el camino POSIX."
  - "`delendai alias status|install|remove` y la sección de `doctor` existen y se prueban."
  - "Tests reales: instalación sin `est`, con `est` ajeno, reinstalación, alias propio preexistente, global y local, Windows y POSIX."
- review-state: done
- review-implementer: delendai-impl-20260906
- review-reviewer: delendai-reviewer-20260906
- review-log: approved by delendai-reviewer-20260906 — Verified: package.json bin = delendai only; shim-posix and shim-windows exist with marker + canonical path; shim.spec.ts covers both; alias.command.ts wires status/install/remove; CLI 43/43 files + 386/386 tests green; tsc clean.
### S2 — `LegacyMigrationManager`: motor versionado e idempotente
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/legacy-migration.service.ts`, `packages/core/src/lib/workspace-migration/migrations/delendai-to-delendai-v1.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/cli/src/lib/cli/entrypoint.ts`, `packages/core/tests/src/lib/workspace-migration/legacy-migration-manager.spec.ts`
- **DependsOn**: [S1]
- **Gate**: validate

El motor de migración, con una primera migración `delendaiToDelendAI:v1`.

Toda ejecución *project-aware* comprueba si el workspace necesita migración
**antes** de cargar servidor y plugins: `__serve`, `init`, `status`,
`doctor`, `overview` y cualquier entrypoint equivalente que pueda abrir un
workspace existente.

Si no hay identidad antigua, el coste debe ser mínimo y **sin ruido**. Si
la hay, se migra automáticamente.
- acceptance:
  - "`LegacyMigrationManager` versionado, con la migración `delendaiToDelendAI:v1` registrada."
  - "Todos los entrypoints project-aware comprueban la migración antes de cargar el servidor y los plugins."
  - "Un workspace ya migrado no produce salida ni coste medible (test que lo pinea)."
  - "Ejecutar la migración dos veces deja el mismo árbol (idempotencia verificada por hash)."

### S3 — Puente local para workspaces ya adoptados
- **Status**: pending
- **Files**: `packages/cli/package.json`, `packages/cli/src/index.ts`, `docs/delendai/wiki/migration-to-delendai.md`
- **DependsOn**: [S2]
- **Gate**: validate

El problema de bootstrap, reducido a su tamaño real ahora que se ha medido
el registro: **no hay release puente que publicar**, porque no hay nada
publicado. Nadie ha instalado `@delendai/cli` desde npm jamás.

Lo que sí existe son workspaces en disco cuyas configuraciones invocan
`delendai` o `delendai` por una ruta local. Para esos, el puente es que los
binarios viejos sigan existiendo en el paquete durante una versión:
conservan sus nombres, detectan el workspace en los argumentos, ejecutan la
migración, y **delegan inmediatamente** en el runtime nuevo. No es una
segunda implementación del producto; es un reenvío que además cura.

Documentar la única limitación inevitable: un proyecto congelado que nunca
ejecute código nuevo no puede migrarse mágicamente. Ninguna herramienta
puede cambiar un fichero de un proyecto que nunca vuelve a abrirse.
- acceptance:
  - "Los binarios `delendai` y `delendai` siguen existiendo una versión más, migran el workspace y delegan en el runtime nuevo sin reimplementar nada."
  - "No se publica ningún paquete puente: verificado que `@delendai/*` nunca estuvo en el registro, así que no hay nada que deprecar."
  - "La limitación del proyecto congelado está documentada de forma explícita."

### S4 — Migradores estructurados por formato
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/migrators/config-file.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/package-manifest.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/host-config.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/cache-and-docs.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/agent-files.migrator.ts`, `packages/core/src/lib/workspace-migration/migrators/vscode.migrator.ts`, `packages/core/tests/src/lib/workspace-migration/migrators/`
- **DependsOn**: [S2]
- **Gate**: validate

**No** un `replaceAll("delendai", "delendai")`. Discoverers y migradores
específicos por formato, usando parsers estructurados donde hay estructura:
JSON como JSON, TOML como TOML, manifiestos como manifiestos.

Cobertura mínima: `delendai.config.json` → `delendai.config.json`;
`.cache/delendai` → `.cache/delendai`; `docs/delendai` →
`docs/delendai`; `@delendai/*` → `@delendai/*`; binarios `delendai` y
`delendai` → `delendai`; nombre del servidor MCP; namespaces y prefijos
de tools; variables de entorno; `.vscode/mcp.json`; configuraciones de
Cursor, Antigravity, Claude Code y Codex; `.github/agents/*`,
`.claude/agents/*`, `.codex/agents/*`; `package.json`; manifiestos y
lockfiles de Bun/npm/pnpm/yarn; scripts; CI; Docker; documentación viva;
README; configuraciones de agente generadas; extensión, settings y comandos
de VS Code; todo lo generado por `delendai init`; y cualquier contrato
persistente creado por versiones anteriores.
- acceptance:
  - "Existe un migrador por formato; no hay ninguna sustitución textual ciega sobre ficheros estructurados."
  - "Las 20+ superficies del listado están cubiertas, cada una con su test."
  - "Los lockfiles se regeneran mediante el gestor de paquetes, nunca por sustitución."

### S5 — Configuraciones fuera del workspace, con prueba de pertenencia
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/host-scope/workspace-ownership.ts`, `packages/core/src/lib/workspace-migration/host-scope/global-config.migrator.ts`, `packages/core/tests/src/lib/workspace-migration/host-scope/workspace-ownership.spec.ts`
- **DependsOn**: [S4]
- **Gate**: validate

Migrar configuraciones globales de hosts (Claude Code, Codex) **sin
reemplazos indiscriminados en el home del usuario**.

Solo se modifica una entrada legacy si puede **demostrarse asociada al
workspace que se está migrando** — por ejemplo, porque sus argumentos
contienen el path canónico de ese workspace junto a la configuración
`delendai` antigua. Los demás proyectos se dejan intactos y se migran
solos cuando se abran.

El objetivo de UX es que cada proyecto se autocure individualmente en su
primera ejecución.
- acceptance:
  - "Una entrada global solo se toca si su asociación al workspace en migración es demostrable; hay un test con dos proyectos donde solo uno se modifica."
  - "Ningún camino del código escribe en el home fuera de las entradas demostradas."

### S6 — Migración transaccional con rollback
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/transaction/migration-transaction.ts`, `packages/core/src/lib/workspace-migration/transaction/migration-manifest.ts`, `packages/core/src/lib/workspace-migration/transaction/rollback.ts`, `packages/cli/src/lib/commands/migrate.command.ts`, `packages/core/tests/src/lib/workspace-migration/transaction/migration-transaction.spec.ts`
- **DependsOn**: [S4]
- **Gate**: validate

Fases `DISCOVER → PLAN → BACKUP → APPLY → VALIDATE → COMMIT`, con
`ROLLBACK` si `APPLY` o `VALIDATE` fallan. Nunca un workspace a medio
migrar en silencio.

Manifest de migración bajo una ruta DelendAI con: id y versión de
migración, timestamp, ficheros afectados, hashes antes y después,
operaciones de rename, cambios de paquetes, cambios de configuración de
host y resultado de la validación.

Diagnóstico: `delendai migrate status|--dry-run|run|rollback`. Que existan
no cambia que la migración normal sea automática.
- acceptance:
  - "Las seis fases existen y un fallo inyectado en APPLY y otro en VALIDATE producen un rollback verificado por hash."
  - "El manifest contiene los diez campos listados."
  - "Los cuatro subcomandos de `migrate` existen y se prueban."

### S7 — Gestor de paquetes y lockfiles
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/package-manager/detect-package-manager.ts`, `packages/core/src/lib/workspace-migration/package-manager/lockfile-refresh.ts`, `packages/core/tests/src/lib/workspace-migration/package-manager/detect-package-manager.spec.ts`
- **DependsOn**: [S6]
- **Gate**: validate

Detectar el gestor real del proyecto (Bun es prioritario aquí, pero deben
contemplarse los soportados). Al cambiar dependencias `@delendai/*` →
`@delendai/*`: actualizar el manifiesto, regenerar el lockfile con el
gestor, validar la resolución y, si falla, hacer rollback coherente.

Nunca dejar un `package.json` migrado con un lockfile que lo contradiga.
- acceptance:
  - "El gestor se detecta a partir del lockfile presente, con un test por gestor soportado."
  - "Un fallo de resolución deja manifiesto y lockfile en su estado original."

### S8 — Scanner de identidad residual
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/scanner/legacy-identity-scanner.ts`, `packages/core/src/lib/workspace-migration/scanner/classification.ts`, `packages/core/tests/src/lib/workspace-migration/scanner/legacy-identity-scanner.spec.ts`, `docs/delendai/wiki/migration-to-delendai.md`
- **DependsOn**: [S7]
- **Gate**: validate

Al terminar una migración, escanear identidad antigua: `delendai`,
`delendai`, `delendai`, `DelendAI`, `DELENDAI`, `@delendai`,
`delendai`, `--delendai-*`.

Clasificar cada hallazgo:

- **LIVE** — debe ser cero al terminar.
- **HISTORICAL** — puede permanecer: cambiarlo falsificaría la historia.
- **VENDORED / THIRD-PARTY** — no tocar.
- **GENERATED** — regenerar desde su fuente.

La migración no se considera completada si queda una referencia LIVE sin
resolver. La distinción LIVE/HISTORICAL es la parte con criterio: *"la
0.1.x de delendai hacía X"* se conserva; *"instala `@delendai/cli`"* se
migra.
- acceptance:
  - "El scanner busca los ocho patrones y clasifica en las cuatro categorías."
  - "Una referencia LIVE sin resolver hace fallar la migración."
  - "La regla LIVE vs HISTORICAL está documentada con ejemplos de ambos lados."

### S9 — Fixtures y e2e de adopción real
- **Status**: pending
- **Files**: `packages/test-kit/src/lib/fixtures/legacy-workspace/`, `tests/e2e/adoption/legacy-migration.e2e.spec.ts`, `tests/e2e/adoption/alias-conflict.e2e.spec.ts`
- **DependsOn**: [S8]
- **Gate**: validate

Fixtures de proyectos legacy representativos. Los e2e deben demostrar, como
mínimo: proyecto totalmente legacy; primera ejecución mediante el puente;
migración automática; reescritura del launch MCP; configuración nueva;
paquetes nuevos; estado, caché y docs migrados; configuraciones de agente
migradas; segunda ejecución idempotente sin cambios; y DelendAI operativo
después de migrar.

Escenarios adicionales: workspace sucio; configuración parcialmente
migrada; destino nuevo ya existente; migración interrumpida; rollback;
configuración global compartida por varios proyectos; lockfile; `est`
libre; `est` ocupado por software ajeno.
- acceptance:
  - "Los diez pasos del recorrido principal están cubiertos por un e2e sobre un fixture legacy real."
  - "Los nueve escenarios adicionales tienen test."
  - "La segunda ejecución no produce ningún cambio en el árbol."

### S10 — Hard cut de este repositorio
- **Status**: pending
- **Files**: `package.json`, `delendai.config.json`, `README.md`, `README.es.md`, `docs/delendai/`, `extensions/vscode/package.json`, `packages/*/package.json`, `plugins/*/package.json`
- **DependsOn**: [S9]
- **Gate**: validate

Solo después de que la infraestructura esté probada. Aplicar a este
repositorio su propia migración —el rebranding se hace **con** DelendAI, no
a mano— y resolver lo que la herramienta no puede: prosa, JSDoc, nombres de
tipos y constantes, assets de marca.

Bloqueado por el clearance de marca de la sección de decisiones abiertas.
- acceptance:
  - "El repo se migra ejecutando la propia migración, y el diff resultante es revisable."
  - "El scanner residual reporta cero LIVE sobre este repositorio."
  - "Documentación y JSDoc actualizados; las menciones históricas se conservan."
  - "`bun run validate` en verde tras el cut."

## Acceptance

La propuesta se cierra cuando, y solo cuando:

1. Un workspace legacy real —el fixture de S9— arranca por el binario
   antiguo, se migra solo y queda operativo bajo DelendAI, sin que nadie
   edite un fichero a mano.
2. Ejecutar la migración una segunda vez no cambia un solo byte.
3. El scanner residual (S8) reporta **cero** referencias LIVE sobre este
   repositorio y sobre el fixture migrado.
4. `est` ocupado por software ajeno deja a DelendAI plenamente funcional
   por `delendai`, con un aviso claro y no fatal, y sin haber tocado el
   ejecutable ajeno.
5. Ninguna configuración MCP generada, script de CI o Dockerfile invoca
   `est`: el software siempre llama a `delendai`.
6. Un fallo inyectado en APPLY y otro en VALIDATE dejan el workspace
   exactamente como estaba, verificado por hash.
7. `bun run validate` en verde.

## Risks and mitigations

### Decisiones abiertas (requieren al maintainer)

1. **Clearance de marca.** No aparece "DelendAI" como producto de software
   relevante, pero existe una empresa tecnológica llamada **DELENDA**. Un
   análisis de similitud para software/servicios debe cerrarse **antes de
   publicar** el rebranding. No bloquea diseñar ni implementar la
   infraestructura de migración; sí bloquea el `npm publish`.
2. **Reserva de nombres**: scope npm `@delendai` y publisher de VS Code.
   Cuanto antes, mejor: el riesgo es que alguien tome el nombre entre la
   decisión y la publicación, y ambos son globales y de primero-en-llegar.

   **No** hace falta una organización de GitHub. DelendAI es el nombre del
   producto, no el de quien lo publica: el repositorio sigue viviendo bajo
   la cuenta del maintainer, igual que hoy. Un producto se conoce por su
   nombre, no por el de su organización, y crear una org por adelantado
   añade una superficie que administrar sin resolver nada. Si algún día el
   proyecto crece hasta necesitarla, se crea entonces — con este nombre o
   con la variante que convenga.
3. **¿Se renombra el repositorio de GitHub?** Un rename mantiene las
   redirecciones, pero rompe las URLs canónicas en documentación publicada.
4. **Cuándo publicar por primera vez.** No hay ventana de deprecación que
   decidir —nunca se publicó nada— pero sí la decisión de cuándo hacer la
   primera publicación, que es la que queda condicionada al clearance de
   marca. La publicación es con `bun publish`, que ya es el
   `--tool` por defecto de `release.script.ts` porque reescribe las
   dependencias `workspace:*` y `npm publish` no.

### Riesgos que podrían impedir un hard cut seguro

- **Bootstrap**: los proyectos actuales arrancan un comando (`delendai`) que
  dejará de existir. Sin el puente local (S3) no hay forma de que se
  autocuren. Menor de lo que parecía —no hay consumidores de registro que
  puentear— pero sigue siendo lo que ordena el plan para los workspaces
  que ya existen en disco.
- **Lockfiles**: cambiar `package.json` sin regenerar el lockfile deja un
  proyecto que no instala. La migración debe delegar en el gestor real.
- **Windows**: el alias no puede resolverse con un symlink POSIX. Sin
  shims correctos, `est` queda roto en Windows y silenciosamente.
- **Proyecto congelado**: un workspace que nunca vuelva a ejecutar código
  nuevo no puede migrarse. Es una limitación inevitable y hay que
  documentarla, no disimularla.
- **Namespace de tools**: renombrar `delendai_*` invalida los prompts,
  memorias y configuraciones de host que los agentes ya tengan aprendidos.
