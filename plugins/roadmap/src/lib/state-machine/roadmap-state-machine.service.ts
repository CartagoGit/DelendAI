import { ROADMAP_ENTRY_TRANSITIONS } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmapEntryState,
	IRoadmapResult,
} from '../contracts/interfaces/roadmap.interface';

/** The states an entry may move to from `from`. */
export const legalTransitions = (
	from: IRoadmapEntryState,
): readonly IRoadmapEntryState[] =>
	ROADMAP_ENTRY_TRANSITIONS[from] as readonly IRoadmapEntryState[];

/**
 * Checks one move. An illegal move comes back with the reason and the
 * moves that would have been legal, so the caller can show it as is.
 */
export const checkTransition = (
	from: IRoadmapEntryState,
	to: IRoadmapEntryState,
): IRoadmapResult<IRoadmapEntryState> => {
	const allowed = legalTransitions(from);
	if (allowed.includes(to)) return { ok: true, value: to };
	if (from === to) {
		return {
			ok: false,
			reason: `entry is already ${from}; there is nothing to change`,
		};
	}
	const next =
		allowed.length === 0
			? `${from} is an ending and has no way out`
			: `from ${from} it can move to: ${allowed.join(', ')}`;
	return {
		ok: false,
		reason: `cannot move an entry from ${from} to ${to}; ${next}`,
	};
};
