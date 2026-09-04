import { join } from 'node:path';

import { definePlugin } from '@mcp-vertex/core/public';
import z from 'zod';

import { buildTriageToolRegistrations } from './lib/tools/triage.tools';
import { REPOSITORY_SLUG } from '@mcp-vertex/core/public';

const TRIAGE_NEEDS_REPO_BODY = [
	'# issues-triage — repo not configured',
	'',
	'`plugins/issues-triage` is loaded but `plugins.issues-triage.options.repo` is missing.',
	'',
	'Set it to the GitHub repository this internal bot should watch, e.g.:',
	'',
	'```jsonc',
	`{ "plugins": { "issues-triage": { "options": { "repo": "${REPOSITORY_SLUG}" } } } }`,
	'```',
].join('\n');

/**
 * `@mcp-vertex/issues-triage` — internal-only issue bot for the
 * mcp-vertex repository itself.
 *
 * PRIVATE by design: this package is `"private": true`, is absent from
 * every preset, absent from `PUBLISH_ORDER`, and absent from the
 * first-party plugin index — it can only be loaded explicitly inside
 * this monorepo (`mcp-vertex --plugins=proposals,issues-triage`).
 *
 * It reads GitHub issues, classifies them mechanically, drafts a
 * complete fix proposal (optionally writing it under
 * `proposals/ready/` with an id from the shared proposals counter), and
 * replies on the issue — every comment is prefixed with a mandatory
 * machine-disclosure notice. No LLM runs inside the server; the host
 * decides what to execute.
 */
export default definePlugin({
	name: 'issues-triage',
	version: '0.1.0',
	describe:
		'INTERNAL-ONLY issue bot: reads GitHub issues, classifies them, drafts fix proposals and replies automatically with a machine-disclosure notice. Not published, not in any preset.',
	dependsOn: ['proposals'],
	optionsSchema: z.object({
		/** `'owner/name'`; required to register the triage tools. */
		repo: z.string().optional(),
	}),
	register(ctx) {
		const repo =
			typeof ctx.options.repo === 'string' &&
			ctx.options.repo.trim() !== ''
				? ctx.options.repo.trim()
				: undefined;

		if (repo === undefined) {
			return {
				tools: [],
				knowledge: [
					{
						id: 'issues-triage-needs-repo',
						title: 'issues-triage needs `repo` configured',
						body: TRIAGE_NEEDS_REPO_BODY,
					},
				],
			};
		}

		const proposalsDirAbs = ctx.workspace.resolve(
			join(ctx.docsDir, 'proposals'),
		);
		const counterPathAbs = ctx.workspace.resolve(
			join(ctx.cacheDir, 'proposal-id-counters.json'),
		);

		const tools = buildTriageToolRegistrations({
			namespacePrefix: ctx.namespacePrefix,
			repo,
			proposals: { proposalsDirAbs, counterPathAbs },
		});

		return {
			tools,
			knowledge: [
				{
					id: 'issues-triage-surface',
					title: 'Internal issue triage bot',
					body: [
						'# Internal issue triage bot',
						'',
						`Watches \`${repo}\`. Tools:`,
						`- \`${ctx.namespacePrefix}_triage_list\` — open issues.`,
						`- \`${ctx.namespacePrefix}_triage_run\` — analyse + draft proposal + automated reply.`,
						`- \`${ctx.namespacePrefix}_triage_comment\` — post an automated progress comment.`,
						'',
						'Every comment carries a mandatory machine-disclosure notice.',
					].join('\n'),
				},
			],
		};
	},
});
