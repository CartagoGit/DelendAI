/**
 * recovery-ladder.ts — f00504 S3.
 *
 * What to try when an agent has stopped making progress, in order of
 * increasing cost.
 *
 * The ladder exists because the alternatives are both bad. Doing nothing
 * leaves an agent burning budget on a task it will not finish. Jumping
 * straight to the strongest remedy — rotate the agent, escalate to a more
 * expensive route — spends the most on a situation that a cheaper rung
 * usually fixes: most stalls are an agent carrying too much context, or
 * a blocker it has not re-checked since it started.
 *
 * So the rungs are ordered by what they cost, and each is tried once.
 * Compacting state is nearly free. Re-evaluating a blocker costs a
 * lookup. Changing strategy costs a rethink. Rotating costs a whole
 * agent's context. Escalating costs money. Giving up costs the task, but
 * gives back a diagnosis someone can act on.
 *
 * ## Escalation never buys what the user did not authorise
 *
 * `escalate-route` is the only rung that can spend more than was already
 * committed, and it is skipped entirely unless the permissions say a
 * stronger route is available. A watchdog that could authorise its own
 * spending would be a budget hole with a helpful name.
 *
 * ## Giving up is a real outcome, and it has to be legible
 *
 * The last rung is not a failure of the ladder; it is the ladder working.
 * What matters is that it ends with a compact diagnosis — what was tried,
 * what the blocker was, what a human would need to unblock it — rather
 * than a dump. The number of rungs attempted is carried on the result so
 * the causes of stalls can be learned from later, which is the only way
 * the ladder gets shorter over time.
 */
import type { TProgressState } from './progress-evidence.js';

/** The rungs, cheapest first. Order is the contract. */
export const RECOVERY_LADDER = [
	'compact-state',
	'reevaluate-blocker',
	'change-strategy',
	'alternative-tool',
	'rotate-agent',
	'escalate-route',
	'terminate-blocked',
] as const;

export type TRecoveryRung = (typeof RECOVERY_LADDER)[number];

export interface IRecoveryPermissions {
	/** A stronger route exists AND the configuration authorises paying for it. */
	readonly mayEscalateRoute: boolean;
	/** Rotation is possible — there is another agent to rotate to. */
	readonly mayRotateAgent: boolean;
	/** Rungs already attempted in this recovery, in order. */
	readonly attempted: readonly TRecoveryRung[];
}

export interface IRecoveryDiagnosis {
	readonly state: TProgressState;
	/** What the task said was blocking it, when it said anything. */
	readonly blocker?: string | undefined;
	/** Every rung tried before giving up. */
	readonly attempted: readonly TRecoveryRung[];
	/** What a person would have to do. One line, never a dump. */
	readonly needsFromHuman: string;
}

export interface IRecoveryStep {
	readonly rung: TRecoveryRung;
	/** True only on `terminate-blocked`. */
	readonly isTerminal: boolean;
	readonly reason: string;
	/** How many rungs have been attempted including this one. Learned from. */
	readonly rungsAttempted: number;
	/** Present only when terminal. */
	readonly diagnosis?: IRecoveryDiagnosis | undefined;
}

const isAvailable = (
	rung: TRecoveryRung,
	permissions: IRecoveryPermissions,
): boolean => {
	if (rung === 'escalate-route') return permissions.mayEscalateRoute;
	if (rung === 'rotate-agent') return permissions.mayRotateAgent;
	return true;
};

const explain = (rung: TRecoveryRung): string => {
	switch (rung) {
		case 'compact-state':
			return 'compacting the working state first, because the most common stall is an agent carrying more context than it can use';
		case 'reevaluate-blocker':
			return 're-checking the blocker, which may have cleared since the agent last looked';
		case 'change-strategy':
			return 'trying a different approach to the same goal before spending anything larger';
		case 'alternative-tool':
			return 'reaching for a different tool, in case the one in use cannot express the step';
		case 'rotate-agent':
			return 'handing the task to a fresh agent, which costs a whole context but keeps the work';
		case 'escalate-route':
			return 'moving to a stronger route, the only rung that spends more than was already committed';
		case 'terminate-blocked':
			return 'stopping, because every cheaper remedy has been tried and none moved the task';
	}
};

/**
 * The next rung to try.
 *
 * Skipped rungs are not silently dropped: they are recorded as attempted
 * so the terminal diagnosis shows what was unavailable rather than
 * implying it was tried and failed.
 */
export const nextRecoveryStep = (
	state: TProgressState,
	permissions: IRecoveryPermissions,
	blocker?: string,
): IRecoveryStep => {
	const attempted = [...permissions.attempted];

	for (const rung of RECOVERY_LADDER) {
		if (attempted.includes(rung)) continue;
		if (rung === 'terminate-blocked') break;
		if (!isAvailable(rung, permissions)) {
			// Unavailable, not untried. Recording it keeps the diagnosis
			// honest about what the ladder could actually reach.
			attempted.push(rung);
			continue;
		}
		return {
			rung,
			isTerminal: false,
			reason: explain(rung),
			rungsAttempted: attempted.length + 1,
		};
	}

	const finalAttempts = [...attempted, 'terminate-blocked' as const];
	return {
		rung: 'terminate-blocked',
		isTerminal: true,
		reason: explain('terminate-blocked'),
		rungsAttempted: finalAttempts.length,
		diagnosis: {
			state,
			blocker,
			attempted: finalAttempts,
			needsFromHuman:
				blocker === undefined
					? `the task stopped in state "${state}" with no blocker declared; someone needs to look at what it was trying to do`
					: `the task cannot proceed until this is resolved: ${blocker}`,
		},
	};
};
