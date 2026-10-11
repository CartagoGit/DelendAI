import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { workspaceAliases } from '../../vitest.shared';

const workspaceRoot = resolve(import.meta.dirname, '../..');

export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		testTimeout: 30_000,
		hookTimeout: 30_000,
		include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
		exclude: ['dist/**', 'node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'tests/**/*'],
		},
	},
});
