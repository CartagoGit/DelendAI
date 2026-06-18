---
id: p99
type: proposal
status: idea
track: audit
date: 2026-06-18
---

# p99 — Plugin de auditoría multi-modelo (`@mcp-vertex/audit`)

> **Estado: IDEA para decidir.** No implementado. Resume el problema, lo que es y
> no es posible, y tres enfoques con una recomendación. Decide tú el alcance.

## Qué quieres

Una herramienta que audite el proyecto (entero o una sección) **con varios modelos
de distintas empresas** — porque cada uno encuentra cosas distintas — usando
**siempre el mismo formato** que las auditorías de este repo
(`docs/proposals/audits/`), y que **sepa a qué modelos tiene acceso** el usuario
(Antigravity→Sonnet 4.6+Gemini 3.5; Claude Code→Opus 4.8; Copilot→GPT-5.4/m3-minimax;
Codex→GPT-5.4; y cambiarán).

## La realidad técnica (lo que SÍ y NO se puede)

Un servidor MCP es un proceso stdio local. Esto acota lo posible:

- ❌ **No puede saber por sí solo qué modelo usa el IDE anfitrión**, ni qué modelos
  puede lanzar el usuario en otros IDEs. MCP no pasa la identidad del modelo a las
  tools; el servidor no "ve" al host.
- ✅ **Sí** puede saberlo por tres vías:
  1. **Que el agente que llama se identifique** (un arg `--model`/`by`), porque el
     agente sí conoce su propio modelo.
  2. **Enumerar modelos vía API**: con claves de proveedor, preguntar a su `/models`
     (Anthropic, OpenAI, Google… y sobre todo **OpenRouter**, que con UNA clave lista
     cientos de modelos de muchas empresas).
  3. **Que el usuario declare su roster** en `mcp-vertex.config.json`.
- Conclusión: el **descubrimiento automático** solo existe en la vía con claves API;
  fuera de eso es **declarado** (config) o **por-llamada** (el agente lo dice).

## Tres enfoques

### A) "Audit kit" — sin claves, portable  ⭐ recomendado como primer paso

Un plugin/tool que **estandariza el formato y automatiza lo doloroso (la unificación)**,
sin red ni secretos:

- `audit_plan { scope? }` → devuelve **el brief canónico**: rúbrica y formato exactos de
  nuestras auditorías (dimensiones, bandas fatal→perfecto, citas `archivo:línea`, tabla
  de calificaciones, convención de nombre `DD-MM-YYYY- <Tool> (<Modelo>).md`), + un
  **checklist de secciones** (arquitectura, cada plugin, seguridad, tokens, tests, CI,
  docs, web…). El usuario **pega ese mismo brief en cada modelo que tenga** (Antigravity,
  Claude Code, Copilot, Codex…); cada uno escribe su `*.md` en `docs/mcp-vertex/audits/`.
- `audit_consolidate` → lee las N auditorías (de distintos modelos) y produce el **maestro
  unificado**: dedup, consenso de nota, quién-encontró-qué, severidad — exactamente lo que
  hemos hecho a mano en este proyecto.
- **Pros:** cero secretos; funciona con los modelos que tengas hoy y mañana; agnóstico.
  **Contra:** disparas cada modelo a mano (pero es un pegado por modelo, guiado por el checklist).
- **El 80/20 real:** lo que más cansa no es escribir cada auditoría (lo hace cada IDE/modelo
  gratis), sino **unificarlas**. Eso es justo lo que automatiza este enfoque, sin coste.

### B) "API fan-out" — con claves, un comando  (opt-in, aislado)

- Bloque de config con claves (Anthropic/OpenAI/Google/xAI/**OpenRouter**). OpenRouter es la
  pieza clave: **una clave → muchos modelos de muchas empresas** + catálogo (`/models`).
- `audit_run { models?, scope? }` → llama a cada modelo con el brief, recoge cada `.md` y
  **auto-consolida**. Aquí **sí** se puede listar a qué modelos tienes acceso (desde las claves).
- **Pros:** un comando, multi-empresa real. **Contra:** claves + gasto de tokens; el servidor
  pasa a hacer **red + secretos** → rompe la postura "sin red por defecto", así que debe ser un
  **plugin separado, opt-in y con el efecto `network` declarado** (M31).

### C) "Roster declarado" — híbrido

- El usuario lista en config `auditModels: [{ via:'antigravity', models:[…] }, …]`; el tool
  adapta el checklist y **lleva la cuenta** de cuáles ya están hechas. Se combina con A (manual)
  o B (API).

## Recomendación

1. **Empezar por A** (`audit_plan` + `audit_consolidate`) — un nuevo plugin `@mcp-vertex/audit`.
   Es barato, sin secretos, encaja con lo que ya hacemos, y resuelve lo que más duele
   (formato uniforme + **consolidación automática**). Calza con la identidad del proyecto
   (que ya es muy "auditoría-céntrico").
2. **Añadir B después** como modo opt-in con **OpenRouter** (una clave, multi-empresa,
   descubrimiento de modelos), aislado y con `effects: ['network']`.
3. (C) como azúcar encima de A/B para no repetir modelos.

## Decisión (marca lo que quieras)

- [ ] A: audit kit (brief + consolidación), sin claves. ¿Carpeta de salida
      `docs/mcp-vertex/audits/`?
- [ ] B: fan-out por API. ¿Solo OpenRouter, o también claves por proveedor?
- [ ] C: roster declarado en config.
- [ ] Nombre del plugin: `@mcp-vertex/audit` (u otro).
- [ ] ¿La consolidación debe **escribir** el maestro o solo proponer el diff (read-only)?
