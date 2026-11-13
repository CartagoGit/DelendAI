/**
 * Why the validate gate is refusing, in terms an agent can act on.
 *
 * The gate itself is right: `close_slice` and `proposal_transition` must
 * not act on a tree whose validation chain is red. What was wrong is
 * that it could only say one thing. A journal with no entries, a journal
 * whose last pass has aged out, and a journal recording a run that just
 * failed all resolved to "no evidence" and all answered `bun run
 * validate`. In the second and third cases the agent has already done
 * exactly that. It runs it again, gets the identical refusal, and loops
 * — the failure this whole subsystem exists to prevent, produced by the
 * gate meant to prevent it.
 *
 * Three states, three different next steps.
 */
export type IValidateBlockerState =
	/** Nothing in the journal. Running validate is genuinely the fix. */
	| 'never-ran'
	/** The last run passed, but too long ago to still be evidence. */
	| 'stale-pass'
	/** The last run failed. Running it again changes nothing. */
	| 'red';

export interface IValidateBlockerDiagnosis {
	readonly state: IValidateBlockerState;
	/** ISO timestamp of the most recent run, when there was one. */
	readonly lastRunAt: string | undefined;
	/** The steps that failed, when the journal recorded them. */
	readonly failedSteps: readonly string[];
	/** One sentence stating what is actually true right now. */
	readonly reason: string;
	/** The next call. Only `never-ran` and `stale-pass` say "run validate". */
	readonly nextAction: string;
}

/** The journal rows this diagnosis reads. Extra fields are ignored. */
export interface IValidateJournalRow {
	readonly timestamp?: string | undefined;
	readonly ts?: string | undefined;
	readonly result?: string | undefined;
	readonly exitCode?: number | undefined;
	readonly failedSteps?: readonly string[] | undefined;
}
