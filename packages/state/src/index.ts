/**
 * index.ts — barrel of `@delendai/state`.
 *
 * q00018 Phase 0.1. The barrel re-exports every public surface.
 * Most consumers prefer the subpath exports (`.scope`,
 * `.fingerprint`, etc.) to keep their import surface narrow.
 *
 * This package MUST NOT import Node modules, `@delendai/core`,
 * or any plugin. The `no-node-imports-in-state` lint enforces that.
 */

export * from './lib/scope';
export * from './lib/fingerprint';
export * from './lib/util/brand';
export * from './lib/hash';
export * from './lib/generation';
export * from './lib/producer';
export * from './lib/registry';
export * from './lib/artifact-store.interface';
export * from './lib/derivation-engine.interface';
export {
	defineInMemoryStateRegistry,
	InMemoryStateRegistry,
	snapshotFromResolved,
} from './lib/driver-in-memory';
