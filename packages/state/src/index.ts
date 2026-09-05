/**
 * index.ts — barrel of `@delendai/state`.
 *
 * q00018 Phase 0 S1. The barrel is the canonical entry point for
 * consumers that want every type and value. Most consumers should
 * prefer the subpath exports (`.fingerprint`, `.hash`, etc.) to
 * keep their import surface narrow.
 *
 * This package MUST NOT import Node modules, `@delendai/core`, or
 * any plugin. The `no-node-imports-in-state` lint enforces that.
 */

export * from './lib/scope';
export * from './lib/fingerprint';
export * from './lib/hash';
export * from './lib/generation';
export * from './lib/producer';
export * from './lib/registry';
export {
	defineInMemoryStateRegistry,
	InMemoryStateRegistry,
} from './lib/driver-in-memory';
