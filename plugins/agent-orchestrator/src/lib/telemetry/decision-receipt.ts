/**
 * decision-receipt.ts — f00503 S4.
 *
 * What a task was predicted to cost, what it actually cost, and how it
 * ended — one compact record per task.
 *
 * S1 declares the decision, S2 takes it and S3 turns it into a plan.
 * None of them ever finds out whether the decision was any good. A
 * policy that never sees its own results cannot be corrected except by
 * argument, and arguments about a scoring function are unwinnable
 * without measurements. The receipt is that measurement.
 *
 * ## This proposal deliberately stops here
 *
 * There is no learning in this file, and there should not be. Feeding
 * outcomes back into the weights is a separate decision with its own
 * failure modes — a feedback loop that quietly teaches the policy to
 * avoid whatever failed last week is far worse than no loop at all if
 * nobody can see it happening. So this slice produces the corpus and
 * nothing reads it yet. What we owe the future consumer is that the
 * record be honest and complete; what we owe the present is that it
 * cost nothing.
 *
 * ## Features, not prompts
 *
 * A receipt keeps the *shape* of a task — how many files, how many
 * subsystems, which tags, how long the description was — and a digest
 * that lets two runs of the same task be recognised as the same task.
 * It never keeps the description itself. Two reasons, and the second is
 * the one that matters: a corpus of prompts is a liability that grows
 * without bound and leaks whatever the user typed, and a learner fed on
 * prompt text learns to pattern-match wording rather than structure,
 * which is precisely the mistake this whole proposal exists to stop.
 *
 * The same rule strips `detail` off the reasons. A signal's detail is
 * written for a human reading one decision and can quote paths and
 * content; the receipt keeps the code, the direction and the weight,
 * which is all a later analysis can legitimately use.
 *
 * ## An abandoned task is data
 *
 * A receipt is opened when the decision is taken and closed when the
 * work stops, and closing is not optional. If unclosed receipts were
 * simply dropped, the corpus would consist entirely of tasks that ran
 * to completion — every crash, timeout and give-up erased. Survivorship
 * bias is the standard way this kind of dataset goes wrong, and it goes
 * wrong invisibly, so `abandon` exists and records what was spent
 * before the work stopped.
 */
import { createHash } from 'node:crypto';

import type {
	IExecutionDecision,
	ITaskObservation,
	TCeremony,
	TContextMode,
	TExecutionMode,
	TSignalDirection,
	TValidationLevel,
} from '../policy/execution-decision.contract.js';

/**
 * The shape of a task, with nothing anyone typed in it.
 *
 * Everything here is a count, a category or a digest, so a receipt can
 * be kept indefinitely and shared without review.
 */
export interface ITaskFeatures {
	readonly fileCount: number;
	/** Distinct top-level areas the files fall in. */
	readonly subsystemCount: number;
	/** Sorted, so two receipts for the same task compare equal. */
	readonly tags: readonly string[];
	/** Length in words. The text itself is not kept. */
	readonly descriptionWords: number;
	/**
	 * Stable digest of the description, so repeats of one task can be
	 * grouped without storing what it said.
	 */
	readonly digest: string;
}

/** One reason, stripped of anything free-form. */
export interface IReceiptReason {
	readonly code: string;
	readonly direction: TSignalDirection;
	readonly weight: number;
}

/** What the decision committed to before the work started. */
export interface IEstimatedCost {
	readonly agents: number;
	readonly minutes: number;
	readonly reviewers: number;
}

/** What it came to. Tokens are only known afterwards, hence optional. */
export interface IActualCost {
	readonly agents: number;
	readonly minutes: number;
	readonly reviewers: number;
	readonly tokens?: number | undefined;
}

export type TTaskOutcome = 'succeeded' | 'failed' | 'abandoned';

/** A receipt opened at decision time, not yet closed. */
export interface IOpenReceipt {
	readonly taskId: string;
	readonly openedAt: number;
	readonly features: ITaskFeatures;
	readonly ceremony: TCeremony;
	readonly execution: TExecutionMode;
	readonly context: TContextMode;
	readonly validation: TValidationLevel;
	readonly route: string;
	readonly confidence: number;
	readonly estimated: IEstimatedCost;
	readonly reasons: readonly IReceiptReason[];
	/** Codes only: a hard rule that fired is a fact, not a narrative. */
	readonly overrideCodes: readonly string[];
}

export interface IDecisionReceipt extends IOpenReceipt {
	readonly closedAt: number;
	readonly actual: IActualCost;
	readonly outcome: TTaskOutcome;
	/**
	 * Actual over estimated, per axis. Above 1 means the decision
	 * under-provisioned. Kept alongside the raw numbers rather than
	 * instead of them, so a later reader can re-derive it differently.
	 */
	readonly variance: {
		readonly agents: number;
		readonly minutes: number;
		readonly reviewers: number;
	};
}

const WORD = /\S+/gu;

const subsystemOf = (file: string): string => {
	const [first = '', second = ''] = file.split('/');
	// `plugins/foo/...` and `packages/bar/...` are only meaningful two
	// segments deep; anything else is its own top-level area.
	return first === 'plugins' || first === 'packages'
		? `${first}/${second}`
		: first;
};

/**
 * Reduce an observation to the parts a later analysis may keep.
 *
 * This is the only place a task's text is seen, and it leaves as a
 * count and a digest.
 */
export const describeTask = (task: ITaskObservation): ITaskFeatures => ({
	fileCount: task.files.length,
	subsystemCount: new Set(task.files.map(subsystemOf)).size,
	tags: [...task.tags].sort((left, right) => left.localeCompare(right)),
	descriptionWords: task.description.match(WORD)?.length ?? 0,
	digest: createHash('sha256')
		.update(task.description.trim().toLowerCase())
		.digest('hex')
		.slice(0, 16),
});

/**
 * What the decision itself promised.
 *
 * Read off the decision's own budgets rather than passed in, so the
 * estimate a receipt is judged against is necessarily the one the
 * system acted on. An estimate supplied separately would be free to
 * drift from the decision, and the drift would look like accuracy.
 */
export const estimateFrom = (decision: IExecutionDecision): IEstimatedCost => ({
	agents: decision.budgets.maxConcurrentAgents,
	minutes: decision.budgets.maxMinutes,
	reviewers: decision.budgets.reviewQuorum,
});

export const openReceipt = (
	taskId: string,
	task: ITaskObservation,
	decision: IExecutionDecision,
	openedAt: number,
): IOpenReceipt => ({
	taskId,
	openedAt,
	features: describeTask(task),
	ceremony: decision.ceremony,
	execution: decision.execution,
	context: decision.context,
	validation: decision.validation,
	route: decision.route,
	confidence: decision.confidence,
	estimated: estimateFrom(decision),
	reasons: decision.reasons.map((reason) => ({
		code: reason.code,
		direction: reason.direction,
		weight: reason.weight,
	})),
	overrideCodes: decision.overrides.map((override) => override.code),
});

/**
 * Ratio of actual to estimated.
 *
 * An estimate of zero cannot be divided into, and the honest answer is
 * not infinity — it is that no ratio exists. Zero actual against zero
 * estimated is exactly on target, so it reads as 1.
 */
const ratio = (actual: number, estimated: number): number => {
	if (estimated > 0) return actual / estimated;
	return actual === 0 ? 1 : Number.POSITIVE_INFINITY;
};

export const closeReceipt = (
	open: IOpenReceipt,
	actual: IActualCost,
	outcome: TTaskOutcome,
	closedAt: number,
): IDecisionReceipt => ({
	...open,
	closedAt,
	actual,
	outcome,
	variance: {
		agents: ratio(actual.agents, open.estimated.agents),
		minutes: ratio(actual.minutes, open.estimated.minutes),
		reviewers: ratio(actual.reviewers, open.estimated.reviewers),
	},
});

/**
 * Close a receipt for work that stopped without finishing.
 *
 * Kept as its own entry point rather than left to the caller, because
 * the code that abandons a task is usually a timeout or an error path
 * with only partial numbers to hand. Made to say so in one call, it
 * will; made to assemble a full cost first, it will skip the receipt
 * altogether — and the receipts it skips are exactly the ones a later
 * analysis most needs.
 */
export const abandonReceipt = (
	open: IOpenReceipt,
	spent: Partial<IActualCost>,
	closedAt: number,
): IDecisionReceipt =>
	closeReceipt(
		open,
		{
			agents: spent.agents ?? 0,
			minutes: spent.minutes ?? 0,
			reviewers: spent.reviewers ?? 0,
			...(spent.tokens === undefined ? {} : { tokens: spent.tokens }),
		},
		'abandoned',
		closedAt,
	);

export const summarizeReceipt = (receipt: IDecisionReceipt): string =>
	[
		receipt.taskId,
		receipt.ceremony,
		receipt.execution,
		`route=${receipt.route}`,
		`outcome=${receipt.outcome}`,
		`agents=${receipt.actual.agents.toString()}/${receipt.estimated.agents.toString()}`,
		`minutes=${receipt.actual.minutes.toString()}/${receipt.estimated.minutes.toString()}`,
		`confidence=${receipt.confidence.toFixed(2)}`,
	].join(' ');
