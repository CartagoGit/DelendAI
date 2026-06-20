# `@mcp-vertex/audit`

Multi-model audit plugin (p99, alcance A). Estandariza el formato de
auditoría del repo y consolida N auditorías en una sola hoja de ruta
unificada. **Sin red, sin secretos.**

## Activate

```bash
mcp-vertex --plugins=audit
```

## Tools

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

Lee cada `*.md` de `auditDir` (default `docs/proposals/audits`), los
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

## Alcance A (este plugin) vs B (futuro)

| | A (este plugin) | B (p99 B, propuesta separada) |
|---|---|---|
| Red | ❌ | ✅ (OpenRouter, etc.) |
| Secretos | ❌ | ✅ (claves API) |
| Descubrimiento de modelos | ❌ (declarado en el brief) | ✅ (`/models` API) |
| Disparo | manual (pegar el brief) | automático (`audit_run`) |
| Consolidación | ✅ | ✅ |

A y B son ortogonales: A es la **infraestructura portable**, B es
**una automatización por encima**.

## Configuración

```jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "audit": { "options": {} }
  }
}
```

Sin opciones hoy. Futuras opciones: `auditDir`, `dimensions`,
`topActions`.

## Ver también

- [`docs/proposals/p99-feat-multi-model-audit-plugin.md`](../../docs/proposals/p99-feat-multi-model-audit-plugin.md)
  — la propuesta completa.
- `docs/proposals/audits/` — los archivos `.md` de auditorías individuales
  que este plugin parsea.