/**
 * rehearsal-budget.helper.ts — the longest a rehearsal run can take with
 * every wait at its cap, and the await cap and concurrency that keep it
 * inside the job timeout. The constants the harness runs with are checked
 * against this plan by a spec, so no number is picked by hand.
 */
import {
	REHEARSAL_AWAIT_MIN_SECONDS,
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

/** The seconds of the job timeout a run's worst case may use. */
export const allowedRunSeconds = (): number =>
	(REHEARSAL_JOB_TIMEOUT_MINUTES - REHEARSAL_JOB_MARGIN_MINUTES) *
	SECONDS_PER_MINUTE;

/** The longest a step can take: its own wait cap plus the allowance for its forge calls. */
const stepCapSeconds = (step: IRehearsalStep, awaitCap: number): number =>
	REHEARSAL_STEP_OVERHEAD_SECONDS +
	(step.kind === 'await'
		? awaitCap
		: step.kind === 'token-push' || step.kind === 'token-open'
			? REHEARSAL_TOKEN_WAIT_SECONDS
			: 0);

/** The longest a scenario can take: every step at its cap, then the settle read. */
const scenarioCapSeconds = (
	scenario: Pick<IRehearsalScenario, 'steps'>,
	awaitCap: number,
): number =>
	scenario.steps.reduce(
		(sum, step) => sum + stepCapSeconds(step, awaitCap),
		0,
	) + REHEARSAL_SETTLE_SECONDS;

/**
 * The longest a run can take with every wait at its cap: `limit` workers
 * list-scheduling the scenarios take at most the mean load plus the longest
 * job's share (Graham's bound), then the one log scan, then the cleanup that
 * waits for the runs in progress.
 */
export const runCapSeconds = (
	scenarios: readonly Pick<IRehearsalScenario, 'steps'>[],
	limit: number,
	awaitCap: number,
): number => {
	const caps = scenarios.map((one) => scenarioCapSeconds(one, awaitCap));
	const sum = caps.reduce((total, one) => total + one, 0);
	const width = Math.min(limit, scenarios.length);
	return (
		sum / width +
		Math.max(...caps) * (1 - 1 / width) +
		REHEARSAL_SCAN_WAIT_CAP_SECONDS +
		REHEARSAL_CLEANUP_WAIT_SECONDS
	);
};

/** The largest await cap, in whole seconds, whose worst case fits the allowance at `limit` workers. */
export const largestAwaitCap = (
	scenarios: readonly Pick<IRehearsalScenario, 'steps'>[],
	limit: number,
): number => {
	let cap = 0;
	while (runCapSeconds(scenarios, limit, cap + 1) <= allowedRunSeconds())
		cap += 1;
	return cap;
};

/**
 * The await cap and the concurrency: the largest cap at `start` workers, or,
 * when that is under the least cap a pull request needs to merge, the
 * fewest workers that allow the least cap, with the largest cap they allow.
 */
export const planRehearsalBudget = (
	scenarios: readonly Pick<IRehearsalScenario, 'steps'>[],
	start: number,
): { readonly concurrency: number; readonly awaitCap: number } => {
	let concurrency = start;
	while (
		largestAwaitCap(scenarios, concurrency) < REHEARSAL_AWAIT_MIN_SECONDS &&
		concurrency < scenarios.length
	)
		concurrency += 1;
	return { concurrency, awaitCap: largestAwaitCap(scenarios, concurrency) };
};
