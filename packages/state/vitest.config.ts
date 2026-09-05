import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
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
