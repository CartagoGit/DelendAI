/**
 * in-progress-work-refs.helper.ts — a work ref whose proposal is in
 * progress is never reaped from the forge, whatever its publication holds.
 *
 * In progress is the one state that keeps a work branch: the proposal's
 * next slice is committed on it, and leaving the state is what publishes
 * the rest and ends it. The queue job deleted the wip of f00761 the
 * moment its pull request for S2–S4 merged, "its content is already in"
 * the publication, while S5 was still to do; the unit on the machine
 * that held it went with it.
 */
/**
 * Splits `reapable` into what may go and the work refs kept because
 * their proposal is in progress at their tip.
 */
export const keepInProgressWorkRefs = <
	TVerdict extends { readonly name: string },
>(input: {
	readonly reapable: readonly TVerdict[];
	/** The work-ref prefix as it appears in a branch name. */
	readonly workPrefix: string;
	/** The proposal id a work ref names. */
	readonly idOf: (name: string) => string | undefined;
	readonly tipOf: (name: string) => string | undefined;
	/** Whether proposal `id` is in progress in the tree of `sha`. */
	readonly inProgressAt: (id: string, sha: string) => boolean;
}): {
	readonly reapable: readonly TVerdict[];
	readonly kept: readonly TVerdict[];
} => {
	const reapable: TVerdict[] = [];
	const kept: TVerdict[] = [];
	for (const verdict of input.reapable) {
		const id = verdict.name.startsWith(input.workPrefix)
			? input.idOf(verdict.name)
			: undefined;
		const tip = id === undefined ? undefined : input.tipOf(verdict.name);
		if (
			id !== undefined &&
			tip !== undefined &&
			input.inProgressAt(id, tip)
		)
			kept.push(verdict);
		else reapable.push(verdict);
	}
	return { reapable, kept };
};
