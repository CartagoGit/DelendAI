/**
 * compute-slot-follow.helper.ts — a caller that joins another's turn of the
 * same unit and tip waits for that turn's result.
 *
 * The claimant writes its result, then takes its claim off. A joiner that
 * read "no result yet" and then "no claim" must not take that for a turn
 * that vanished: the turn may have finished between its two reads, and
 * proving again would run a joined proof twice. With the claim gone the
 * result is read once more; it was written before the claim came off, so it
 * is absent only if the claimant really died.
 */

/** Wait for a joined turn's result; `undefined` when the turn vanished. */
export const followTurn = async <R>(input: {
	readonly readResult: () => Promise<R | undefined>;
	/** Whether the claim followed is still on record, held by a live process. */
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
