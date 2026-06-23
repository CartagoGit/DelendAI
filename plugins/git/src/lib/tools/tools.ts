import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import {
	checkRepo,
	gitBlame,
	gitChanged,
	gitDiffStat,
	gitLog,
	gitShow,
	gitStatus,
	gitWorktreeList,
} from '../services/git';
import type { IGitRunner } from '../services/git';

const NOT_A_REPO = (reason = 'not a git repository') =>
	toolError(
		reason,
		reason.includes('not available')
			? 'Install git or run where git is on PATH.'
			: 'Run inside a git working tree.',
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
	options: IGitToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'status',
			summary: 'Branch + working-tree status (clean flag + entries).',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_status`,
					{
						description:
							'Returns the current branch, whether the tree is clean, and the changed entries (status + path). Read-only.',
						outputSchema: z.object({
							branch: z.string().optional(),
							clean: z.boolean(),
							entries: z.array(
								z.object({
									status: z.string(),
									path: z.string(),
								}),
							),
						}),
					},
					async () => {
						const repo = await checkRepo(options.run);
						return repo.ok
							? toolJson(await gitStatus(options.run))
							: NOT_A_REPO(repo.reason);
					},
				);
			},
		},
		{
			id: 'changed',
			summary: 'List of changed file paths in the working tree.',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_changed`,
					{
						description:
							'Returns just the list of changed file paths. Cheapest way to see what you have touched. Read-only.',
						outputSchema: z.object({
							changed: z.array(z.string()),
						}),
					},
					async () => {
						const repo = await checkRepo(options.run);
						return repo.ok
							? toolJson({
									changed: await gitChanged(options.run),
								})
							: NOT_A_REPO(repo.reason);
					},
				);
			},
		},
		{
			id: 'diff',
			summary: 'Diff --stat (optionally staged or scoped to a path).',
			tags: ['git'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_diff`,
					{
						description:
							'Returns `git diff --stat` (file/line change summary). Optionally staged-only or scoped to a path. Low-token; read-only.',
						inputSchema: z.object({
							staged: z.boolean().optional(),
							path: z.string().optional(),
						}),
						outputSchema: z.object({ stat: z.string() }),
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
					},
				);
			},
		},
		{
			id: 'log',
			summary: 'Recent commits (hash + subject).',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_log`,
					{
						description:
							'Returns the most recent commits as {hash, subject}. Read-only.',
						inputSchema: z.object({ limit: z.number().optional() }),
						outputSchema: z.object({
							commits: z.array(
								z.object({
									hash: z.string(),
									subject: z.string(),
								}),
							),
						}),
					},
					async (args: { limit?: number | undefined }) => {
						const repo = await checkRepo(options.run);
						if (!repo.ok) return NOT_A_REPO(repo.reason);
						const limit = Math.max(
							1,
							Math.min(100, Math.floor(args.limit ?? 10)),
						);
						return toolJson({
							commits: await gitLog(options.run, limit),
						});
					},
				);
			},
		},
		{
			id: 'blame',
			summary:
				'Per-line authorship for a tracked file (optionally a line range).',
			tags: ['git'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_blame`,
					{
						description:
							'Returns per-line authorship for a tracked file: {line, hash, author, date, content}. Optional `startLine`/`endLine` (both required together) scope it to a range. Read-only.',
						inputSchema: z.object({
							path: z.string(),
							startLine: z.number().int().positive().optional(),
							endLine: z.number().int().positive().optional(),
						}),
						outputSchema: z.object({
							lines: z.array(
								z.object({
									line: z.number(),
									hash: z.string(),
									author: z.string(),
									date: z.string(),
									content: z.string(),
								}),
							),
						}),
					},
					async (args: {
						path: string;
						startLine?: number | undefined;
						endLine?: number | undefined;
					}) => {
						const repo = await checkRepo(options.run);
						if (!repo.ok) return NOT_A_REPO(repo.reason);
						const result = await gitBlame(options.run, args.path, {
							...(args.startLine !== undefined
								? { startLine: args.startLine }
								: {}),
							...(args.endLine !== undefined
								? { endLine: args.endLine }
								: {}),
						});
						if (!result.ok) {
							return toolError(
								result.reason ?? 'git blame failed',
								'Check the path exists and is tracked by git.',
							);
						}
						return toolJson({ lines: result.lines });
					},
				);
			},
		},
		{
			id: 'show',
			summary:
				'Commit metadata + --stat summary for a ref (no full patch).',
			tags: ['git'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_show`,
					{
						description:
							"Returns a commit's metadata and `--stat` summary (file/line change counts, not the full patch): {hash, author, date, subject, stat}. `ref` defaults to HEAD; optional `path` scopes the stat to one file. Read-only.",
						inputSchema: z.object({
							ref: z.string().optional(),
							path: z.string().optional(),
						}),
						outputSchema: z.object({
							hash: z.string(),
							author: z.string(),
							date: z.string(),
							subject: z.string(),
							stat: z.string(),
						}),
					},
					async (args: {
						ref?: string | undefined;
						path?: string | undefined;
					}) => {
						const repo = await checkRepo(options.run);
						if (!repo.ok) return NOT_A_REPO(repo.reason);
						const result = await gitShow(
							options.run,
							args.ref ?? 'HEAD',
							args.path,
						);
						if (!result.ok || !result.detail) {
							return toolError(
								result.reason ?? 'git show failed',
								'Check the ref (and path, if given) exist.',
							);
						}
						return toolJson(result.detail);
					},
				);
			},
		},
		{
			id: 'worktree',
			summary: 'List existing git worktrees for this repo (read-only).',
			tags: ['git', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_worktree`,
					{
						description:
							'Lists existing git worktrees for this repo as {path, head, branch?, bare?, locked?}. Read-only orientation — to create/remove a per-agent worktree use proposals_agent_worktree instead.',
						outputSchema: z.object({
							worktrees: z.array(
								z.object({
									path: z.string(),
									head: z.string(),
									branch: z.string().optional(),
									bare: z.boolean().optional(),
									locked: z.boolean().optional(),
								}),
							),
						}),
					},
					async () => {
						const repo = await checkRepo(options.run);
						if (!repo.ok) return NOT_A_REPO(repo.reason);
						return toolJson({
							worktrees: await gitWorktreeList(options.run),
						});
					},
				);
			},
		},
	];
};
