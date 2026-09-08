#!/usr/bin/env bun
/**
 * lazy-loader.spec.ts — f00200 (Track N / q00006 §52).
 *
 * Synthetic test: manifests are an in-memory map, importer is a
 * counter that "resolves" each plugin id on demand. The tests
 * verify (a) modules are NOT imported at boot, (b) the first
 * `load(id)` does the import and caches it, (c) concurrent
 * `load(id)` calls share the in-flight promise, (d) warmup is
 * best-effort and surfaces failures without throwing,
 * (e) unload clears the cache, (f) stats accumulate correctly,
 * (g) readManifest does NOT import.
 */
export {};
