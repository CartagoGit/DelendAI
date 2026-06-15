import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolError, toolJson } from '@cartago-git/mcp-core/public';

import { gitChanged, gitDiffStat, gitLog, gitStatus, isGitRepo } from './git';
import type { IGitRunner } from './git';

const NOT_A_REPO = () =>
	toolError(
		'not a git repository (or git is unavailable here)',
		'Run inside a git working tree.'
	);

export interface IGitToolOptions {
	readonly namespacePrefix: string;
	readonly run: IGitRunner;
}

/**
 * Read-only git orientation tools: status, changed files, diff stat and
 * recent log as structured JSON. Lets an agent see what changed cheaply,
 * agnostic of language or framework. They never modify the repo.
 */
export const buildGitToolRegistrations = (
	options: IGitToolOptions
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'git_status',
			summary: 'Branch + working-tree status (clean flag + entries).',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_git_status`,
					{
						description:
							'Returns the current branch, whether the tree is clean, and the changed entries (status + path). Read-only.',
					},
					async () =>
						isGitRepo(options.run)
							? toolJson(gitStatus(options.run))
							: NOT_A_REPO()
				);
			},
		},
		{
			id: 'git_changed',
			summary: 'List of changed file paths in the working tree.',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_git_changed`,
					{
						description:
							'Returns just the list of changed file paths. Cheapest way to see what you have touched. Read-only.',
					},
					async () =>
						isGitRepo(options.run)
							? toolJson({ changed: gitChanged(options.run) })
							: NOT_A_REPO()
				);
			},
		},
		{
			id: 'git_diff',
			summary: 'Diff --stat (optionally staged or scoped to a path).',
			tags: ['git'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_git_diff`,
					{
						description:
							'Returns `git diff --stat` (file/line change summary). Optionally staged-only or scoped to a path. Low-token; read-only.',
						inputSchema: z.object({
							staged: z.boolean().optional(),
							path: z.string().optional(),
						}),
					},
					async (args: {
						staged?: boolean | undefined;
						path?: string | undefined;
					}) =>
						!isGitRepo(options.run)
							? NOT_A_REPO()
							: toolJson({
							stat: gitDiffStat(options.run, {
								...(args.staged !== undefined
									? { staged: args.staged }
									: {}),
								...(args.path !== undefined
									? { path: args.path }
									: {}),
							}),
						})
				);
			},
		},
		{
			id: 'git_log',
			summary: 'Recent commits (hash + subject).',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_git_log`,
					{
						description:
							'Returns the most recent commits as {hash, subject}. Read-only.',
						inputSchema: z.object({ limit: z.number().optional() }),
					},
					async (args: { limit?: number | undefined }) => {
						if (!isGitRepo(options.run)) return NOT_A_REPO();
						const limit = Math.max(
							1,
							Math.min(100, Math.floor(args.limit ?? 10))
						);
						return toolJson({ commits: gitLog(options.run, limit) });
					}
				);
			},
		},
	];
};
