/**
 * forge-tools.ts — f00136 S2: opt-in GitHub PR/CI tools (`pr_list`,
 * `pr_view`) for the git plugin, registered only when
 * `plugins.git.options.allowForge: true`. Both are read-only, `effects:
 * ['network']`, and drive the host's authenticated `gh` CLI through the
 * shared `runExternalTool` seam (r00012) — no token handling of our own.
 */
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import type { IGitForgeToolOptions } from '../contracts/interfaces/forge.interface';
import { listOpenPrs, viewPr } from '../services/forge';

const PR_ENTRY = z.object({
	number: z.number(),
	title: z.string(),
	branch: z.string(),
	url: z.string(),
	draft: z.boolean(),
});

const CI_CHECK = z.object({
	name: z.string(),
	status: z.string(),
	conclusion: z.string(),
	url: z.string(),
});

const PR_DETAIL = z.object({
	number: z.number(),
	title: z.string(),
	state: z.string(),
	url: z.string(),
	mergeable: z.string(),
	reviewDecision: z.string(),
	checks: z.array(CI_CHECK),
});

export const buildGitForgeToolRegistrations = (
	options: IGitForgeToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'pr_list',
			summary:
				'List open pull requests (number, title, branch, url) via gh. Opt-in, network.',
			tags: ['git', 'forge', 'network'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_pr_list`,
					{
						description:
							"List the repository's open pull requests via the GitHub CLI (gh): number, title, source branch, url and draft flag. Opt-in (plugins.git.options.allowForge:true), read-only, uses your existing gh auth. A missing or unauthenticated gh yields available:false with an install/auth hint, never an error.",
						inputSchema: z.object({}),
						outputSchema: z.object({
							available: z.boolean(),
							note: z.string().optional(),
							prs: z.array(PR_ENTRY),
						}),
					},
					async () =>
						toolJson(
							await listOpenPrs(
								options.workspaceRootAbs,
								options.forgeExec,
							),
						),
				);
			},
		},
		{
			id: 'pr_view',
			summary:
				'View a pull request with its CI check rollup via gh. Opt-in, network.',
			tags: ['git', 'forge', 'network'],
			effects: ['network'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_pr_view`,
					{
						description:
							"View a pull request via gh: state, mergeable, review decision, url and the CI status-check rollup (name, status, conclusion, url). Pass `pr` (a number, branch or url); omit it to use the current branch's PR. Opt-in (plugins.git.options.allowForge:true), read-only.",
						inputSchema: z.object({ pr: z.string().optional() }),
						outputSchema: z.object({
							available: z.boolean(),
							note: z.string().optional(),
							pr: PR_DETAIL.optional(),
						}),
					},
					async (args: { pr?: string | undefined }) =>
						toolJson(
							await viewPr(
								options.workspaceRootAbs,
								args.pr,
								options.forgeExec,
							),
						),
				);
			},
		},
	];
};
