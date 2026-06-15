import { z } from 'zod';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolError, toolJson } from '@cartago-git/mcp-core/public';

import { checkRepo, gitChanged, gitDiffStat, gitLog, gitStatus } from './git';
import type { IGitRunner } from './git';

const NOT_A_REPO = (reason = 'not a git repository') =>
	toolError(
		reason,
		reason.includes('not available')
			? 'Install git or run where git is on PATH.'
			: 'Run inside a git working tree.'
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
					async () => {
						const repo = await checkRepo(options.run);
						return repo.ok
							? toolJson(await gitStatus(options.run))
							: NOT_A_REPO(repo.reason);
					}
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
					async () => {
						const repo = await checkRepo(options.run);
						return repo.ok
							? toolJson({ changed: await gitChanged(options.run) })
							: NOT_A_REPO(repo.reason);
					}
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
					}) => {
						const repo = await checkRepo(options.run);
						if (!repo.ok) return NOT_A_REPO(repo.reason);
						return toolJson({
							stat: await gitDiffStat(options.run, {
								...(args.staged !== undefined
									? { staged: args.staged }
									: {}),
								...(args.path !== undefined
									? { path: args.path }
									: {}),
							}),
						});
					}
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
						const repo = await checkRepo(options.run);
						if (!repo.ok) return NOT_A_REPO(repo.reason);
						const limit = Math.max(
							1,
							Math.min(100, Math.floor(args.limit ?? 10))
						);
						return toolJson({
							commits: await gitLog(options.run, limit),
						});
					}
				);
			},
		},
	];
};
