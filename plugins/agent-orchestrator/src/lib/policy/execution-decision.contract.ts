/**
 * execution-decision.contract.ts — f00503 S1.
 *
 * One decision per task, taken once, consumed by everyone.
 *
 * Today the same task gets classified independently in several places —
 * proposals, the orchestrator, context selection, the validation policy,
 * the model selectors — and nothing makes those answers agree. They can
 * and do diverge, each one re-derives what the others already worked out,
 * and every new consumer multiplies the maintenance.
 *
 * The expensive symptom is disproportionate ceremony. A typo walks the
 * whole proposal cycle, whose creation and upkeep cost more than the fix;
 * meanwhile there is no middle path at all for the change that touches
 * five files and decides nothing architectural. The missing intelligence
 * is not doing more. It is knowing how much process a task deserves.
 *
 * This file is the vocabulary, not the judgement. It declares what a
 * decision IS and how the evidence behind it is gathered; `f00503 S2`
 * supplies the rules that score it. Keeping them apart matters, because
 * the decision is meant to be read by plugins that must not depend on
 * whoever produced it.
 *
 * ## Why signals are registered rather than hard-coded
 *
 * The obvious implementation is a chain of ifs over a task. It does not
 * survive contact with the system: every plugin that learns something new
 * about risk — the storm detector knowing this area is failing, the
 * proposal store knowing this file is contended, the watchdog knowing the
 * last three attempts stalled — would have to edit that chain. So the
 * evidence is a registry of named sources. A plugin contributes what it
 * knows and the policy stays closed for modification, which is the same
 * seam the mode registry already uses in this package.
 *
 * ## Why every decision carries its reasons
 *
 * A number nobody can argue with is a number nobody can fix. `reasons`
 * are structured codes with the observation behind them, so a decision
 * that sends a trivial change down the proposal path can be inspected and
 * corrected instead of merely resented. They are codes and measurements —
 * never model reasoning.
 */

/** How much process a task deserves. The central output. */
export type TCeremony = 'direct' | 'light-plan' | 'proposal';

/** What the orchestrator is asked to run. It still owns the mechanism. */
export type TExecutionMode = 'single' | 'linear' | 'swarm';

/** How much of the codebase to pull in before starting. */
export type TContextMode = 'minimal' | 'focused' | 'broad';

/** How much proof the result needs before it counts as done. */
export type TValidationLevel = 'none' | 'targeted' | 'package' | 'full';

/** How long the answer to the user should be. */
export type TResponseLength = 'terse' | 'normal' | 'detailed';

/**
 * Which way a signal argues. A signal never decides anything by itself;
 * it says what it saw and how hard it pushes.
 */
export type TSignalDirection = 'toward-ceremony' | 'toward-directness';

export interface IExecutionSignal {
	/** Stable identifier of the source, e.g. `public-contract-touched`. */
	readonly code: string;
	readonly direction: TSignalDirection;
	/**
	 * 0..1 — how strongly this observation argues. A source that is
	 * unsure says so here instead of abstaining, so the weakness stays
	 * visible in the reasons.
	 */
	readonly weight: number;
	/** What was actually observed, in terms a human can check. */
	readonly detail: string;
}

/**
 * A hard rule. Some things are not tradeable against a score: crossing a
 * security boundary earns a proposal even if every other signal says the
 * change is one line. A source raises this instead of an enormous weight,
 * so the override is legible rather than hidden inside arithmetic.
 */
export interface IExecutionOverride {
	readonly code: string;
	readonly forces: TCeremony;
	readonly detail: string;
}

/** What a source is shown. Facts only — no verdicts. */
export interface ITaskObservation {
	readonly description: string;
	/** Files the task is expected to touch, when known. */
	readonly files: readonly string[];
	/** Free-form tags the host attached. */
	readonly tags: readonly string[];
	/** Anything a plugin wants to pass along, read only by its own source. */
	readonly facts?: Readonly<Record<string, unknown>> | undefined;
}

export interface ISignalContribution {
	readonly signals: readonly IExecutionSignal[];
	readonly overrides: readonly IExecutionOverride[];
}

export const EMPTY_CONTRIBUTION: ISignalContribution = {
	signals: [],
	overrides: [],
};

/**
 * A plugin's contribution of evidence. Pure and cheap: it is called on
 * every decision, so it must not do I/O. Anything expensive belongs in
 * the `facts` the host gathered before asking.
 */
export interface ISignalSource {
	readonly id: string;
	observe(task: ITaskObservation): ISignalContribution;
}

export class DuplicateSignalSourceError extends Error {
	readonly sourceId: string;
	constructor(sourceId: string) {
		super(
			`a signal source with id "${sourceId}" is already registered; ids must be unique so a decision's reasons can be traced back to exactly one source`,
		);
		this.name = 'DuplicateSignalSourceError';
		this.sourceId = sourceId;
	}
}

/**
 * The extension seam. Registering is how a plugin teaches the policy
 * something, and it is the only way — there is no branch to edit.
 */
export class SignalRegistry {
	private readonly sources = new Map<string, ISignalSource>();

	register(source: ISignalSource): this {
		if (this.sources.has(source.id)) {
			throw new DuplicateSignalSourceError(source.id);
		}
		this.sources.set(source.id, source);
		return this;
	}

	has(id: string): boolean {
		return this.sources.has(id);
	}

	get size(): number {
		return this.sources.size;
	}

	/** Registration order, so a decision replays identically. */
	ids(): readonly string[] {
		return [...this.sources.keys()];
	}

	/**
	 * Every source's view of one task.
	 *
	 * A source that throws is dropped with a signal recording that it
	 * did, rather than taking the decision down with it: losing one
	 * plugin's opinion should cost precision, not the ability to decide
	 * at all. The failure stays visible in the reasons.
	 */
	collect(task: ITaskObservation): ISignalContribution {
		const signals: IExecutionSignal[] = [];
		const overrides: IExecutionOverride[] = [];
		for (const [id, source] of this.sources) {
			try {
				const contribution = source.observe(task);
				signals.push(...contribution.signals);
				overrides.push(...contribution.overrides);
			} catch (error: unknown) {
				signals.push({
					code: 'signal-source-failed',
					direction: 'toward-ceremony',
					weight: 0.2,
					detail: `source "${id}" threw and was skipped (${error instanceof Error ? error.message : 'unknown error'}); the decision is less informed than it should be`,
				});
			}
		}
		return { signals, overrides };
	}
}

export interface IExecutionBudgets {
	/** Upper bound on agents this task may occupy at once. */
	readonly maxConcurrentAgents: number;
	/** How many independent reviewers must approve. f00508 reads this. */
	readonly reviewQuorum: number;
	/** Wall-clock ceiling before the watchdog escalates. f00504 reads this. */
	readonly maxMinutes: number;
}

/**
 * The canonical decision. Serializable by construction: no functions, no
 * classes, no dates — so any consumer can read one without knowing, or
 * caring, which plugin produced it.
 */
export interface IExecutionDecision {
	readonly ceremony: TCeremony;
	readonly execution: TExecutionMode;
	readonly context: TContextMode;
	readonly validation: TValidationLevel;
	readonly response: TResponseLength;
	/** Named route the request should take. Priced by f00507. */
	readonly route: string;
	readonly budgets: IExecutionBudgets;
	/** 0..1. Low confidence is a reason to ask, not to guess louder. */
	readonly confidence: number;
	readonly reasons: readonly IExecutionSignal[];
	/** The hard rules that fired, if any. Empty when the score decided. */
	readonly overrides: readonly IExecutionOverride[];
}

const CEREMONIES: ReadonlySet<string> = new Set([
	'direct',
	'light-plan',
	'proposal',
]);
const EXECUTIONS: ReadonlySet<string> = new Set(['single', 'linear', 'swarm']);
const CONTEXTS: ReadonlySet<string> = new Set(['minimal', 'focused', 'broad']);
const VALIDATIONS: ReadonlySet<string> = new Set([
	'none',
	'targeted',
	'package',
	'full',
]);
const RESPONSES: ReadonlySet<string> = new Set(['terse', 'normal', 'detailed']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const inSet = (value: unknown, allowed: ReadonlySet<string>): value is string =>
	typeof value === 'string' && allowed.has(value);

const isSignal = (value: unknown): value is IExecutionSignal =>
	isRecord(value) &&
	typeof value.code === 'string' &&
	(value.direction === 'toward-ceremony' ||
		value.direction === 'toward-directness') &&
	typeof value.weight === 'number' &&
	typeof value.detail === 'string';

const isOverride = (value: unknown): value is IExecutionOverride =>
	isRecord(value) &&
	typeof value.code === 'string' &&
	inSet(value.forces, CEREMONIES) &&
	typeof value.detail === 'string';

/**
 * Whether an arbitrary value is a decision this system can act on.
 *
 * A decision may arrive from another process, another plugin or a cache
 * written by an older version, so it is checked rather than trusted:
 * acting on a malformed one would spend agents and budget on a shape
 * nobody meant.
 */
export const isExecutionDecision = (
	value: unknown,
): value is IExecutionDecision => {
	if (!isRecord(value)) return false;
	if (!inSet(value.ceremony, CEREMONIES)) return false;
	if (!inSet(value.execution, EXECUTIONS)) return false;
	if (!inSet(value.context, CONTEXTS)) return false;
	if (!inSet(value.validation, VALIDATIONS)) return false;
	if (!inSet(value.response, RESPONSES)) return false;
	if (typeof value.route !== 'string' || value.route.length === 0) {
		return false;
	}
	if (typeof value.confidence !== 'number') return false;
	if (value.confidence < 0 || value.confidence > 1) return false;
	if (!isRecord(value.budgets)) return false;
	const budgets = value.budgets;
	if (
		typeof budgets.maxConcurrentAgents !== 'number' ||
		typeof budgets.reviewQuorum !== 'number' ||
		typeof budgets.maxMinutes !== 'number'
	) {
		return false;
	}
	if (!Array.isArray(value.reasons) || !value.reasons.every(isSignal)) {
		return false;
	}
	return Array.isArray(value.overrides) && value.overrides.every(isOverride);
};

/**
 * The decision to fall back to when nothing is known.
 *
 * It is deliberately the cheap one. An unknown task is far more often
 * small than architectural, and the failure modes are not symmetric:
 * treating a small change as large wastes a session and annoys the user
 * every single time, while treating a large change as small is caught by
 * the hard rules in S2 that no score can outvote. Confidence says out
 * loud that nothing informed this.
 */
export const UNDECIDED: IExecutionDecision = {
	ceremony: 'direct',
	execution: 'single',
	context: 'focused',
	validation: 'targeted',
	response: 'normal',
	route: 'default',
	budgets: { maxConcurrentAgents: 1, reviewQuorum: 1, maxMinutes: 30 },
	confidence: 0,
	reasons: [
		{
			code: 'no-signals',
			direction: 'toward-directness',
			weight: 0,
			detail: 'no signal source contributed, so this is the default and not a judgement about this task',
		},
	],
	overrides: [],
};
