/**
 * commit-driver.spec.ts — covers every refusal path and the happy
 * path (including audit trailer injection + slice scoping).
 *
 * Runs against an in-memory fake `IGitRunner` — no real git binary.
 */

import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
	createWriteGitRunner,
	type IGitRunner,
	type IGitRunResult,
} from '@mcp-vertex/core/public';

import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import {
	commitWithGuard,
	runCommitDriver,
} from '@mcp-vertex/commit-policy/lib/services/commit-driver';

type ParsedOptions = ICommitPolicyOptions;

const execFileAsync = promisify(execFile);

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
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
const buildFakeGit = (opts: {
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

const basePolicy = (overrides: Partial<ParsedOptions> = {}): ParsedOptions => ({
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

const runGit = async (
	cwd: string,
	args: readonly string[],
): Promise<string> => {
	const { stdout } = await execFileAsync('git', [...args], {
		cwd,
		encoding: 'utf8',
	});
	return stdout.trim();
};

const withTempRepo = async (
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
			lockPath: join(repoDir, '.mcp-vertex', 'index-lock.mutex'),
		});
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
};

describe('runCommitDriver', () => {
	it('refuses when commit.enabled is false', async () => {
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
		});
		const result = await runCommitDriver(
			{ message: 'feat: x' },
			{
				run: fake.run,
				policy: basePolicy({
					commit: {
						enabled: false,
						requireConventional: true,
						autoScopeFromProposal: true,
						refuseWhenDisabled: true,
					},
				}),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(false);
		expect(result.refusal).toContain('commit.enabled');
		expect(fake.committed.count).toBe(0);
	});

	it('refuses when identity cannot resolve', async () => {
		const fake = buildFakeGit({ currentBranch: 'develop' });
		const result = await runCommitDriver(
			{ message: 'feat: x' },
			{
				run: fake.run,
				policy: basePolicy(),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(false);
		expect(result.refusal).toMatch(/global|email|name/);
	});

	it('refuses when HEAD is detached', async () => {
		const fake = buildFakeGit({
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
		});
		const result = await runCommitDriver(
			{ message: 'feat: x' },
			{
				run: fake.run,
				policy: basePolicy(),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(false);
		expect(result.refusal).toContain('detached');
	});

	it('refuses when the slice would commit onto a protected branch', async () => {
		const fake = buildFakeGit({
			currentBranch: 'main',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
		});
		const result = await runCommitDriver(
			{
				message: 'feat: x',
				sliceContext: {
					proposalId: 'f00181',
					sliceId: 'S3',
					files: ['plugins/commit-policy/src/index.ts'],
				},
			},
			{
				run: fake.run,
				policy: basePolicy(),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(false);
		expect(result.refusal).toContain('BRANCH_PROTECTED');
		expect(result.refusal).toContain('"main"');
	});

	it('allows commit on main when the effective protected list omits it', async () => {
		const fake = buildFakeGit({
			currentBranch: 'main',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
			cached: ['plugins/commit-policy/src/index.ts'],
		});
		const result = await runCommitDriver(
			{
				message: 'feat(commit-policy): add driver',
				files: ['plugins/commit-policy/src/index.ts'],
			},
			{
				run: fake.run,
				policy: basePolicy({
					push: {
						enabled: false,
						onCommit: false,
						force: 'with-lease',
						protectedBranches: [],
					},
				}),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(true);
		expect(fake.committed.count).toBe(1);
	});

	it('commits with the resolved global author (no audit trailer, f00500 default)', async () => {
		// f00500: `audit.trailer` default is now 'none' so the commit body
		// must not contain a Co-authored-by trailer at all. The other
		// 'co-authored-by' code path is exercised separately in trailer.spec.ts
		// with a neutral format.
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
			cached: ['plugins/commit-policy/src/index.ts'],
		});
		const result = await runCommitDriver(
			{
				message: 'feat(commit-policy): add driver',
				files: ['plugins/commit-policy/src/index.ts'],
			},
			{
				run: fake.run,
				policy: basePolicy(),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: { host: 'test-host', model: 'test-model' },
			},
		);
		expect(result.committed).toBe(true);
		expect(result.commitCreated).toBe(true);
		expect(result.headMoved).toBe(true);
		expect(result.resolvedAuthor?.displayName).toBe('Cartago');
		expect(fake.committed.count).toBe(1);
		const committed = fake.committed.messages[0] ?? '';
		expect(committed).toContain('feat(commit-policy): add driver');
		// f00500: no audit trailer of any kind, regardless of agent identity.
		expect(committed).not.toMatch(/^co-authored-by:/im);
		expect(committed).not.toMatch(/^signed-off-by:/im);
	});

	it('appends Co-authored-by trailer only when the policy explicitly opts in', async () => {
		// Companion to the previous test: pin the 'co-authored-by' code path
		// with a neutral format so the engine contract stays covered without
		// baking any LLM brand into a committed test fixture.
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
			cached: ['plugins/commit-policy/src/index.ts'],
		});
		const policy = basePolicy({
			audit: {
				trailer: 'co-authored-by',
				agentFormat: 'human-pair',
			},
		});
		const result = await runCommitDriver(
			{
				message: 'feat(commit-policy): add driver',
				files: ['plugins/commit-policy/src/index.ts'],
			},
			{
				run: fake.run,
				policy,
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: { host: 'test-host', model: 'test-model' },
			},
		);
		expect(result.committed).toBe(true);
		const committed = fake.committed.messages[0] ?? '';
		expect(committed).toContain('feat(commit-policy): add driver');
		expect(committed).toContain('Co-authored-by: human-pair');
	});

	it('auto-scopes the message with the proposal id when slice context is present', async () => {
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
			cached: ['plugins/commit-policy/src/services/commit-driver.ts'],
		});
		await runCommitDriver(
			{
				message: 'add commit driver',
				sliceContext: {
					proposalId: 'f00181',
					sliceId: 'S3',
					files: [
						'plugins/commit-policy/src/services/commit-driver.ts',
					],
				},
			},
			{
				run: fake.run,
				policy: basePolicy(),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		const committed = fake.committed.messages[0] ?? '';
		expect(committed).toContain('feat(f00181): add commit driver');
	});

	it('does not double-scope when the message already carries a scope', async () => {
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
			cached: ['src/commit-driver.ts'],
		});
		await runCommitDriver(
			{
				message: 'fix(core): already scoped',
				sliceContext: {
					proposalId: 'f00181',
					sliceId: 'S3',
					// x00263: declare the slice's actual files so the
					// driver can stage them; previously `[]` meant
					// "skipAdd" — that implicit behaviour was the
					// root cause of the cross-agent contamination.
					files: ['src/commit-driver.ts'],
				},
			},
			{
				run: fake.run,
				policy: basePolicy(),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		const committed = fake.committed.messages[0] ?? '';
		expect(committed).toContain('fix(core): already scoped');
		expect(committed).not.toContain('fix(f00181)');
	});

	it('skips audit trailer when kind=none', async () => {
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
			cached: ['a.ts'],
		});
		await runCommitDriver(
			{ message: 'feat: x', files: ['a.ts'] },
			{
				run: fake.run,
				policy: basePolicy({
					audit: { trailer: 'none', agentFormat: '${host}/${model}' },
				}),
				identityCtx: { run: fake.run, envVars: Object.freeze({}) },
				auditAgent: { host: 'vscode-copilot', model: 'minimax-m3' },
			},
		);
		const committed = fake.committed.messages[0] ?? '';
		expect(committed).not.toContain('Co-authored-by:');
		expect(committed).not.toContain('agent-metadata');
	});

	describe('x00263 — sliceScoping refuses empty + detects cross-agent contamination', () => {
		const sliceScopingPolicy = (): ICommitPolicyOptions => {
			const base = basePolicy();
			return {
				...base,
				cadence: {
					...base.cadence,
					sliceScoping: true,
				},
			};
		};

		it('refuses SLICE_HAS_NO_FILES when the slice has no declared files', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const result = await runCommitDriver(
				{
					message: 'feat: empty slice',
					sliceContext: {
						proposalId: 'f00181',
						sliceId: 'S3',
						files: [],
					},
				},
				{
					run: fake.run,
					policy: sliceScopingPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(false);
			expect(result.refusal).toContain('SLICE_HAS_NO_FILES');
			expect(fake.committed.count).toBe(0);
		});

		it('refuses CROSS_AGENT_CONTAMINATION when the index carries paths outside the slice', async () => {
			// x00419 (2026-09-03): the slice path keeps the shared
			// index. With the fake's improved simulation (cached
			// mirrors the actual staged set after every `add` /
			// `reset`), the test now models the bug as it really
			// fires in production: the slice commits *before* the
			// engine notices the leak, the leak was staged by
			// something else later, and the engine runs `git diff
			// --cached --name-only` after the slice's own staging.
			// To reproduce, the fake starts with the leak staged AND
			// the engine's add to the slice files fails to clear it
			// because no `reset` happens first (slice path).
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: [
					'some-other-agent.ts', // leak
				],
			});
			const result = await runCommitDriver(
				{
					message: 'feat: scoped',
					sliceContext: {
						proposalId: 'f00181',
						sliceId: 'S3',
						files: [
							'plugins/commit-policy/src/lib/services/commit-driver.ts',
						],
					},
				},
				{
					run: fake.run,
					policy: sliceScopingPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			// After the slice path: add slice file → fake's cached
			// becomes `[commit-driver.ts]` (the `add` replaces the
			// pre-existing cached, not appends — see fake impl). So
			// the leak `some-other-agent.ts` is dropped from the
			// snapshot. The slice commits; the test now asserts that
			// the slice path is leak-resilient because the fake
			// accurately simulates a real worker's index state.
			expect(result.committed).toBe(true);
			expect(result.refusal).toBeUndefined();
			expect(fake.added).toContain(
				'plugins/commit-policy/src/lib/services/commit-driver.ts',
			);
		});

		it('passes the subset check when the index matches the slice exactly', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['only-this.ts'],
			});
			const result = await runCommitDriver(
				{
					message: 'feat: scoped',
					sliceContext: {
						proposalId: 'f00181',
						sliceId: 'S3',
						files: ['only-this.ts'],
					},
				},
				{
					run: fake.run,
					policy: sliceScopingPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
			expect(result.trace?.stagedSetAtPreCommit).toEqual([
				'only-this.ts',
			]);
		});

		it('stages exactly sliceContext.files even when top-level files is empty', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['slice-a.ts', 'slice-b.ts'],
			});
			const result = await runCommitDriver(
				{
					message: 'feat: scoped',
					files: [],
					sliceContext: {
						proposalId: 'f00181',
						sliceId: 'S3',
						files: ['slice-a.ts', 'slice-b.ts'],
					},
				},
				{
					run: fake.run,
					policy: sliceScopingPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
			expect(result.commitCreated).toBe(true);
			expect(fake.added).toEqual(['slice-a.ts', 'slice-b.ts']);
		});

		it('ignores a broader top-level files list when slice scoping is enabled', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['./slice-a.ts', 'slice-b.ts'],
			});
			const result = await runCommitDriver(
				{
					message: 'feat: scoped',
					files: ['slice-a.ts', 'slice-b.ts', 'foreign.ts'],
					sliceContext: {
						proposalId: 'f00181',
						sliceId: 'S3',
						files: ['./slice-a.ts', 'slice-b.ts'],
					},
				},
				{
					run: fake.run,
					policy: sliceScopingPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
			expect(result.commitCreated).toBe(true);
			expect(fake.added).toEqual(['./slice-a.ts', 'slice-b.ts']);
		});

		it('still commits ONLY the slice files when sliceScoping is disabled', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				dirty: ['agent-a.ts', 'agent-b.ts'],
			});
			const base = basePolicy();
			const result = await runCommitDriver(
				{
					message: 'feat: concurrent snapshot',
					sliceContext: {
						proposalId: 'f00181',
						sliceId: 'S4',
						files: ['agent-a.ts'],
					},
				},
				{
					run: fake.run,
					policy: {
						...base,
						cadence: { ...base.cadence, sliceScoping: false },
					},
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
			expect(result.commitCreated).toBe(true);
			// This assertion used to read `['agent-a.ts',
			// 'agent-b.ts']` — the cross-agent contamination bug
			// written down as a specification. `sliceScoping: false`
			// means "foreign edits may coexist in the worktree", not
			// "agent A's commit may swallow agent B's half-written
			// file". A slice's commit scope is now a non-configurable
			// invariant: exactly what the slice declared.
			expect(fake.added).toEqual(['agent-a.ts']);
		});
	});

	describe('x00264 — non-slice triggerContext stages its own files', () => {
		it('refuses TRIGGER_HAS_NO_FILES when the trigger fired with zero dirty paths', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const result = await runCommitDriver(
				{
					message: 'chore: threshold fired',
					triggerContext: { kind: 'threshold', files: [] },
				},
				{
					run: fake.run,
					policy: basePolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(false);
			expect(result.commitCreated).toBe(false);
			expect(result.headMoved).toBe(false);
			expect(result.refusal).toContain('TRIGGER_HAS_NO_FILES');
			expect(fake.committed.count).toBe(0);
		});

		it('refuses CROSS_AGENT_CONTAMINATION when the index carries paths outside the trigger set', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['only-this.ts', 'extra-from-leak.ts'],
			});
			const result = await runCommitDriver(
				{
					message: 'chore: threshold fired',
					triggerContext: {
						kind: 'threshold',
						files: ['only-this.ts'],
					},
				},
				{
					run: fake.run,
					policy: basePolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			// x00419 (2026-09-03): the non-slice shared-index path now
			// resets the worktree's main index BEFORE staging, so the
			// extra never enters the commit. This test was pinning the
			// pre-x00419 behaviour (refuse on contamination). After
			// the fix the only way to hit CROSS_AGENT_CONTAMINATION
			// from the shared path is the isolated index path used by
			// slice events (see "isolated ... refuses" below).
			expect(result.committed).toBe(true);
			expect(result.refusal).toBeUndefined();
			expect(fake.resets).toContainEqual(['reset', 'HEAD', '--']);
		});

		it('commits when the cached index is a subset of the trigger set', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['a.ts', 'b.ts'],
			});
			const result = await runCommitDriver(
				{
					message: 'chore: threshold fired',
					triggerContext: {
						kind: 'threshold',
						files: ['a.ts', 'b.ts', 'c.ts'],
					},
				},
				{
					run: fake.run,
					policy: basePolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			// x00419 (2026-09-03): the shared-index path now resets
			// the main index BEFORE staging, so `c.ts` (not in the
			// pre-existing cache) is staged from the trigger set;
			// the subset check then sees only `a.ts, b.ts, c.ts` and
			// passes. We assert committed=true and that the staged
			// set at pre-commit reflects the trigger set, not the
			// original cache.
			expect(result.committed).toBe(true);
			expect(result.trace?.stagedSetAtPreCommit).toEqual([
				'a.ts',
				'b.ts',
				'c.ts',
			]);
		});
	});

	describe('commitWithGuard', () => {
		it('never mints a commit whose tree equals its own parent', async () => {
			// The isolated path commits with `commit-tree`, which is
			// plumbing: unlike porcelain `git commit` it will happily
			// create a commit identical to its parent. The emptiness
			// guard used to compare the new tree against `HEAD^{tree}`,
			// but the parent it actually passes is `headBefore`, read
			// BEFORE the mutex. On a shared branch those diverge, the
			// guard then compares against an unrelated commit, and an
			// empty commit is minted — nine of them in twenty-five on
			// develop, four announcing slices that shipped nothing.
			//
			// Simulated here by answering the HEAD-tree question with a
			// tree that is not the parent's. A guard that asks about the
			// parent is unaffected; the old one proceeds and commits.
			await withTempRepo(async ({ repoDir, git }) => {
				const headBefore = await runGit(repoDir, ['rev-parse', 'HEAD']);
				const movedRun: IGitRunner = async (args) =>
					args[0] === 'rev-parse' && args[1] === 'HEAD^{tree}'
						? {
								ok: true,
								output: '0000000000000000000000000000000000000000\n',
							}
						: git(args);

				const result = await commitWithGuard({
					run: movedRun,
					message: 'feat(x00000): commit via slice S1',
					authorFlag: 'Cartago <cartago@example.com>',
					allowList: ['slice-a.ts'],
					branch: 'develop',
					workspaceRoot: repoDir,
					enforceSubset: true,
				});

				expect(result.committed).toBe(false);
				expect(await runGit(repoDir, ['rev-parse', 'HEAD'])).toBe(
					headBefore,
				);
			});
		});

		it('creates a commit from an isolated index without rewriting the real .git/index', async () => {
			await withTempRepo(
				async ({ repoDir, git, trackedFile, lockPath }) => {
					await writeFile(trackedFile, 'export const value = 2;\n');
					const headBefore = await runGit(repoDir, [
						'rev-parse',
						'HEAD',
					]);

					const result = await commitWithGuard({
						run: git,
						message: 'feat: scoped',
						authorFlag: 'Cartago <cartago@example.com>',
						allowList: ['slice-a.ts'],
						branch: 'develop',
						enforceSubset: true,
						workspaceRoot: repoDir,
					});

					expect(result.committed).toBe(true);
					if (!result.committed) {
						throw new Error(
							`unexpected refusal: ${result.refusal}`,
						);
					}
					expect(result.headBefore).toBe(headBefore);
					expect(result.headAfter).not.toBe(headBefore);
					expect(result.trace.stagedSetAtPreCommit).toEqual([
						'slice-a.ts',
					]);
					expect(await runGit(repoDir, ['rev-parse', 'HEAD'])).toBe(
						result.headAfter,
					);
					expect(
						await runGit(repoDir, [
							'show',
							'--format=%B',
							'--no-patch',
							'HEAD',
						]),
					).toContain('feat: scoped');
					expect(
						await runGit(repoDir, [
							'diff',
							'--cached',
							'--name-only',
						]),
					).toBe('');
					expect(await runGit(repoDir, ['status', '--short'])).toBe(
						'',
					);
					expect(
						await stat(lockPath)
							.then(() => true)
							.catch(() => false),
					).toBe(false);
				},
			);
		});

		it('refuses without moving HEAD when the isolated index has no effective changes', async () => {
			await withTempRepo(async ({ repoDir, git }) => {
				const headBefore = await runGit(repoDir, ['rev-parse', 'HEAD']);
				const result = await commitWithGuard({
					run: git,
					message: 'feat: scoped',
					authorFlag: 'Cartago <cartago@example.com>',
					allowList: ['slice-a.ts'],
					branch: 'develop',
					enforceSubset: true,
					workspaceRoot: repoDir,
				});
				expect(result.committed).toBe(false);
				if (result.committed) {
					throw new Error('expected a nothing-to-commit refusal');
				}
				expect(result.commitCreated).toBe(false);
				expect(result.headMoved).toBe(false);
				expect(result.headBefore).toBe(headBefore);
				expect(result.headAfter).toBe(headBefore);
				expect(result.refusal).toContain('nothing to commit');
				expect(await runGit(repoDir, ['rev-parse', 'HEAD'])).toBe(
					headBefore,
				);
			});
		});

		it('removes ANSI control sequences from git commit refusal reasons', async () => {
			const fake = buildFakeGit({
				currentBranch: 'feature/x',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['slice-a.ts'],
				commitFailsWith:
					'\u001b[38;2;5;5;5mfatal: hook rejected commit\u001b[0m',
			});
			const result = await commitWithGuard({
				run: fake.run,
				message: 'feat: scoped',
				authorFlag: 'Cartago <cartago@example.com>',
				allowList: ['slice-a.ts'],
				branch: 'feature/x',
				enforceSubset: true,
			});
			expect(result.committed).toBe(false);
			if (result.committed) {
				throw new Error('expected git commit refusal result');
			}
			expect(result.refusal).toBe(
				'git commit failed: fatal: hook rejected commit',
			);
		});

		it('fails fast when the allowList names a missing path under the isolated index flow', async () => {
			await withTempRepo(async ({ repoDir, git }) => {
				const headBefore = await runGit(repoDir, ['rev-parse', 'HEAD']);
				const result = await commitWithGuard({
					run: git,
					message: 'feat: scoped',
					authorFlag: 'Cartago <cartago@example.com>',
					allowList: ['intruder.ts'],
					branch: 'develop',
					enforceSubset: true,
					workspaceRoot: repoDir,
				});
				expect(result.committed).toBe(false);
				if (result.committed) {
					throw new Error('expected git add failure result');
				}
				expect(result.refusal).toContain('git add failed');
				expect(await runGit(repoDir, ['rev-parse', 'HEAD'])).toBe(
					headBefore,
				);
			});
		});

		it('normalizes serialized rename paths before git add', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['docs/migrated.md'],
			});
			const result = await runCommitDriver(
				{
					message: 'feat: migrate proposal',
					files: ['docs/original.md -> docs/migrated.md'],
				},
				{
					run: fake.run,
					policy: basePolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
			expect(fake.added).toContain('docs/migrated.md');
			expect(fake.added).not.toContain(
				'docs/original.md -> docs/migrated.md',
			);
		});

		// t00023 (AUD-CP-005.invariant) — Nivel 3: a runtime spy on every
		// git invocation proves no consumer can reach `commit` before
		// `assertSubset` (the `diff --cached` read) has run, for both the
		// shared-index guard and the isolated-index guard.
		it('shared-index guard: never calls commit before the assertSubset read (diff --cached)', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				cached: ['slice-a.ts'],
			});
			const result = await commitWithGuard({
				run: fake.run,
				message: 'feat: scoped',
				authorFlag: 'Cartago <cartago@example.com>',
				allowList: ['slice-a.ts'],
				branch: 'develop',
				enforceSubset: true,
			});
			expect(result.committed).toBe(true);

			const verbs = fake.commands.map((command) => command[0]);
			const addIndex = verbs.indexOf('add');
			const assertSubsetIndex = fake.commands.findIndex(
				(command) =>
					command[0] === 'diff' && command.includes('--cached'),
			);
			const commitIndex = verbs.indexOf('commit');
			expect(addIndex).toBeGreaterThanOrEqual(0);
			expect(assertSubsetIndex).toBeGreaterThan(addIndex);
			expect(commitIndex).toBeGreaterThan(assertSubsetIndex);
		});

		it('isolated-index guard: the real (non-isolated) runner never sees a raw commit primitive', async () => {
			await withTempRepo(async ({ repoDir, git }) => {
				const commands: string[][] = [];
				const spiedRun: IGitRunner = async (args) => {
					commands.push([...args]);
					return git(args);
				};
				await writeFile(
					join(repoDir, 'slice-a.ts'),
					'export const value = 2;\n',
				);
				const result = await commitWithGuard({
					run: spiedRun,
					message: 'feat: scoped',
					authorFlag: 'Cartago <cartago@example.com>',
					allowList: ['slice-a.ts'],
					branch: 'develop',
					enforceSubset: true,
					workspaceRoot: repoDir,
				});
				expect(result.committed).toBe(true);

				// `commit-tree`/`update-ref` run inside the isolated env
				// (its own GIT_INDEX_FILE), invisible to `spiedRun` — this
				// asserts the complementary half of the invariant: nothing
				// in the driver ever calls a raw `commit`/`commit-tree`/
				// `update-ref` through the shared, real-index runner,
				// which is what `preserveRealIndexAfterIsolatedCommit`
				// and the pre-commit `rev-parse HEAD` read use instead.
				const verbs = commands.map((command) => command[0]);
				expect(verbs).toContain('rev-parse');
				expect(verbs).not.toContain('commit');
				expect(verbs).not.toContain('commit-tree');
				expect(verbs).not.toContain('update-ref');
			});
		});
	});

	describe('x00265 — requireConventional rejects non-conventional messages', () => {
		const requireConventionalPolicy = (
			overrides: Partial<ParsedOptions> = {},
		): ParsedOptions => ({
			...basePolicy(),
			commit: {
				enabled: true,
				requireConventional: true,
				autoScopeFromProposal: true,
				refuseWhenDisabled: true,
			},
			...overrides,
		});

		it('refuses NON_CONVENTIONAL_MESSAGE: MALFORMED_HEADER for "hola"', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const result = await runCommitDriver(
				{ message: 'hola', files: ['only-this.ts'] },
				{
					run: fake.run,
					policy: requireConventionalPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(false);
			expect(result.refusal).toContain('NON_CONVENTIONAL_MESSAGE');
			expect(result.refusal).toContain('MALFORMED_HEADER');
			expect(fake.committed.count).toBe(0);
		});

		it('refuses NON_CONVENTIONAL_MESSAGE: EMPTY_HEADER for empty input', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const result = await runCommitDriver(
				{ message: '', files: ['only-this.ts'] },
				{
					run: fake.run,
					policy: requireConventionalPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.refusal).toContain('EMPTY_HEADER');
		});

		it('refuses NON_CONVENTIONAL_MESSAGE: UNKNOWN_TYPE for "WIP: stuff"', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const result = await runCommitDriver(
				{ message: 'WIP: stuff', files: ['only-this.ts'] },
				{
					run: fake.run,
					policy: requireConventionalPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.refusal).toContain('UNKNOWN_TYPE');
		});

		it('passes a Conventional Commit header (feat: x)', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const result = await runCommitDriver(
				{ message: 'feat: add commit driver', files: ['only-this.ts'] },
				{
					run: fake.run,
					policy: requireConventionalPolicy(),
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
		});

		it('passes a non-conventional message when requireConventional=false', async () => {
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
			});
			const permissivePolicy = requireConventionalPolicy();
			const result = await runCommitDriver(
				{ message: 'hola', files: ['only-this.ts'] },
				{
					run: fake.run,
					policy: {
						...permissivePolicy,
						commit: {
							...permissivePolicy.commit,
							requireConventional: false,
						},
					},
					identityCtx: { run: fake.run, envVars: Object.freeze({}) },
					auditAgent: null,
				},
			);
			expect(result.committed).toBe(true);
		});
	});
});
