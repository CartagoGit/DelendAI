import { describe, expect, it, vi } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import { DEFAULT_BRANCH_POLICY } from './contracts/branch';
import type { ICommitPolicyOptions } from './contracts/options';
import { createCommitPolicyEngine } from './engine';
import type { IProcessedEventsStore } from './processed-events';

const PIPELINE_STEPS = [
	'selector',
	'branch',
	'conventional',
	'idempotency',
	'stage',
	'commit',
	'push',
];

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const buildRunner = (
	currentBranch: string | undefined,
	dirty: readonly string[] = ['only-this.ts'],
	commits?: string[],
): IGitRunner => {
	let head = 'aaaaaaaa';
	let staged = [...dirty];
	let commitCount = 0;
	return (async (args: readonly string[]): Promise<IGitRunResult> => {
		if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
			return currentBranch === undefined
				? fail('not a repo')
				: ok(`${currentBranch}\n`);
		}
		if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
			return ok(`${head}\n`);
		}
		if (
			args[0] === 'rev-parse' &&
			args[1] === '--short' &&
			args[2] === 'HEAD'
		) {
			return ok(`${head.slice(0, 7)}\n`);
		}
		if (args[0] === 'commit' || args[0] === 'commit-tree') {
			commits?.push(args.join(' '));
			commitCount += 1;
			head = `${commitCount}`.padStart(8, '0');
			staged = [];
			return ok(args[0] === 'commit-tree' ? `${head}\n` : 'committed\n');
		}
		if (args[0] === 'update-ref') {
			return ok('updated\n');
		}
		if (args[0] === 'write-tree' || args[0] === 'read-tree') {
			return ok('tree\n');
		}
		if (args[0] === 'add') {
			const marker = args.indexOf('--');
			const additions = (
				marker >= 0 ? args.slice(marker + 1) : args.slice(1)
			).filter((path) => path.length > 0);
			staged = [...new Set([...staged, ...additions])];
			return ok('added\n');
		}
		if (
			args[0] === 'diff' &&
			args[1] === '--cached' &&
			args[2] === '--name-only'
		) {
			return ok(`${staged.join('\n')}${staged.length > 0 ? '\n' : ''}`);
		}
		if (args[0] === 'status') {
			return ok(`${dirty.map((path) => ` M ${path}`).join('\n')}\n`);
		}
		if (args[0] === 'reset' || args[0] === 'rm') {
			staged = [];
			return ok('unstaged\n');
		}
		if (args[0] === 'config') {
			return ok('cartago@example.com\n');
		}
		return fail(`not stubbed: ${args.join(' ')}`);
	}) as IGitRunner;
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
	audit: { trailer: 'co-authored-by', agentFormat: '${host}/${model}' },
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

describe('CommitPolicyEngine trigger surface', () => {
	it('accepts the 4 TriggerEvent kinds and logs the full pipeline in order', async () => {
		const events: readonly {
			readonly label: string;
			readonly event: Parameters<
				ReturnType<typeof createCommitPolicyEngine>['handle']
			>[0];
			readonly commitSnippet: string;
		}[] = [
			{
				label: 'slice',
				event: {
					kind: 'slice',
					proposalId: 'f00266',
					sliceId: 'S1',
					files: ['only-this.ts'],
					eventId: 'slice-1',
				},
				commitSnippet: 'feat(f00266): commit via slice S1',
			},
			{
				label: 'threshold',
				event: {
					kind: 'threshold',
					dirtyCount: 1,
					files: ['only-this.ts'],
					eventId: 'threshold-1',
				},
				commitSnippet: 'chore: update only-this.ts',
			},
			{
				label: 'interval',
				event: {
					kind: 'interval',
					dirtyCount: 1,
					files: ['only-this.ts'],
					eventId: 'interval-1',
				},
				commitSnippet: 'chore: update only-this.ts',
			},
			{
				label: 'manual',
				event: {
					kind: 'manual',
					message: 'chore: manual commit-policy snapshot',
					eventId: 'manual-1',
				},
				commitSnippet: 'chore: manual commit-policy snapshot',
			},
		];

		for (const { event, commitSnippet, label } of events) {
			const commits: string[] = [];
			const runner = buildRunner('feature/x', ['only-this.ts'], commits);
			const engine = createCommitPolicyEngine({
				driver: {
					run: runner,
					policy: basePolicy(),
					identityCtx: { run: runner, envVars: Object.freeze({}) },
					auditAgent: null,
					workspaceRoot: '/tmp/workspace',
					pluginCacheDir: '.cache/mcp-vertex/commit-policy',
				},
				branchPolicy: DEFAULT_BRANCH_POLICY,
			});
			const infoSpy = vi
				.spyOn(console, 'info')
				.mockImplementation(() => {});

			const result = await engine.handle(event);

			expect(result.ack, label).toBe('OK');
			expect(commits[0], label).toContain(commitSnippet);
			const parsedLogs = infoSpy.mock.calls.map(
				([line]) =>
					JSON.parse(String(line)) as {
						readonly event: string;
						readonly step: string;
						readonly outcome: string;
					},
			);
			expect(parsedLogs.map((entry) => entry.event)).toEqual(
				Array.from(
					{ length: PIPELINE_STEPS.length },
					() => 'pipeline.step',
				),
			);
			expect(parsedLogs.map((entry) => entry.step)).toEqual(
				PIPELINE_STEPS,
			);
			expect(parsedLogs.at(-1)?.outcome).toBe('SKIP');

			infoSpy.mockRestore();
			await engine.dispose();
		}
	});

	it('maps refusal paths to typed engine codes', async () => {
		const emptyHeaderEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x'),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x'),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		await expect(
			emptyHeaderEngine.handle({
				kind: 'manual',
				message: '',
				eventId: 'manual-empty-header',
			}),
		).resolves.toMatchObject({ ack: 'ERR', code: 'EMPTY_HEADER' });
		await emptyHeaderEngine.dispose();

		const malformedHeaderEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x'),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x'),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		await expect(
			malformedHeaderEngine.handle({
				kind: 'manual',
				message: 'feat(scope) missing colon',
				eventId: 'manual-malformed-header',
			}),
		).resolves.toMatchObject({ ack: 'ERR', code: 'MALFORMED_HEADER' });
		await malformedHeaderEngine.dispose();

		const unknownTypeEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x'),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x'),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		await expect(
			unknownTypeEngine.handle({
				kind: 'manual',
				message: 'banana: nope',
				eventId: 'manual-unknown-type',
			}),
		).resolves.toMatchObject({ ack: 'ERR', code: 'UNKNOWN_TYPE' });
		await unknownTypeEngine.dispose();

		const sliceNoFilesEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x'),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x'),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		await expect(
			sliceNoFilesEngine.handle({
				kind: 'slice',
				proposalId: 'f00266',
				sliceId: 'S1',
				files: [],
				eventId: 'slice-no-files',
			}),
		).resolves.toMatchObject({ ack: 'ERR', code: 'SLICE_HAS_NO_FILES' });
		await sliceNoFilesEngine.dispose();

		const triggerNoFilesEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x'),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x'),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		await expect(
			triggerNoFilesEngine.handle({
				kind: 'threshold',
				dirtyCount: 0,
				files: [],
				eventId: 'threshold-no-files',
			}),
		).resolves.toMatchObject({ ack: 'ERR', code: 'TRIGGER_HAS_NO_FILES' });
		await triggerNoFilesEngine.dispose();

		const contaminationEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x', ['only-this.ts', 'extra.ts']),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x', ['only-this.ts', 'extra.ts']),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
				workspaceRoot: '/tmp/workspace',
				pluginCacheDir: '.cache/mcp-vertex/commit-policy',
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
		});
		await expect(
			contaminationEngine.handle({
				kind: 'threshold',
				dirtyCount: 1,
				files: ['only-this.ts'],
				eventId: 'threshold-contamination',
			}),
		).resolves.toMatchObject({
			ack: 'ERR',
			code: 'CROSS_AGENT_CONTAMINATION',
		});
		await contaminationEngine.dispose();

		const pushFailureEngine = createCommitPolicyEngine({
			driver: {
				run: buildRunner('feature/x'),
				policy: basePolicy(),
				identityCtx: {
					run: buildRunner('feature/x'),
					envVars: Object.freeze({}),
				},
				auditAgent: null,
				workspaceRoot: '/tmp/workspace',
				pluginCacheDir: '.cache/mcp-vertex/commit-policy',
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			onCommitSucceeded: async () => ({
				ok: false,
				refusal: 'push refused',
				code: 'PUSH_FAILED',
			}),
		});
		await expect(
			pushFailureEngine.handle({
				kind: 'manual',
				message: 'chore: manual commit-policy snapshot',
				files: ['only-this.ts'],
				eventId: 'manual-push-failed',
			}),
		).resolves.toMatchObject({ ack: 'ERR', code: 'PUSH_FAILED' });
		await pushFailureEngine.dispose();
	});

	it('logs downstream steps as SKIP after an early refusal', async () => {
		const runner = buildRunner('develop');
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: {
				protected: ['develop'],
				protectedPrefixes: [],
			},
		});
		const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

		const result = await engine.handle({
			kind: 'manual',
			message: 'feat: protected branch',
			files: ['only-this.ts'],
			eventId: 'protected-1',
		});

		expect(result).toMatchObject({
			ack: 'ERR',
			code: 'BRANCH_PROTECTED',
		});
		const parsedLogs = infoSpy.mock.calls.map(
			([line]) =>
				JSON.parse(String(line)) as {
					readonly step: string;
					readonly outcome: string;
				},
		);
		expect(parsedLogs).toHaveLength(PIPELINE_STEPS.length);
		expect(parsedLogs[0]).toMatchObject({
			step: 'selector',
			outcome: 'OK',
		});
		expect(parsedLogs[1]).toMatchObject({ step: 'branch', outcome: 'ERR' });
		expect(
			parsedLogs.slice(2).every((entry) => entry.outcome === 'SKIP'),
		).toBe(true);

		infoSpy.mockRestore();
		await engine.dispose();
	});

	it('dispose stops registered resources and releases the processed-events store', async () => {
		const runner = buildRunner('feature/x');
		const processedEvents: IProcessedEventsStore = {
			has: vi.fn(async () => false),
			add: vi.fn(async () => undefined),
			recordTerminal: vi.fn(async () => undefined),
			prune: vi.fn(async () => 0),
			dispose: vi.fn(async () => undefined),
		};
		const engine = createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: basePolicy(),
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
			branchPolicy: DEFAULT_BRANCH_POLICY,
			processedEvents,
		});

		await engine.dispose();

		expect(processedEvents.dispose).toHaveBeenCalledOnce();
	});
});
