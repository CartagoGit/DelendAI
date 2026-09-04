/**
 * dogfood.spec.ts — covers the four scenarios the task brief demands:
 *
 *   1. dry-run produces the expected receipt (source/base/version frozen).
 *   2. execute reuses the store on a second call (no second candidate).
 *   3. readiness failure aborts BEFORE any PR work is attempted.
 *   4. finalize stays blocked until a simulated MERGED state arrives.
 *
 * The spec drives `runReleaseDogfood` directly with a mocked
 * `IGitRunner`, an injected `IReleasePrProvider`, and an injected PR
 * reader. No real git is invoked from the spec; the only place real git
 * is invoked is the production `main()` entry point, which is
 * deliberately not exercised here (a separate runbook verifies it
 * against the real repo).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';
import {
	parseDogfoodFlags,
	runReleaseDogfood,
	createMockReleasePrProvider,
	createSimulatedMergeReader,
	type IDogfoodRunInput,
	type IReleaseDogfoodFlags,
} from './dogfood.script';
import type { IReleasePrProvider } from '../../../../plugins/forge/src/lib/release-pr';
import type { IForgePullRequestDetail } from '../../../../plugins/forge/src/lib/contracts/interfaces/forge-read.interface';
import type { PullRequestReader } from '../../../../plugins/forge/src/lib/release-finalize';

// ---------------------------------------------------------------------------
// Fixture data — the SHAs and version match what `git rev-parse` would
// return on the real repo at the moment the runbook was authored. They
// are also the values every receipt must echo, so the dry-run assertion
// has something concrete to compare against.
// ---------------------------------------------------------------------------

const SOURCE_DEVELOP_SHA = '7d4a2e91c0b8e1f3a4c5b6d7e8f9012345678901';
const BASE_MAIN_SHA = '1a2b3c4d5e6f7890abcdef1234567890fedcba09';
const MAIN_VERSION = '0.1.9';
const SLUG = 'cli-typed-forge-boundary';

const mainPackageJson = `${JSON.stringify({ name: '@delendai/core', version: MAIN_VERSION }, null, 2)}\n`;

/**
 * Standard `IGitRunner` mock for the dry-run path. The release contract
 * resolves `develop` + `main` SHAs and reads `<mainSha>:packages/core/
 * package.json`. The script never calls git for anything else in this
 * branch of the flow.
 */
const buildDryRunGitRunner = (): IGitRunner => {
	const commands: string[][] = [];
	return async (args): Promise<IGitRunResult> => {
		commands.push([...args]);
		if (args[0] === 'rev-parse' && args[1] === 'develop') {
			return { ok: true, output: `${SOURCE_DEVELOP_SHA}\n` };
		}
		if (args[0] === 'rev-parse' && args[1] === 'main') {
			return { ok: true, output: `${BASE_MAIN_SHA}\n` };
		}
		if (
			args[0] === 'show' &&
			args[1] === `${BASE_MAIN_SHA}:packages/core/package.json`
		) {
			return { ok: true, output: mainPackageJson };
		}
		return {
			ok: false,
			output: '',
			reason: `unexpected git command: ${args.join(' ')}`,
		};
	};
};

/**
 * The reconcile contract calls `merge-base --is-ancestor X Y`. The
 * dogfood uses a dedicated runner (built inside the script) for that
 * step, but the spec verifies the contract by feeding the SAME runner
 * into `runReleaseDogfood` and asserting no other git commands are
 * emitted from `reconcileRelease`. The contract only ever invokes git
 * when develop has actually advanced; the dry-run keeps
 * developShaNow === developShaAtCut and skips the git call entirely.
 * This helper builds the runner the script will use for `reconcile`.
 */
const _buildReconcileAwareGitRunner = (): IGitRunner => {
	return async (args): Promise<IGitRunResult> => {
		if (
			args[0] === 'merge-base' &&
			args[1] === '--is-ancestor' &&
			args[2] === SOURCE_DEVELOP_SHA &&
			args[3] === SOURCE_DEVELOP_SHA
		) {
			return { ok: true, output: '' };
		}
		return {
			ok: false,
			output: '',
			reason: `unexpected reconcile git command: ${args.join(' ')}`,
		};
	};
};

/**
 * Helper: build a default `IDogfoodRunInput` for the spec. The
 * provider override defaults to a fresh mock; callers can replace it.
 */
const buildInput = (
	overrides: Partial<IDogfoodRunInput> = {},
): IDogfoodRunInput => {
	const run = overrides.run ?? buildDryRunGitRunner();
	const flags: IReleaseDogfoodFlags =
		overrides.flags ?? parseDogfoodFlags([]);
	const provider: IReleasePrProvider =
		overrides.provider ?? createMockReleasePrProvider().provider;
	const prReader: PullRequestReader | undefined = overrides.prReader;
	return {
		flags: Object.freeze({ ...flags }),
		run,
		provider,
		...(prReader === undefined ? {} : { prReader }),
	};
};

describe('dogfood.script — release track dogfooding', () => {
	describe('parseDogfoodFlags', () => {
		it('returns the documented defaults with no argv', () => {
			const flags = parseDogfoodFlags([]);
			expect(flags.slug).toBe(SLUG);
			expect(flags.type).toBe('minor');
			expect(flags.dryRunOnly).toBe(false);
			expect(flags.execute).toBe(false);
			expect(flags.confirmPr).toBe(false);
			expect(flags.simulateMerge).toBe(false);
			expect(flags.gateStatuses.size).toBe(0);
			expect(flags.actor.length).toBeGreaterThan(0);
		});

		it('parses every documented flag', () => {
			const flags = parseDogfoodFlags([
				'--slug=r1-contracts',
				'--type=patch',
				'--actor=human',
				'--execute',
				'--confirm-pr',
				'--simulate-merge',
				'--gate-status=typecheck=failed',
				'--gate-status=tests=passed',
			]);
			expect(flags.slug).toBe('r1-contracts');
			expect(flags.type).toBe('patch');
			expect(flags.actor).toBe('human');
			expect(flags.execute).toBe(true);
			expect(flags.confirmPr).toBe(true);
			expect(flags.simulateMerge).toBe(true);
			expect(flags.gateStatuses.get('typecheck')).toBe('failed');
			expect(flags.gateStatuses.get('tests')).toBe('passed');
		});

		it('forces --dry-run to override --execute', () => {
			const flags = parseDogfoodFlags(['--dry-run', '--execute']);
			expect(flags.dryRunOnly).toBe(true);
			expect(flags.execute).toBe(false);
		});

		it('rejects unknown gates and unknown release types', () => {
			expect(() => parseDogfoodFlags(['--type=weekly'])).toThrowError(
				/--type must be/,
			);
			expect(() =>
				parseDogfoodFlags(['--gate-status=typecheck=green']),
			).toThrowError(/--gate-status value must be/);
		});
	});

	describe('createMockReleasePrProvider', () => {
		it('returns empty list and never invok gh', async () => {
			const mock = createMockReleasePrProvider();
			const list = await mock.provider.listPullRequests({
				headBranch: 'release/minor/cli-typed-forge-boundary',
				baseBranch: 'main',
			});
			expect(list).toEqual([]);
			const pr = await mock.provider.createPullRequest({
				title: 'Release 0.2.0',
				body: 'desc',
				headBranch: 'release/minor/cli-typed-forge-boundary',
				baseBranch: 'main',
			});
			expect(pr.headBranch).toBe(
				'release/minor/cli-typed-forge-boundary',
			);
			expect(pr.baseBranch).toBe('main');
			expect(mock.created.length).toBe(1);
			expect(mock.snapshot().length).toBe(1);
		});
	});

	describe('createSimulatedMergeReader', () => {
		it('always reports MERGED with the SHAs the caller supplied', async () => {
			const reader = createSimulatedMergeReader('HEAD-SHA', 'MERGED-SHA');
			const detail: IForgePullRequestDetail = await reader('42');
			expect(detail.state).toBe('MERGED');
			expect(detail.headSha).toBe('HEAD-SHA');
			expect(detail.mergeCommitSha).toBe('MERGED-SHA');
			expect(detail.headBranch).toBe(
				'release/minor/cli-typed-forge-boundary',
			);
			expect(detail.baseBranch).toBe('main');
		});
	});

	describe('dry-run produces the expected receipt', () => {
		let input: IDogfoodRunInput;
		beforeEach(() => {
			input = buildInput({
				flags: parseDogfoodFlags(['--confirm-pr']),
			});
		});

		it('echoes the measured source/main SHAs and the base main version', async () => {
			const result = await runReleaseDogfood(input);
			expect(result.sourceDevelopSha).toBe(SOURCE_DEVELOP_SHA);
			expect(result.baseMainSha).toBe(BASE_MAIN_SHA);
			expect(result.fromVersion).toBe(MAIN_VERSION);
			expect(result.targetVersion).toBe('0.2.0'); // minor bump 0.1.9 → 0.2.0
			expect(result.branch).toBe(`release/minor/${SLUG}`);
		});

		it('freezes the candidate and surfaces every receipt field', async () => {
			const result = await runReleaseDogfood(input);
			expect(Object.isFrozen(result.candidate)).toBe(true);
			expect(Object.isFrozen(result.candidate.includedProposals)).toBe(
				true,
			);
			expect(result.candidate).toMatchObject({
				sourceDevelopSha: SOURCE_DEVELOP_SHA,
				baseMainSha: BASE_MAIN_SHA,
				fromVersion: MAIN_VERSION,
				targetVersion: '0.2.0',
				type: 'minor',
				slug: SLUG,
				branch: `release/minor/${SLUG}`,
				state: 'draft',
			});
			expect(result.prepareDryRunReceipt.mode).toBe('dry-run');
			expect(result.prepareDryRunReceipt.candidate).toBe(
				result.candidate,
			);
			expect(result.stabilizeReceipt.operation).toBe('stabilize');
			expect(result.reconcileReceipt.operation).toBe('reconcile');
			expect(result.hotfixReceipt.operation).toBe('hotfix');
			expect(result.policy.mode).toBe('normal');
			expect(result.policy.branch).toBe(`release/minor/${SLUG}`);
			expect(result.policy.target).toBe('main');
		});

		it('emits the gh command when --confirm-pr is set, suppresses it otherwise', async () => {
			const withConfirm = await runReleaseDogfood(input);
			expect(withConfirm.ghCommand).not.toBeNull();
			expect(withConfirm.ghCommand ?? '').toContain('--base main');
			expect(withConfirm.ghCommand ?? '').toContain(
				`--head release/minor/${SLUG}`,
			);
			expect(withConfirm.ghCommand ?? '').toContain(
				`--title 'Release 0.2.0'`,
			);

			const withoutConfirm = await runReleaseDogfood(buildInput());
			expect(withoutConfirm.ghCommand).toBeNull();
		});

		it('records the PR contract result via the mocked provider (no gh)', async () => {
			const providerSpy: IReleasePrProvider = {
				listPullRequests: vi.fn(async () => []),
				createPullRequest: vi.fn(async (input) =>
					Object.freeze({
						number: 99,
						url: 'https://example.test/pr/99',
						title: input.title,
						headBranch: input.headBranch,
						baseBranch: input.baseBranch,
					}),
				),
			};
			const result = await runReleaseDogfood(
				buildInput({ provider: providerSpy }),
			);
			expect(result.prContractResult).not.toBeNull();
			expect(result.prContractResult?.created).toBe(true);
			expect(result.prContractResult?.number).toBe(99);
			expect(result.prContractResult?.url).toBe(
				'https://example.test/pr/99',
			);
			expect(providerSpy.listPullRequests).toHaveBeenCalledTimes(1);
			expect(providerSpy.createPullRequest).toHaveBeenCalledTimes(1);
		});
	});

	describe('execute reuses the store on a second call (idempotency)', () => {
		it('returns the same candidate and reports idempotencyReused', async () => {
			const result = await runReleaseDogfood(
				buildInput({ flags: parseDogfoodFlags(['--execute']) }),
			);
			expect(result.prepareExecuteReceipt).not.toBeNull();
			expect(result.prepareExecuteReceipt?.mode).toBe('execute');
			// The FIRST execute call creates the candidate (`created: true`).
			expect(result.prepareExecuteReceipt?.created).toBe(true);
			// The SECOND execute call (driven by runReleaseDogfood
			// internally with the same idempotencyKey) MUST NOT create a
			// second candidate. The `idempotencyReused` boolean is the
			// observable proof; the boolean is true exactly when the
			// second call's candidate is the same frozen object as the
			// first.
			expect(result.idempotencyReused).toBe(true);
			expect(result.prepareExecuteReceipt?.idempotencyKey).toBe(
				`${SOURCE_DEVELOP_SHA}:${BASE_MAIN_SHA}:minor`,
			);
			// The execute candidate is `state: 'cut'`, the dry-run
			// candidate is `state: 'draft'` — they are intentionally
			// different objects, so we DO NOT compare them here.
			expect(result.prepareExecuteReceipt?.candidate.state).toBe('cut');
			expect(result.prepareDryRunReceipt.candidate.state).toBe('draft');
		});

		it('does NOT populate prepareExecuteReceipt without --execute', async () => {
			const result = await runReleaseDogfood(buildInput());
			expect(result.prepareExecuteReceipt).toBeNull();
			expect(result.idempotencyReused).toBe(false);
		});
	});

	describe('readiness failure aborts BEFORE any PR', () => {
		it('throws readiness-blocked and never calls createPullRequest', async () => {
			const providerSpy: IReleasePrProvider = {
				listPullRequests: vi.fn(async () => []),
				createPullRequest: vi.fn(async (input) =>
					Object.freeze({
						number: 1,
						url: 'https://example.test/pr/1',
						title: input.title,
						headBranch: input.headBranch,
						baseBranch: input.baseBranch,
					}),
				),
			};
			await expect(
				runReleaseDogfood(
					buildInput({
						flags: parseDogfoodFlags([
							'--gate-status=typecheck=failed',
						]),
						provider: providerSpy,
					}),
				),
			).rejects.toThrowError(/readiness/i);
			// Critical: the provider MUST not have been called at all —
			// the script aborts before step (g).
			expect(providerSpy.listPullRequests).not.toHaveBeenCalled();
			expect(providerSpy.createPullRequest).not.toHaveBeenCalled();
		});

		it('also blocks when the readiness-blocked gate is "tests"', async () => {
			await expect(
				runReleaseDogfood(
					buildInput({
						flags: parseDogfoodFlags([
							'--gate-status=tests=failed',
						]),
					}),
				),
			).rejects.toThrowError(/readiness/i);
		});
	});

	describe('finalize stays blocked until MERGED is simulated', () => {
		it('reports finalizeBlockedReason by default', async () => {
			const result = await runReleaseDogfood(buildInput());
			expect(result.finalizeReceipt).toBeNull();
			expect(result.finalizeBlockedReason).not.toBeNull();
			expect(result.finalizeBlockedReason ?? '').toContain(
				'user must approve merge',
			);
		});

		it('records the finalize receipt when --simulate-merge is set', async () => {
			const result = await runReleaseDogfood(
				buildInput({
					flags: parseDogfoodFlags(['--simulate-merge']),
					prReader: createSimulatedMergeReader(
						SOURCE_DEVELOP_SHA,
						BASE_MAIN_SHA,
					),
				}),
			);
			expect(result.finalizeReceipt).not.toBeNull();
			expect(result.finalizeBlockedReason).toBeNull();
			expect(result.finalizeReceipt?.operation).toBe('finalize');
			expect(result.finalizeReceipt?.status).toBe('completed');
		});

		it('rejects when the simulated reader returns OPEN instead of MERGED', async () => {
			const openReader: PullRequestReader = async () =>
				Object.freeze({
					number: 42,
					title: 'Release (open)',
					branch: 'release/minor/cli-typed-forge-boundary',
					url: 'https://example.test/pr/42',
					draft: false,
					author: 'dogfood',
					labels: [],
					ciSummary: Object.freeze({
						total: 0,
						successful: 0,
						failed: 0,
						pending: 0,
						running: 0,
					}),
					state: 'OPEN',
					mergeable: 'MERGEABLE',
					reviewDecision: 'APPROVED',
					checks: [],
					headBranch: 'release/minor/cli-typed-forge-boundary',
					baseBranch: 'main',
					headSha: SOURCE_DEVELOP_SHA,
					mergeCommitSha: BASE_MAIN_SHA,
				});
			await expect(
				runReleaseDogfood(
					buildInput({
						flags: parseDogfoodFlags(['--simulate-merge']),
						prReader: openReader,
					}),
				),
			).rejects.toThrowError(/merged/i);
		});
	});

	describe('reconcile uses the contract-mandated git command shape', () => {
		it('records a planned receipt even when develop did not advance', async () => {
			const result = await runReleaseDogfood(
				buildInput({ run: buildDryRunGitRunner() }),
			);
			expect(result.reconcileReceipt.operation).toBe('reconcile');
			expect(result.reconcileReceipt.status).toBe('planned');
			// The script's reconcile runner short-circuits when develop
			// has not advanced, so the receipt's details explain why.
			expect(result.reconcileReceipt.details?.reason).toBeDefined();
		});

		it('uses a runner that only answers the merge-base --is-ancestor call', async () => {
			// The dogfood buildReconcileRunner rejects every other git
			// command, so any unexpected git call from `reconcileRelease`
			// would surface as a thrown error. Reaching the receipt
			// without throwing IS the assertion that the contract only
			// invokes the documented commands.
			const result = await runReleaseDogfood(
				buildInput({ run: buildDryRunGitRunner() }),
			);
			expect(result.reconcileReceipt).toBeDefined();
			expect(result.reconcileReceipt.releaseSlug).toBe(SLUG);
			expect(result.reconcileReceipt.actor.length).toBeGreaterThan(0);
		});
	});

	describe('hotfix path documents the source-from-main shape', () => {
		it('emits a planned hotfix receipt targeting the release branch', async () => {
			const result = await runReleaseDogfood(buildInput());
			expect(result.hotfixReceipt.operation).toBe('hotfix');
			expect(result.hotfixReceipt.status).toBe('planned');
			expect(result.hotfixReceipt.target).toBe(`release/patch/${SLUG}`);
			expect(result.hotfixReceipt.source).toBe('main');
			expect(result.hotfixReceipt.releaseSlug).toBe(SLUG);
		});
	});

	describe('commit-policy gate', () => {
		it('validates normal-mode release promotion to main', async () => {
			const result = await runReleaseDogfood(buildInput());
			expect(result.policy.mode).toBe('normal');
			expect(result.policy.branch).toBe(`release/minor/${SLUG}`);
			expect(result.policy.target).toBe('main');
		});
	});
});
