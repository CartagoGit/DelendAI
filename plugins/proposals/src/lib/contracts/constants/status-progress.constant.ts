import type { IProposalStatus } from './proposal-glossary.constant';

/** How far along the state machine each status is; a later one wins a tie. */
export const STATUS_PROGRESS: Readonly<Record<IProposalStatus, number>> = {
	ready: 0,
	blocked: 1,
	paused: 1,
	'in-progress': 2,
	review: 3,
	done: 4,
	retired: 5,
};
