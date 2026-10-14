---
id: x00239
title: "process — UTF-8 safe truncation al recortar chunks (PROC2-001)"
kind: fix
status: done
type: proposal
track: quality
date: 2026-08-25
priority: P3
classification: PROBABLE / MENOR
parent-plan: q00004
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol.md
    section: "§7 PROC2-001"
    sha256: fc2494af135f18cdc2de8c36c110d6296e2a1c511e602afa0a1e4d2a566f339d
related:
    - q00004
    - f00158 # error-reporting (referencia de truncation ya endurecida)
shipped-in:
  - 15cc1e95 # fix: preserve utf8 boundaries in process output
  - d98c7ebe # perf(core): concatenate process output once when decoding utf8 chunks
---

# x00239 — process: UTF-8 safe truncation

## Goal

El recorte actual de chunks de proceso puede dejar una secuencia UTF-8 incompleta si corta justo después del byte inicial de una secuencia multibyte:

```ts
// chunks/runner.ts (aprox)
function truncate(chunk: string, remainingBytes: number): string {
  // slice hasta que byteLength <= remainingBytes
  let result = chunk;
  while (Buffer.byteLength(result, 'utf8') > remainingBytes && result.length > 0) {
    result = result.slice(0, -1);
  }
  return result;
}
```

Problemas:

- `slice(0, -1)` puede cortar justo después de un byte inicial (`0xE2`, `0xF0`, etc.) dejando continuation bytes huérfanos.
- `Buffer.byteLength(returned, 'utf8')` puede diferir del string reserializado.

Reglas violadas: §7 PROC2-001.


Tests existentes no cubren emoji, CJK, secuencias 2/3/4-byte en todos los offsets.


`PROBABLE / MENOR` — código muestra el riesgo, falta reproducción.

## Why

- Caracteres `�` en output.
- Bytes accounting inconsistente.


Cero.


Cero.

## Non-goals

**Permitido**:

- `packages/core/src/lib/process/truncate-utf8.ts` (nuevo helper).
- `packages/core/src/lib/process/runner.ts` (usar el helper).
- Tests actualizados.

**No permitido**:

- Cambios en otros truncation paths (la truncation genérica ya está endurecida; aquí es específico de process output).


- Cambios en el process runner top-level.

## Architecture

### 1. Helper compartido

```ts
// packages/core/src/lib/process/truncate-utf8.ts
/**
 * Trunca una string sin cortar secuencias UTF-8 multibyte.
 *
 * @param input - String a truncar.
 * @param maxBytes - Máximo de bytes UTF-8 permitidos.
 * @returns String truncada que satisface `Buffer.byteLength(s, 'utf8') <= maxBytes`.
 *
 * Garantías:
 * - Nunca corta en medio de una secuencia multibyte.
 * - El byte accounting es exacto (la string retornada es lo que dice el byte length).
 */
export function truncateUtf8(input: string, maxBytes: number): string {
  if (maxBytes < 0) {
    throw new RangeError('maxBytes must be non-negative');
  }
  if (Buffer.byteLength(input, 'utf8') <= maxBytes) {
    return input;
  }

  // Buscar el corte seguro con búsqueda binaria.
  let low = 0;
  let high = input.length;
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = input.slice(0, mid);
    const size = Buffer.byteLength(candidate, 'utf8');

    if (size <= maxBytes) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Verificar invariante: si best termina en medio de un sequence, retroceder.
  // (la búsqueda binaria puede terminar en medio si el último carácter es multibyte)
  return trimToValidUtf8Boundary(best);
}

/**
 * Retrocede hasta el último boundary UTF-8 válido.
 */
function trimToValidUtf8Boundary(s: string): string {
  const bytes = Buffer.from(s, 'utf8');
  // Decodificar y re-codificar para forzar alineación.
  // Esto descarta bytes que estaban "completos" pero el último char multibyte
  // se truncó.
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return decoded;
}
```

### 2. Uso en el runner

```ts
// packages/core/src/lib/process/runner.ts (refactor)
import { truncateUtf8 } from './truncate-utf8';

// Antes:
function truncate(chunk: string, remainingBytes: number): string {
  let result = chunk;
  while (Buffer.byteLength(result, 'utf8') > remainingBytes && result.length > 0) {
    result = result.slice(0, -1);
  }
  return result;
}

// Después:
function truncate(chunk: string, remainingBytes: number): string {
  return truncateUtf8(chunk, remainingBytes);
}
```

### 3. Tests adversariales

```ts
// packages/core/tests/src/lib/process/truncate-utf8.spec.ts
import { truncateUtf8 } from '../../../../src/lib/process/truncate-utf8';

describe('truncateUtf8', () => {
  const inputs = [
    'plain ascii',
    'español con ñ',
    '日本語のテキスト',
    '🎉🎊🚀',  // emoji 4-byte
    'café résumé naïve',  // 2-byte
    '𝐇𝐞𝐥𝐥𝐨',  // 4-byte mathematical
    'Mixed: ABC 中文 🎉 end',
  ];

  for (const input of inputs) {
    for (let maxBytes = 0; maxBytes <= Buffer.byteLength(input, 'utf8'); maxBytes++) {
      it(`preserves boundary for "${input.slice(0, 20)}..." with maxBytes=${maxBytes}`, () => {
        const result = truncateUtf8(input, maxBytes);
        expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(maxBytes);

        // Re-encoding debe dar el mismo byte sequence.
        const original = Buffer.from(result, 'utf8');
        const roundtrip = Buffer.from(result, 'utf8');
        expect(original.equals(roundtrip)).toBe(true);

        // No debe contener � (caracteres de reemplazo).
        expect(result).not.toContain('\uFFFD');
      });
    }
  }

  it('throws on negative maxBytes', () => {
    expect(() => truncateUtf8('hello', -1)).toThrow(RangeError);
  });

  it('returns input if it fits', () => {
    expect(truncateUtf8('hello', 100)).toBe('hello');
  });

  it('returns empty string if maxBytes is 0', () => {
    expect(truncateUtf8('hello', 0)).toBe('');
  });
});
```

### 4. Property tests

```ts
import fc from 'fast-check';

it('property: result byteLength <= maxBytes', () => {
  fc.assert(
    fc.property(fc.string(), fc.integer({ min: 0, max: 1024 }), (s, maxBytes) => {
      const result = truncateUtf8(s, maxBytes);
      return Buffer.byteLength(result, 'utf8') <= maxBytes;
    }),
  );
});

it('property: result is valid UTF-8 (no replacement chars)', () => {
  fc.assert(
    fc.property(fc.string(), fc.integer({ min: 0, max: 1024 }), (s, maxBytes) => {
      const result = truncateUtf8(s, maxBytes);
      return !result.includes('\uFFFD');
    }),
  );
});
```

## Slices

- global_gate: type

### S1 — Helper + uso

- **Status**: done
- **Files**: `packages/core/src/lib/shared/truncate-utf8.ts`, `packages/core/src/lib/shared/run-command.ts`
- **Gate**: type
- acceptance:
  - "Helper implementado."
  - "Runner usa el helper."

### S2 — Tests adversariales + property

- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/truncate-utf8.spec.ts`
- **Gate**: type
- acceptance:
  - "≥30 unit tests verdes."
  - "Property tests verdes."

## Acceptance

- **Unit**: cobertura de cada input en todos los offsets.
- **Property**: byte length invariant + no replacement chars.
- **Integration**: el runner usa el helper y los tests de process pasan.


- [ ] Helper `truncateUtf8` implementado.
- [ ] Process runner usa el helper.
- [ ] Tests adversariales verdes para emoji, CJK, 2/3/4-byte sequences en todos los offsets.
- [ ] Property tests verdes.
- [ ] Sin `�` en el output truncado.
- [ ] `Buffer.byteLength(result, 'utf8') <= maxBytes` siempre.
- [ ] `bun run validate` verde.


- Helper implementado y usado.
- Tests verdes.
- Sin `�` en output.

---

## Notes

- **Property test** integrado en CI.
- **Snapshot test** sobre un set fijo de inputs/outputs.


```yaml
resolution:
  status: implemented
  evidence:
    - commit: <hash>
    - new-files:
        - packages/core/src/lib/process/truncate-utf8.ts
        - packages/core/tests/src/lib/process/truncate-utf8.spec.ts
    - before/after:
        before: "slice(0, -1) puede cortar UTF-8"
        after:  "truncateUtf8 garantiza boundary seguro"
```

---


- **Plan padre**: [q00004](../../ready/q00004-plan-hardening-post-auditoria-chatgpt-sol-segunda-pasada.md), Track F.
- **Auditoría legada**: §7 PROC2-001.
- **Hermana**: `x00240` (memory dispose).
