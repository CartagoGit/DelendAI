/**
 * silent-work-refs.ts — a work ref nobody has pushed to for longer than a
 * unit is given, and that was never published, is retired by the queue.
 *
 * `work doctor` reported such refs as hanging, with "publish the unit or
 * retire it" for a remedy, and its author was a session that had ended:
 * after the swarm of 2026-10-11 four of them failed the queue's own check
 * on every pass for eight hours, and the proposals they had claimed stayed
 * out of every other reviewer's reach. Retiring keeps the tip where
 * `work retired` lists it; nothing is deleted that is not kept first.
 */
import { abandonedAfterSeconds } from '@delendai/core/lib/work-units/forge-work-refs.service';

export interface IDatedWorkRef {
	readonly name: string;
	/** Its tip's commit time, in seconds since the epoch. */
	readonly committedAt: number;
	/** Its publication is on the forge: the landing settles it. */
	readonly published: boolean;
}

/** The work refs to retire, each with how long it has been silent. */
export const silentWorkRefs = (input: {
	readonly refs: readonly IDatedWorkRef[];
	readonly leaseTtlMinutes: number;
	readonly now: number;
}): readonly { readonly name: string; readonly hours: number }[] => {
	const limit = abandonedAfterSeconds(input.leaseTtlMinutes);
	return input.refs
		.filter(
			(ref) =>
				!ref.published &&
				Number.isFinite(ref.committedAt) &&
				ref.committedAt > 0 &&
				input.now - ref.committedAt > limit,
		)
		.map((ref) => ({
			name: ref.name,
			hours: Math.round((input.now - ref.committedAt) / 3600),
		}));
};
