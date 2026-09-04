#!/usr/bin/env bun
/**
 * dogfood.script.ts — Release-track dogfooding driver (R1/R2/R3/R4).
 *
 * Wires together every release contract that the release track exposes,
 * exercises them end-to-end against the real git state of this
 * repository, and prints a single stable JSON receipt the user can
 * pipe into the runbook they will execute manually to open the PR.
 *
 * Hard rules (per the task brief):
 *   1. Touches ONLY files under `tools/scripts/release/dogfood/**`.
 *   2. Never commits, never pushes, never alters `develop` or `main`.
 *   3. When `--confirm-pr` is set the script aborts before invoking
 *      `gh`; it prints the exact `gh pr create ...` command and stops.
 *   4. The `IReleasePrProvider` it builds is a local mock — no GitHub
 *      network calls happen from this script, ever.
 *   5. `finalizeRelease` only runs when `--simulate-merge` is set; the
 *      default behaviour aborts before finalize with an explicit
 *      "user must approve merge" message.
 *
 * CLI surface:
 *   --slug=<value>               release slug (default: cli-typed-forge-boundary)
 *   --type=<patch|minor|major>   release type (default: minor)
 *   --actor=<value>              release actor (default: $USER || 'dogfood')
 *   --dry-run                    run only the dry-run path (overrides --execute)
 *   --execute                    additionally run releasePrepareExecute + idempotency
 *   --confirm-pr                 additionally print the exact `gh pr create ...` command
 *                                the user will run by hand. The script never invokes gh.
 *   --simulate-merge             additionally run finalizeRelease with a mocked
 *                                MERGED state from the local reader. Off by default.
 *   --gate-status=<name>=<status>  repeatable; override a gate status for
 *                                  readiness testing. Status ∈ passed|failed|
 *                                  pending|running. Default: every gate passed.
 *
 * The CLI is parsed by `parseDogfoodFlags` (exported so the spec can drive it
 * without spawning a child process). The receipt-builder `runReleaseDogfood`
 * is also exported so the spec can inject a mocked `IGitRunner`,
 * `IReleasePrProvider`, and PR reader without touching the host filesystem.
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type {
	IGitRunResult,
	IGitRunner,
	IReleaseCandidateMetadata,
	ReleaseType,
	IExpectedReleaseState,
	IReleaseGate,
	IReleasePrepareInput,
	IReleasePreparation,
	IReleaseReadiness,
	IExpectedFinalReleaseState,
	IHotfixInput,
	IReleaseReceipt,
	IReleaseReconciliationInput,
} from '@delendai/core/public';
import type { IForgePullRequestDetail } from '../../../../plugins/forge/src/lib/contracts/interfaces/forge-read.interface';
import {
	readExpectedReleaseState,
	releasePrepareDryRun,
	releasePrepareExecute,
	releaseValidate,
} from '../../../../plugins/git/src/lib/release';
import type { IReleaseCandidateStore } from '../../../../plugins/git/src/lib/release';
import { createReleaseCandidateStore } from '../../../../plugins/git/src/lib/release';
import {
	createHotfixReceipt,
	reconcileRelease,
} from '../../../../plugins/git/src/lib/release-finalize';
import { createReleasePullRequest } from '../../../../plugins/forge/src/lib/release-pr';
import type {
	IReleasePrProvider,
	IReleasePrRecord,
} from '../../../../plugins/forge/src/lib/release-pr';
import {
	finalizeRelease,
	stabilizeRelease,
} from '../../../../plugins/forge/src/lib/release-finalize';
import type { PullRequestReader } from '../../../../plugins/forge/src/lib/release-finalize';
import {
	EMERGENCY_BYPASS_CAPABILITY,
	validateReleasePromotionPolicy,
} from '../../../../plugins/commit-policy/src/lib/branch-policy/index.ts';
// Note: the task brief referenced `src/lib/release-branch` in
// commit-policy. The actual directory is `src/lib/branch-policy` —
// it owns the release-branch promotion policy (`validateReleasePromotionPolicy`
// + `EMERGENCY_BYPASS_CAPABILITY`) that this flow depends on. The barrel
// does not re-export them, so we reach in via the relative path.

// ---------------------------------------------------------------------------
// CLI types + flag parser
// ---------------------------------------------------------------------------

export interface IReleaseDogfoodFlags {
	readonly slug: string;
	readonly type: ReleaseType;
	readonly actor: string;
	readonly dryRunOnly: boolean;
	readonly execute: boolean;
	readonly confirmPr: boolean;
	readonly simulateMerge: boolean;
	readonly gateStatuses: ReadonlyMap<string, IReleaseGate['status']>;
}

const DEFAULT_SLUG = 'cli-typed-forge-boundary';
const DEFAULT_TYPE: ReleaseType = 'minor';
const DEFAULT_GATE_NAMES: ReadonlyArray<string> = [
	'typecheck',
	'tests',
	'lint-presets',
	'generated-artifacts-check',
	'drift',
	'develop-health',
];

const VALID_GATE_STATUSES: ReadonlySet<IReleaseGate['status']> = new Set<
	IReleaseGate['status']
>(['passed', 'failed', 'pending', 'running']);
const VALID_RELEASE_TYPES: ReadonlySet<ReleaseType> = new Set<ReleaseType>([
	'patch',
	'minor',
	'major',
]);

const fail = (message: string): never => {
	// Throw rather than process.exit so vitest's toThrowError can catch
	// the parse-time failures. Production entry point still exits 2 via
	// the catch in main().
	throw new Error(`dogfood: ${message}`);
};

/**
 * Exported for the spec. Parses CLI argv (without the leading node/bun
 * bin and script path — the caller strips those off first).
 */
export const parseDogfoodFlags = (
	argv: readonly string[],
): IReleaseDogfoodFlags => {
	let slug = DEFAULT_SLUG;
	let type: ReleaseType = DEFAULT_TYPE;
	let actor = process.env.USER?.trim() || 'dogfood';
	let dryRunOnly = false;
	let execute = false;
	let confirmPr = false;
	let simulateMerge = false;
	const gateStatuses = new Map<string, IReleaseGate['status']>();

	for (const arg of argv) {
		if (arg === '--dry-run') {
			dryRunOnly = true;
			continue;
		}
		if (arg === '--execute') {
			execute = true;
			continue;
		}
		if (arg === '--confirm-pr') {
			confirmPr = true;
			continue;
		}
		if (arg === '--simulate-merge') {
			simulateMerge = true;
			continue;
		}
		if (arg.startsWith('--slug=')) {
			const value = arg.slice('--slug='.length).trim();
			if (value === '') fail('--slug must not be empty');
			slug = value;
			continue;
		}
		if (arg.startsWith('--type=')) {
			const value = arg.slice('--type='.length).trim();
			if (!VALID_RELEASE_TYPES.has(value as ReleaseType))
				fail(`--type must be patch|minor|major, got "${value}"`);
			type = value as ReleaseType;
			continue;
		}
		if (arg.startsWith('--actor=')) {
			const value = arg.slice('--actor='.length).trim();
			if (value === '') fail('--actor must not be empty');
			actor = value;
			continue;
		}
		if (arg.startsWith('--gate-status=')) {
			const value = arg.slice('--gate-status='.length).trim();
			const eq = value.indexOf('=');
			if (eq <= 0 || eq === value.length - 1)
				fail(`--gate-status must be <name>=<status>, got "${arg}"`);
			const name = value.slice(0, eq).trim();
			const status = value.slice(eq + 1).trim();
			if (!VALID_GATE_STATUSES.has(status as IReleaseGate['status']))
				fail(
					`--gate-status value must be passed|failed|pending|running, got "${status}"`,
				);
			gateStatuses.set(name, status as IReleaseGate['status']);
			continue;
		}
		fail(`unknown flag: ${arg}`);
	}

	// --dry-run overrides --execute. This makes "just print the dry-run"
	// the safest possible invocation regardless of what else the caller
	// passed.
	const resolvedExecute = execute && !dryRunOnly;

	return Object.freeze({
		slug,
		type,
		actor,
		dryRunOnly,
		execute: resolvedExecute,
		confirmPr,
		simulateMerge,
		gateStatuses,
	});
};

// ---------------------------------------------------------------------------
// Git runner factory (real-spawn)
// ---------------------------------------------------------------------------

/**
 * Build a real `IGitRunner` that shells out to the host `git` binary in
 * `cwd`. The script never throws from this runner — failures come back
 * as `{ ok: false, reason }` so the caller can distinguish "git missing"
 * from "not a git repo".
 */
export const createSpawnGitRunner = (
	cwd: string,
	timeoutMs = 60_000,
): IGitRunner => {
	return async (args): Promise<IGitRunResult> => {
		try {
			const { stdout, stderr: _stderr } = await new Promise<{
				stdout: string;
				stderr: string;
			}>((resolve, reject) => {
				execFile(
					'git',
					[...args],
					{
						cwd,
						encoding: 'utf8',
						timeout: timeoutMs,
						maxBuffer: 8 * 1024 * 1024,
					},
					(error, stdoutText, stderrText) => {
						if (error !== null) {
							reject(error);
							return;
						}
						resolve({
							stdout: stdoutText as string,
							stderr: stderrText as string,
						});
					},
				);
			});
			return { ok: true, output: stdout };
		} catch (error) {
			const err = error as NodeJS.ErrnoException & {
				killed?: boolean;
				signal?: string;
			};
			let reason: string;
			if (err.code === 'ENOENT') {
				reason = 'git is not installed or not on PATH';
			} else if (err.killed || err.signal === 'SIGTERM') {
				reason = `git timed out after ${timeoutMs}ms`;
			} else {
				reason =
					(err.message || 'git command failed')
						.split('\n')[0]
						?.trim() || 'git command failed';
			}
			return { ok: false, output: '', reason };
		}
	};
};

// ---------------------------------------------------------------------------
// PR provider + reader mocks
// ---------------------------------------------------------------------------

export interface IDogfoodRunInput {
	readonly flags: IReleaseDogfoodFlags;
	readonly run: IGitRunner;
	/**
	 * Optional provider override (spec injects a spy). The script builds
	 * a default mock that records calls and never touches the network.
	 */
	readonly provider?: IReleasePrProvider;
	/** Optional reader override (spec injects a spy). */
	readonly prReader?: PullRequestReader;
}

/**
 * Build a local mock `IReleasePrProvider`. `listPullRequests` always
 * returns `[]` (this runbook assumes no existing PR for the candidate
 * branch), and `createPullRequest` returns a synthetic PR record whose
 * number/URL are derived from a monotonic counter. This provider never
 * shells out to `gh`; the script's `--confirm-pr` flag is the only way
 * the user can ever get the exact `gh pr create ...` command.
 */
export interface IMockReleasePrProvider {
	readonly provider: IReleasePrProvider;
	/** Live reference to the records the mock has produced. Frozen
	 *  records but the array itself is mutable so the spec can
	 *  observe growth via .length / iteration. */
	readonly created: IReleasePrRecord[];
	/** Returns a frozen snapshot — handy for assertions that need a
	 *  stable reference at a point in time. */
	readonly snapshot: () => readonly IReleasePrRecord[];
}

export const createMockReleasePrProvider = (): IMockReleasePrProvider => {
	let counter = 41;
	const created: IReleasePrRecord[] = [];
	const provider: IReleasePrProvider = {
		listPullRequests: async () => [],
		createPullRequest: async (input) => {
			const record: IReleasePrRecord = Object.freeze({
				number: counter++,
				url: `https://github.com/delendai/core/pull/${String(counter - 1)}`,
				title: input.title,
				headBranch: input.headBranch,
				baseBranch: input.baseBranch,
			});
			created.push(record);
			return record;
		},
	};
	return {
		provider,
		created,
		snapshot: () => Object.freeze([...created]),
	};
};

/**
 * Build a mocked PR reader that always reports `MERGED`. Used by the
 * `--simulate-merge` path so the dogfood can exercise `finalizeRelease`
 * end-to-end without waiting for the human to merge the PR on GitHub.
 */
export const createSimulatedMergeReader =
	(headSha: string, mergeCommitSha: string): PullRequestReader =>
	async (_pullRequest): Promise<IForgePullRequestDetail> =>
		Object.freeze({
			number: 42,
			title: 'Release (simulated)',
			branch: 'release/minor/cli-typed-forge-boundary',
			url: 'https://github.com/delendai/core/pull/42',
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
			state: 'MERGED',
			mergeable: 'MERGEABLE',
			reviewDecision: 'APPROVED',
			checks: [],
			headBranch: 'release/minor/cli-typed-forge-boundary',
			baseBranch: 'main',
			headSha,
			mergeCommitSha,
		});

// ---------------------------------------------------------------------------
// Receipt shape (stable JSON contract for the runbook)
// ---------------------------------------------------------------------------

export interface IDogfoodResult {
	readonly sourceDevelopSha: string;
	readonly baseMainSha: string;
	readonly fromVersion: string;
	readonly targetVersion: string;
	readonly branch: string;
	readonly candidate: IReleaseCandidateMetadata;
	readonly gates: readonly IReleaseGate[];
	readonly prepareDryRunReceipt: IReleasePreparation;
	readonly prepareExecuteReceipt: IReleasePreparation | null;
	readonly idempotencyReused: boolean;
	readonly readiness: IReleaseReadiness;
	readonly stabilizeReceipt: IReleaseReceipt;
	readonly prContractResult: {
		readonly created: boolean;
		readonly number: number;
		readonly url: string;
		readonly headBranch: string;
		readonly baseBranch: string;
		readonly description: string;
	} | null;
	readonly finalizeBlockedReason: string | null;
	readonly finalizeReceipt: IReleaseReceipt | null;
	readonly reconcileReceipt: IReleaseReceipt;
	readonly hotfixReceipt: IReleaseReceipt;
	readonly ghCommand: string | null;
	readonly policy: {
		readonly mode: 'normal' | 'emergency';
		readonly capability: typeof EMERGENCY_BYPASS_CAPABILITY;
		readonly branch: string;
		readonly target: 'main';
	};
}

// ---------------------------------------------------------------------------
// Receipt builder
// ---------------------------------------------------------------------------

const buildGateList = (
	overrides: ReadonlyMap<string, IReleaseGate['status']>,
): readonly IReleaseGate[] => {
	const gates: IReleaseGate[] = [];
	for (const name of DEFAULT_GATE_NAMES) {
		const status: IReleaseGate['status'] = overrides.get(name) ?? 'passed';
		gates.push(
			Object.freeze({
				name,
				status,
				required: true,
				detail:
					status === 'passed'
						? `${name} green in this runbook`
						: `${name} = ${status}`,
			}),
		);
	}
	return Object.freeze(gates);
};

const buildGhCommand = (targetVersion: string, headBranch: string): string =>
	[
		'gh pr create',
		'--base main',
		`--head ${headBranch}`,
		`--title 'Release ${targetVersion}'`,
		'--body-file <(gh api -X POST /repos/{owner}/{repo}/releases/generate-notes',
		"  -f tag_name='vX.Y.Z' -f name='vX.Y.Z' --jq .body)",
	].join(' ');

const buildReconcileRunner = (
	developShaAtCut: string,
	developShaNow: string,
): IGitRunner => {
	return async (args): Promise<IGitRunResult> => {
		if (
			args[0] === 'merge-base' &&
			args[1] === '--is-ancestor' &&
			args[2] === developShaAtCut &&
			args[3] === developShaNow
		) {
			return { ok: true, output: '' };
		}
		return {
			ok: false,
			output: '',
			reason: `unexpected reconcile command: ${args.join(' ')}`,
		};
	};
};

/**
 * Exported so the spec can drive the full receipt builder with a mocked
 * `IGitRunner`, `IReleasePrProvider`, and PR reader. Production entry
 * point is `main()` at the bottom of this file.
 */
export const runReleaseDogfood = async (
	input: IDogfoodRunInput,
): Promise<IDogfoodResult> => {
	const { flags, run } = input;
	const store: IReleaseCandidateStore = createReleaseCandidateStore();

	// (a) Measure source/base/mainVersion via git.
	const current: IExpectedReleaseState = await readExpectedReleaseState(run);
	const expected: IExpectedReleaseState = Object.freeze({
		sourceDevelopSha: current.sourceDevelopSha,
		mainSha: current.mainSha,
		mainVersion: current.mainVersion,
	});

	// (b)+(c) Dry-run is unconditional.
	const baseInput: IReleasePrepareInput = Object.freeze({
		type: flags.type,
		slug: flags.slug,
		actor: flags.actor,
		expected,
		includedProposals: Object.freeze([
			'github-security',
			'r1-contracts',
			'r2-typed-pr',
			'r3-finalize',
			'r4-promotion-policy',
			'transactions',
			'release-tools',
		]),
	});
	const prepareDryRunReceipt: IReleasePreparation =
		await releasePrepareDryRun(run, store, baseInput);

	// (d) Execute path (skipped under --dry-run, which overrides --execute).
	let prepareExecuteReceipt: IReleasePreparation | null = null;
	let idempotencyReused = false;
	if (flags.execute) {
		const idempotencyKey = `${expected.sourceDevelopSha}:${expected.mainSha}:${flags.type}`;
		const execInput: IReleasePrepareInput = Object.freeze({
			...baseInput,
			idempotencyKey,
		});
		prepareExecuteReceipt = await releasePrepareExecute(
			run,
			store,
			execInput,
		);
		// Re-run with the same idempotencyKey. The store MUST return the
		// same candidate (`created: false`); no second candidate is
		// created.
		const second: IReleasePreparation = await releasePrepareExecute(
			run,
			store,
			execInput,
		);
		idempotencyReused =
			second.idempotencyKey === prepareExecuteReceipt.idempotencyKey &&
			second.candidate === prepareExecuteReceipt.candidate &&
			!second.created;
	}

	const candidate: IReleaseCandidateMetadata = prepareDryRunReceipt.candidate;

	// (e) Validate readiness. A not-ready outcome aborts the run before
	// any PR work happens — that is the spec's contract.
	const gates = buildGateList(flags.gateStatuses);
	const readiness: IReleaseReadiness = releaseValidate(candidate, gates);

	// (f) Stabilize (the first PR-shape receipt).
	const stabilizeReceipt: IReleaseReceipt = stabilizeRelease(
		candidate,
		readiness,
		flags.actor,
	);

	// Commit-policy gate. Normal mode: the source branch must be a
	// release branch targeting main. We capture the decision so the
	// runbook can show the policy that authorised the PR.
	const policy = validateReleasePromotionPolicy({
		sourceBranch: candidate.branch,
		targetBranch: 'main',
		mode: 'normal',
	});

	// (g)+(h) PR contract. The provider is always mocked — we never call
	// `gh` from this script.
	const mock = createMockReleasePrProvider();
	const provider = input.provider ?? mock.provider;
	const prResult = await createReleasePullRequest({
		candidate,
		gates,
		currentBranch: candidate.branch,
		upstream: 'origin/develop',
		provider,
	});

	// (i) Finalize. Only runs under --simulate-merge; otherwise we
	// capture the explicit "user must approve merge" reason.
	let finalizeReceipt: IReleaseReceipt | null = null;
	let finalizeBlockedReason: string | null =
		'release finalize is blocked: user must approve merge on GitHub before this script can record the MERGED state';
	if (flags.simulateMerge) {
		const expectedFinal: IExpectedFinalReleaseState = Object.freeze({
			releaseBranchSha: candidate.sourceDevelopSha,
			mainSha: candidate.baseMainSha,
			targetVersion: candidate.targetVersion,
		});
		const reader =
			input.prReader ??
			createSimulatedMergeReader(
				candidate.sourceDevelopSha,
				candidate.baseMainSha,
			);
		finalizeReceipt = await finalizeRelease(
			reader,
			candidate,
			expectedFinal,
			readiness,
			flags.actor,
			'42',
		);
		finalizeBlockedReason = null;
	}

	// (j) Reconcile. The mock runner only "answers" for the
	// merge-base --is-ancestor command the contract invokes; every other
	// command is rejected so the spec can prove we never call git for
	// anything beyond what the contract demands.
	const reconcileInput: IReleaseReconciliationInput = Object.freeze({
		releaseSlug: candidate.slug,
		releaseBranchSha: candidate.sourceDevelopSha,
		developShaAtCut: candidate.sourceDevelopSha,
		developShaNow: candidate.sourceDevelopSha,
		releaseOnlyFixes: Object.freeze([
			`${candidate.sourceDevelopSha.slice(0, 7)} release-only fix placeholder`,
		]),
		actor: flags.actor,
	});
	const reconcileRunner = buildReconcileRunner(
		reconcileInput.developShaAtCut,
		reconcileInput.developShaNow,
	);
	const reconcileReceipt: IReleaseReceipt = await reconcileRelease(
		reconcileRunner,
		reconcileInput,
	);

	// (k) Hotfix receipt. Hotfix source is always `main` per the contract.
	const hotfixInput: IHotfixInput = Object.freeze({
		slug: candidate.slug,
		source: 'main',
		actor: flags.actor,
	});
	const hotfixReceipt: IReleaseReceipt = createHotfixReceipt(hotfixInput);

	// (l) Build the runbook JSON. `ghCommand` is ONLY populated when the
	// user opted in with --confirm-pr; otherwise the script never prints
	// the gh command.
	const ghCommand = flags.confirmPr
		? buildGhCommand(candidate.targetVersion, candidate.branch)
		: null;

	return Object.freeze({
		sourceDevelopSha: expected.sourceDevelopSha,
		baseMainSha: expected.mainSha,
		fromVersion: candidate.fromVersion,
		targetVersion: candidate.targetVersion,
		branch: candidate.branch,
		candidate,
		gates,
		prepareDryRunReceipt,
		prepareExecuteReceipt,
		idempotencyReused,
		readiness,
		stabilizeReceipt,
		prContractResult: Object.freeze({
			created: prResult.created,
			number: prResult.pr.number,
			url: prResult.pr.url,
			headBranch: prResult.pr.headBranch,
			baseBranch: prResult.pr.baseBranch,
			description: prResult.description,
		}),
		finalizeBlockedReason,
		finalizeReceipt,
		reconcileReceipt,
		hotfixReceipt,
		ghCommand,
		policy: Object.freeze({
			mode: policy.mode,
			capability: EMERGENCY_BYPASS_CAPABILITY,
			branch: policy.sourceBranch,
			target: policy.targetBranch,
		}),
	});
};

// ---------------------------------------------------------------------------
// Production entry point
// ---------------------------------------------------------------------------

/** Exported so the spec can import it (and so we can stub it from tests). */
export const buildDogfoodRunner = (cwd: string): IGitRunner =>
	createSpawnGitRunner(cwd);

/** Print a compact runbook header on stderr so the user can see what
 *  happened even when they pipe stdout to a file. */
const printRunbookHeader = (
	flags: IReleaseDogfoodFlags,
	candidate: IReleaseCandidateMetadata,
	expected: IExpectedReleaseState,
): void => {
	const lines = [
		'─── dogfood release runbook ───────────────────────────────────────',
		`slug             : ${candidate.slug}`,
		`type             : ${candidate.type}`,
		`branch           : ${candidate.branch}`,
		`source develop   : ${expected.sourceDevelopSha.slice(0, 12)}`,
		`base main        : ${expected.mainSha.slice(0, 12)}`,
		`fromVersion      : ${candidate.fromVersion}`,
		`targetVersion    : ${candidate.targetVersion}`,
		`actor            : ${flags.actor}`,
		`mode             : ${flags.dryRunOnly ? 'dry-run only' : flags.execute ? 'dry-run + execute' : 'dry-run'}`,
		`confirm-pr       : ${flags.confirmPr ? 'yes (runbook printed)' : 'no (runbook suppressed)'}`,
		`simulate-merge   : ${flags.simulateMerge ? 'yes (finalize will run)' : 'no (finalize blocked)'}`,
		'──────────────────────────────────────────────────────────────────',
	];
	for (const line of lines) process.stderr.write(`${line}\n`);
};

/**
 * Production main(). Resolves the real git runner from `cwd`, calls
 * `runReleaseDogfood`, then prints the stable JSON receipt to stdout.
 */
const main = async (): Promise<void> => {
	const flags = parseDogfoodFlags(process.argv.slice(2));
	const cwd = fileURLToPath(new URL('../..', import.meta.url));
	const run = buildDogfoodRunner(cwd);
	const result = await runReleaseDogfood({ flags, run });

	printRunbookHeader(flags, result.candidate, {
		sourceDevelopSha: result.sourceDevelopSha,
		mainSha: result.baseMainSha,
		mainVersion: result.fromVersion,
	});

	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

	if (flags.confirmPr && result.ghCommand !== null) {
		process.stderr.write(
			[
				'',
				'dogfood: --confirm-pr was set; the script DID NOT invoke `gh`.',
				'Run the following command yourself to open the release PR:',
				'',
				`  ${result.ghCommand}`,
				'',
				'After the PR merges, re-run this script with --simulate-merge',
				'(or use your real forge reader) to capture the finalize receipt.',
				'',
			].join('\n'),
		);
	}
};

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && scriptPath === process.argv[1]) {
	main().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		process.stderr.write(`dogfood: ${message}\n`);
		if (stack !== undefined) process.stderr.write(`${stack}\n`);
		process.exit(1);
	});
}
