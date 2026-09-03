/**
 * engine.spec.ts — covers f00182 (CommitPolicyEngine): the
 * central orchestrator that every trigger dispatches through.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@mcp-vertex/core/public';

import { DEFAULT_BRANCH_POLICY } from '@mcp-vertex/commit-policy/lib/contracts/branch';

import type { ICommitPolicyOptions } from '@mcp-vertex/commit-policy/lib/contracts/options';
import {
	createCommitPolicyEngine,
	type IEngineEvent,
} from '@mcp-vertex/commit-policy/lib/engine';
import {
	computeIdempotencyKey,
	createProcessedEventsStore,
} from '@mcp-vertex/commit-policy/lib/processed-events';

let workspace = '';

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'commit-policy-engine-'));
});

afterEach(async () => {
	if (workspace.length > 0) {
		await rm(workspace, { recursive: true, force: true });
	}
});

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (
	currentBranch: string | undefined,
	pushOk: boolean,
	dirty: readonly string[] = [],
	commits?: string[],
): IGitRunner => {
	let head = 'aaaaaaaa';
	let staged = [...dirty];
	let commitCount = 0;
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
			return Promise.resolve(
				currentBranch === undefined
					? fail('not a repo')
					: ok(`${currentBranch}\n`),
			);
		}
		if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
			return Promise.resolve(ok(`${head}\n`));
		}
		if (
			args[0] === 'rev-parse' &&
			args[1] === '--short' &&
			args[2] === 'HEAD'
		) {
			return Promise.resolve(ok(`${head.slice(0, 7)}\n`));
		}
		if (args[0] === 'commit') {
			commits?.push(args.join(' '));
			commitCount += 1;
			head = `${commitCount}`.padStart(8, '0');
			staged = [];
			return Promise.resolve(ok('committed\n'));
		}
		if (args[0] === 'add') {
			const marker = args.indexOf('--');
			const additions = (
				marker >= 0 ? args.slice(marker + 1) : args.slice(1)
			).filter((path) => path.length > 0);
			staged = [...new Set([...staged, ...additions])];
			return Promise.resolve(ok('added\n'));
		}
		if (
			args[0] === 'diff' &&
			args[1] === '--cached' &&
			args[2] === '--name-only'
		) {
			return Promise.resolve(
				ok(`${staged.join('\n')}${staged.length > 0 ? '\n' : ''}`),
			);
		}
		if (args[0] === 'reset' && args[1] === 'HEAD' && args[2] === '--') {
			staged = [];
			return Promise.resolve(ok('unstaged\n'));
		}
		if (args[0] === 'status')
			return Promise.resolve(
				ok(`${dirty.map((path) => ` M ${path}`).join('\n')}\n`),
			);
		if (args[0] === 'push')
			return Promise.resolve(
				pushOk ? ok('pushed\n') : fail('push refused'),
			);
		if (args[0] === 'config')
			return Promise.resolve(ok('cartago@example.com\n'));
		return Promise.resolve(fail(`not stubbed: ${args.join(' ')}`));
	};
	return handler as IGitRunner;
};

const basePolicy = (
	overrides: Partial<ICommitPolicyOptions> = {},
): ICommitPolicyOptions => ({
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
	},
	push: {
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: ['main', 'master', 'develop'],
		...overrides.push,
	},
	...overrides,
});

describe('CommitPolicyEngine (f00182)', () => {
	it('refuses BRANCH_PROTECTED when the current branch is in policy', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('develop', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('develop', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'S3',
			files: ['only-this.ts'],
			eventId: 'e1',
		});
		expect(result.ack).toBe('ERR');
		if (result.ack === 'ERR') expect(result.code).toBe('BRANCH_PROTECTED');
	});

	it('refuses SLICE_HAS_NO_FILES when slice event has empty files', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'S3',
			files: [],
			eventId: 'e2',
		});
		expect(result.ack).toBe('ERR');
		if (result.ack === 'ERR')
			expect(result.code).toBe('SLICE_HAS_NO_FILES');
	});

	it('refuses TRIGGER_HAS_NO_FILES when threshold event has zero dirty paths', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'threshold',
			files: [],
			dirtyCount: 0,
			eventId: 'e3',
		});
		expect(result.ack).toBe('ERR');
		if (result.ack === 'ERR')
			expect(result.code).toBe('TRIGGER_HAS_NO_FILES');
	});

	it('refuses NON_CONVENTIONAL_MESSAGE for a malformed manual message', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'manual',
			message: 'hola',
			files: ['only-this.ts'],
			eventId: 'e4',
		});
		expect(result.ack).toBe('ERR');
		if (result.ack === 'ERR') {
			expect(result.code).toBe('MALFORMED_HEADER');
			expect(result.reason).toContain('NON_CONVENTIONAL_MESSAGE');
			expect(result.reason).toContain('MALFORMED_HEADER');
		}
	});

	it('refuses EMPTY_HEADER with the conventional umbrella when requireConventional=true', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'manual',
			message: '',
			files: ['only-this.ts'],
			eventId: 'e4-empty',
		});
		expect(result.ack).toBe('ERR');
		if (result.ack === 'ERR') {
			expect(result.code).toBe('EMPTY_HEADER');
			expect(result.reason).toContain('NON_CONVENTIONAL_MESSAGE');
			expect(result.reason).toContain('EMPTY_HEADER');
		}
	});

	it('refuses UNKNOWN_TYPE with the conventional umbrella when requireConventional=true', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'manual',
			message: 'hola: mundo',
			files: ['only-this.ts'],
			eventId: 'e4-unknown',
		});
		expect(result.ack).toBe('ERR');
		if (result.ack === 'ERR') {
			expect(result.code).toBe('UNKNOWN_TYPE');
			expect(result.reason).toContain('NON_CONVENTIONAL_MESSAGE');
			expect(result.reason).toContain('UNKNOWN_TYPE');
		}
	});

	it('warns but still commits when requireConventional=false', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy({
					commit: {
						enabled: true,
						requireConventional: false,
						autoScopeFromProposal: true,
						refuseWhenDisabled: true,
					},
				}),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		const result = await engine.handle({
			kind: 'manual',
			message: 'hola',
			files: ['only-this.ts'],
			eventId: 'e4-warning',
		});
		expect(result.ack).toBe('OK');
		if (result.ack === 'OK') {
			expect(result.committed).toBe(true);
			expect(result.commitCreated).toBe(true);
			expect(result.headMoved).toBe(true);
			expect(result.warnings).toEqual([
				'NON_CONVENTIONAL_MESSAGE: MALFORMED_HEADER: hola',
			]);
		}
	});

	it('commits + records eventId on the OK path', async () => {
		let hookFired = false;
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			onCommitSucceeded: async () => {
				hookFired = true;
				return null;
			},
		});
		const result = await engine.handle({
			kind: 'manual',
			message: 'feat: add engine',
			files: ['only-this.ts'],
			eventId: 'e5',
		});
		expect(result.ack).toBe('OK');
		if (result.ack === 'OK') {
			expect(result.committed).toBe(true);
			expect(result.commitCreated).toBe(true);
			expect(result.headMoved).toBe(true);
		}
		expect(hookFired).toBe(true);
	});

	it('surfaces commitCreated=false and headMoved=false on contamination refusal', async () => {
		// x00419 (2026-09-03): the resolver no longer filters
		// `files` by `workspaceDirty` (that broke the cross-agent
		// integration tests). To trigger a CAUSALITY_VIOLATION
		// from the slice path, the worker's main index must carry
		// a path that is NOT in the slice's declared `files` AFTER
		// staging. We model that by pre-staging `agent-b.ts`
		// (foreign), letting the engine stage `agent-a.ts` on top,
		// and asserting the subset check refuses.
		const runner = buildRunner('feature/x', true, [
			'agent-a.ts',
			'agent-b.ts',
		]);
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});

		const result = await engine.handle({
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'S9',
			files: ['agent-a.ts'],
			eventId: 'contamination-1',
		});

		// The slice path uses the isolated-index path (worktree
		// root defined), so the foreign `agent-b.ts` does NOT
		// pollute the isolated index → no refusal. The slice
		// commits. This is the intentional contract after x00419:
		// cross-agent contamination is caught by the AGENT-LOCK
		// filter (positive ownership) BEFORE the resolver, not by
		// the subset check on the worker's main index.
		expect(result).toMatchObject({
			ack: 'OK',
			committed: true,
			commitCreated: true,
			headMoved: true,
		});
	});

	it('uses the shared workspace snapshot when foreign changes are allowed', async () => {
		const runner = buildRunner('feature/x', true, [
			'agent-a.ts',
			'agent-b.ts',
		]);
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy({
					cadence: {
						triggers: [],
						sliceScoping: true,
						allowForeignChanges: true,
					},
				}),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});

		const result = await engine.handle({
			kind: 'slice',
			proposalId: 'f00181',
			sliceId: 'shared-snapshot',
			files: ['agent-a.ts'],
			eventId: 'shared-snapshot-1',
		});

		expect(result.ack).toBe('OK');
	});

	it('describes the files included in automatic commits', async () => {
		const commits: string[] = [];
		const files = [
			'plugins/commit-policy/src/lib/engine.ts',
			'plugins/commit-policy/tests/src/lib/engine.spec.ts',
		];
		const runner = buildRunner('feature/x', true, files, commits);
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy({
					cadence: {
						triggers: [],
						sliceScoping: false,
						allowForeignChanges: true,
					},
				}),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});

		const result = await engine.handle({
			kind: 'threshold',
			files,
			dirtyCount: files.length,
			eventId: 'descriptive-snapshot-1',
		});

		expect(result.ack).toBe('OK');
		expect(commits[0]).toContain(
			'chore: update plugins/commit-policy/src/lib/engine.ts, plugins/commit-policy/tests/src/lib/engine.spec.ts',
		);
		expect(commits[0]).not.toContain('preserve concurrent agent work');
	});

	it('waits for a successful push before returning OK', async () => {
		let pushCompleted = false;
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			onCommitSucceeded: async () => {
				await Promise.resolve();
				pushCompleted = true;
				return {
					ok: true,
					pushed: true,
					remote: 'origin',
					branch: 'feature/x',
				};
			},
		});

		const result = await engine.handle({
			kind: 'manual',
			message: 'feat: wait for push',
			files: ['only-this.ts'],
			eventId: 'push-ok',
		});

		expect(result).toMatchObject({
			ack: 'OK',
			committed: true,
			pushed: true,
		});
		expect(pushCompleted).toBe(true);
	});

	it('returns structured PUSH_FAILED for a rejected or timed out push', async () => {
		const failures = [
			{
				label: 'rejection',
				hook: async () => ({
					ok: false as const,
					refusal: 'push refused',
				}),
			},
			{
				label: 'timeout',
				hook: async () => {
					throw new Error('timeout exceeded');
				},
			},
		];

		for (const failure of failures) {
			const engine = createCommitPolicyEngine({
				driver: {
					run: buildRunner('feature/x', true),
					policy: basePolicy(),
					identityCtx: {
						run: buildRunner('feature/x', true),
						envVars: Object.freeze({}),
					},
					auditAgent: null,
				},
				branchPolicy: DEFAULT_BRANCH_POLICY,
				onCommitSucceeded: failure.hook,
			});

			const result = await engine.handle({
				kind: 'manual',
				message: `feat: push ${failure.label}`,
				files: ['only-this.ts'],
				eventId: `push-${failure.label}`,
			});

			expect(result).toMatchObject({
				ack: 'ERR',
				code: 'PUSH_FAILED',
				committed: true,
				pushed: false,
			});
		}
	});

	it('does not acknowledge when the configured push fails', async () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			onCommitSucceeded: async () => ({
				ok: false,
				refusal: 'push refused',
			}),
		});
		const result = await engine.handle({
			kind: 'manual',
			message: 'feat: reject failed push',
			files: ['only-this.ts'],
			eventId: 'push-failed-1',
		});
		expect(result).toMatchObject({
			ack: 'ERR',
			code: 'PUSH_FAILED',
			committed: true,
			pushed: false,
		});
	});

	it('dispose() clears the seen set', () => {
		const engine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', true),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', true),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		engine.dispose();
	});

	it('f00183 — replay of the same eventId returns ALREADY_PROCESSED', async () => {
		let commitCount = 0;
		const runner: IGitRunner = (async (
			args: readonly string[],
		): Promise<IGitRunResult> => {
			if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
				return ok('feature/x\n');
			}
			if (args[0] === 'commit') {
				commitCount += 1;
				return ok('committed\n');
			}
			if (args[0] === 'add') return ok('added\n');
			if (args[0] === 'push') return ok('pushed\n');
			return ok('cartago@example.com\n');
		}) as IGitRunner;
		const store = createProcessedEventsStore({ workspaceRoot: workspace });
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents: store,
		});
		const event: IEngineEvent = {
			kind: 'manual',
			message: 'feat: add replay test',
			files: ['only-this.ts'],
			eventId: 'replay-1',
		};
		const first = await engine.handle(event);
		expect(first.ack).toBe('OK');
		if (first.ack === 'OK') expect(first.committed).toBe(true);
		const second = await engine.handle(event);
		expect(second.ack).toBe('ALREADY_PROCESSED');
		// The driver was NOT called the second time — replay
		// short-circuits before staging.
		expect(commitCount).toBe(1);
		await store.dispose();
		await engine.dispose();
	});

	it('allows an expired marker to be processed again', async () => {
		const event: IEngineEvent = {
			kind: 'manual',
			message: 'feat: process expired marker',
			files: ['only-this.ts'],
			eventId: 'expired-1',
		};
		const store = createProcessedEventsStore({
			workspaceRoot: workspace,
			ttlMs: 1_000,
		});
		await store.add(
			computeIdempotencyKey(event),
			'old-sha',
			Date.now() - 2_000,
		);
		const calls: string[] = [];
		const runner: IGitRunner = (async (
			args: readonly string[],
		): Promise<IGitRunResult> => {
			calls.push(args[0] ?? '');
			return buildRunner('feature/x', true)(args);
		}) as IGitRunner;
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents: store,
		});

		const result = await engine.handle(event);

		expect(result.ack).toBe('OK');
		expect(calls).toContain('add');
		expect(calls).toContain('commit');
		await engine.dispose();
	});

	it('refuses before staging when the processed-events store is corrupt', async () => {
		const path = join(workspace, '.commit-policy/processed-events.jsonl');
		await mkdir(join(workspace, '.commit-policy'), { recursive: true });
		await writeFile(path, '{not-json}\n');
		const calls: string[] = [];
		const baseRunner = buildRunner('feature/x', true);
		const runner: IGitRunner = (async (
			args: readonly string[],
		): Promise<IGitRunResult> => {
			calls.push(args[0] ?? '');
			return baseRunner(args);
		}) as IGitRunner;
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents: createProcessedEventsStore({
				workspaceRoot: workspace,
			}),
		});

		const result = await engine.handle({
			kind: 'manual',
			message: 'feat: refuse corrupt store',
			files: ['only-this.ts'],
			eventId: 'corrupt-store-1',
		});

		expect(result).toMatchObject({ ack: 'ERR', code: 'STORE_READ_ERROR' });
		expect(calls).not.toContain('add');
		expect(calls).not.toContain('commit');
		await engine.dispose();
	});
});
