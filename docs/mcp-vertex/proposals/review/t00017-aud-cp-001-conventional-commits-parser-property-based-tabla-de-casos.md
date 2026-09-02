---
id: t00017
title: "AUD-CP-001 — Conventional Commits parser: property-based + tabla de casos"
kind: test
status: review
type: proposal
track: commit-policy
date: 2026-08-25
priority: P0
classification: CONFIRMADO
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track B / t00017"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
    finding: AUD-CP-001
related:
    - q00006
    - x00259 # el fix cuya corrección se cubre
    - x00265 # requireConventional consume este parser
last-transition-id: 7166f5d5-ffca-49ef-83c1-da5f3cb9c78b
last-correlation-id: 7166f5d5-ffca-49ef-83c1-da5f3cb9c78b
last-transition-from: in-progress
---

# t00017 — Conventional Commits parser: property-based + tabla de casos

## Goal

Cubrir completamente el parser/constructor de Conventional Commits
de `commit-policy`, de modo que cualquier regresión tipo
"`buildScopedMessage` rompe el header" se detecte sin intervención
manual. La corrección está en `x00259`; este proposal define el
contrato de cobertura que esa corrección debe satisfacer.

Cobertura exigida:

1. **Tabla de casos** explícitos, escrita como fixture
   versionada.
2. **Property-based test** que genera 1000 mensajes aleatorios y
   verifica `parseHeader(rebuild(x)) === x` para todo `x`
   parseable.
3. Casos adversariales (unicode, emojis, whitespace al borde).

## Why

- El bug AUD-CP-001 ("type, scope y `!` no preservados") es
  exactamente del tipo "predicado ≠ acción": un caso pasa, el
  siguiente rompe silenciosamente. Solo property-based + tabla lo
  cazaría.
- Pieza que habilita `x00265` (`requireConventional=true`
  refusals) y `f00182` (`CommitPolicyEngine`).
- El plugin `commit-policy` se introdujo recientemente (`f00181`),
  no hay cobertura previa robusta del parser.

## Non-goals

- No testear el driver de git ni el engine.
- No testear staging ni cross-agent — eso es `t00018`/`t00019`.
- No añadir `fast-check` u otra librería externa: usar el helper
  propio de property tests del proyecto si existe; si no, escribir
  el generador a mano (1000 casos).

## Architecture

### 1. Ubicación de los tests

- Archivo principal:
  `plugins/commit-policy/tests/src/lib/contracts/i18n-types.spec.ts`
  (o `scope.spec.ts` según convención que decida `x00259`).
- Fixture de casos esperada:
  `plugins/commit-policy/tests/fixtures/conventional-cases.json`

### 2. Tabla de casos mínimos (≥ 12 filas)

| Entrada | Salida esperada | Notas |
| --- | --- | --- |
| `feat: x` | `feat(f00181): x` | sin scope → añadir default |
| `fix: x` | `fix(f00181): x` | |
| `fix!: x` | `fix(f00181)!: x` | `!` en posición correcta |
| `fix(core): x` | `fix(core): x` | unchanged |
| `fix(core)!: x` | `fix(core)!: x` | unchanged con breaking |
| `chore: x` | `chore(f00181): x` | tipo soportado |
| `refactor: x` | `refactor(f00181): x` | |
| `perf: x` | `perf(f00181): x` | |
| `xyz: x` | `xyz(f00181): x` | tipo custom preservado |
| `feat(deps): bump x` | `feat(deps): bump x` | unchanged con scope custom |
| `feat: corrección ñ` | `feat(f00181): corrección ñ` | unicode |
| `fix: 🎉 x` | `fix(f00181): 🎉 x` | emoji |
| `hola` | refusal `MALFORMED_HEADER` | sin `:` |
| `:` | refusal `MALFORMED_HEADER` | type vacío |
| (vacío) | refusal `EMPTY_HEADER` | |
| `feat!!: x` | refusal `MALFORMED_HEADER` | `!` doble no válido |

Cada fila es `{ input, expected, refusal? }`.

### 3. Property-based

Generador de mensajes válidos (type ∈ standard, scope opcional,
breaking opcional, subject no vacío, body libre opcional).

Verifica `parseHeader(buildScopedMessage(input, { defaultScope:
'f00181' }))` produce un header equivalente.

Casos semilla: 42 (constantes) + 1000 aleatorios. Si alguno falla,
el test vuelca el caso y se etiqueta como regression.

### 4. Helper de property-based (sin librería)

Si el proyecto no tiene `fast-check` ni equivalente:

```ts
// plugins/commit-policy/tests/src/lib/contracts/property-helpers.ts
export function* validConventionalMessages(rng: () => number): Generator<string> {
  const types = ['feat', 'fix', 'chore', 'refactor', 'perf', 'docs', 'test', 'ci', 'build'];
  for (let i = 0; i < 1000; i++) {
    const type = types[Math.floor(rng() * types.length)];
    const scope = rng() < 0.3 ? randomScope(rng) : null;
    const bang = rng() < 0.1 ? '!' : '';
    const subject = randomSubject(rng);
    yield scope
      ? `${type}${bang}(${scope}): ${subject}`
      : `${type}${bang}: ${subject}`;
  }
}
```

`seedrandom` o `crypto.randomBytes` (preferible cryptographically
strong si está disponible en el proyecto).

### 5. Test runner

Vitest (`bunx vitest run`). Cada fila es un `it(…)` para mensajes
de error claros en CI.

### 6. Acceptance

```bash
bunx vitest run plugins/commit-policy/tests/src/lib/contracts/i18n-types.spec.ts
# → 1000/1000 property-based + 16 filas de tabla verdes
```

## Slices

- global_gate: lint

### S1 — Tests del parser con tabla y property-based

- **Status**: pending
- **Files**: `plugins/commit-policy/tests/src/lib/contracts/i18n-types.spec.ts` (o `scope.spec.ts`), `plugins/commit-policy/tests/fixtures/conventional-cases.json`, opcional `plugins/commit-policy/tests/src/lib/contracts/property-helpers.ts`
- **Gate**: type
- **Dependency**: `x00259`
- acceptance:
  - "tabla de ≥ 12 casos documentada en `conventional-cases.json`"
  - "property-based genera 1000 mensajes y verifica `parse(rebuild(x)) === x`"
  - "casos adversariales pasan (unicode, emojis, whitespace al borde)"
  - "tests rojos antes del fix de x00259; verdes después"

## acceptance

- `bunx vitest run` del archivo termina verde con 1000/1000
  property-based + 16 filas de tabla.
- Falla clara con el caso semilla si la regresión vuelve.
- Cobertura del archivo ≥ 95% statements / ≥ 90% branches.
- `bun run lint` verde; `tsc --noEmit` verde.
