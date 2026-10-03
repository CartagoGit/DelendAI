import { defineConfig } from 'vitest/config';
import { bunOwnedExcludes } from '../../vitest.shared';

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
			// Specs that open a real `bun:sqlite` database run under
			// `bun run test:sqlite` instead; the list lives in one place.
			...bunOwnedExcludes('packages/state-telemetry'),
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'tests/**/*'],
		},
	},
});
