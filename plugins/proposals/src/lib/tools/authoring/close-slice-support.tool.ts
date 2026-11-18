import { runAgentLockEngine } from '../../locks/agent-lock-engine';
import { runAgentNames } from '../agent-names.tool';
import type { IGitRunner } from '../../shared/git-runner';
import { AGENT_BRANCH_PREFIX } from '../../contracts/constants/agent-branch-convention.constant';
import { runAcceptanceCriteria } from '../../proposals/proposal-acceptance';
import type { IValidateEvidenceDeps } from '../proposal-transition.tool';
import type { IAuthoringToolOptions } from '../authoring-options';
import type {
	ICloseGateDeps,
	ICloseSliceQualityResult,
} from '../../contracts/interfaces/close-slice-gate.interface';
import { runCloseSliceGate } from '../close-slice-gate';
import {
	CLOSE_SLICE_VALIDATION_TIMEOUT_MS,
	TIMEOUT_EXIT_CODE,
} from '../../contracts/constants/close-slice-validation.constant';
import type {
	ICloseSliceThrownError,
	IAgentLockReleaseResult,
} from '../../contracts/interfaces/authoring-tool.interface';
import { canonicalSliceId } from './slice-block.tool';

export const isCloseSliceThrownError = (
	value: unknown,
): value is ICloseSliceThrownError => value instanceof Error;

export const runCloseSliceValidation = async (
	command: string,
	cwd: string,
	timeoutMs = CLOSE_SLICE_VALIDATION_TIMEOUT_MS,
): Promise<{
	readonly ok: boolean;
	readonly output: string;
	readonly exitCode: number;
}> => {
	const result = await runAcceptanceCriteria(
		[{ command, expect: 'exit0', timeoutMs }],
		{ cwd },
	);
	const verdict = result.results[0];
	if (verdict === undefined) {
		return {
			ok: false,
			output: 'validation command produced no result',
			exitCode: 1,
		};
	}
	return {
		ok: verdict.passed,
		output: [verdict.actual, verdict.reason]
			.filter(
				(part): part is string =>
					typeof part === 'string' && part.length > 0,
			)
			.join('\n'),
		exitCode:
			verdict.exitCode ??
			(verdict.reason?.startsWith('timeout:') ? TIMEOUT_EXIT_CODE : 1),
	};
};

/**
 * The quality probe `close_slice` wires: the project's declared gate,
 * run as a resumable job (see `close-slice-gate.ts`). `gate` tells a
 * gate that is still running or could not be verified apart from one
 * that failed, because the caller must answer each differently.
 */
export const runCloseSliceGateProbe = async (
	deps: ICloseGateDeps,
	scopes: readonly string[] = [],
): Promise<ICloseSliceQualityResult> => {
	const verdict = await runCloseSliceGate(deps, scopes);
	return {
		ok: verdict.state === 'pass',
		severity: verdict.state === 'pass' ? 'ok' : 'error',
		findings: verdict.findings,
		gate: {
			state: verdict.state,
			reused: verdict.reused,
			...(verdict.handle !== undefined ? { handle: verdict.handle } : {}),
			...(verdict.tree !== undefined ? { tree: verdict.tree } : {}),
			...(verdict.certifiedBy !== undefined
				? { certifiedBy: verdict.certifiedBy }
				: {}),
			...(verdict.evidence !== undefined
				? { evidence: verdict.evidence }
				: {}),
			...(verdict.nextAction !== undefined
				? { nextAction: verdict.nextAction }
				: {}),
		},
	};
};

/**
 * The branch a checkout is on when it is a unit of work: under the
 * policy's work-ref prefix. `undefined` for anything else, or when the
 * policy names no work refs.
 */
export const workUnitBranch = async (
	run: IGitRunner,
	workRefPrefix: string | undefined,
): Promise<string | undefined> => {
	const prefix = (workRefPrefix ?? '')
		.replace(/^refs\/heads\//u, '')
		.replace(/^heads\//u, '');
	if (prefix.length === 0) return undefined;
	const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!result.ok) return undefined;
	const branch = result.output.trim();
	return branch.startsWith(prefix) ? branch : undefined;
};

/**
 * f00091 S2: resolve the current branch and, if it is an `agent/*`
 * branch, return it (else `null`). Read-only (`git rev-parse`); never a
 * git mutation. Any failure degrades to `null` so `close_slice` never
 * throws over a branch-integration detail.
 */
export const resolveAgentBranch = async (
	run: IGitRunner,
): Promise<string | null> => {
	const result = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!result.ok) return null;
	const branch = result.output.trim();
	if (branch.length === 0 || branch === 'HEAD') return null;
	return branch.startsWith(AGENT_BRANCH_PREFIX) ? branch : null;
};

/** f00091 S2: resolve the worktree top-level dir (read-only). */
export const resolveWorktreeTopLevel = async (
	run: IGitRunner,
): Promise<string> => {
	const result = await run(['rev-parse', '--show-toplevel']);
	return result.ok ? result.output.trim() : '';
};

/**
 * Releases a slice's agent-lock claim on close/approve. `auto_work`'s
 * `claimReady.agent_lock_args` (see `auto-work.tool.ts`) tells callers to
 * claim with the composite `${proposalId}-${canonicalSliceId}` task_id
 * (canonical uppercase, e.g. "f00082-S1") — the form that stays
 * unambiguous when two different proposals both have a slice named e.g.
 * "S1". Try that convention first (both the canonical-case and the
 * caller's-own-case spelling, since `close_slice` itself accepts either),
 * then fall back to the bare sliceId for callers that claimed without
 * the proposal prefix.
 *
 * `runAgentLockEngine`'s release action reports `ok:true` even when NO
 * entry matched (it is a no-op release, not an error) — a caller that
 * only checks for a thrown error, without inspecting `removed`, will
 * wrongly believe the lock was released. Every existing call site here
 * used to do exactly that (hardcode `lockReleased = true`); this helper
 * inspects the actual result so the reported flag is honest.
 */
export const releaseSliceLock = async (
	options: IAuthoringToolOptions & {
		readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	},
	proposalId: string,
	sliceId: string,
): Promise<boolean> => {
	const deps = {
		lockPath: options.lockPathAbs,
		toolName: `${options.namespacePrefix}_agent_lock`,
	};
	const candidates = new Set([
		`${proposalId}-${canonicalSliceId(sliceId)}`,
		`${proposalId}-${sliceId}`,
		sliceId,
	]);
	for (const taskId of candidates) {
		const result = await runAgentLockEngine(
			{ action: 'release', task_id: taskId },
			deps,
		);
		const body = JSON.parse(
			result.content[0]?.text ?? '{}',
		) as IAgentLockReleaseResult;
		if ((body.removed ?? 0) > 0) return true;
	}
	return false;
};

export const releaseSliceAssignment = async (
	options: IAuthoringToolOptions & {
		readonly validateEvidenceDeps?: IValidateEvidenceDeps;
	},
	proposalId: string,
	sliceId: string,
): Promise<boolean> => {
	if (options.agentNames === undefined) return false;
	const candidates = new Set([
		`${proposalId}-${canonicalSliceId(sliceId)}`,
		`${proposalId}-${sliceId}`,
		sliceId,
	]);
	for (const taskId of candidates) {
		const result = await runAgentNames(
			{ action: 'release', task_id: taskId },
			options.agentNames,
		);
		const body = JSON.parse(result.content[0]?.text ?? '{}') as {
			released?: readonly string[];
		};
		if (body.released?.includes(taskId) === true) return true;
	}
	return false;
};
