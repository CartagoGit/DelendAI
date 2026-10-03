/**
 * zod-default-resolver.mjs — vitest-only zod alias wrapper.
 *
 * x00189 s1: vitest 4.1.10 + vite 8 (rolldown bundler) + zod 4.4.3 has
 * an interop bug where `import { z } from 'zod'` resolves to
 * `{ z: undefined }`, because rolldown's CJS↔ESM interop drops the
 * `export { z }` binding from zod's `index.js`. Every public API
 * (`z.discriminatedUnion`, `z.object`, `z.enum`, …) appears as
 * `undefined`, and the FIRST zod call inside a file throws
 * `TypeError: undefined is not an object (evaluating 'z.<X>')`.
 *
 * `import z from 'zod'` works fine — the default export is
 * `zod.default` and rolldown handles it correctly. So the cleanest
 * workaround is to alias `zod` to this wrapper, which re-exports
 * everything from the real zod AND exposes `z` as a named binding
 * sourced from the default export.
 *
 * This file is registered via `resolve.alias` in `vitest.shared.ts`,
 * so every vitest project (core, plugins/*, extensions/*, apps/*)
 * gets the fix automatically without touching 285 import sites.
 * At tsc / bun runtime, the alias does NOT apply — the real zod
 * ESM entry resolves normally and named imports continue to work.
 */

import z from 'zod';

export * from 'zod';
export { z };
export default z;
