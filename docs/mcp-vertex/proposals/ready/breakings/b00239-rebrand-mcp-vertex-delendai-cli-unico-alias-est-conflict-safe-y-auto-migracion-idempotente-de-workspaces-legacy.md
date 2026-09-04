---
id: b00239
title: "Rebrand mcp-vertex → DelendAI: CLI único, alias est conflict-safe y auto-migración idempotente de workspaces legacy"
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

# b00239 — Rebrand `mcp-vertex` → **DelendAI**

## Goal

Cambiar la identidad del producto de `mcp-vertex` a **DelendAI**, con un
único paquete de CLI `@delendai/cli`, binario canónico `delendai` y alias
humano `est`, **sin que ningún proyecto que ya usa `mcp-vertex` tenga que
migrarse a mano**.

El criterio de éxito no es "el repo dice DelendAI". Es: *un proyecto
existente que hoy arranca `mcpv` se autocura en su primera ejecución
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
alias `est`, NO reescribe prosa histórica (una frase como "mcp-vertex
0.1.x hacía X" se conserva por ser cierta) y NO toca un ejecutable ajeno
llamado `est`.

## Architecture

### Inventario cuantificado

Medido sobre el árbol real (`git grep` / `git ls-files`, 5.828 ficheros
versionados, 2026-09-04):

| Superficie | Ficheros | Ocurrencias |
| --- | ---: | ---: |
| `mcp-vertex` | 3.605 | 22.326 |
| `@mcp-vertex` (imports y deps) | 2.351 | 8.383 |
| `mcpv` (binario y prefijos CSS/tool) | 351 | 3.667 |
| `mcpv-*` (prefijo de UI compartida) | 174 | 2.973 |
| `MCP Vertex` (prosa) | 78 | 179 |
| `MCP-VERTEX` (constantes, env) | 45 | 101 |
| `mcp_vertex` | 13 | 23 |
| `mcpvertex` | 11 | 17 |
| **Rutas** que contienen el nombre | **1.157** | — |

Manifiestos: **72** `package.json`, de los cuales **67** declaran un nombre
`@mcp-vertex/*`.

**Contratos públicos afectados** (lo que rompe para un consumidor):

1. Scope npm `@mcp-vertex/*` → `@delendai/*` (5 paquetes publicables:
   `cli`, `core`, `contracts`, `client`, y los plugins que se publiquen).
2. Binarios `mcp-vertex` y `mcpv` (`packages/cli/package.json#bin`) →
   `delendai` (+ `est` por alias, nunca por `bin`).
3. Fichero de configuración `mcp-vertex.config.json` →
   `delendai.config.json`.
4. Raíz de caché `.cache/mcp-vertex/` → `.cache/delendai/`.
5. Raíz de documentación `docs/mcp-vertex/` → `docs/delendai/`.
6. Nombre del servidor MCP y **namespace de tools** (`mcp-vertex_*`), que
   es el contrato que ve el LLM.
7. Prefijo `mcpv-*` de la UI compartida (clases CSS y custom elements).
8. Extensión de VS Code: `publisher`, `name`, ids de comandos y claves de
   settings.
9. Variables de entorno `MCP_VERTEX_*`.

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
- **Status**: pending
- **Files**: `packages/cli/package.json`, `packages/cli/src/lib/alias/alias-manager.ts`, `packages/cli/src/lib/alias/shim-windows.ts`, `packages/cli/src/lib/alias/shim-posix.ts`, `packages/cli/src/lib/commands/alias.command.ts`, `packages/cli/src/lib/commands/doctor.command.ts`, `packages/cli/tests/src/lib/alias/alias-manager.spec.ts`
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

### S2 — `LegacyMigrationManager`: motor versionado e idempotente
- **Status**: pending
- **Files**: `packages/core/src/lib/migration/legacy-migration-manager.ts`, `packages/core/src/lib/migration/migrations/mcp-vertex-to-delendai-v1.ts`, `packages/core/src/lib/migration/migration-registry.ts`, `packages/cli/src/lib/cli/entrypoint.ts`, `packages/core/tests/src/lib/migration/legacy-migration-manager.spec.ts`
- **DependsOn**: [S1]
- **Gate**: validate

El motor de migración, con una primera migración `mcpVertexToDelendAI:v1`.

Toda ejecución *project-aware* comprueba si el workspace necesita migración
**antes** de cargar servidor y plugins: `__serve`, `init`, `status`,
`doctor`, `overview` y cualquier entrypoint equivalente que pueda abrir un
workspace existente.

Si no hay identidad antigua, el coste debe ser mínimo y **sin ruido**. Si
la hay, se migra automáticamente.
- acceptance:
  - "`LegacyMigrationManager` versionado, con la migración `mcpVertexToDelendAI:v1` registrada."
  - "Todos los entrypoints project-aware comprueban la migración antes de cargar el servidor y los plugins."
  - "Un workspace ya migrado no produce salida ni coste medible (test que lo pinea)."
  - "Ejecutar la migración dos veces deja el mismo árbol (idempotencia verificada por hash)."

### S3 — Release puente de `@mcp-vertex/cli`
- **Status**: pending
- **Files**: `packages/cli-bridge/package.json`, `packages/cli-bridge/src/index.ts`, `docs/mcp-vertex/wiki/migration-to-delendai.md`
- **DependsOn**: [S2]
- **Gate**: validate

El problema de bootstrap: los proyectos de hoy arrancan configuraciones que
llaman a `@mcp-vertex/cli` + `mcpv`. Si ese comando desaparece, no hay
ningún momento en el que el proyecto pueda autocurarse.

Una **última** release de compatibilidad de `@mcp-vertex/cli` que **no es
una segunda implementación del producto**: conserva los binarios legacy
`mcpv` / `mcp-vertex`, obtiene el motor de DelendAI, detecta el workspace
en los argumentos, ejecuta `LegacyMigrationManager`, migra el proyecto y su
configuración MCP, y **delega inmediatamente** en el runtime de DelendAI.

Después, `@mcp-vertex/*` queda deprecado en npm apuntando a `@delendai/*`.
No se mantienen dos productos en paralelo.

Documentar la única limitación inevitable: un proyecto congelado que nunca
ejecute código nuevo no puede migrarse mágicamente.
- acceptance:
  - "La release puente conserva `mcpv` y `mcp-vertex`, migra y delega — sin reimplementar el producto."
  - "Tras publicarla, todos los `@mcp-vertex/*` quedan deprecados con un mensaje que apunta a `@delendai/*`."
  - "La limitación del proyecto congelado está documentada de forma explícita."

### S4 — Migradores estructurados por formato
- **Status**: pending
- **Files**: `packages/core/src/lib/migration/migrators/config-file.migrator.ts`, `packages/core/src/lib/migration/migrators/package-manifest.migrator.ts`, `packages/core/src/lib/migration/migrators/host-config.migrator.ts`, `packages/core/src/lib/migration/migrators/cache-and-docs.migrator.ts`, `packages/core/src/lib/migration/migrators/agent-files.migrator.ts`, `packages/core/src/lib/migration/migrators/vscode.migrator.ts`, `packages/core/tests/src/lib/migration/migrators/`
- **DependsOn**: [S2]
- **Gate**: validate

**No** un `replaceAll("mcp-vertex", "delendai")`. Discoverers y migradores
específicos por formato, usando parsers estructurados donde hay estructura:
JSON como JSON, TOML como TOML, manifiestos como manifiestos.

Cobertura mínima: `mcp-vertex.config.json` → `delendai.config.json`;
`.cache/mcp-vertex` → `.cache/delendai`; `docs/mcp-vertex` →
`docs/delendai`; `@mcp-vertex/*` → `@delendai/*`; binarios `mcpv` y
`mcp-vertex` → `delendai`; nombre del servidor MCP; namespaces y prefijos
de tools; variables de entorno; `.vscode/mcp.json`; configuraciones de
Cursor, Antigravity, Claude Code y Codex; `.github/agents/*`,
`.claude/agents/*`, `.codex/agents/*`; `package.json`; manifiestos y
lockfiles de Bun/npm/pnpm/yarn; scripts; CI; Docker; documentación viva;
README; configuraciones de agente generadas; extensión, settings y comandos
de VS Code; todo lo generado por `mcpv init`; y cualquier contrato
persistente creado por versiones anteriores.
- acceptance:
  - "Existe un migrador por formato; no hay ninguna sustitución textual ciega sobre ficheros estructurados."
  - "Las 20+ superficies del listado están cubiertas, cada una con su test."
  - "Los lockfiles se regeneran mediante el gestor de paquetes, nunca por sustitución."

### S5 — Configuraciones fuera del workspace, con prueba de pertenencia
- **Status**: pending
- **Files**: `packages/core/src/lib/migration/host-scope/workspace-ownership.ts`, `packages/core/src/lib/migration/host-scope/global-config.migrator.ts`, `packages/core/tests/src/lib/migration/host-scope/workspace-ownership.spec.ts`
- **DependsOn**: [S4]
- **Gate**: validate

Migrar configuraciones globales de hosts (Claude Code, Codex) **sin
reemplazos indiscriminados en el home del usuario**.

Solo se modifica una entrada legacy si puede **demostrarse asociada al
workspace que se está migrando** — por ejemplo, porque sus argumentos
contienen el path canónico de ese workspace junto a la configuración
`mcp-vertex` antigua. Los demás proyectos se dejan intactos y se migran
solos cuando se abran.

El objetivo de UX es que cada proyecto se autocure individualmente en su
primera ejecución.
- acceptance:
  - "Una entrada global solo se toca si su asociación al workspace en migración es demostrable; hay un test con dos proyectos donde solo uno se modifica."
  - "Ningún camino del código escribe en el home fuera de las entradas demostradas."

### S6 — Migración transaccional con rollback
- **Status**: pending
- **Files**: `packages/core/src/lib/migration/transaction/migration-transaction.ts`, `packages/core/src/lib/migration/transaction/migration-manifest.ts`, `packages/core/src/lib/migration/transaction/rollback.ts`, `packages/cli/src/lib/commands/migrate.command.ts`, `packages/core/tests/src/lib/migration/transaction/migration-transaction.spec.ts`
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
- **Files**: `packages/core/src/lib/migration/package-manager/detect-package-manager.ts`, `packages/core/src/lib/migration/package-manager/lockfile-refresh.ts`, `packages/core/tests/src/lib/migration/package-manager/detect-package-manager.spec.ts`
- **DependsOn**: [S6]
- **Gate**: validate

Detectar el gestor real del proyecto (Bun es prioritario aquí, pero deben
contemplarse los soportados). Al cambiar dependencias `@mcp-vertex/*` →
`@delendai/*`: actualizar el manifiesto, regenerar el lockfile con el
gestor, validar la resolución y, si falla, hacer rollback coherente.

Nunca dejar un `package.json` migrado con un lockfile que lo contradiga.
- acceptance:
  - "El gestor se detecta a partir del lockfile presente, con un test por gestor soportado."
  - "Un fallo de resolución deja manifiesto y lockfile en su estado original."

### S8 — Scanner de identidad residual
- **Status**: pending
- **Files**: `packages/core/src/lib/migration/scanner/legacy-identity-scanner.ts`, `packages/core/src/lib/migration/scanner/classification.ts`, `packages/core/tests/src/lib/migration/scanner/legacy-identity-scanner.spec.ts`, `docs/mcp-vertex/wiki/migration-to-delendai.md`
- **DependsOn**: [S7]
- **Gate**: validate

Al terminar una migración, escanear identidad antigua: `mcp-vertex`,
`mcp_vertex`, `mcpvertex`, `MCP Vertex`, `MCP-VERTEX`, `@mcp-vertex`,
`mcpv`, `--mcpv-*`.

Clasificar cada hallazgo:

- **LIVE** — debe ser cero al terminar.
- **HISTORICAL** — puede permanecer: cambiarlo falsificaría la historia.
- **VENDORED / THIRD-PARTY** — no tocar.
- **GENERATED** — regenerar desde su fuente.

La migración no se considera completada si queda una referencia LIVE sin
resolver. La distinción LIVE/HISTORICAL es la parte con criterio: *"la
0.1.x de mcp-vertex hacía X"* se conserva; *"instala `@mcp-vertex/cli`"* se
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
- **Files**: `package.json`, `mcp-vertex.config.json`, `README.md`, `README.es.md`, `docs/mcp-vertex/`, `extensions/vscode/package.json`, `packages/*/package.json`, `plugins/*/package.json`
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
2. **Reserva de nombres**: org de GitHub, scope npm `@delendai`, publisher
   de VS Code, dominio. Cuanto antes, mejor: el riesgo es que alguien tome
   el nombre entre la decisión y la publicación.
3. **¿Se renombra el repositorio de GitHub?** Un rename mantiene las
   redirecciones, pero rompe las URLs canónicas en documentación publicada.
4. **Ventana de deprecación** de `@mcp-vertex/*` en npm.

### Riesgos que podrían impedir un hard cut seguro

- **Bootstrap**: los proyectos actuales arrancan un comando (`mcpv`) que
  dejará de existir. Sin la release puente (S3) no hay forma de que se
  autocuren. Este es el riesgo que ordena todo el plan.
- **Lockfiles**: cambiar `package.json` sin regenerar el lockfile deja un
  proyecto que no instala. La migración debe delegar en el gestor real.
- **Windows**: el alias no puede resolverse con un symlink POSIX. Sin
  shims correctos, `est` queda roto en Windows y silenciosamente.
- **Proyecto congelado**: un workspace que nunca vuelva a ejecutar código
  nuevo no puede migrarse. Es una limitación inevitable y hay que
  documentarla, no disimularla.
- **Namespace de tools**: renombrar `mcp-vertex_*` invalida los prompts,
  memorias y configuraciones de host que los agentes ya tengan aprendidos.
