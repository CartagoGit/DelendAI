---
id: t00009
title: "error-reporting — privacy adversarial regression suite: dos hosts distintos, mismo bug Vertex, mismo issue público (propiedad fuerte de privacidad)"
kind: test
status: done
type: proposal
track: privacy
date: 2026-08-25
priority: P0
classification: MEJORA / ADVERSARIAL REGRESSION
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§3.2 propiedad fuerte + §30 privacy classes + §32 pipeline + §33 fingerprint"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - x00245 # safe tool identity
    - x00236 # internalOnly:false
    - x00237 # runtime version source
    - x00214 # DTO seguro
shipped-in:
  - 24cdfab6 # test(error-reporting): add privacy adversarial regression suite
---

# t00009 — privacy adversarial regression suite

## Goal

La auditoría §3.2 enuncia la **propiedad fuerte de privacidad**:

> Dos proyectos privados completamente distintos que provoquen exactamente el mismo bug interno de Vertex deberían producir el mismo issue público, salvo metadata explícitamente segura como versión MCP Vertex, package/component id, error code, runtime family, OS family.

Esta propiedad es la única garantía operativa de que el reporter no filtra datos del proyecto. Sin un test que la verifique continuamente, una regresión menor (un `toolName` añadido por "debug", un `path` que vuelve al DTO, un `args` que escapa del filter) pasa desapercibida hasta que aparece en producción.

Hoy:

- Hay tests unitarios del reporter (DTO shape, validator, frames).
- **No hay** un test que ejecute el pipeline completo con dos hosts ficticios y compare los issues resultantes.
- **No hay** una suite que asuma explícitamente "dos proyectos privados distintos".

Esto convierte la privacidad en una promesa **no verificada**.

Reglas relacionadas: R1.1, R1.5, R1.7, §3.2 auditoría.


Suite actual (extracto — incompleta):

```
plugins/error-reporting/tests/
├── src/lib/
│   ├── report-builder.spec.ts          # unit, single host
│   ├── privacy-validator.spec.ts       # unit, deny-by-default
│   ├── frame-extractor.spec.ts         # unit, frames
│   └── ...
```

Lo que **falta**:

- Test E2E del pipeline completo: capture → classify → frames → resolve identity → synthetic → redact → validate → serialize → revalidate → fingerprint.
- Test que ejecute el pipeline **dos veces** con hosts ficticios diferentes y compare los issues byte-a-byte (excepto Class A: version, packageId, componentId, errorCode).
- Test adversarial con tool names host-project que incluyan prefijos engañosos, unicode, espacios, prefijos comunes (`mcp_vertex_*`, `mcp-vertex-*`, `vertex_*`).
- Property tests sobre el DTO serializado: no contiene paths absolutos, no contiene Class C/D, no contiene tool names host-project.


`MEJORA / ADVERSARIAL REGRESSION` — propuesta de test, no fix.

## Why

- Operadores: confianza operativa continua de que ningún cambio futuro filtra Class C/D.
- Equipo de soporte: si un test falla, saben inmediatamente qué cambio rompió la propiedad.
- Auditores externos (legales): pueden revisar la suite como evidencia de privacy-by-construction.


Esta suite **es** la verificación de las reglas R1.1–R1.7. Su objetivo es detectar cualquier regresión que:

- Filtre Class C (paths, repo, branch, tool args host-project, source code).
- Filtre Class D (tokens, emails, credentials).
- Permita identificar al proyecto emisor (huella única).


Cero. No añade tools; añade tests.

## Non-goals

**Permitido**:

- `plugins/error-reporting/tests/src/lib/adversarial/` (nuevo directorio para la suite).
- `plugins/error-reporting/tests/src/lib/fixtures/` (hosts ficticios, tools ficticias, errores ficticios).
- `packages/core/tests/src/lib/contracts/property/` (property tests reusables).
- `tools/scripts/privacy/` (nuevo: scripts de auditoría manual que reusan los tests).

**No permitido**:

- Tests que requieran red real (synthetic hosts son locales).
- Tests que generen telemetría (los issues son capturados en memoria, no enviados).


- CI dashboard público de privacidad (otra propuesta si se quiere).
- Test de carga / rate-limit / circuit breaker (`x00214` ya cubre rate limits; este se centra en contenido).
- Cambios al reporter mismo (las propuestas `x00245`, `x00236`, `x00237` ya endurecen el código; este test verifica que se mantengan endurecidos).

## Architecture

### 1. Estructura de la suite

```
plugins/error-reporting/tests/src/lib/adversarial/
├── hosts/
│   ├── host-bakery.fixture.ts          # "Bakery Operations MCP", tool: "ovens.preheat"
│   ├── host-books.fixture.ts           # "Books Catalog MCP", tool: "isbn.lookup"
│   ├── host-pets.fixture.ts            # "Pet Store MCP", tool: "vaccinations.schedule"
│   ├── host-planets.fixture.ts         # "Astronomy MCP", tool: "orbits.calculate"
│   └── host-private-bank.fixture.ts    # Tool name ADVERSARIAL: "privatebank_reconciliation_execute"
│
├── scenarios/
│   ├── same-internal-error.spec.ts     # Mismo McpVertexInternalError, dos hosts → mismo issue (salvo Class A)
│   ├── tool-name-leak.spec.ts          # Tool name host-project NUNCA llega al DTO
│   ├── path-leak.spec.ts               # Paths absolutos NUNCA llegan al DTO
│   ├── args-leak.spec.ts               # Args del caller NUNCA llegan al DTO
│   ├── synthetic-example-only.spec.ts  # El campo "example" es sintético, no derivado de inputs
│   ├── prefix-deception.spec.ts        # Tool names con prefijos engañosos NO se confunden con Vertex
│   ├── unicode-and-edges.spec.ts       # Unicode, longitud máxima, espacios, newlines
│   └── two-hosts-equality.spec.ts      # Property: dos hosts con mismo error → mismo issue
│
├── pipeline/
│   ├── capture.spec.ts                 # Captura de error
│   ├── classify.spec.ts                # Clasificación origen
│   ├── frames.spec.ts                  # Extracción de frames internos
│   ├── resolve-identity.spec.ts        # ISafeToolIdentity
│   ├── redact.spec.ts                  # Redactor secundario
│   ├── validate.spec.ts                # Privacy validator
│   └── serialize.spec.ts               # Serialización + revalidación
│
└── README.md                           # Cómo correr la suite, qué cubre, qué NO cubre
```

### 2. Escenario central: `two-hosts-equality.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import { runFullPipeline } from '../pipeline/run-full-pipeline';
import { HOST_BAKERY } from '../hosts/host-bakery.fixture';
import { HOST_BOOKS } from '../hosts/host-books.fixture';

describe('Privacy — strong property', () => {
  it('two distinct hosts, same internal Vertex error → identical public issue (modulo Class A)', async () => {
    const error = new McpVertexInternalError({
      code: 'VM-INTERNAL-001',
      packageId: '@mcp-vertex/proposals',
      componentId: 'state-machine',
      message: 'internal invariant violated',   // safe message
    });

    const reportBakery = await runFullPipeline({
      host: HOST_BAKERY,
      toolName: 'ovens.preheat',
      args: { customer: 'real-customer-bakery', orderId: 'bkr-9981' },
      error,
    });

    const reportBooks = await runFullPipeline({
      host: HOST_BOOKS,
      toolName: 'isbn.lookup',
      args: { isbn: '978-0-13-235088-4', customer: 'real-customer-books' },
      error,
    });

    // Class A permitida: version, packageId, componentId, errorCode, runtime, os
    const classAKeys = ['mcpVertexVersion', 'packageId', 'componentId', 'errorCode', 'runtime', 'os'];
    const stripClassA = (r: ISafeMcpVertexReport) => {
      const copy = { ...r };
      for (const k of classAKeys) delete (copy as any)[k];
      return copy;
    };

    expect(stripClassA(reportBakery)).toEqual(stripClassA(reportBooks));

    // Ningún Class C/D en ninguno de los dos reports
    for (const report of [reportBakery, reportBooks]) {
      const json = JSON.stringify(report);
      expect(json).not.toMatch(/ovens|preheat|978-0-13|bakery|customer|orderId|real-customer/);
      expect(json).not.toMatch(/\/Users\/|\/home\/|C:\\|node_modules/);
      expect(json).not.toMatch(/eyJ[A-Za-z0-9_-]+/);  // JWT-like
      expect(json).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+/);  // emails
    }
  });
});
```

### 3. Escenario: `tool-name-leak.spec.ts`

```ts
describe('Privacy — tool name provenance', () => {
  const adversarialNames = [
    'privatebank_reconciliation_execute',
    'acme_hr_onboarding',
    'superbank_internal_fraud',
    'mcp_vertex_internal_fraud',           // prefix deception
    'mcp-vertex.create_proposal',          // prefix deception (kebab)
    'vertex.create_proposal',              // prefix deception (short)
    'mcp_vert_x_evil',                     // close-but-not-vertex
    '🔓host_secret_tool',                  // unicode emoji
    'A'.repeat(1024),                      // length attack
    'tool\nwith\nnewlines',
    'tool with spaces',
    '../../../etc/passwd-as-tool-name',
    'superbank_internal\0fraud',
  ];

  for (const toolName of adversarialNames) {
    it(`toolName "${toolName.slice(0, 30)}..." never leaks`, async () => {
      const report = await runFullPipeline({
        host: HOST_PETS,
        toolName,
        error: vertexError,
      });

      expect(JSON.stringify(report)).not.toContain(toolName);
      expect(report.safeToolId).toBeUndefined();
      expect(report.toolOwner).not.toBe('mcp-vertex');
    });
  }
});
```

### 4. Property tests (`packages/core/tests/src/lib/contracts/property/`)

```ts
import fc from 'fast-check';

describe('Privacy — property tests on serialized DTO', () => {
  it('serialized DTO never contains absolute paths', () => {
    fc.assert(
      fc.property(
        fc.scheduler(),
        fc.string(),
        fc.string(),
        (env, toolName, args) => {
          const report = runFullPipeline({ toolName, args, error: vertexError });
          const json = JSON.stringify(report);
          // No paths absolutos POSIX ni Windows.
          expect(json).not.toMatch(/^\/|^[A-Z]:\\|\/Users\/|\/home\/|C:\\Users\\/m);
          return true;
        },
      ),
    );
  });

  it('serialized DTO never contains emails', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (toolName, args) => {
        const report = runFullPipeline({ toolName, args, error: vertexError });
        const json = JSON.stringify(report);
        expect(json).not.toMatch(/\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
        return true;
      }),
    );
  });

  it('safeToolId is undefined for non-Vertex tools', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 512 }), (toolName) => {
        const report = runFullPipeline({ toolName, args: {}, error: vertexError });
        if (!toolName.startsWith('@mcp-vertex/')) {
          expect(report.safeToolId).toBeUndefined();
        }
        return true;
      }),
    );
  });
});
```

### 5. Pipeline ejecutable

`plugins/error-reporting/tests/src/lib/pipeline/run-full-pipeline.ts` ejecuta los 18 pasos del pipeline seguro de la auditoría §32:

1. capture
2. classify
3. extract frames
4. **resolve safe tool identity** (`x00245`)
5. synthetic example
6. redact
7. validate
8. serialize
9. revalidate
10. fingerprint
11. (rate-limit / dedupe — no se ejecuta en tests; se mockea)

La función es **idéntica** al path real del reporter; los mocks solo se usan en el último paso (submit) para evitar envío real.

### 6. Integración en CI

```yaml
# .github/workflows/ci.yml (extracto)
- name: Privacy adversarial suite
  run: bun run test:privacy-adversarial
```

Nuevo script:

```ts
// tools/scripts/test/run-privacy-adversarial.script.ts
import { run } from 'vitest';
// ... corre plugins/error-reporting/tests/src/lib/adversarial/**/*.spec.ts
```

Añadir a `bun run validate`.

## Slices

- global_gate: type

### S1 — Pipeline ejecutable + fixtures

- **Status**: done
- **Files**: `plugins/error-reporting/tests/adversarial-fixtures.ts`, `plugins/error-reporting/tests/report-builder.spec.ts`, `plugins/error-reporting/tests/privacy-adversarial.spec.ts`
- **Gate**: type
- acceptance:
  - "Función `runFullPipeline` ejecuta los 18 pasos del §32 sin envío real."
  - "≥4 hosts ficticios (bakery, books, pets, planets) + 1 adversarial (private-bank)."

### S2 — Escenarios adversariales

- **Status**: done
- **Files**: `plugins/error-reporting/tests/report-builder.spec.ts`, `plugins/error-reporting/tests/privacy-adversarial.spec.ts`
- **Gate**: type
- acceptance:
  - "≥8 specs cubren: same-error, tool-name-leak, path-leak, args-leak, synthetic-example, prefix-deception, unicode-and-edges, two-hosts-equality."
  - "≥13 nombres adversariales en tool-name-leak."

### S3 — Property tests sobre DTO serializado

- **Status**: done
- **Files**: `packages/core/tests/src/lib/contracts/resolvers/safe-tool-identity.property.spec.ts`
- **Gate**: type
- acceptance:
  - "≥3 property tests verdes (paths, emails, safeToolId)."

### S4 — Integración CI + README

- **Status**: done
- **Files**: `tools/scripts/test/run-privacy-adversarial.script.ts`, `plugins/error-reporting/tests/adversarial/README.md`, `package.json`
- **Gate**: type
- acceptance:
  - "Script añadido a `bun run validate`."
  - "README documenta qué cubre y qué NO."
  - "Suite corre en <30s en CI."

## Acceptance

- Cobertura obligatoria de esta propuesta (los tests son la propuesta):
  - `same-internal-error.spec.ts`
  - `tool-name-leak.spec.ts` (≥13 nombres adversariales)
  - `path-leak.spec.ts`
  - `args-leak.spec.ts`
  - `synthetic-example-only.spec.ts`
  - `prefix-deception.spec.ts`
  - `unicode-and-edges.spec.ts`
  - `two-hosts-equality.spec.ts`
  - Property tests (≥3 property tests sobre el DTO serializado)


- [ ] La suite adversarial existe en `plugins/error-reporting/tests/src/lib/adversarial/`.
- [ ] Al menos 13 nombres adversariales cubiertos en `tool-name-leak.spec.ts`.
- [ ] Al menos 3 property tests verdes.
- [ ] El escenario `two-hosts-equality.spec.ts` demuestra la propiedad fuerte: dos hosts distintos → mismo issue (modulo Class A).
- [ ] `bun run test:privacy-adversarial` integrado en `bun run validate`.
- [ ] Cualquier regresión que filtre Class C/D rompe al menos un test.
- [ ] `README.md` de la suite explica qué cubre y qué NO cubre.
- [ ] La suite corre en <30s en CI (no requiere red real).


- Suite adversarial existe y cubre ≥8 specs.
- ≥13 nombres adversariales.
- ≥3 property tests verdes.
- Two-hosts-equality verde.
- Suite integrada en `bun run validate`.
- Cualquier regresión bloquea merge.

---

## Notes

- La suite es la **verificación continua** de R1.1–R1.7. Cualquier cambio futuro que:
  - Añada un campo nuevo al DTO → debe pasar property test "no Class C/D".
  - Cambie el resolver de tool identity → debe pasar `tool-name-leak.spec.ts`.
  - Cambie el classifier → debe pasar `same-internal-error.spec.ts`.
- Si un test falla, no se commitea el cambio sin corregir el problema.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - tests:
        - plugins/error-reporting/tests/src/lib/adversarial/**/* (≥8 specs)
        - packages/core/tests/src/lib/contracts/property/* (≥3 property tests)
    - ci-integration: bun run test:privacy-adversarial en bun run validate
    - runtime: <30s en CI
    - before/after:
        before: "No existe suite adversarial; propiedad fuerte no verificada"
        after:  "Suite adversarial verde; cualquier regresión bloquea merge"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track D.
- **Auditoría legada**: §3.2 (propiedad fuerte), §30 (privacy classes), §32 (pipeline), §33 (fingerprint).
- **Hermanas**: `x00245` (provenance), `x00236` (internalOnly:false), `x00237` (version source).
- **Predecesora**: `x00214` (DTO seguro base).
- **Cierra el Track D**: tras este test verde, el Track D entero queda blindado por la suite adversarial.
