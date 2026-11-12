/** Names the slot a process tree already holds. */
export const COMPUTE_SLOT_ENV = 'DELENDAI_COMPUTE_SLOT_HELD';

/** How long a caller yields to the urgent lane before asking the slot again. */
export const LANE_YIELD_MS = 200;

/** What a waiter is told when no owner record names the holder. */
export const NO_RECORDED_HOLDER = 'another run';
