/**
 * brand.ts — local `Brand<T, B>` definition.
 *
 * q00018 Phase 0.1: kept local to `@delendai/state` so the package
 * stays free of dependencies on `@delendai/contracts` (the contract
 * package forbids Node, which is fine, but we also want to keep
 * the State Engine independently publishable in case a future
 * contributor wants to split it out of the monorepo). The shape is
 * byte-identical to `Brand` in `@delendai/contracts/primitives`
 * — both compile to `T & { readonly __brand: B }`.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };
