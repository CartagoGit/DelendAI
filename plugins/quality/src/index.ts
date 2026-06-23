import {
	createWorkspaceFileReader,
	definePlugin,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import { createCommandRunner } from './lib/services/runner';
import { buildRunAllToolRegistration } from './lib/services/run-all';
import { buildQualityToolRegistrations } from './lib/tools/tools';

/**
 * Quality-gate runner. Executes the project's validation commands
 * (lint/test/build/typecheck) per scope and returns a structured
 * pass/fail report. Commands come from plugin options, the config's
 * validationMatrix, or package.json scripts. Load with
 * `mcp-vertex --plugins=quality`.
 */
export default definePlugin({
	name: 'quality',
	version: '0.1.0',
	describe:
		'Run the project quality gates (lint/test/build/typecheck) per scope and return structured pass/fail.',
	optionsSchema: z.object({
		/** scope name → ordered shell commands. */
		scopes: z.record(z.string(), z.array(z.string())).optional(),
		timeoutMs: z.number().optional(),
		/** Allow/deny which binaries `run_quality` may spawn (trust boundary). */
		commandPolicy: z
			.object({
				allow: z.array(z.string()).optional(),
				deny: z.array(z.string()).optional(),
			})
			.optional(),
	}),
	register(ctx) {
		const reader = createWorkspaceFileReader(ctx.workspace);
		const timeoutMs = ctx.options.timeoutMs;
		const qualityOptions = {
			namespacePrefix: ctx.namespacePrefix,
			reader,
			workspaceRoot: ctx.workspace.root,
			run: createCommandRunner(
				typeof timeoutMs === 'number' ? timeoutMs : undefined,
			),
			...(ctx.options.scopes
				? {
						optionScopes: ctx.options.scopes as Record<
							string,
							readonly string[]
						>,
					}
				: {}),
			...(ctx.options.commandPolicy
				? { commandPolicy: ctx.options.commandPolicy }
				: {}),
		};
		return {
			tools: [
				...buildQualityToolRegistrations(qualityOptions),
				buildRunAllToolRegistration(qualityOptions),
			],
			knowledge: [
				{
					id: 'quality-gates',
					title: 'Quality gates',
					body: [
						'# Quality gates',
						'',
						`Tools: \`${ctx.namespacePrefix}_get_quality_scopes\` (list), \`${ctx.namespacePrefix}_run_quality\` (execute one scope), \`${ctx.namespacePrefix}_quality_run_all\` (execute every configured scope, one aggregated report).`,
						'',
						'- Before closing work, run the relevant scope and ensure it passes.',
						'- Scopes come from plugin options → mcp-vertex.config.json validationMatrix → package.json scripts.',
						'- `run_quality` executes real commands; read the per-command `ok`/`tail` to fix failures.',
					].join('\n'),
				},
			],
		};
	},
});
