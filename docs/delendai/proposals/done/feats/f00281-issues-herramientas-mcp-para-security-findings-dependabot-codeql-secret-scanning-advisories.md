---
id: f00281
title: "issues: herramientas MCP para security findings (Dependabot, CodeQL, secret scanning, advisories)"
kind: feat
status: done
type: proposal
track: security
date: 2026-08-29
priority: P1
related: [f00251]
shipped-in: [b8ff9ef6]
---

# f00281 — issues: herramientas MCP para security findings de GitHub

## Goal

Añadir 4 herramientas de lectura al plugin `issues` que expongan los
hallazgos de seguridad de GitHub directamente en el workspace del agente,
para poder verlos, triarlos y resolverlos sin salir de VS Code:

- `issues_list_dependabot` — alertas de Dependabot
  (`GET /repos/{owner}/{repo}/dependabot/alerts`)
- `issues_list_code_scanning` — alertas de Code scanning / CodeQL
  (`GET /repos/{owner}/{repo}/code-scanning/alerts`)
- `issues_list_secret_scanning` — alertas de secret scanning
  (`GET /repos/{owner}/{repo}/secret-scanning/alerts`)
- `issues_list_advisories` — security advisories del repo
  (`GET /repos/{owner}/{repo}/security-advisories`)

## why

Hoy el plugin `issues` (`plugins/issues/`) sólo sabe leer *issues* de
GitHub. Los hallazgos de seguridad viven en endpoints REST distintos y
no hay ninguna herramienta que los traiga al workspace. El resultado:
para revisar las 127 alertas abiertas de CodeQL que reporta Security and
quality, un humano tiene que abrir la web de GitHub, copiar cada hallazgo,
y volver al editor para arreglarlo.

La infraestructura ya existe: `github-client.ts` implementa un cliente
de 3 tiers (`gh` CLI → `GITHUB_TOKEN` → REST anónimo) con `tryGhApi` y
`restGet` como primitivas reutilizables. Cada nuevo endpoint es una
variación de `listIssues` con un mapeador distinto. No se necesita
ninguna dependencia nueva (no `octokit`, deliberadamente, igual que el
resto del plugin).

## why this design

**Una herramienta por tipo de hallazgo, no una genérica.** Cada endpoint
de GitHub tiene un shape de respuesta distinto (un alert de Dependabot
no se parece en nada a un alert de CodeQL), y el contrato de
`outputSchema` por herramienta fuerza a que cada uno tenga su schema
propio. Una herramienta genérica `issues_list_security(kind)` obligaría
a un `outputSchema` union o a `z.unknown()`, rompiendo la disciplina de
outputs tipados del repo.

**Sólo lectura en esta tanda.** El ciclo completo (list → fetch detail →
update state → dismiss) sería el espejo del flujo issues
list/fetch/ingest/analyze/resolve, pero las 4 herramientas `list_*` ya
cierran el dolor principal (ver los hallazgos desde el editor). Los
detalles y las mutaciones de estado (`dismiss`, `reopen`, `patch`) se
dejan como slices de seguimiento fuera de esta propuesta, y su diseño
debe discutir si corresponde a `issues` o a un plugin `security` nuevo.

**Reutilización del cliente, no duplicación.** En vez de abrir un
segundo módulo de transporte, se amplía `github-client.ts` con funciones
hermanas (`listDependabotAlerts`, `listCodeScanningAlerts`, …) que
comparten `tryGhApi` / `restGet` / `resolveSpawn` / `IGithubClientDeps`.
La precedencia de tiers y el manejo de errores quedan definidos en un
solo lugar.

## non-goals

- Mutar el estado de un hallazgo (dismiss / fix / reopen) — fuera de
  alcance; ver "why this design".
- Un plugin `security` separado — se añade a `issues` porque comparte
  el cliente, el `repo` option y el flujo de triage; si la superficie
  crece, extraerla es un refactor posterior.
- Ingesta de hallazgos como archivos scaffold — `issues_ingest` es
  específico del shape de issue; los security findings en disco se
  diseñarán junto con sus slices de mutación.
- Soporte para repos distintos del configurado — las herramientas leen
  `ctx.options.repo` igual que las existentes.

## architecture

```
plugins/issues/src/lib/
├── github-client.ts            (ampliado: 4 funciones list* hermanas)
│   ├── tryGhApi / restGet      (reutilizados, sin cambios)
│   ├── listDependabotAlerts    (nuevo)
│   ├── listCodeScanningAlerts  (nuevo)
│   ├── listSecretScanningAlerts(nuevo)
│   └── listSecurityAdvisories  (nuevo)
├── contracts/
│   └── security.types.ts       (nuevo: shapes de las 4 respuestas)
└── tools/
    ├── list-dependabot.tool.ts       (nuevo)
    ├── list-code-scanning.tool.ts    (nuevo)
    ├── list-secret-scanning.tool.ts  (nuevo)
    └── list-advisories.tool.ts       (nuevo)

IGithubClient (puerto en tools/list-issues.tool.ts) se ensancha con
los 4 métodos nuevos; createGithubClient en src/index.ts los adapta a
las funciones libres. Cada herramienta sigue el patrón exacto de
buildListIssuesRegistration: args opcionales (state/severity/limit),
delegate al puerto, toolOk con tier.
```

## slices

### S1 — Tipos de contrato + funciones de cliente

- **Status**: done
- **Files**:
    - `plugins/issues/src/lib/contracts/interfaces/security.interface.ts` (nuevo — renombrado al implementar para cumplir `lint:types-in-contracts`)
    - `plugins/issues/src/lib/contracts/index.ts` (re-export)
    - `plugins/issues/src/lib/github-client.ts` (4 funciones nuevas)
- **Gate**: `bunx tsc --noEmit -p plugins/issues/tsconfig.json`

### S2 — Herramientas `issues_list_dependabot` + `issues_list_code_scanning`

- **Status**: done
- **Files**:
    - `plugins/issues/src/lib/tools/list-dependabot.tool.ts` (nuevo)
    - `plugins/issues/src/lib/tools/list-code-scanning.tool.ts` (nuevo)
    - `plugins/issues/src/lib/tools/list-issues.tool.ts` (ensanchar
      `IGithubClient`)
    - `plugins/issues/src/lib/tools/index.ts` (composición)
    - `plugins/issues/src/index.ts` (adaptador `createGithubClient`)
- **Gate**: `bunx vitest run plugins/issues/tests`

### S3 — Herramientas `issues_list_secret_scanning` + `issues_list_advisories`

- **Status**: done
- **Files**:
    - `plugins/issues/src/lib/tools/list-secret-scanning.tool.ts` (nuevo)
    - `plugins/issues/src/lib/tools/list-advisories.tool.ts` (nuevo)
    - `plugins/issues/src/lib/tools/index.ts` (composición)
    - `plugins/issues/src/index.ts` (adaptador)
- **Gate**: `bunx vitest run plugins/issues/tests`

### S4 — Tests de las 4 herramientas y del cliente

- **Status**: done
- **Files**:
    - `plugins/issues/tests/src/lib/github-client-security-secret-scanning-advisories.spec.ts` y `plugins/issues/tests/src/lib/github-client-security-dependabot-code-scanning.spec.ts` (nuevos — el spec único se partió en dos al implementar) (nuevo —
      fakes de spawn/fetch por tier, igual que los specs de issues)
    - `plugins/issues/tests/src/lib/tools/list-dependabot.tool.spec.ts` (nuevo)
    - `plugins/issues/tests/src/lib/tools/list-code-scanning.tool.spec.ts` (nuevo)
    - `plugins/issues/tests/src/lib/tools/list-secret-scanning.tool.spec.ts` (nuevo)
    - `plugins/issues/tests/src/lib/tools/list-advisories.tool.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/issues/tests`

### S5 — Validación completa + docs

- **Status**: done
- **Files**:
    - `plugins/issues/README.md` (documentar las 4 herramientas nuevas)
    - `docs/mcp-vertex/host-hints/agent-instructions.generated.md` (si
      aplica regeneración)
- **Gate**: `bun run validate`
- review-state: in_review
- review-implementer: technical_investigator
## dependency graph

S1 → S2, S3 (las tools consumen tipos + cliente). S2 y S3 son
independientes entre sí — se pueden implementar en paralelo. S4 depende
de S2+S3. S5 cierra todo. Sin dependencias externas: el cliente de 3
tiers y el patrón de registro ya existen.

## acceptance

- `issues_list_code_scanning` devuelve las alertas abiertas de CodeQL
  (incluidas las 127 "Polynomial regular expression" de main) con
  `rule.id`, `severity`, `html_url` y `most_recent_instance.path`,
  vía al menos un tier (`gh` o `rest-authed`).
- `issues_list_dependabot` devuelve alertas con `package.ecosystem`,
  `package.name`, `severity` y `state`.
- `issues_list_secret_scanning` y `issues_list_advisories` devuelven
  sus shapes respectivos con el mismo contrato `ok`/`tier`.
- Todas respetan `limit` y filtran `state` (open por defecto).
- `bun run validate` en verde; las 4 tools aparecen en
  `mcp-vertex_overview` cuando `plugins.issues.options.repo` está
  configurado.

## risks and mitigations

- **Riesgo: los endpoints de security requieren scope/token con permisos
  de `security_events` o admin en repos privados.** Mitigación: el tier
  `gh` hereda los scopes de `gh auth login`; cuando un 403 llegue por
  REST, el error de la herramienta debe incluir el nextAction
  "check token scopes (`gh auth status`)".
- **Riesgo: respuestas paginadas grandes (127+ CodeQL alerts).**
  Mitigación: `per_page` + `limit` por defecto (30), como `listIssues`;
  el schema incluye `truncated` cuando el total excede el límite.
- **Riesgo: drift entre el shape real de la API y los contratos escritos
  a mano.** Mitigación: S4 fija los fixtures de los specs contra las
  muestras de la documentación de GitHub, y las funciones de mapeo son
  defensivas (defaults para campos opcionales), igual que `toSummary`.
