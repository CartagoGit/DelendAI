import { join } from 'node:path';

import type { IGitRunner } from '../shared/git-runner';
import {
	type IWorktreeSyncCoordinator,
	resolveWorktreeSyncCoordinator,
} from './worktree-sync-coordinator';
import { composeIdentity, nextCollisionSuffix } from '../shared/agent-identity';

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
	/**
	 * r00003 S10 (CONC-1): serializes `git worktree add`/`remove` against
	 * the proposals registry sync so a concurrent
	 * `syncProposalRegistry.run()` never reads a half-applied worktree.
	 * When omitted, a coordinator is derived from `registryMutexPath`
	 * (pass-through when that too is absent — identical to the previous
	 * direct-git behaviour). Tests inject a stub to assert ordering.
	 */
	readonly coordinator?: IWorktreeSyncCoordinator;
	/**
	 * Absolute path of the proposals registry index whose `withFileMutex`
	 * lock the default coordinator shares. When set (and no explicit
	 * `coordinator` is given), worktree mutations and registry syncs become
	 * mutually exclusive.
	 */
	readonly registryMutexPath?: string;
}

export interface IAgentWorktreeArgs {
	readonly action: 'create' | 'list' | 'remove';
	readonly agent?: string | undefined;
	/** `create` only: branch/commit to base the new branch on (default HEAD). */
	readonly base_branch?: string | undefined;
	/** `remove` only: force-remove even with uncommitted changes. */
	readonly force?: boolean | undefined;
	/**
	 * f00082 S4: composite identity. When host/model/task_id are
	 * all set, the worktree branch is
	 * `agent/<host>-<model>-<agent_name>-<task_id>` instead of the
	 * historical `agent/<agent_name>`. Optional for backwards
	 * compat — older callers that only pass `agent` keep working.
	 */
	readonly host?: import('@mcp-vertex/core/public').AgentHost | undefined;
	readonly model?: string | undefined;
	readonly task_id?: string | undefined;
}

export interface IWorktreeEntry {
	readonly path: string;
	readonly head: string;
	readonly branch?: string;
	readonly detached: boolean;
	readonly locked: boolean;
}

export type IAgentWorktreeResult =
	| {
			readonly ok: true;
			readonly action: 'create';
			readonly path: string;
			readonly branch: string;
			readonly created: boolean;
	  }
	| {
			readonly ok: true;
			readonly action: 'list';
			readonly worktrees: readonly IWorktreeEntry[];
	  }
	| {
			readonly ok: true;
			readonly action: 'remove';
			readonly path: string;
			readonly removed: boolean;
	  }
	| {
			readonly ok: false;
			readonly action: IAgentWorktreeArgs['action'];
			readonly reason: string;
	  };

const slug = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'agent';

const dirFor = (options: IAgentWorktreeOptions, agentSlug: string): string =>
	join(
		options.workspaceRoot,
		options.worktreesDirRel ?? '.worktrees',
		agentSlug,
	);

/**
 * The coordinator that serializes worktree mutations against the registry
 * sync. Use the explicitly-injected one if present; otherwise derive it
 * from `registryMutexPath` (pass-through when that is also absent).
 */
const coordinatorFor = (
	options: IAgentWorktreeOptions,
): IWorktreeSyncCoordinator =>
	options.coordinator ??
	resolveWorktreeSyncCoordinator(options.registryMutexPath);

/** Parse `git worktree list --porcelain` into structured entries. */
export const parseWorktreeList = (raw: string): readonly IWorktreeEntry[] => {
	const blocks = raw
		.split('\n\n')
		.map((block) => block.trim())
		.filter((b) => b.length > 0);
	const entries: IWorktreeEntry[] = [];
	for (const block of blocks) {
		const lines = block.split('\n');
		let path = '';
		let head = '';
		let branch: string | undefined;
		let detached = false;
		let locked = false;
		for (const line of lines) {
			if (line.startsWith('worktree '))
				path = line.slice('worktree '.length);
			else if (line.startsWith('HEAD '))
				head = line.slice('HEAD '.length);
			else if (line.startsWith('branch '))
				branch = line
					.slice('branch '.length)
					.replace(/^refs\/heads\//, '');
			else if (line === 'detached') detached = true;
			else if (line.startsWith('locked')) locked = true;
		}
		if (path.length > 0) {
			entries.push({
				path,
				head,
				...(branch !== undefined ? { branch } : {}),
				detached,
				locked,
			});
		}
	}
	return entries;
};

const listWorktrees = async (
	run: IGitRunner,
): Promise<IAgentWorktreeResult> => {
	const result = await run(['worktree', 'list', '--porcelain']);
	if (!result.ok) {
		return {
			ok: false,
			action: 'list',
			reason: result.reason ?? 'git worktree list failed',
		};
	}
	return {
		ok: true,
		action: 'list',
		worktrees: parseWorktreeList(result.output),
	};
};

const branchExists = async (
	run: IGitRunner,
	branch: string,
): Promise<boolean> =>
	(await run(['rev-parse', '--verify', '--quiet', branch])).ok;

const createWorktree = async (
	options: IAgentWorktreeOptions,
	run: IGitRunner,
	args: IAgentWorktreeArgs,
): Promise<IAgentWorktreeResult> => {
	if (args.agent === undefined || args.agent.trim().length === 0) {
		return {
			ok: false,
			action: 'create',
			reason: 'create requires "agent"',
		};
	}
	// f00082 S4: build the composite branch slug from the optional
	// host/model/task_id fields. The historical shape
	// (`agent/<agent_name>`) is preserved when none of the new
	// fields are set so older callers keep working.
	const composite = composeIdentity({
		agent_name: args.agent,
		...(args.host !== undefined ? { host: args.host } : {}),
		...(args.model !== undefined ? { model: args.model } : {}),
		...(args.task_id !== undefined ? { task_id: args.task_id } : {}),
	});
	const agentSlug = slug(args.agent);
	const path = dirFor(options, agentSlug);
	let branch = `agent/${composite}`;

	const existing = await listWorktrees(run);
	if (existing.ok && existing.action === 'list') {
		const already = existing.worktrees.find((entry) => entry.path === path);
		if (already !== undefined) {
			return {
				ok: true,
				action: 'create',
				path,
				branch: already.branch ?? branch,
				created: false,
			};
		}
	}

	// f00082 S4: when the composite branch already exists, pick the
	// next numeric suffix. We enumerate via `git branch --list` so
	// the engine stays a thin wrapper around git — no in-memory
	// state to drift from the working tree.
	const existingBranches = await listBranchNames(run);
	if (existingBranches !== null) {
		const suffix = nextCollisionSuffix(existingBranches, composite);
		if (suffix !== null) {
			branch = `${branch}-${suffix}`;
		}
	}

	const hasBranch = await branchExists(run, branch);
	const addArgs = hasBranch
		? ['worktree', 'add', path, branch]
		: ['worktree', 'add', '-b', branch, path, args.base_branch ?? 'HEAD'];
	// r00003 S10 (CONC-1): the `git worktree add` runs under the registry
	// mutex so a concurrent `syncProposalRegistry.run()` cannot read a
	// half-applied worktree mid-add.
	const result = await coordinatorFor(options).runExclusive(() =>
		run(addArgs),
	);
	if (!result.ok) {
		return {
			ok: false,
			action: 'create',
			reason: result.reason ?? 'git worktree add failed',
		};
	}
	return { ok: true, action: 'create', path, branch, created: true };
};

/**
 * Enumerate the local branch names known to git. Returns `null` when
 * the lookup fails (e.g. not a git repo, git missing) — the engine
 * then falls back to the bare composite without a numeric suffix.
 * Pure against the runner: no I/O outside `git branch --list`.
 */
const listBranchNames = async (
	run: IGitRunner,
): Promise<ReadonlySet<string> | null> => {
	const result = await run(['branch', '--list', '--format=%(refname:short)']);
	if (!result.ok) return null;
	const names = result.output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		// f00082 S4: strip the `agent/` prefix so the collision
		// check works against the bare composite
		// (`copilot-m3-orion-f00078` instead of
		// `agent/copilot-m3-orion-f00078`). Branches without the
		// prefix pass through unchanged.
		.map((name) =>
			name.startsWith('agent/') ? name.slice('agent/'.length) : name,
		);
	return new Set(names);
};

const removeWorktree = async (
	options: IAgentWorktreeOptions,
	run: IGitRunner,
	args: IAgentWorktreeArgs,
): Promise<IAgentWorktreeResult> => {
	if (args.agent === undefined || args.agent.trim().length === 0) {
		return {
			ok: false,
			action: 'remove',
			reason: 'remove requires "agent"',
		};
	}
	const path = dirFor(options, slug(args.agent));
	const removeArgs = [
		'worktree',
		'remove',
		...(args.force === true ? ['--force'] : []),
		path,
	];
	// r00003 S10 (CONC-1): same registry-mutex serialization as `create`,
	// so a worktree removal and a registry sync never interleave.
	const result = await coordinatorFor(options).runExclusive(() =>
		run(removeArgs),
	);
	if (!result.ok) {
		return {
			ok: false,
			action: 'remove',
			reason: result.reason ?? 'git worktree remove failed',
		};
	}
	return { ok: true, action: 'remove', path, removed: true };
};

export const runAgentWorktreeEngine = async (
	args: IAgentWorktreeArgs,
	options: IAgentWorktreeOptions,
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
