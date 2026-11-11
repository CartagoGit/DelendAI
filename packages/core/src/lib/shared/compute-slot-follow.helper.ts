/**
 * compute-slot-follow.helper.ts — a caller that joins another's turn of the
 * same unit and tip waits for that turn's result.
 *
 * The claimant writes its result, then takes its claim off. A joiner that
 * read "no result yet" and then "no claim" took that for a turn that
 * vanished and ran the proof a second time, when the turn had only just
 * finished between its two reads: a joined proof ran twice (seen in CI as
 * `[2, 1]` where `[1, 1]` was expected). With its claim gone, the result is
 * read once more: written before the claim came off, it is there if the
 * turn finished, and absent only if the claimant really died.
 */

/** Wait for a joined turn's result; `undefined` when the turn vanished. */
export const followTurn = async <R>(input: {
	readonly readResult: () => Promise<R | undefined>;
	/** Whether the claim followed is still the one on record, held by a live process. */
	readonly claimHeld: () => Promise<boolean>;
	readonly pause: () => Promise<void>;
}): Promise<R | undefined> => {
	for (;;) {
		const result = await input.readResult();
		if (result !== undefined) return result;
		if (!(await input.claimHeld())) return input.readResult();
		await input.pause();
	}
};
