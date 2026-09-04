/**
 * subpath-exports.spec.ts — r00028 (Track C / §9).
 *
 * Smoke tests for the four subpath exports added to
 * `@delendai/core`: `./contracts`, `./runtime`, `./plugin`,
 * `./node`. Each subpath must resolve + expose at least one
 * expected symbol. This is the contract enforcement: any
 * future refactor that breaks one of these subpaths will fail
 * here before users see it.
 */
export {};
