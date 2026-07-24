import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildForgeReadToolRegistrations } from './lib/tools/forge-read.tool';
import { buildForgeReleaseToolRegistrations } from './lib/tools/forge-release.tool';
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
		"GitHub/GitLab forge surface: PRs, issues, CI, releases and remote code search via the host's authenticated gh/glab CLI.",
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
			...(parsed.data.defaultTimeoutMs !== undefined
				? { defaultTimeoutMs: parsed.data.defaultTimeoutMs }
				: {}),
		});
		const releaseTools = buildForgeReleaseToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
			...(parsed.data.defaultTimeoutMs !== undefined
				? { timeoutMs: parsed.data.defaultTimeoutMs }
				: {}),
		});
		return {
			tools: [...readTools, ...writeTools, ...releaseTools],
			knowledge: [
				{
					id: 'forge-surface',
					title: 'Forge surface',
					body: [
						'# Forge surface',
						'',
						`Read tools: \`${ctx.namespacePrefix}_pr_list\` / \`${ctx.namespacePrefix}_pr_show\` / \`${ctx.namespacePrefix}_ci_status\` / \`${ctx.namespacePrefix}_issue_list\` / \`${ctx.namespacePrefix}_issue_show\`.`,
						`Write tool: \`${ctx.namespacePrefix}_write\` with kind discriminator \`pr_create\` / \`pr_comment\` / \`issue_create\`.`,
						`Release tool: \`${ctx.namespacePrefix}_release\` with kind discriminator \`create\` / \`search_code\`.`,
						'',
						'- Provider is auto-detected from the `origin` remote.',
						"- The plugin wraps the host's existing `gh`/`glab` auth; it never stores or prompts for a PAT.",
						'- Missing CLI yields an install hint instead of a crash.',
						'- Every write action requires an explicit `confirm:true` and returns a structured refusal envelope when the flag is absent or false.',
						'- Remote code search is read-only; release creation is consent-gated and reuses the same bounded/redacted CLI seam.',
					].join('\n'),
				},
			],
		};
	},
});
