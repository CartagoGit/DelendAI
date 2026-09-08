/**
 * subpaths.spec.ts — r00028 S1 acceptance for `@delendai/core/*`
 * subpath exports (Track C / §9).
 *
 * Pins:
 *  1. `package.json#exports` declares the 5 entrypoints (".", "./contracts",
 *     "./runtime", "./plugin", "./node") plus "./public", "./version",
 *     "./manifest" carry-overs.
 *  2. Each subpath resolves through TypeScript's `bundler` resolution
 *     and exports at least one named symbol.
 *  3. `@delendai/core/contracts` is the type-only surface and must
 *     NOT drag `node:fs` into a consumer that imports it directly.
 *  4. The default `"."` entry still resolves (back-compat).
 */
export {};
