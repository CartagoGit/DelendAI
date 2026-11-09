/**
 * orphan-rescue.ts — the hydrator keeps an orphaned candidate moving, a
 * bounded number of times, and then tells the owner once.
 *
 * A red candidate whose author is gone used to be `author` for good: out
 * of the queue, never brought forward, red forever. The rules of when it
 * is brought forward and when the owner is told live in
 * `planOrphanRescues` (packages/core), so every project's hydrator follows
 * the same ones; this only applies them to the queue's verdicts. Nothing
 * here deletes: a candidate given up on keeps its tip for whoever adopts it.
 */
import { orphanedCandidates, type ICandidateVerdict } from '@delendai/core/cli';
import {
	planOrphanRescues,
	readOrphanRescues,
	writeOrphanRescues,
} from '@delendai/core/runtime';
import type { IAuthorPresence } from '@delendai/core/runtime';

/** Why the author is gone, for the candidate's facts; undefined when not. */
export const authorGoneOf = (
	presence: IAuthorPresence | undefined,
): string | undefined =>
	presence?.orphaned === true && presence.reason !== null
		? `${presence.reason}: ${presence.why}`
		: undefined;

/**
 * The orphans to bring forward on this pass. Counts are kept only when the
 * pass applies, so a read-only run never spends an attempt.
 */
export const rescueOrphans = async (
	root: string,
	verdicts: readonly ICandidateVerdict[],
	behind: ReadonlySet<string>,
	apply: boolean,
): Promise<readonly string[]> => {
	const plan = planOrphanRescues({
		orphaned: orphanedCandidates(verdicts).map((headRef) => ({
			headRef,
			behind: behind.has(headRef),
		})),
		rescues: await readOrphanRescues(root),
	});
	for (const [headRef, step] of plan.steps) {
		if (step === 'report') {
			console.log(
				`refresh-candidate-artifacts: ${headRef} — orphaned and still red after ${String(plan.next.rescues[headRef]?.attempts ?? 0)} attempt(s); no longer brought forward, its tip is kept. The owner is told in \`delendai work status\`; adopt it with \`delendai work claim --ref=${headRef}\`.`,
			);
		}
	}
	if (apply) await writeOrphanRescues(root, plan.next).catch(() => undefined);
	return [...plan.steps.entries()]
		.filter(([, step]) => step === 'bring-forward')
		.map(([headRef]) => headRef);
};
