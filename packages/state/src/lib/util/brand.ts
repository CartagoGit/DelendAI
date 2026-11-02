/**
 * brand.ts — `Brand<T, B>` re-export.
 *
 * x00530 S1: the declaration moved to `@delendai/contracts/state`
 * (as `StateBrand`) so `@delendai/core`'s PUBLIC plugin contract
 * can reference the State Engine types without importing this
 * package. The alias is kept so every internal
 * `import type { Brand } from './util/brand'` keeps working.
 */

export type { StateBrand as Brand } from '@delendai/contracts/state';
