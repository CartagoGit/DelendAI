import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildForgeReadToolRegistrations } from './lib/tools/forge-read.tool';

const OptionsSchema = z
	.object({
		defaultTimeoutMs: z.number().int().positive().max(120000).optional(),
	})
	.strict();

export default definePlugin({
	name: 'forge',
	version: '0.1.0',
	describe:
		"Read-only GitHub/GitLab forge surface: PR list/show, CI status and remote issue list/show via the host's authenticated gh/glab CLI.",
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`forge plugin rejected its options: ${parsed.error.message}`,
			);
		}
		return {
			tools: buildForgeReadToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				...(parsed.data.defaultTimeoutMs !== undefined
					? { defaultTimeoutMs: parsed.data.defaultTimeoutMs }
					: {}),
			}),
			knowledge: [
				{
					id: 'forge-read-surface',
					title: 'Forge read surface',
					body: [
						'# Forge read surface',
						'',
						`Tools: \`${ctx.namespacePrefix}_pr_list\` / \`${ctx.namespacePrefix}_pr_show\` / \`${ctx.namespacePrefix}_ci_status\` / \`${ctx.namespacePrefix}_issue_list\` / \`${ctx.namespacePrefix}_issue_show\`.`,
						'',
						'- Provider is auto-detected from the `origin` remote.',
						"- The plugin wraps the host's existing `gh`/`glab` auth; it never stores or prompts for a PAT.",
						'- Missing CLI yields an install hint instead of a crash.',
					].join('\n'),
				},
			],
		};
	},
});
