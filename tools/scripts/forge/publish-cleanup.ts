/**
 * Removing a published work branch, one verifiable step at a time.
 *
 * The removal used to be a straight sequence of git calls. When one threw,
 * the process stopped mid-handoff: the publication ref existed, the remote
 * work branch was already gone, and the local worktree, the local branch
 * and the pull request were silently never reached. Each step now runs on
 * its own, a step that threw is checked against git before it is called a
 * failure, and whatever really remains is reported with the command that
 * finishes it.
 */
import type {
	ICleanupOutcome,
	ICleanupStep,
} from './publish-candidate.interface';

const firstLine = (error: unknown): string =>
	(error instanceof Error ? error.message : String(error)).split('\n')[0] ??
	'failed';

/** Run every step, whatever the earlier ones did. */
export const runCleanupSteps = (
	steps: readonly ICleanupStep[],
): ICleanupOutcome => {
	const done: string[] = [];
	const remaining: Array<{ label: string; reason: string; remedy: string }> =
		[];
	for (const step of steps) {
		try {
			step.run();
			done.push(step.doneMessage);
		} catch (error) {
			let verified = false;
			try {
				verified = step.isDone();
			} catch {
				verified = false;
			}
			if (verified) {
				done.push(step.doneMessage);
			} else {
				remaining.push({
					label: step.label,
					reason: firstLine(error),
					remedy: step.remedy,
				});
			}
		}
	}
	return { done, remaining };
};

/** The report lines for an outcome: what was removed, what is left and how. */
export const describeCleanup = (outcome: ICleanupOutcome): string[] => [
	...outcome.done.map((message) => `✓ forge:publish — ${message}`),
	...outcome.remaining.flatMap((step) => [
		`! forge:publish — could not remove ${step.label}: ${step.reason}`,
		`  next-action: ${step.remedy}`,
	]),
];
