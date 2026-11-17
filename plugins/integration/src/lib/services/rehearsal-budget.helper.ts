/**
 * rehearsal-budget.helper.ts — the longest a group of scenarios can take with
 * every wait at its cap, and the await budget and cap that keep it inside the
 * job timeout. The constants the harness runs with are checked against this
 * plan by a spec, so no number is picked by hand.
 */
import {
	REHEARSAL_AWAITS_AT_CAP,
	REHEARSAL_CLEANUP_WAIT_SECONDS,
	REHEARSAL_JOB_MARGIN_MINUTES,
	REHEARSAL_JOB_TIMEOUT_MINUTES,
	REHEARSAL_SCAN_WAIT_CAP_SECONDS,
	REHEARSAL_SETTLE_SECONDS,
	REHEARSAL_STEP_OVERHEAD_SECONDS,
	REHEARSAL_TOKEN_WAIT_SECONDS,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalScenario,
	IRehearsalStep,
} from '../contracts/interfaces/rehearsal.interface';

const SECONDS_PER_MINUTE = 60;

type IBudgetScenario = Pick<IRehearsalScenario, 'steps'>;

/** The seconds of the job timeout a run's worst case may use. */
export const allowedRunSeconds = (): number =>
	(REHEARSAL_JOB_TIMEOUT_MINUTES - REHEARSAL_JOB_MARGIN_MINUTES) *
	SECONDS_PER_MINUTE;

/** Whether a step waits on the forge under the await cap and the scenario's budget. */
export const isAwaiting = (step: IRehearsalStep): boolean =>
	step.kind === 'await' || (step.kind === 'ready' && step.together === true);

/** What a step takes whatever the forge does: its forge calls, and the token wait of a token step. */
const stepFixedSeconds = (step: IRehearsalStep): number =>
	REHEARSAL_STEP_OVERHEAD_SECONDS +
	(step.kind === 'token-push' || step.kind === 'token-open'
		? REHEARSAL_TOKEN_WAIT_SECONDS
		: 0);

/** The seconds of a scenario outside its waits: its steps' own time, then the settle read. */
const scenarioFixedSeconds = (scenario: IBudgetScenario): number =>
	scenario.steps.reduce((sum, step) => sum + stepFixedSeconds(step), 0) +
	REHEARSAL_SETTLE_SECONDS;

const awaitCount = (scenario: IBudgetScenario): number =>
	scenario.steps.filter(isAwaiting).length;

/** The longest a scenario can take: its fixed time, and its waits at the cap but never past the budget. */
const scenarioCapSeconds = (
	scenario: IBudgetScenario,
	awaitCap: number,
	awaitBudget: number,
): number =>
	scenarioFixedSeconds(scenario) +
	Math.min(awaitCount(scenario) * awaitCap, awaitBudget);

/**
 * The longest a run can take with every wait at its cap: with a worker for
 * every scenario the longest scenario, otherwise `limit` workers
 * list-scheduling take at most the mean load plus the longest job's share
 * (Graham's bound); then the one log scan, then the cleanup that waits for
 * the runs in progress.
 */
export const runCapSeconds = (
	scenarios: readonly IBudgetScenario[],
	limit: number,
	awaitCap: number,
	awaitBudget: number,
): number => {
	const caps = scenarios.map((one) =>
		scenarioCapSeconds(one, awaitCap, awaitBudget),
	);
	const sum = caps.reduce((total, one) => total + one, 0);
	const longest = Math.max(...caps);
	const played =
		limit >= scenarios.length
			? longest
			: sum / limit + longest * (1 - 1 / limit);
	return (
		played +
		REHEARSAL_SCAN_WAIT_CAP_SECONDS +
		REHEARSAL_CLEANUP_WAIT_SECONDS
	);
};

/**
 * The largest await budget, in whole seconds, every scenario of the group
 * can spend in all its waits and still end inside the allowance, and the
 * cap of one wait: the budget shared by the waits that may each take it.
 */
export const planGroupBudget = (
	group: readonly IBudgetScenario[],
): { readonly awaitBudget: number; readonly awaitCap: number } => {
	const awaitBudget = Math.floor(
		Math.min(
			...group.map(
				(one) =>
					allowedRunSeconds() -
					REHEARSAL_SCAN_WAIT_CAP_SECONDS -
					REHEARSAL_CLEANUP_WAIT_SECONDS -
					scenarioFixedSeconds(one),
			),
		),
	);
	return {
		awaitBudget,
		awaitCap: Math.floor(awaitBudget / REHEARSAL_AWAITS_AT_CAP),
	};
};
