/**
 * close-slice-gate.ts — the gate `close_slice` runs before it flips a slice.
 *
 * The gate is the one the project declares (`validationMatrix.scopes`
 * narrowed to the slice's scopes where they match, else its `validate`
 * script), read through the same reader `delendai validate` uses. It runs
 * as a detached job keyed by the exact tree, so:
 *
 *   - a gate longer than a tool call is never killed by one: the call
 *     waits a bounded time, then returns `pending` and a handle, and the
 *     next `close_slice` resumes the same run;
 *   - a green result for the same tree is reused, never re-run;
 *   - a failing run blocks with its output;
 *   - a run that timed out, crashed, or could not be started is
 *     `unverifiable`: it is neither a pass nor a failure of the work, and
 *     it is reported as exactly that.
 */
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative } from 'node:path';

import { validationGateSteps, withFileMutex } from '@delendai/core/public';

import { fingerprintTree } from './close-slice-gate-tree';
import {
	renderRunnerScript,
	systemGateProcess,
} from './close-slice-gate-process';
import {
	CLOSE_GATE_DEFAULT_TIMEOUT_MS,
	CLOSE_GATE_DEFAULT_WAIT_MS,
} from '../contracts/constants/close-slice-gate.constant';
import type {
	ICloseGateDeps,
	ICloseGateJob,
	ICloseGateProcessPort,
	ICloseGateStep,
	ICloseGateVerdict,
} from '../contracts/interfaces/close-slice-gate.interface';
import {
	clearJob,
	jobDirectory,
	prepareJobDirectory,
	readGreenVerdict,
	readJob,
	readOutputTail,
	readProgress,
	runnerPath,
	writeGreenVerdict,
	writeJob,
	writeRunner,
} from './close-slice-gate-store';

const POLL_INTERVAL_MS = 200;
const HANDLE_HASH_LENGTH = 16;

const DECLARATION_FILES = [
	'delendai.config.json',
	'package.json',
	'bun.lock',
	'bun.lockb',
	'pnpm-lock.yaml',
	'yarn.lock',
] as const;

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** The steps the project declares for this slice; the whole gate when no scope matches. */
export const declaredGateSteps = async (
	readDeclaration: ICloseGateDeps['readDeclaration'],
	scopes: readonly string[],
): Promise<readonly ICloseGateStep[]> => {
	const contents = new Map<string, string>();
	for (const file of DECLARATION_FILES) {
		const text = await readDeclaration(file);
		if (text !== null) contents.set(file, text);
	}
	const all = validationGateSteps((path) => contents.get(path));
	const scoped = all.filter((step) => scopes.includes(step.scope));
	return scoped.length > 0 ? scoped : all;
};

const handleFor = (tree: string, steps: readonly ICloseGateStep[]): string =>
	`gate-${createHash('sha256')
		.update(tree)
		.update('\0')
		.update(JSON.stringify(steps))
		.digest('hex')
		.slice(0, HANDLE_HASH_LENGTH)}`;

const unverifiable = (
	reason: string,
	extra: Partial<ICloseGateVerdict> = {},
): ICloseGateVerdict => ({
	state: 'unverifiable',
	reused: false,
	findings: [reason],
	...extra,
});

const pendingVerdict = (handle: string, tree: string): ICloseGateVerdict => ({
	state: 'pending',
	handle,
	tree,
	reused: false,
	findings: [
		`the gate is still running (handle ${handle}); call close_slice again to resume it`,
	],
});

interface IResolvedDeps {
	readonly processPort: ICloseGateProcessPort;
	readonly timeoutMs: number;
	readonly now: () => number;
}

/** Report a run that ended badly, then forget it so the next call runs afresh. */
const settleBad = async (
	dir: string,
	job: ICloseGateJob,
	state: 'fail' | 'unverifiable',
	headline: string,
): Promise<ICloseGateVerdict> => {
	const tail = await readOutputTail(dir);
	await clearJob(dir);
	return {
		state,
		handle: job.handle,
		tree: job.tree,
		reused: false,
		findings: tail === '' ? [headline] : [headline, tail],
	};
};

const evaluateRun = async (
	dir: string,
	job: ICloseGateJob,
	resolved: IResolvedDeps,
): Promise<ICloseGateVerdict> => {
	const progress = await readProgress(dir);
	if (progress.finished) {
		const allRan = progress.exitCodes.length === job.steps.length;
		const allPassed =
			allRan && progress.exitCodes.every((code) => code === 0);
		if (allPassed) {
			await writeGreenVerdict(dir, {
				tree: job.tree,
				steps: job.steps.length,
				passedAt: new Date(resolved.now()).toISOString(),
			});
			return {
				state: 'pass',
				handle: job.handle,
				tree: job.tree,
				reused: false,
				findings: [],
			};
		}
		const failedIndex = progress.exitCodes.findIndex((code) => code !== 0);
		const failed = job.steps[failedIndex < 0 ? 0 : failedIndex];
		return settleBad(
			dir,
			job,
			'fail',
			`gate step failed: [${failed?.scope ?? '?'}] ${failed?.command ?? '?'}`,
		);
	}
	if (!resolved.processPort.isAlive(job.pid)) {
		return settleBad(
			dir,
			job,
			'unverifiable',
			'the gate run ended without finishing (its process is gone); it proves nothing, run close_slice again',
		);
	}
	if (resolved.now() - job.startedAtMs > job.timeoutMs) {
		resolved.processPort.killGroup(job.pid);
		return settleBad(
			dir,
			job,
			'unverifiable',
			`the gate run was stopped after ${job.timeoutMs} ms (closeGateTimeoutMs); it proves nothing, raise the timeout or run close_slice again`,
		);
	}
	return pendingVerdict(job.handle, job.tree);
};

const startRun = async (
	dir: string,
	handle: string,
	tree: string,
	steps: readonly ICloseGateStep[],
	deps: ICloseGateDeps,
	resolved: IResolvedDeps,
): Promise<ICloseGateVerdict> => {
	await prepareJobDirectory(dir);
	await writeRunner(dir, renderRunnerScript(dir, deps.cwd, steps));
	const pid = resolved.processPort.start(runnerPath(dir), deps.cwd);
	if (pid === undefined) {
		await clearJob(dir);
		return unverifiable('the gate runner could not be started', {
			handle,
			tree,
		});
	}
	await writeJob(dir, {
		handle,
		tree,
		steps,
		cwd: deps.cwd,
		startedAtMs: resolved.now(),
		timeoutMs: resolved.timeoutMs,
		pid,
	});
	return pendingVerdict(handle, tree);
};

/** Attach to the run for this key, or start it; never blocks on the run. */
const attachOrStart = (
	deps: ICloseGateDeps,
	resolved: IResolvedDeps,
	tree: string,
	steps: readonly ICloseGateStep[],
): Promise<ICloseGateVerdict> => {
	const handle = handleFor(tree, steps);
	const dir = jobDirectory(deps.storeRoot, handle);
	return withFileMutex(join(deps.storeRoot, `${handle}.lock`), async () => {
		const green = await readGreenVerdict(dir);
		if (green !== undefined && green.tree === tree) {
			return {
				state: 'pass' as const,
				handle,
				tree,
				reused: true,
				findings: [],
			};
		}
		const job = await readJob(dir);
		return job === undefined
			? startRun(dir, handle, tree, steps, deps, resolved)
			: evaluateRun(dir, job, resolved);
	});
};

/**
 * Run (or resume) the project's declared gate against the current tree.
 * Waits at most `waitMs`; a slower gate answers `pending` with its handle.
 */
export const runCloseSliceGate = async (
	deps: ICloseGateDeps,
	scopes: readonly string[] = [],
): Promise<ICloseGateVerdict> => {
	const resolved: IResolvedDeps = {
		processPort: deps.process ?? systemGateProcess,
		timeoutMs: deps.timeoutMs ?? CLOSE_GATE_DEFAULT_TIMEOUT_MS,
		now: deps.now ?? Date.now,
	};
	const steps = await declaredGateSteps(deps.readDeclaration, scopes);
	if (steps.length === 0) {
		return unverifiable(
			'the project declares no gate (validationMatrix.scopes in delendai.config.json, or a validate script), so nothing was verified',
		);
	}
	const ownState = (deps.stateRoots ?? [deps.storeRoot])
		.map((root) => relative(deps.cwd, root))
		.filter(
			(path) =>
				path !== '' && !path.startsWith('..') && !isAbsolute(path),
		);
	const tree = await (deps.fingerprint ?? fingerprintTree)(
		deps.cwd,
		ownState,
		deps.storeRoot,
	);
	if (tree === undefined) {
		return unverifiable(
			'the checkout is not a git tree git can fingerprint, so a result could not be tied to it',
		);
	}
	const sleep = deps.sleep ?? delay;
	const deadline =
		resolved.now() + (deps.waitMs ?? CLOSE_GATE_DEFAULT_WAIT_MS);
	let verdict = await attachOrStart(deps, resolved, tree, steps);
	while (verdict.state === 'pending' && resolved.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		verdict = await attachOrStart(deps, resolved, tree, steps);
	}
	return verdict;
};
