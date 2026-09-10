/**
 * commit-driver-harness.ts — the fake git runner and the baseline
 * options that every commit-driver spec builds on.
 *
 * Extracted so a second spec file can exercise the same driver without
 * duplicating the fake. Two fakes for one driver is two chances to
 * disagree about what git does, and the spec that disagrees quietly is
 * the one that stops protecting anything.
 */
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
	createWriteGitRunner,
	type IGitRunner,
	type IGitRunResult,
} from '@delendai/core/public';

import type { ICommitPolicyOptions } from '@delendai/commit-policy/lib/contracts/options';
export type IParsedOptions = ICommitPolicyOptions;

export const execFileAsync = promisify(execFile);

export const ok = (output: string): IGitRunResult => ({ ok: true, output });
export const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

interface IFakeGit {
	readonly run: IGitRunner;
	readonly committed: { count: number; messages: string[] };
	readonly added: string[];
	readonly resets: string[][];
	readonly commands: string[][];
}

/**
 * Build an IGitRunner that:
 *   - answers `config --global user.name|user.email` from globals
 *   - answers `rev-parse --abbrev-ref HEAD` from `currentBranch`
 *   - counts every `commit -m <msg>` invocation and stores the
 *     message + author flag
 *   - succeeds on push (so we can verify the post-commit push call)
 */
export const buildFakeGit = (opts: {
	currentBranch?: string;
	globalName?: string;
	globalEmail?: string;
	/**
	 * x00263 (AUD-CP-005): pretend `git diff --cached --name-only`
	 * returned these paths. Lets the new post-stage subset
	 * check exercise both the contamination path and the
	 * clean-subset path without a real git repo.
	 *
	 * x00419 (2026-09-03): after the shared-index path resets the
	 * worktree index BEFORE staging, the cached value is wiped and
	 * subsequent `git diff --cached --name-only` calls must reflect
	 * only what was added AFTER the reset. We model this by
	 * switching the cached response from `opts.cached` to
	 * `added` once any `reset` is observed.
	 */
	cached?: readonly string[];
	dirty?: readonly string[];
	headBefore?: string;
	headAfter?: string;
	commitFailsWith?: string;
}): IFakeGit => {
	const committed = { count: 0, messages: [] as string[] };
	const added: string[] = [];
	const resets: string[][] = [];
	const commands: string[][] = [];
	const responses = new Map<string, IGitRunResult>();
	const headBefore =
		opts.headBefore ?? '1111111111111111111111111111111111111111';
	const headAfter =
		opts.headAfter ?? '2222222222222222222222222222222222222222';
	if (opts.currentBranch !== undefined) {
		responses.set(
			'rev-parse\u0000--abbrev-ref\u0000HEAD',
			ok(`${opts.currentBranch}\n`),
		);
	} else {
		responses.set(
			'rev-parse\u0000--abbrev-ref\u0000HEAD',
			fail('not a repo'),
		);
	}
	if (opts.globalName !== undefined) {
		responses.set(
			'config\u0000--global\u0000user.name',
			ok(`${opts.globalName}\n`),
		);
	}
	if (opts.globalEmail !== undefined) {
		responses.set(
			'config\u0000--global\u0000user.email',
			ok(`${opts.globalEmail}\n`),
		);
	}
	responses.set('rev-parse\u0000HEAD', ok(`${headBefore}\n`));
	responses.set(
		'rev-parse\u0000--short\u0000HEAD',
		ok(`${headAfter.slice(0, 7)}\n`),
	);
	if (opts.cached !== undefined) {
		responses.set(
			'diff\u0000--cached\u0000--name-only',
			ok(`${opts.cached.join('\n')}\n`),
		);
	}
	if (opts.dirty !== undefined) {
		responses.set(
			'status\u0000--porcelain=v1',
			ok(`${opts.dirty.map((path) => ` M ${path}`).join('\n')}\n`),
		);
	}
	const run: IGitRunner = async (
		args: readonly string[],
	): Promise<IGitRunResult> => {
		commands.push([...args]);
		const key = args.join('\u0000');
		if (args[0] === 'commit') {
			if (opts.commitFailsWith !== undefined) {
				return fail(opts.commitFailsWith);
			}
			committed.count += 1;
			const mIdx = args.indexOf('-m');
			if (mIdx >= 0 && mIdx + 1 < args.length) {
				committed.messages.push(args[mIdx + 1] ?? '');
			}
			responses.set('rev-parse\u0000HEAD', ok(`${headAfter}\n`));
			return ok('committed\n');
		}
		if (args[0] === 'push') return ok('pushed\n');
		if (args[0] === 'add') {
			added.push(...args.slice(2));
			// After an add, the cached names grow by exactly the
			// union of `added`. Reflect this in the next
			// `diff --cached --name-only` call so the subset
			// check sees what was actually staged.
			responses.set(
				'diff\u0000--cached\u0000--name-only',
				ok(`${[...new Set(added)].join('\n')}\n`),
			);
			return ok('added\n');
		}
		if (args[0] === 'reset') {
			resets.push([...args]);
			// After a reset, the worktree's main index is empty.
			// The next `add` will start the cached list from
			// zero; reflect that.
			added.length = 0;
			responses.set('diff\u0000--cached\u0000--name-only', ok(''));
			return ok('reset\n');
		}
		const direct = responses.get(key);
		if (direct !== undefined) return direct;
		return fail(`not stubbed: ${key}`);
	};
	return { run, committed, added, resets, commands };
};

export const basePolicy = (overrides: Partial<IParsedOptions> = {}): IParsedOptions => ({
	gitTimeoutMs: 60_000,
	commit: {
		enabled: true,
		requireConventional: true,
		autoScopeFromProposal: true,
		refuseWhenDisabled: true,
	},
	stash: { enabled: false },
	identity: { mode: 'global' },
	audit: { trailer: 'none', agentFormat: '${host}/${model}' },
	cadence: {
		triggers: [],
		sliceScoping: true,
		allowForeignChanges: false,
		// This suite does not exercise the quiet period.
		quietPeriodMs: 0,
	},
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master'],
	},
	...overrides,
});

export const runGit = async (
	cwd: string,
	args: readonly string[],
): Promise<string> => {
	const { stdout } = await execFileAsync('git', [...args], {
		cwd,
		encoding: 'utf8',
	});
	return stdout.trim();
};

export const withTempRepo = async (
	run: (ctx: {
		repoDir: string;
		git: IGitRunner;
		trackedFile: string;
		lockPath: string;
	}) => Promise<void>,
): Promise<void> => {
	const repoDir = await mkdtemp(join(tmpdir(), 'commit-driver-spec-'));
	const trackedFile = join(repoDir, 'slice-a.ts');
	try {
		await runGit(repoDir, ['init', '-b', 'develop']);
		await runGit(repoDir, ['config', 'user.name', 'Cartago']);
		await runGit(repoDir, ['config', 'user.email', 'cartago@example.com']);
		await writeFile(trackedFile, 'export const value = 1;\n');
		await runGit(repoDir, ['add', '--', 'slice-a.ts']);
		await runGit(repoDir, ['commit', '-m', 'feat: seed']);
		await run({
			repoDir,
			git: createWriteGitRunner(repoDir),
			trackedFile,
			lockPath: join(repoDir, '.delendai', 'index-lock.mutex'),
		});
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
};
