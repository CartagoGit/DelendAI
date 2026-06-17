# Auditoría del estado actual de `@cartago-git/mcp-core` — Claude Code (Opus 4.8)

> Fecha: 17-06-2026 (tarde, casa). Auditoría **del estado ACTUAL** tras cerrar
> M1–M15, la serie H1–H10 (4ª auditoría MiniMax) y el workstream W1/W2
> (auto-release + Pages). Hecha leyendo el código real y ejecutando la suite, **no
> a partir de las auditorías previas**. Sus hallazgos se incorporan en la misma
> sesión a `audits/16-06-2026- Auditoría Maestra (Unificada).md`.
>
> **Estado verificado (tras `bun install`):** `bun run validate` VERDE — **72
> ficheros de test, 461 + 10 skip = 471 tests**, typecheck limpio, **Biome lint**
> limpio, **coverage gate** verde (umbrales 72/55/75/73). `bun run build` → 10
> paquetes; `node packages/core/dist/cli.js --check` arranca (**9 tools de core**,
> con `metrics`). ~29,9k LOC fuente, **47 `registerTool`**, 10 paquetes.

---

## 0. Veredicto: **9,6 / 10**

El proyecto ha pasado de "excelente prototipo" a **plataforma MCP local madura y
publicable**. Lo que dos días atrás eran agujeros (cwd, locks no atómicos, runtime
bun-only, I/O síncrono, sin linter) está cerrado. Hoy:

- **Correctitud de concurrencia** resuelta (mutex con token de propiedad + heartbeat,
  escritura atómica, cuarentena de corrupción, migraciones de estado con backup).
- **Runtime universal** (`dist/` ESM + `.d.ts`, corre en Node/Deno/bun y cualquier
  gestor; `bin` con shebang node).
- **Disciplina de repo**: Biome como linter, coverage gate, `bun.lock` trackeado,
  SDK de tipos generado con drift-guard, auto-release + sitio Pages en CI.
- **Higiene de código**: **0 `@ts-ignore`**, **0 `any` real** en `src` (las
  coincidencias son comentarios de la regla "no as any" o `dist/`), `console.*`
  limpio (un único `console.error` legítimo en `delivery-verifier`), y los
  `TODO` son **plantillas** que el scaffold genera para el usuario, no deuda.

No es 10/11 todavía por **una migración async a medio terminar fuera de
`proposals`**, un puñado de **nice-to-haves de plataforma** sin hacer, y el
**sitio web profesional (W3)** sin empezar. Nada es rearquitectura.

---

## 1. 🟠 A1 (P1) — I/O síncrono residual FUERA de `proposals/lib`

**El hallazgo real más relevante.** H2/M4/M5 erradicaron el I/O síncrono en
`proposals/lib`, `docs`, `git` y `search`, pero **el mismo patrón sigue vivo en
core y en `memory`/`deps`** — handlers de tool que son `async` pero hacen I/O
bloqueante:

- **`plugins/memory/src/lib/store.ts` — store 100% síncrono.**
  [`readStore`](../../../plugins/memory/src/lib/store.ts) usa `existsSync` +
  `readFileSync`; `writeStore` usa `writeFileAtomicSync`. Ambos corren **dentro**
  del `withFileMutex` async (`saveNote`/`removeNote`), así que el read-modify-write
  **bloquea el event loop** del servidor en cada `memory_save`/`memory_forget`. Es
  el caso más notable: `memory` es un store caliente y multi-agente. → migrar a
  `readFile`/`writeFileAtomic` async.
- **`packages/core/src/lib/bootstrap/bootstrap-tool.ts`** — `existsSync` /
  `readFileSync` / `readdirSync` en el provider de FS que consumen
  `analyze_project`/`plan`/`create_server` (handlers de tool).
- **`packages/core/src/lib/scaffold/scaffold-tool.ts`** — el camino de **aplicado**
  (`!dryRun`) hace `existsSync` + `mkdirSync` + `writeFileSync` síncronos por
  fichero. (El `apply`/`--write` que pedían las auditorías ya existe — pero síncrono.)
- **`plugins/deps/src/lib/engine.ts`** — `existsSync` + `readFileSync` del manifest
  (un solo fichero pequeño → impacto menor, pero inconsistente con el resto).
- *Aceptable y no listado como deuda:* las lecturas de **boot** en `assemble.ts`
  (config file + check de blueprint) y `writeFileAtomicSync` (variante sync por
  diseño): se ejecutan una vez en el arranque, fuera de la ruta de respuesta.

**Fix:** cerrar la migración async iniciada en H2 también en `core/bootstrap`,
`core/scaffold` (apply), `memory/store` y `deps/engine`. Bajo riesgo, mecánico,
y deja el invariante "ningún handler de tool bloquea el event loop" **completo**.

---

## 2. 🟡 A2 (P2) — Nice-to-haves de plataforma (verificados como ausentes)

Ninguno es bloqueante; son lo que separa "muy bueno" de "referencia de industria":

- **TypeDoc** de `public/` — ausente (no hay dep ni script). La API pública está
  bien comentada pero no navegable sin leer el source.
- **`/examples`** — no existe. Un `examples/minimal`, `examples/swarm` y
  `examples/custom-plugin` (con tests) bajarían enormemente la barrera de entrada.
- **JSON Schema de `mcp-core.config.json`** — no publicado. Daría autocompletado en
  editores y validación del config sin leer docs.
- **Skills/prompts versionados** (operator, swarm-runner, plugin-author, `finish`) —
  los prompts `work`/`orchestrate` existen, pero falta el set de skills materializable.
- **`quality_cancel`** — no implementado: no se puede abortar un `run_quality` largo
  por PID; hay que esperar al timeout. (`metrics` M12 y `command-policy` M13 sí están.)
- **Freno duro anti-idle en `auto_work`** — hoy devuelve `state:'idle'`/`all-claimed`
  (guía), pero **no hay contador de no-progreso** que escale a error tras N idles del
  mismo agente. Sigue siendo *guidance, no enforcement*.

---

## 3. 🟡 A3 (P3) — Sitio web profesional (W3) sin empezar

El `scripts/build-site.ts` actual (W1) genera un `index.html` mínimo autocontenido
desde la lista viva de tools. El encargo W3 (web de producto profesional: componentes
SCSS+TS+HTML separados, i18n multi-idioma, benchmarks, explicación de concepto,
**marquesinas duales** con hover-pausa + zoom de icono, responsive total) **no está
iniciado**. Spec completo en `../RESUMEN-SESION-2026-06-17.md`. Es el mayor trozo de
trabajo abierto, pero es producto/marketing, no core.

---

## 4. 🔵 A4 (nit) — DX: el typecheck raíz se acopla al SDK hoisteado

`scripts/build-site.ts` importa `@modelcontextprotocol/sdk` y el tsconfig raíz
incluye `scripts/**/*`, así que **un `git pull` sin `bun install` deja el typecheck
ROJO** (TS2307 + `any` implícitos en cascada) hasta reinstalar. En CI no pasa
(`bun install --frozen-lockfile` lo resuelve, el SDK está en devDeps raíz + lock),
pero es una pequeña trampa de DX. Opciones: excluir `scripts/` del typecheck
principal (typecheck propio para scripts), o que `build-site` no dependa del SDK en
type-time. Menor.

---

## 5. Tokens y bucles/bloqueos (consolidado)

- **Tokens:** sigue ejemplar — cold-start <300 tok, `overview compact`, knowledge
  lazy, JSON compacto en tools calientes (M8/H3 cerraron el pretty-print residual),
  push de `notification`. Y ahora **medible**: el meta-tool `metrics` (M12) cuantifica
  llamadas/errores/latencia/bytes por tool. Sin fugas abiertas conocidas.
- **Bucles/bloqueos:** sin deadlock ni bucle infinito alcanzable. Único asterisco de
  *rendimiento*: el I/O síncrono de A1 puede congelar el event loop bajo FS lento
  (no es bloqueo lógico, es latencia). El anti-idle de `auto_work` es blando (A2).

---

## 6. Scoreboard

| Dimensión | Nota |
|---|---|
| Arquitectura / contrato de plugins | ⭐⭐⭐⭐⭐ |
| Concurrencia / I/O (correctitud) | ⭐⭐⭐⭐⭐ |
| I/O async (no bloquear event loop) | ⭐⭐⭐⭐ (A1: core+memory+deps sync) |
| Runtime / publicabilidad (`dist/`) | ⭐⭐⭐⭐⭐ |
| Eficiencia de tokens (+ métricas) | ⭐⭐⭐⭐⭐ |
| TypeScript / higiene (0 any, 0 ts-ignore) | ⭐⭐⭐⭐⭐ |
| Testing (471, caos, e2e, coverage gate) | ⭐⭐⭐⭐½ |
| Lint / CI / Release / Pages | ⭐⭐⭐⭐⭐ |
| Seguridad (allow/deny cmds, redacción) | ⭐⭐⭐⭐½ |
| Observabilidad (`metrics`, `--verbose`) | ⭐⭐⭐⭐½ |
| Migraciones de estado | ⭐⭐⭐⭐½ |
| Documentación de producto / web (W3) | ⭐⭐½ (sitio mínimo; W3 pendiente) |
| Onboarding (TypeDoc/examples/JSON-schema) | ⭐⭐⭐ |

**Global: 9,6/10.** Cerrando **A1** (async completo) → ~9,8; +A2 (TypeDoc/examples/
schema/skills/quality_cancel/anti-idle) → ~10,0; +A3 (web W3) + publish real → **11/10**.

---

## 7. Plan accionable (orden por valor/esfuerzo)

1. **A1 — cerrar el barrido async**: `memory/store` (lo primero, es hot), luego
   `core/bootstrap`, `core/scaffold` (apply) y `deps/engine`. Invariante: 0 `*Sync(`
   en handlers de tool en todo el repo. *(P1, mecánico)*
2. **A2 — onboarding**: JSON Schema del config + TypeDoc + `/examples` (los 3 de más
   ROI para adopción), luego skills versionadas, `quality_cancel`, freno duro
   anti-idle en `auto_work`.
3. **A3 — W3**: construir el sitio profesional (spec en el RESUMEN).
4. **A4** (opcional): desacoplar el typecheck raíz del SDK de `build-site`.
5. **Despliegue** (lo hace el usuario): `NPM_TOKEN`, Pages = Actions, merge
   `develop → main`.

— Auditoría de estado actual, 17-06-2026. Hallazgos verificados contra el código y la suite.
