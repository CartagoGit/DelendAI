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
 *
 * Which reading says "in progress" is the one rule for a work ref's life,
 * not this file's: a ref whose work landed on the integration branch is
 * judged by the integration branch, so a landed tip that still says "in
 * progress" no longer keeps the ref of a proposal closed elsewhere.
 */
import { workRefProposalOpen } from '@delendai/core/lib/work-units/work-ref-lifecycle.service';

/**
 * Splits `reapable` into what may go and the work refs kept because the
 * work-ref rule holds their proposal open.
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
	/** The integration branch's tip. */
	readonly integration: string;
	/** Whether the integration branch contains `sha`. */
	readonly landed: (sha: string) => boolean;
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
			workRefProposalOpen({
				landed: input.landed(tip),
				openAtTip: input.inProgressAt(id, tip),
				openOnIntegration: input.inProgressAt(id, input.integration),
			})
		)
			kept.push(verdict);
		else reapable.push(verdict);
	}
	return { reapable, kept };
};

/**
 * Whether proposal `id` is in progress, from the names a read of the
 * in-progress folder at a tip returns. Only a read the forge answered
 * with 404 (no such folder) says no; any other failure (a rate limit, the
 * network) cannot tell, and a ref that cannot be told about is kept: the
 * queue job deleted f00763's work branch on 2026-10-14 when one read
 * failed, while the run before had kept it.
 */
export const inProgressOrUnknown = (
	id: string,
	read: () => readonly string[],
): boolean => {
	try {
		return read().some((file) => file.startsWith(`${id}-`));
	} catch (error) {
		const said = `${String((error as { stderr?: unknown }).stderr ?? '')} ${error instanceof Error ? error.message : String(error)}`;
		return !/\b404\b|Not Found/u.test(said);
	}
};

/**
 * `read`, run at most once: later calls answer what the first one did,
 * its failure included, so a tree every ref asks about is read once.
 */
export const onceRead = <TValue>(read: () => TValue): (() => TValue) => {
	let outcome:
		| { readonly value: TValue }
		| { readonly error: unknown }
		| undefined;
	return () => {
		if (outcome === undefined) {
			try {
				outcome = { value: read() };
			} catch (error) {
				outcome = { error };
			}
		}
		if ('error' in outcome) throw outcome.error;
		return outcome.value;
	};
};
