import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 11 ms (`ETA accuracy over a synthetic fixture (f00511 S3) keeps the median ...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
		exclude: [
			'dist/**',
			'node_modules/**',
			// These two open a real `bun:sqlite` database, which is a Bun
			// builtin with no node resolution, so they can only run under
			// `bun run test:sqlite` — a CI step of its own. The rest of the
			// package (the NDJSON store, the ETA maths) runs here as usual;
			// only the SQLite-backed paths move.
			'src/lib/eta/duration-history.spec.ts',
			'src/lib/events/work-event-store.spec.ts',
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'tests/**/*'],
		},
	},
});
