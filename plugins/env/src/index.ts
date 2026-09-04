import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildEnvCheckRegistration } from './lib/tools/env-check.tool';
import { buildEnvExplainsRegistration } from './lib/tools/env-explains.tool';

/**
 * Env plugin. `env_check` validates a `.env` file for common problems
 * (duplicate/empty/malformed keys, missing required vars) and reports them as
 * normalized findings — never leaking a value. `env_explains` diffs the same
 * file against an injected requirements catalog to surface which plugin
 * capabilities are unlocked vs blocked. Offline, pure. Load with
 * `mcp-vertex --plugins=env`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'env',
	version: '0.1.1',
	describe:
		'Environment config validation: env_check flags duplicate/empty/malformed keys and missing required vars in a .env file; env_explains reports which plugin capabilities are unlocked vs blocked. Offline, values never leaked.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const envCheckOptions = {
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
		};
		return {
			tools: [
				buildEnvCheckRegistration(envCheckOptions),
				buildEnvExplainsRegistration(envCheckOptions),
			],
			knowledge: [
				{
					id: 'env-usage',
					title: 'Environment config validation',
					body: [
						'# Environment config validation',
						'',
						`Tools: \`${ctx.namespacePrefix}_env_check\` + \`${ctx.namespacePrefix}_env_explains\` (offline).`,
						'',
						'- `env_check` flags duplicate keys (medium), empty values (low), malformed lines (low), and missing required vars (high, when a `required` list is passed).',
						'- `env_check` also accepts a `schema` input and emits 4 normalized finding categories: `env/missing-required`, `env/missing-typed`, `env/extra-undeclared`, `env/mistyped-value`.',
						'- `env_explains` diffs a parsed .env against an injected requirements catalog and reports unlocked vs blocked capabilities.',
						'- Pass `path` (default `.env`).',
						'- Values are never included in the output — only key names and line numbers.',
					].join('\n'),
				},
			],
		};
	},
});
