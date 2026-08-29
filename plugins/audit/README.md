# `@mcp-vertex/audit`

Multi-model audit plugin (l99, alcance A). Estandariza el formato de
auditoría del repo y consolida N auditorías en una sola hoja de ruta
unificada. La planificación y consolidación son locales; `audit_run` es una
superficie de red explícita que usa únicamente los proveedores y credenciales
entregados por el host.

### Activation

```bash
mcp-vertex --plugins=audit
```

## Tools

### Tipos de auditoría

Todas las herramientas que generan o consolidan auditorías aceptan
`auditType: "valuation" | "plan"` y usan `valuation` por defecto para
mantener compatibilidad:

- `valuation`: valoración técnica completa del proyecto, con hallazgos y
  propuestas de corrección (`kind: fix`).
- `plan`: auditoría exhaustiva orientada a ejecución. El brief exige snapshot,
  puntuaciones, hallazgos accionables, roadmap, arquitectura objetivo,
  Definition of Done y plantilla de propuestas. Cuando el plugin `proposals`
  está disponible, el scaffolder crea un plan padre (`type: plan`, `kind: plan`)
  con propuestas hijas de corrección (`kind: fix`) enlazadas mediante
  `contains.proposals`.

El contrato es agnóstico: el plugin no asume el nombre, estructura, lenguaje ni
taxonomía del proyecto auditado. Los scopes de capas, dimensiones, rutas y
reglas específicas los proporciona el host mediante sus opciones.

### `audit_plan { scope? }` — devuelve el brief canónico

Genera el markdown que el agente copia/pega en cualquier modelo
(Antigravity, Claude Code, Copilot, Codex, …). Scope opcional
(`full` | `core` | `plugins` | `web` | `security` | `tokens` |
`tests` | `docs`; default `full`) para enfocar la auditoría.

El brief incluye:

- Frontmatter con fecha, revisor y metodología.
- Rúbrica de 5 bandas (🔴 FATAL · 🟠 MUY MAL · 🟡 MEJORABLE · 🟢 OK · 🌟 MUY BIEN · 💎 PERFECTO).
- Checklist de secciones a inspeccionar.
- Tabla de puntuación obligatoria de 9 dimensiones.

### `audit_consolidate { auditDir?, topActions? }` — consolida N auditorías

Lee cada `*.md` de `auditDir` (default `docs/mcp-vertex/proposals/done/audits`), los
parsea con `parseAuditBody`, deduplica los hallazgos por **título +
archivo citado**, promedia las puntuaciones por dimensión, y devuelve:

- `auditsFound`, `skipped` (auditorías que no se pudieron parsear).
- `consensus`: array por dimensión con las puntuaciones de cada modelo
  + la media redondeada a 1 decimal.
- `findings`: array deduplicado con `worstSeverity`, `files`, `seenBy`.
- `topActions`: las 5 acciones más urgentes (FATAL/MUY_MAL consensuadas).
- `markdown`: el documento maestro en markdown, listo para commitear.

## Por qué un plugin y no solo docs

- El brief es **canónico**: vive en `buildBrief()` y se exporta como
  string; cualquier consumidor (web, scripts, otros plugins) lo
  reemite sin divergencia.
- La consolidación es **automática y reproducible**: el mismo input
  produce el mismo output (sin timestamps, sin orden aleatorio).
- El orquestador puede invocar `audit_consolidate` después de cada
  ronda sin intervención humana.

## Formato esperado de cada auditoría individual

Cada `.md` que un modelo escribe debe seguir el brief canónico:

- `# 🔍 Auditoría Exhaustiva — <título>`
- Frontmatter: `> Fecha | Revisor | Metodología`
- `## 📊 Resumen Ejecutivo`
- `## 🔴 FATAL`, `## 🟠 MUY MAL`, `## 🟡 MEJORABLE`, `## 🟢 OK`, …
- Cada hallazgo: `### N. <título>` con `**Fichero**: <ruta>`
- Tabla final: `| Dimensión | Puntuación | Comentario |`

El parser es **permisivo**: secciones desconocidas se ignoran, campos
vacíos no rompen. El formato del brief es la **convención recomendada**
pero el parser tolera variantes razonables.

## Efectos

`audit_plan` es puro y `audit_consolidate` lee informes locales. `audit_run`
declara red y puede escribir informes/propuestas cuando así se solicita y el
plugin `proposals` está disponible. La respuesta informa cualquier escritura
omitida; no existe un modo silencioso de fingir que se materializó.

## Configuración

```jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "audit": { "options": { "topActions": 5, "autoScaffoldProposals": true } }
  }
}
```

También admite `auditDir`, `proposalsDir`, `dimensions`, `layers`,
`projectName`, `configFileName` y `crossCuttingAdditions`; el schema runtime
es la fuente autoritativa de tipos y límites.

## Ver también

- `docs/mcp-vertex/proposals/done/audits/` — los archivos `.md` de auditorías individuales
  que este plugin parsea.

### `audit_run { scope, targets, ... }` — ejecuta revisores configurados

Contacta los proveedores solicitados y por ello declara efecto de red. Las
claves se suministran en la petición/entorno y nunca se escriben en los
informes. Si el plugin `proposals` está cargado, puede materializar propuestas;
si no, devuelve explícitamente que ese paso fue omitido.

## Self-audit

`self_audit` composes `aggregateSelfAudit`, `rankFindings`, and,
when the caller grants consent, `fileProposalsFromBacklog` to turn
scanner findings into one ranked backlog and optionally file the top
items as proposal drafts for human review.

## Activate

```bash
mcp-vertex --plugins=audit
```

### Inputs

`self_audit { limit?, consent? }`

- `limit` caps how many ranked findings are returned and, when filing is
  enabled, how many proposal drafts can be created in one run.
- `consent` is required for proposal filing; omit it or pass `false`
  to keep the run read-only.

### Outputs

Returns the aggregated audit summary plus the ranked backlog. When
`consent: true`, the filing step also returns an `IFileProposalsResult`
payload with:

- `filed`, `skipped`, `ranAt`
- `drafts[]` with `absPath`, `proposalId`, `rank`, and the source
  `finding`

### Filing proposals

Proposal filing is consent-gated: drafts are only written when the
caller passes `consent: true`. The filing step also applies a separate
`limit` safety cap (default `3`) so a large backlog cannot flood the
proposals directory in a single run.

### Example

Minimal tool call:

```json
{"limit": 5, "consent": true}
```

Result shape:

```json
{
  "filed": 3,
  "skipped": 2,
  "drafts": [
    {
      "absPath": "/repo/docs/mcp-vertex/proposals/ready/f0012345-fix-issue.md",
      "proposalId": "f0012345",
      "rank": 1,
      "finding": {
        "ruleId": "rule-id",
        "severity": "high",
        "message": "Explain the issue"
      }
    }
  ],
  "ranAt": "2026-07-26T00:00:00.000Z"
}
```

### Design reference

See [docs/mcp-vertex/proposals/done/feats/f00139-self-audit-dogfood-loop.md](docs/mcp-vertex/proposals/done/feats/f00139-self-audit-dogfood-loop.md)
for the original S3 design notes and acceptance criteria.
