import { defineConfig } from 'vitest/config';
import { join } from 'node:path';

export default defineConfig({
	test: {
		name: 'agent-orchestrator',
		include: ['tests/**/*.spec.ts'],
		environment: 'node',
	},
	resolve: {
		alias: {
			'@mcp-vertex/core/public': join(
				__dirname,
				'../../packages/core/src/public/index.ts',
			),
		},
	},
});
