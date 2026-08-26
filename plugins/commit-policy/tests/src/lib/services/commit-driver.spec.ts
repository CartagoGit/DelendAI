/**
 * commit-driver.spec.ts — covers every refusal path and the happy
 * path (including audit trailer injection + slice scoping).
 *
 * Runs against an in-memory fake `IGitRunner` — no real git binary.
 */

import { describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import type { CommitPolicyOptionsSchema } from '@mcp-vertex/commit-policy/lib/contracts/options';
import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import { runCommitDriver } from '@mcp-vertex/commit-policy/lib/services/commit-driver';

type Schema = typeof CommitPolicyOptionsSchema;
type ParsedOptions = ICommitPolicyOptions;

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

interface IFakeGit {
	readonly run: IGitRunner;
	readonly committed: { count: number; messages: string[] };
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
	 */
	cached?: readonly string[];
}): IFakeGit => {
	const committed = { count: 0, messages: [] as string[] };
	const responses = new Map<string, IGitRunResult>();
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
	if (opts.cached !== undefined) {
		responses.set(
			'diff\u0000--cached\u0000--name-only',
			ok(`${opts.cached.join('\n')}\n`),
		);
	}
	const run: IGitRunner = async (
		args: readonly string[],
	): Promise<IGitRunResult> => {
		const key = args.join('\u0000');
		if (args[0] === 'commit') {
			committed.count += 1;
			const mIdx = args.indexOf('-m');
			if (mIdx >= 0 && mIdx + 1 < args.length) {
				committed.messages.push(args[mIdx + 1] ?? '');
			}
			return ok('committed\n');
		}
		if (args[0] === 'push') return ok('pushed\n');
		if (args[0] === 'add') return ok('added\n');
		const direct = responses.get(key);
		if (direct !== undefined) return direct;
		return fail(`not stubbed: ${key}`);
	};
	return { run, committed };
};

const basePolicy = (overrides: Partial<ParsedOptions> = {}): ParsedOptions => ({
	commit: {
		enabled: true,
		requireConventional: true,
		autoScopeFromProposal: true,
		refuseWhenDisabled: true,
	},
	identity: { mode: 'global' },
	audit: { trailer: 'co-authored-by', agentFormat: '${host}/${model}' },
	cadence: { triggers: [], sliceScoping: true },
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master'],
	},
	...overrides,
});

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
		expect(result.refusal).toContain('protected branch "main"');
	});

	it('commits with the resolved global author + audit trailer', async () => {
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
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
				auditAgent: { host: 'vscode-copilot', model: 'minimax-m3' },
			},
		);
		expect(result.committed).toBe(true);
		expect(result.resolvedAuthor?.displayName).toBe('Cartago');
		expect(fake.committed.count).toBe(1);
		const committed = fake.committed.messages[0] ?? '';
		expect(committed).toContain('feat(commit-policy): add driver');
		expect(committed).toContain(
			'Co-authored-by: vscode-copilot/minimax-m3',
		);
	});

	it('auto-scopes the message with the proposal id when slice context is present', async () => {
		const fake = buildFakeGit({
			currentBranch: 'develop',
			globalName: 'Cartago',
			globalEmail: 'cartago@example.com',
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
			const fake = buildFakeGit({
				currentBranch: 'develop',
				globalName: 'Cartago',
				globalEmail: 'cartago@example.com',
				// Pretend the index already has unrelated work
				// staged — simulates a leaked sub-agent.
				cached: [
					'plugins/commit-policy/src/lib/services/commit-driver.ts',
					'some-other-agent.ts',
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
			expect(result.committed).toBe(false);
			expect(result.refusal).toContain('CROSS_AGENT_CONTAMINATION');
			expect(result.refusal).toContain('some-other-agent.ts');
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
		});
	});
});
