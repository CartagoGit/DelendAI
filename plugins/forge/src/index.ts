import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildForgeReadToolRegistrations } from './lib/tools/forge-read.tool';
import { buildForgeWriteToolRegistrations } from './lib/tools/forge-write.tool';

const OptionsSchema = z
	.object({
		defaultTimeoutMs: z.number().int().positive().max(120000).optional(),
	})
	.strict();

export default definePlugin({
	name: 'forge',
	version: '0.1.0',
	describe:
		"GitHub/GitLab forge surface: PR list/show/create/comment, CI status and remote issue list/show/create via the host's authenticated gh/glab CLI.",
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`forge plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const readTools = buildForgeReadToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
			...(parsed.data.defaultTimeoutMs !== undefined
				? { defaultTimeoutMs: parsed.data.defaultTimeoutMs }
				: {}),
		});
		const writeTools = buildForgeWriteToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
		});
		return {
			tools: [...readTools, ...writeTools],
			knowledge: [
				{
					id: 'forge-surface',
					title: 'Forge surface',
					body: [
						'# Forge surface',
						'',
						`Tools: \`${ctx.namespacePrefix}_pr_list\` / \`${ctx.namespacePrefix}_pr_show\` / \`${ctx.namespacePrefix}_pr_create\` / \`${ctx.namespacePrefix}_pr_comment\` / \`${ctx.namespacePrefix}_ci_status\` / \`${ctx.namespacePrefix}_issue_list\` / \`${ctx.namespacePrefix}_issue_show\` / \`${ctx.namespacePrefix}_issue_create\`.`,
						'',
						'- Provider is auto-detected from the `origin` remote.',
						"- The plugin wraps the host's existing `gh`/`glab` auth; it never stores or prompts for a PAT.",
						'- Missing CLI yields an install hint instead of a crash.',
						'- Every write action requires an explicit `confirm:true` and returns a structured refusal envelope when the flag is absent or false.',
					].join('\n'),
				},
			],
		};
	},
});
