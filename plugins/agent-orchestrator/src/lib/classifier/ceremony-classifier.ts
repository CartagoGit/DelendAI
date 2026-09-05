/**
 * ceremony-classifier.ts — f00503 S2.
 *
 * Turns the registered signals into one decision: how much process this
 * task deserves.
 *
 * The scoring is deliberately boring — signals pushing toward ceremony
 * minus signals pushing toward directness, normalised by the evidence
 * actually gathered. What makes it trustworthy is not the arithmetic; it
 * is the two things wrapped around it.
 *
 * ## Hard rules are not tradeable
 *
 * Some properties do not get to be outvoted by a pile of small
 * observations. Crossing a security boundary, migrating a persisted
 * format, or changing a public contract earns a proposal even when the
 * diff is one line — because the cost of being wrong is not proportional
 * to the size of the change. Equally, a single local reversible file with
 * an identified regression is direct even if the description happens to
 * contain the word "refactor". Overrides are applied before the score is
 * consulted, and they are named in the reasons, so an operator can see
 * that the score never got a vote rather than wondering why it lost.
 *
 * When two overrides disagree, the more careful one wins. This is the one
 * place the classifier is deliberately not symmetric: an unnecessary
 * proposal costs a session, and a missing one costs the thing the rule
 * was protecting.
 *
 * ## Confidence is not the score
 *
 * A task can score clearly toward `proposal` on one weak signal. That is
 * a confident-looking number resting on almost nothing, and reporting it
 * as confident is how a system earns distrust. Confidence here measures
 * how much evidence there was and how much it agreed — so thin or
 * conflicting evidence lowers it even when the verdict is lopsided. A low
 * confidence is a reason to ask the user, which is what `f00504` and the
 * router are meant to do with it.
 */
import type {
	IExecutionBudgets,
	IExecutionDecision,
	IExecutionOverride,
	IExecutionSignal,
	ISignalContribution,
	TCeremony,
	TContextMode,
	TExecutionMode,
	TResponseLength,
	TValidationLevel,
} from '../policy/execution-decision.contract.js';

/** More careful first. Used to resolve disagreeing hard rules. */
const CEREMONY_ORDER: readonly TCeremony[] = [
	'proposal',
	'light-plan',
	'direct',
];

const careOf = (ceremony: TCeremony): number =>
	CEREMONY_ORDER.indexOf(ceremony);

/** What the user's configuration allows, when it constrains anything. */
export interface ICeremonyLimits {
	/** Never spend more agents than this, whatever the task looks like. */
	readonly maxConcurrentAgents?: number | undefined;
	/** Force a quorum, overriding what risk would have chosen. */
	readonly reviewQuorum?: number | undefined;
	/** The route the host wants used. */
	readonly route?: string | undefined;
}

const sum = (signals: readonly IExecutionSignal[]): number =>
	signals.reduce((total, signal) => total + Math.max(0, signal.weight), 0);

/**
 * The strongest hard rule, if any fired.
 *
 * Ties break toward care, which is the asymmetry the module header
 * explains: the two mistakes do not cost the same.
 */
const decisiveOverride = (
	overrides: readonly IExecutionOverride[],
): IExecutionOverride | undefined => {
	let winner: IExecutionOverride | undefined;
	for (const override of overrides) {
		if (
			winner === undefined ||
			careOf(override.forces) < careOf(winner.forces)
		) {
			winner = override;
		}
	}
	return winner;
};

/** Score in -1..1. Positive argues for ceremony. */
export const ceremonyScore = (signals: readonly IExecutionSignal[]): number => {
	const toward = sum(
		signals.filter((signal) => signal.direction === 'toward-ceremony'),
	);
	const against = sum(
		signals.filter((signal) => signal.direction === 'toward-directness'),
	);
	const total = toward + against;
	return total === 0 ? 0 : (toward - against) / total;
};

const PROPOSAL_AT = 0.5;
const LIGHT_PLAN_AT = 0.1;

const ceremonyFromScore = (score: number): TCeremony => {
	if (score >= PROPOSAL_AT) return 'proposal';
	if (score >= LIGHT_PLAN_AT) return 'light-plan';
	return 'direct';
};

/**
 * How much this verdict can be relied on.
 *
 * Two things lower it independently: thin evidence (few signals, or weak
 * ones) and disagreement (signals pulling both ways). Either alone is
 * enough to make a lopsided score untrustworthy.
 */
export const decisionConfidence = (
	signals: readonly IExecutionSignal[],
	overrides: readonly IExecutionOverride[] = [],
): number => {
	// A hard rule that fired is the most certain thing the system knows:
	// it did not weigh anything, it recognised a boundary. Scoring only
	// the signals reported a decision forced by a security boundary, with
	// no signals to weigh, as confidence 0 — and the contract says low
	// confidence is a reason to ask. That reported the most certain
	// decision in the system as the least trustworthy one.
	if (overrides.length > 0) {
		const forced = new Set(overrides.map((override) => override.forces));
		// Two rules demanding different ceremonies is not certainty, it is
		// a conflict, and it falls back to what the evidence says.
		if (forced.size === 1) return 1;
	}
	if (signals.length === 0) return 0;
	const mass = sum(signals);
	if (mass === 0) return 0;
	// Evidence saturates: three solid signals is informed, thirty is not
	// ten times more informed.
	const evidence = Math.min(1, mass / 2);
	const agreement = Math.abs(ceremonyScore(signals));
	return Number((evidence * (0.4 + 0.6 * agreement)).toFixed(4));
};

const EXECUTION_FOR: Readonly<Record<TCeremony, TExecutionMode>> = {
	direct: 'single',
	'light-plan': 'single',
	proposal: 'linear',
};

const CONTEXT_FOR: Readonly<Record<TCeremony, TContextMode>> = {
	direct: 'minimal',
	'light-plan': 'focused',
	proposal: 'broad',
};

const VALIDATION_FOR: Readonly<Record<TCeremony, TValidationLevel>> = {
	direct: 'targeted',
	'light-plan': 'package',
	proposal: 'full',
};

const RESPONSE_FOR: Readonly<Record<TCeremony, TResponseLength>> = {
	direct: 'terse',
	'light-plan': 'normal',
	proposal: 'detailed',
};

/**
 * Reviewers needed, by how much is at stake — this is what `f00508`
 * reads.
 *
 * A `direct` task gets one reviewer, exactly as today: a second reviewer
 * on a typo is another agent, another context and another chance for the
 * round to stall, bought for nothing. A `proposal` gets two, because
 * that is where a shared blind spot between implementer and reviewer
 * actually costs something. Three is reserved for a hard rule firing —
 * security, a persisted migration, a public contract — where the panel is
 * the cheapest part of being wrong.
 */
export const quorumFor = (
	ceremony: TCeremony,
	hasHardOverride: boolean,
): number => {
	if (hasHardOverride && ceremony === 'proposal') return 3;
	return ceremony === 'proposal' ? 2 : 1;
};

const budgetsFor = (
	ceremony: TCeremony,
	hasHardOverride: boolean,
	limits: ICeremonyLimits,
): IExecutionBudgets => {
	const agents = ceremony === 'proposal' ? 3 : 1;
	const minutes =
		ceremony === 'proposal' ? 120 : ceremony === 'light-plan' ? 45 : 15;
	return {
		// The user's ceiling is a ceiling, never a target to be raised to.
		maxConcurrentAgents: Math.min(
			agents,
			limits.maxConcurrentAgents ?? agents,
		),
		reviewQuorum:
			limits.reviewQuorum ?? quorumFor(ceremony, hasHardOverride),
		maxMinutes: minutes,
	};
};

export const classifyCeremony = (
	contribution: ISignalContribution,
	limits: ICeremonyLimits = {},
): IExecutionDecision => {
	const { signals, overrides } = contribution;
	const override = decisiveOverride(overrides);
	const score = ceremonyScore(signals);
	const scored = ceremonyFromScore(score);
	const ceremony = override?.forces ?? scored;

	const reasons: IExecutionSignal[] = [...signals];
	if (override !== undefined) {
		reasons.unshift({
			code: `override:${override.code}`,
			direction:
				override.forces === 'direct'
					? 'toward-directness'
					: 'toward-ceremony',
			weight: 1,
			detail: `${override.detail} — this is a hard rule, so the score (${score.toFixed(2)}, which alone would have chosen "${scored}") did not get a vote`,
		});
	} else {
		reasons.unshift({
			code: 'score',
			direction: score >= 0 ? 'toward-ceremony' : 'toward-directness',
			weight: Math.abs(score),
			detail: `weighted signals scored ${score.toFixed(2)}, which selects "${scored}" (proposal at ${PROPOSAL_AT.toString()}, light-plan at ${LIGHT_PLAN_AT.toString()})`,
		});
	}

	const hasHardOverride =
		override !== undefined && override.forces === 'proposal';

	return {
		ceremony,
		execution: EXECUTION_FOR[ceremony],
		context: CONTEXT_FOR[ceremony],
		validation: VALIDATION_FOR[ceremony],
		response: RESPONSE_FOR[ceremony],
		route: limits.route ?? 'default',
		budgets: budgetsFor(ceremony, hasHardOverride, limits),
		confidence: decisionConfidence(signals, overrides),
		reasons,
		overrides: [...overrides],
	};
};
