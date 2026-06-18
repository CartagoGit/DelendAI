import { join } from 'node:path';

import type { IGitRunner } from '../shared/git-runner';

/**
 * Isolates a concurrent agent into its own `git worktree` + branch, so two
 * agents editing the same repo never share `.git/index` (the failure mode
 * is a lost or merged-in-error commit when one agent's `git add`/`commit`
 * races another's). One worktree per agent name, under `.worktrees/<slug>`.
 */
export interface IAgentWorktreeOptions {
	readonly run: IGitRunner;
	/** Absolute repo root (worktree paths resolve relative to this). */
	readonly workspaceRoot: string;
	/** Relative dir holding all agent worktrees (default `.worktrees`). */
	readonly worktreesDirRel?: string;
}

export interface IAgentWorktreeArgs {
	readonly action: 'create' | 'list' | 'remove';
	readonly agent?: string | undefined;
	/** `create` only: branch/commit to base the new branch on (default HEAD). */
	readonly base_branch?: string | undefined;
	/** `remove` only: force-remove even with uncommitted changes. */
	readonly force?: boolean | undefined;
}

export interface IWorktreeEntry {
	readonly path: string;
	readonly head: string;
	readonly branch?: string;
	readonly detached: boolean;
	readonly locked: boolean;
}

export type IAgentWorktreeResult =
	| { readonly ok: true; readonly action: 'create'; readonly path: string; readonly branch: string; readonly created: boolean }
	| { readonly ok: true; readonly action: 'list'; readonly worktrees: readonly IWorktreeEntry[] }
	| { readonly ok: true; readonly action: 'remove'; readonly path: string; readonly removed: boolean }
	| { readonly ok: false; readonly action: IAgentWorktreeArgs['action']; readonly reason: string };

const slug = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'agent';

const dirFor = (options: IAgentWorktreeOptions, agentSlug: string): string =>
	join(options.workspaceRoot, options.worktreesDirRel ?? '.worktrees', agentSlug);

/** Parse `git worktree list --porcelain` into structured entries. */
export const parseWorktreeList = (raw: string): readonly IWorktreeEntry[] => {
	const blocks = raw.split('\n\n').map((block) => block.trim()).filter((b) => b.length > 0);
	const entries: IWorktreeEntry[] = [];
	for (const block of blocks) {
		const lines = block.split('\n');
		let path = '';
		let head = '';
		let branch: string | undefined;
		let detached = false;
		let locked = false;
		for (const line of lines) {
			if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
			else if (line.startsWith('HEAD ')) head = line.slice('HEAD '.length);
			else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
			else if (line === 'detached') detached = true;
			else if (line.startsWith('locked')) locked = true;
		}
		if (path.length > 0) {
			entries.push({ path, head, ...(branch !== undefined ? { branch } : {}), detached, locked });
		}
	}
	return entries;
};

const listWorktrees = async (run: IGitRunner): Promise<IAgentWorktreeResult> => {
	const result = await run(['worktree', 'list', '--porcelain']);
	if (!result.ok) {
		return { ok: false, action: 'list', reason: result.reason ?? 'git worktree list failed' };
	}
	return { ok: true, action: 'list', worktrees: parseWorktreeList(result.output) };
};

const branchExists = async (run: IGitRunner, branch: string): Promise<boolean> =>
	(await run(['rev-parse', '--verify', '--quiet', branch])).ok;

const createWorktree = async (
	options: IAgentWorktreeOptions,
	run: IGitRunner,
	args: IAgentWorktreeArgs
): Promise<IAgentWorktreeResult> => {
	if (args.agent === undefined || args.agent.trim().length === 0) {
		return { ok: false, action: 'create', reason: 'create requires "agent"' };
	}
	const agentSlug = slug(args.agent);
	const path = dirFor(options, agentSlug);
	const branch = `agent/${agentSlug}`;

	const existing = await listWorktrees(run);
	if (existing.ok && existing.action === 'list') {
		const already = existing.worktrees.find((entry) => entry.path === path);
		if (already !== undefined) {
			return { ok: true, action: 'create', path, branch: already.branch ?? branch, created: false };
		}
	}

	const hasBranch = await branchExists(run, branch);
	const addArgs = hasBranch
		? ['worktree', 'add', path, branch]
		: ['worktree', 'add', '-b', branch, path, args.base_branch ?? 'HEAD'];
	const result = await run(addArgs);
	if (!result.ok) {
		return { ok: false, action: 'create', reason: result.reason ?? 'git worktree add failed' };
	}
	return { ok: true, action: 'create', path, branch, created: true };
};

const removeWorktree = async (
	options: IAgentWorktreeOptions,
	run: IGitRunner,
	args: IAgentWorktreeArgs
): Promise<IAgentWorktreeResult> => {
	if (args.agent === undefined || args.agent.trim().length === 0) {
		return { ok: false, action: 'remove', reason: 'remove requires "agent"' };
	}
	const path = dirFor(options, slug(args.agent));
	const removeArgs = ['worktree', 'remove', ...(args.force === true ? ['--force'] : []), path];
	const result = await run(removeArgs);
	if (!result.ok) {
		return { ok: false, action: 'remove', reason: result.reason ?? 'git worktree remove failed' };
	}
	return { ok: true, action: 'remove', path, removed: true };
};

export const runAgentWorktreeEngine = async (
	args: IAgentWorktreeArgs,
	options: IAgentWorktreeOptions
): Promise<IAgentWorktreeResult> => {
	switch (args.action) {
		case 'create':
			return createWorktree(options, options.run, args);
		case 'remove':
			return removeWorktree(options, options.run, args);
		case 'list':
			return listWorktrees(options.run);
	}
};
