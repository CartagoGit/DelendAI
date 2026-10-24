import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 469 ms (`no-node-imports-in-state (q00018 S1) returns 0 violations for the c...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		include: ['tests/**/*.spec.ts'],
		exclude: ['tests/**/*.script.spec.ts', 'dist/**', 'node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts'],
		},
	},
});
