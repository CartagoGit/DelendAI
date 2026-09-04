import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildGenerateDocstringsPrompt } from './prompts/docstrings';
import { buildExplainThisCodePrompt } from './prompts/explain';
import { buildOptimizeThisPrompt } from './prompts/optimize';
import { buildReviewThisDiffPrompt } from './prompts/review-diff';
import { buildSecurityAuditThisFilePrompt } from './prompts/security-audit';
import { buildWriteTestsForPrompt } from './prompts/write-tests';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'prompts-pack',
	version: '0.1.1',
	describe:
		'Prompts pack: explain-code, write-tests-for, review-diff, generate-docstrings, security-audit-file, optimize-this — composes existing tools, no model calls of its own.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			prompts: [
				buildExplainThisCodePrompt(ctx.namespacePrefix),
				buildGenerateDocstringsPrompt(ctx.namespacePrefix),
				buildWriteTestsForPrompt(ctx.namespacePrefix),
				buildReviewThisDiffPrompt(ctx.namespacePrefix),
				buildSecurityAuditThisFilePrompt(ctx.namespacePrefix),
				buildOptimizeThisPrompt(ctx.namespacePrefix),
			],
			knowledge: [
				{
					id: 'prompts-pack-overview',
					title: 'Prompts pack overview',
					body: [
						'# Prompts pack',
						'',
						'This plugin contributes six project-aware MCP prompts. Each prompt is pure text composition over shipped tool IDs and does not execute tools by itself.',
						'',
						`Prompts: \`${ctx.namespacePrefix}_explain-this-code\`, \`${ctx.namespacePrefix}_generate-docstrings\`, \`${ctx.namespacePrefix}_write-tests-for\`, \`${ctx.namespacePrefix}_review-this-diff\`, \`${ctx.namespacePrefix}_security-audit-this-file\`, \`${ctx.namespacePrefix}_optimize-this\`.`,
						'',
						'- Use them to inject grounded working instructions into the active host without coupling to a provider.',
						'- The prompts reference refactor, git, quality, test-convention, security, env, and perf tools already shipped elsewhere in the workspace.',
					].join('\n'),
				},
			],
		};
	},
});
