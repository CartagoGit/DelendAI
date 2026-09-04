/**
 * index.ts — `@delendai/contracts` barrel.
 *
 * r00029 (Track C / §10): the canonical entry point for the
 * pure-TypeScript contracts package. Plugins and external
 * consumers should import from this package (or one of the
 * subpath exports) instead of `@delendai/core/contracts` so
 * they don't drag in the core runtime.
 *
 * This file MUST NOT import any Node module, `fs`, `path`,
 * `process`, or `@delendai/core`. The `no-node-imports` lint
 * enforces that.
 */

export * from './primitives';
export * from './capabilities';
export * from './envelopes';
export * from './safety';
export * from './plugin';
export * from './routes';
export * from './remote-provider';
export * from './remote-mutations';
export * from './remote-diagnostics';
export * from './capability-graph.interface';
export * from './host-capability-manifest.interface';
