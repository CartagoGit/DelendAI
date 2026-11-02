/**
 * transactions/executor.ts — f00201 (Track O / q00006 §55).
 *
 * The runtime half of the workflow-transaction module. Walks a frozen
 * `ITransactionPlan`, calls `step.run` in plan order, and on failure
 * asks the compensation helper to undo everything that already ran.
 *
 * Algorithm: resolve `dryRun` (default false), then for each step in
 * plan order either skip its effects (preview), call `run(ctx)` and
 * capture the value, or — on error — run `compensateAll` and return a
 * failure envelope. The final step builds the success envelope.
 *
 * Privacy (R1.1–R1.10): the executor never logs, never reads the
 * clock, never writes to a sink. It returns a pure result envelope
 * that the caller (an LLM-facing tool handler) can choose to log or
 * surface verbatim. Step names and counters only.
 */

import { compensateAll } from './compensate';
import { computePlanRisk } from './plan';
import {
	approvalFingerprint,
	buildReplayedReceipt,
	isApprovalSatisfied,
	normalizeExpectedState,
} from './approval';
import type {
	IExecuteOptions,
	IStep,
	IStepContext,
	ITransactionError,
	ITransactionPlan,
	ITransactionReceipt,
	ITransactionResult,
	TTransactionRisk,
} from './types';

const buildReceipt = <T>(input: {
	readonly plan: ITransactionPlan<T>;
	readonly options: IExecuteOptions<T>;
	readonly stage: ITransactionReceipt['stage'];
	readonly executedSteps: number;
	readonly replayed?: boolean;
	readonly approved: boolean;
	readonly approval?: Pick<
		ITransactionReceipt,
		'approved' | 'approver' | 'approvalReceipt' | 'grantedCapabilities'
	>;
}): ITransactionReceipt =>
	Object.freeze({
		stage: input.stage,
		...(input.plan.meta.id !== undefined
			? { planId: input.plan.meta.id }
			: {}),
		planFingerprint: input.plan.meta.fingerprint,
		...(input.plan.meta.idempotencyKey !== undefined
			? { idempotencyKey: input.plan.meta.idempotencyKey }
			: {}),
		...(input.plan.meta.expectedState !== undefined
			? { expectedState: input.plan.meta.expectedState }
			: {}),
		approvalRequired: input.plan.meta.capabilityGrant.approvalRequired,
		approved: input.approval?.approved ?? input.approved,
		...(input.approval?.approver !== undefined
			? { approver: input.approval.approver }
			: input.options.approval?.approver !== undefined
				? { approver: input.options.approval.approver }
				: {}),
		...(input.approval?.approvalReceipt !== undefined
			? { approvalReceipt: input.approval.approvalReceipt }
			: input.options.approval?.receipt !== undefined
				? { approvalReceipt: input.options.approval.receipt }
				: {}),
		requiredCapabilities: input.plan.meta.capabilityGrant.permissions,
		grantedCapabilities: Object.freeze([
			...(input.approval?.grantedCapabilities ??
				input.options.approval?.capabilities ??
				[]),
		]),
		replayed: input.replayed === true,
		executedSteps: input.executedSteps,
		totalSteps: input.plan.steps.length,
	});

const persistReceipt = async <T>(input: {
	readonly key: string | undefined;
	readonly plan: ITransactionPlan<T>;
	readonly options: IExecuteOptions<T>;
	readonly result: ITransactionResult<T>;
}): Promise<ITransactionResult<T>> => {
	if (input.key === undefined || input.options.receiptStore === undefined) {
		return input.result;
	}
	await input.options.receiptStore.put({
		key: input.key,
		planFingerprint: input.plan.meta.fingerprint,
		result: input.result,
	});
	return input.result;
};

/** Re-exported from `plan.ts` for the public barrel. */
export interface IExecuteResult<_T> {
	readonly ok: boolean;
	readonly totalSteps: number;
	readonly executedSteps: number;
}

/** Build a frozen failure envelope. `stage` defaults to `'failed'`. */
const failedResult = <T>(input: {
	readonly plan: ITransactionPlan<T>;
	readonly options: IExecuteOptions<T>;
	readonly risk: TTransactionRisk;
	readonly dryRun: boolean;
	readonly totalSteps: number;
	readonly error: ITransactionError;
	readonly stage?: ITransactionReceipt['stage'];
}): ITransactionResult<T> =>
	Object.freeze({
		ok: false,
		values: Object.freeze([]) as readonly T[],
		compensations: Object.freeze([]) as readonly [],
		risk: input.risk,
		dryRun: input.dryRun,
		executedSteps: 0,
		totalSteps: input.totalSteps,
		receipt: buildReceipt({
			plan: input.plan,
			options: input.options,
			stage: input.stage ?? 'failed',
			executedSteps: 0,
			approved: false,
		}),
		error: input.error,
		executedStepNames: Object.freeze([]),
	});

/** Build a frozen success/preview envelope. Mirrors `failedResult`. */
const okResult = <T>(input: {
	readonly plan: ITransactionPlan<T>;
	readonly options: IExecuteOptions<T>;
	readonly risk: TTransactionRisk;
	readonly dryRun: boolean;
	readonly totalSteps: number;
	readonly executedSteps: number;
	readonly executedNames: readonly string[];
	readonly approved: boolean;
	readonly stage: ITransactionReceipt['stage'];
}): ITransactionResult<T> =>
	Object.freeze({
		ok: true,
		values: Object.freeze([]) as readonly T[],
		compensations: Object.freeze([]) as readonly [],
		risk: input.risk,
		dryRun: input.dryRun,
		executedSteps: input.executedSteps,
		totalSteps: input.totalSteps,
		receipt: buildReceipt({
			plan: input.plan,
			options: input.options,
			stage: input.stage,
			executedSteps: input.executedSteps,
			approved: input.approved,
		}),
		executedStepNames: Object.freeze([...input.executedNames]),
	});

/** Run the plan. Returns an `ITransactionResult`. Never throws — a
 * failing step is captured into the result envelope so the caller
 * can render the trace to the LLM. */
export const execute = async <T>(
	plan: ITransactionPlan<T>,
	options: IExecuteOptions<T> = {},
): Promise<ITransactionResult<T>> => {
	const dryRun = options.dryRun === true;
	const steps = plan.steps;
	const totalSteps = steps.length;
	const completed = new Map<number, T>();
	const executedStepNames: string[] = [];
	const risk = computePlanRisk(plan);
	const approved = isApprovalSatisfied(plan, options);

	if (dryRun) {
		return okResult({
			plan,
			options,
			risk,
			dryRun,
			totalSteps,
			executedSteps: steps.length,
			executedNames: steps.map((step) => step.name),
			approved,
			stage: 'preview',
		});
	}

	const idempotencyKey = plan.meta.idempotencyKey;
	if (idempotencyKey !== undefined && options.receiptStore !== undefined) {
		const existing = await options.receiptStore.get(idempotencyKey);
		if (existing !== undefined) {
			if (existing.planFingerprint !== plan.meta.fingerprint) {
				return failedResult({
					plan,
					options,
					risk,
					dryRun,
					totalSteps,
					error: Object.freeze({
						code: 'idempotency-key-conflict',
						step: '<idempotency>',
						stepIndex: -1,
						cause: new Error(
							`idempotency key ${idempotencyKey} belongs to another transaction`,
						),
					}),
				});
			}

			const existingApproval = approvalFingerprint({
				granted: existing.result.receipt.approved,
				...(existing.result.receipt.approver !== undefined
					? { approver: existing.result.receipt.approver }
					: {}),
				...(existing.result.receipt.approvalReceipt !== undefined
					? { receipt: existing.result.receipt.approvalReceipt }
					: {}),
				...(existing.result.receipt.grantedCapabilities.length > 0
					? {
							capabilities:
								existing.result.receipt.grantedCapabilities,
						}
					: {}),
			});
			const incomingApproval = approvalFingerprint(options.approval);
			if (existingApproval !== incomingApproval) {
				return failedResult({
					plan,
					options,
					risk,
					dryRun,
					totalSteps,
					error: Object.freeze({
						code: 'approval-mismatch',
						step: '<approval>',
						stepIndex: -1,
						cause: new Error(
							'replay approval does not match the original approval receipt',
						),
					}),
				});
			}

			const replayedResult: ITransactionResult<T> = buildReplayedReceipt({
				plan,
				options,
				existing: existing.result,
			});

			return replayedResult;
		}
	}

	if (
		plan.meta.expectedState !== undefined &&
		normalizeExpectedState(plan.meta.expectedState) !==
			normalizeExpectedState(options.currentState)
	) {
		return failedResult({
			plan,
			options,
			risk,
			dryRun,
			totalSteps,
			error: Object.freeze({
				code: 'expected-state-mismatch',
				step: '<expected-state>',
				stepIndex: -1,
				cause: new Error('expected state mismatch'),
				expectedState: plan.meta.expectedState,
				...(options.currentState !== undefined
					? { actualState: options.currentState }
					: {}),
			}),
		});
	}

	if (!approved) {
		return failedResult({
			plan,
			options,
			risk,
			dryRun,
			totalSteps,
			stage: 'approval-required',
			error: Object.freeze({
				code: 'approval-required',
				step: '<approval>',
				stepIndex: -1,
				cause: new Error('transaction approval is required'),
			}),
		});
	}

	for (const [index, step] of steps.entries()) {
		const ctx = buildStepContext({
			step,
			index,
			totalSteps,
			dryRun,
			completedValues: [...completed.values()],
		});

		try {
			const value = await step.run(ctx);
			completed.set(index, value);
			executedStepNames.push(step.name);
		} catch (cause) {
			// Record the failing step so the LLM sees the full plan.
			executedStepNames.push(step.name);
			const compensations = await compensateAll({
				steps,
				completed,
				failingStep: step.name,
				failingStepIndex: index,
				dryRun,
			});

			return persistReceipt({
				key: idempotencyKey,
				plan,
				options,
				result: Object.freeze({
					ok: false,
					values: Object.freeze([
						...completed.values(),
					]) as readonly T[],
					compensations,
					risk,
					dryRun,
					executedSteps: executedStepNames.length,
					totalSteps,
					receipt: buildReceipt({
						plan,
						options,
						stage: 'failed',
						executedSteps: executedStepNames.length,
						approved,
					}),
					error: Object.freeze({
						code: 'step-failed' as const,
						step: step.name,
						stepIndex: index,
						cause,
					}),
					executedStepNames: Object.freeze(executedStepNames),
				}) as ITransactionResult<T>,
			});
		}
	}

	return persistReceipt({
		key: idempotencyKey,
		plan,
		options,
		result: Object.freeze({
			ok: true,
			values: Object.freeze([...completed.values()]) as readonly T[],
			compensations: Object.freeze([]) as readonly [],
			risk,
			dryRun,
			executedSteps: executedStepNames.length,
			totalSteps,
			receipt: buildReceipt({
				plan,
				options,
				stage: 'executed',
				executedSteps: executedStepNames.length,
				approved,
			}),
			executedStepNames: Object.freeze(executedStepNames),
		}) as ITransactionResult<T>,
	});
};

const buildStepContext = <T>(input: {
	readonly step: IStep<T>;
	readonly index: number;
	readonly totalSteps: number;
	readonly dryRun: boolean;
	readonly completedValues: readonly unknown[];
}): IStepContext =>
	Object.freeze({
		stepName: input.step.name,
		stepIndex: input.index,
		stepCount: input.totalSteps,
		dryRun: input.dryRun,
		priorValues: Object.freeze([...input.completedValues]),
	});
