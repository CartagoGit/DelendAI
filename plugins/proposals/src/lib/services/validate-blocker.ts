import type {
	IValidateBlockerDiagnosis,
	IValidateJournalRow,
} from '../contracts/interfaces/validate-blocker.interface';

/**
 * Explain a refused validate gate.
 *
 * The gate has always been correct to refuse; it was never able to say
 * why. "Run `bun run validate`" is the right answer exactly once — when
 * nothing has run. Said to an agent that just ran it and watched it
 * fail, it is an instruction to repeat the thing that did not work, and
 * an agent that follows its tooling does precisely that, forever. In a
 * swarm this is worse than a wasted turn: the whole team is blocked on
 * one red chain, every agent is told the same useless thing, and the
 * proposals nobody can close pile up while everyone keeps busy.
 *
 * So a red journal now answers with the failing step names, which turns
 * "you are blocked" into a list of work — and, when the failures are not
 * this agent's, into a fact worth saying out loud: a shared branch is
 * red, anybody can fix it, and nobody closes anything until someone
 * does.
 *
 * Pure: the caller reads the journal, this decides what it means.
 */

/** Evidence older than this is not evidence about the current tree. */
export const VALIDATE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const timestampOf = (row: IValidateJournalRow): number =>
	Date.parse(row.timestamp ?? row.ts ?? '');

const isPass = (row: IValidateJournalRow): boolean =>
	row.result === 'pass' && (row.exitCode ?? 0) === 0;

/**
 * The newest row with a usable timestamp, or undefined. Generic over the
 * row shape so the transition tool can keep its own stricter entry type
 * and still share the one definition of "most recent".
 */
export const latestValidateRow = <TRow extends IValidateJournalRow>(
	rows: readonly TRow[],
): TRow | undefined => {
	let latest: TRow | undefined;
	let latestMs = Number.NEGATIVE_INFINITY;
	for (const row of rows) {
		const ms = timestampOf(row);
		if (Number.isNaN(ms) || ms <= latestMs) continue;
		latest = row;
		latestMs = ms;
	}
	return latest;
};

const RUN_VALIDATE =
	'Run `bun run validate` (it journals its own evidence; no arguments are needed afterwards).';

const describeSteps = (steps: readonly string[]): string =>
	steps.length === 0
		? 'the run did not record which steps failed — re-run `bun run validate` and read its summary'
		: steps.map((step) => `\`${step}\``).join(', ');

export const diagnoseValidateBlocker = (
	rows: readonly IValidateJournalRow[],
	nowMs: number = Date.now(),
): IValidateBlockerDiagnosis => {
	const latest = latestValidateRow(rows);
	if (latest === undefined) {
		return {
			state: 'never-ran',
			lastRunAt: undefined,
			failedSteps: [],
			reason: 'No validate run has been journalled for this workspace, so there is nothing to check the tree against.',
			nextAction: RUN_VALIDATE,
		};
	}
	const lastRunAt = latest.timestamp ?? latest.ts;
	if (!isPass(latest)) {
		const failedSteps = latest.failedSteps ?? [];
		return {
			state: 'red',
			lastRunAt,
			failedSteps,
			reason: `The most recent validate run (${lastRunAt}) FAILED. Closing tools stay blocked until it is green, and running it again will not change that.`,
			// Deliberately not "run validate". The agent has done that.
			// The only thing that moves this forward is repairing the
			// chain, and in a shared checkout the repair is worth doing
			// even when the breakage is somebody else's — it is blocking
			// every agent, not just this one.
			nextAction: `Fix the failing steps, then re-run \`bun run validate\`. Failing: ${describeSteps(failedSteps)}. If they are not in files you changed, this is shared-branch breakage: it blocks every agent in this workspace, so fix it or hand it to whoever owns those files — do NOT start another slice and do NOT retry this call unchanged.`,
		};
	}
	if (nowMs - timestampOf(latest) > VALIDATE_EVIDENCE_MAX_AGE_MS) {
		return {
			state: 'stale-pass',
			lastRunAt,
			failedSteps: [],
			reason: `The last validate run passed, but at ${lastRunAt} — more than 24h ago, so it says nothing about the tree as it stands now.`,
			nextAction: RUN_VALIDATE,
		};
	}
	// A fresh pass is the caller's own bug: the gate should not have
	// refused. Answer honestly rather than inventing a blocker.
	return {
		state: 'never-ran',
		lastRunAt,
		failedSteps: [],
		reason: `The last validate run passed at ${lastRunAt} and is still fresh; if a gate refused anyway, the evidence it was handed did not come from this journal.`,
		nextAction: RUN_VALIDATE,
	};
};
