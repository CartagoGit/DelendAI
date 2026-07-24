import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildEnvCheckRegistration } from './lib/tools/env-check.tool';

/**
 * Env plugin. `env_check` validates a `.env` file for common problems
 * (duplicate/empty/malformed keys, missing required vars) and reports them as
 * normalized findings — never leaking a value. Offline, pure. Load with
 * `mcp-vertex --plugins=env`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'env',
	version: '0.1.0',
	describe:
		'Environment config validation: env_check flags duplicate/empty/malformed keys and missing required vars in a .env file. Offline, values never leaked.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildEnvCheckRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'env-usage',
					title: 'Environment config validation',
					body: [
						'# Environment config validation',
						'',
						`Tool: \`${ctx.namespacePrefix}_env_check\` — validate a .env file (offline).`,
						'',
						'- Flags duplicate keys (medium), empty values (low), malformed lines (low), and missing required vars (high, when a `required` list is passed).',
						'- Pass `path` (default `.env`) and optional `required` variable names.',
						'- Values are never included in the output — only key names and line numbers.',
					].join('\n'),
				},
			],
		};
	},
});
