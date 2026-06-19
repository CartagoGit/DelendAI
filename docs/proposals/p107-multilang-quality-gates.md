---
id: p107
type: proposal
status: idea
track: core+scaffold
date: 2026-06-19
related:
  - p105 # web bugfixes & UX overhaul (where this is mentioned as B17)
  - p99 # multi-model audit (shares the "more than just TS" theme)
---

# p107 — Quality gates multi-lenguaje (ESLint / Prettier / TypeCheck)

> **Estado: IDEA para decidir. NO IMPLEMENTAR TODAVÍA.** Recoge la
> necesidad de que `@mcp-vertex/quality` (y el `check-i18n.ts` +
> `validate` general) no asuman TypeScript como único lenguaje.
> Hoy todo el gate es `tsc --noEmit`; la idea es ampliarlo a
> cualquier lenguaje (JVM, Python, Rust, Go) **sin que el core
> tenga que conocer cada toolchain**.

## 0. El problema (en palabras del usuario)

> "Deberíamos tener también instrucciones específicas para
> clarificar ... que también se pueden importar eslints
> predefinidos o sobrescribir con los propios, o prettier o
> typechecks (y notificando que por ahora solo vamos con ts, pero
> que la idea es hacerlo funcional con cualquier lenguaje)."

Traducción técnica:

1. La **documentación pública** (web, README, propuesta p105) no
   menciona que el gate de calidad incluye lint/format/typecheck,
   ni cómo extenderlos.
2. La arquitectura del core está acoplada a TypeScript:
   - `package.json` raíz define `lint: biome ci`, `test: vitest`,
     `typecheck: tsc --noEmit`, `validate: typecheck + lint + scss
     + test` — todo JS/TS.
   - `apps/web/scripts/check-i18n.ts` valida traducciones con
     lógica hardcoded para 12 códigos.
   - El `quality` plugin ejecuta `lint/test/build` pero el
     `IMcpVertexProject` no expone un `lang` ni un mapping
     "language → checker command".
3. Los usuarios que adopten mcp-vertex en proyectos Kotlin / Python
   / Rust / Go no pueden usar el gate de calidad tal cual.

## 1. Lo que se quiere

Una arquitectura de quality gates **agnóstica del lenguaje** del
proyecto, con tres ejes:

1. **ESLint** (presets + override por proyecto).
2. **Prettier** (idem).
3. **TypeCheck** (cualquier comando que devuelva exit code 0/1
   según pase o no).

Más una página de la web (sección "Quality gates" en `/guide`,
anclada desde la home) que documente:

- Cómo se incluyen los presets en `mcp-vertex.config.json`.
- Cómo se sobrescriben con la config del proyecto.
- Que **por ahora solo TS está cableado de serie**, pero la
  arquitectura está abierta a cualquier toolchain.

## 2. Lo que es y no es posible

**Sí es posible**:

- Definir un contrato `IQualityGate` en el core: `{ id, command,
  args, expect, languages, docs }`.
- Aceptar gates adicionales vía `mcp-vertex.config.json`:
  ```jsonc
  {
    "validationMatrix": {
      "scopes": {
        "typecheck": [
          { "command": "tsc --noEmit", "expect": "pass" },
          { "command": "mypy .", "expect": "pass" }
        ]
      }
    }
  }
  ```
- Mapeo `language → preset`: el usuario declara el `language` del
  proyecto (`ts`, `py`, `kt`, `rs`, `go`...) y el plugin
  `quality` aplica los gates del preset por defecto + los del
  override del proyecto.
- Presets oficiales:
  - `ts`: `tsc --noEmit` + `eslint .` + `prettier --check .`
  - `py`: `mypy .` + `ruff check .` + `black --check .`
  - `kt`: `kotlinc -script` o detekt
  - `rs`: `cargo check` + `cargo clippy` + `rustfmt --check`
  - `go`: `go vet ./...` + `gofmt -l .`

**No es posible / fuera de scope**:

- El core **no instala** los toolchains de cada lenguaje.
- El core **no mantiene** los presets: cada preset vive en un
  paquete npm propio (o como un subdirectorio de `plugins/quality`
  opcional). El core solo sabe cómo ejecutar `command` + medir
  exit code.
- La integración profunda con LSPs, coverage, etc. queda fuera.

## 3. Diseño (alto nivel)

### 3.1 `IQualityGate` (core)

```typescript
export interface IQualityGate {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly expect: 'pass' | 'fail'; // exit code 0/1
  readonly languages: readonly string[]; // 'ts', 'py', 'kt', ...
  readonly docs?: string;
}
```

### 3.2 `mcp-vertex.config.json`

```jsonc
{
  "$schema": "...",
  "language": "ts", // opcional; default 'ts'
  "plugins": {
    "quality": {
      "options": {
        "presets": ["ts-eslint", "ts-prettier"],
        "extraGates": [
          {
            "id": "custom-shellcheck",
            "command": "shellcheck",
            "args": ["**/*.sh"],
            "expect": "pass",
            "languages": ["sh"]
          }
        ]
      }
    }
  }
}
```

### 3.3 `plugins/quality` consume el contrato

- Lee `ctx.options.presets` y carga los presets oficiales (uno
  por lenguaje) desde `@mcp-vertex/quality/presets/<lang>.ts`.
- Aplica los `extraGates` definidos por el proyecto.
- Expone los gates como **tools MCP** (`quality_run { scope }`,
  `quality_list`).

### 3.4 Documentación (web)

Nueva página `/guide` (propuesta p105 B16) con sección "Quality
gates" + anclaje en la home "Linting, formatting, type-checking
beyond TypeScript".

## 4. Slices (orden, disjuntos)

- `s1-contract`:
  - `packages/core/src/lib/contracts/interfaces/quality-gate.interface.ts`
  - re-export desde `public/index.ts`
  - tests en `packages/core/tests/`
  - gate: `lint`
- `s2-presets-ts`:
  - `plugins/quality/presets/ts.ts` (eslint + prettier + tsc)
  - tests
  - gate: `lint`
- `s3-presets-py-kt-rs-go`:
  - `plugins/quality/presets/{py,kt,rs,go}.ts` (los 4 lenguajes extra)
  - tests
  - gate: `lint`
- `s4-quality-plugin-integration`:
  - `plugins/quality/src/lib/quality.ts` lee presets + extraGates
  - tools MCP re-renderizados con los gates resueltos
  - gate: `lint`
- `s5-docs`:
  - nueva página `/guide` con la sección "Quality gates"
  - anclaje en la home
  - i18n en 12 idiomas
  - gate: `lint`
- `s6-validate`:
  - `bun run validate` verde
  - `bun run site:strict` verde
  - gate: `lint`

## 5. Acceptance

- [ ] El core expone `IQualityGate` y el parser de
      `mcp-vertex.config.json` lo reconoce.
- [ ] `plugins/quality` tiene presets para TS, Python, Kotlin, Rust
      y Go (mínimo uno por lenguaje; el resto pueden ser
      "marcador de posición" si la toolchain no está disponible
      en CI).
- [ ] La web documenta la arquitectura agnóstica + el caso TS
      actual + cómo extender a otros lenguajes.
- [ ] `bun run validate` verde.
- [ ] `bun run site:strict` verde.

## 6. No-objetivos

- No mantener los toolchains de cada lenguaje (no instalamos
  `mypy` automáticamente, por ejemplo).
- No traducir la página `/guide` a 12 idiomas (mínimo: EN + ES;
  el resto pueden tener fallback a EN con un badge "pendiente
  de traducir").
- No rehacer el sistema de quality-gates de los plugins existentes
  (solo ampliar).
- No cubrir Go-style `go vet` con reglas de lint arbitrarias.

## 7. Riesgos

- **Acoplamiento del core a JS/TS**: el `package.json` raíz
  define `lint/test/validate` con comandos JS. Migrar a un
  registro abstracto es un refactor mayor; aquí dejamos los
  comandos existentes como **defaults** y añadimos la capa
  `IQualityGate` por encima. Los defaults siguen siendo JS/TS.
- **CI heterogéneo**: en CI hay que asumir que el toolchain del
  lenguaje está instalado. No lo garantizamos.
- **Complejidad del `IQualityGate`**: la propuesta es ambiciosa
  (5 lenguajes, 5 presets, 5 tests × preset). Cortar a **2
  lenguajes** (TS + Python) y dejar el resto como stub.
