/** How long one `close_slice` call waits for the gate before answering `pending`. */
export const CLOSE_GATE_DEFAULT_WAIT_MS = 20_000;

/** How long a gate run may take before it is stopped and reported unverifiable. */
export const CLOSE_GATE_DEFAULT_TIMEOUT_MS = 30 * 60_000;

/** Local gates one machine runs at once; the others queue. */
export const CLOSE_GATE_DEFAULT_MAX_CONCURRENT = 1;

/** The check conclusions that certify, and the ones that condemn. */
export const CLOSE_GATE_PASSING_CONCLUSIONS = ['success'] as const;
export const CLOSE_GATE_FAILING_CONCLUSIONS = [
	'failure',
	'cancelled',
	'timed_out',
	'action_required',
	'startup_failure',
	'stale',
] as const;

/** Where `work publish` records the local certification of a landed merge, under the git directory. */
export const LANDING_CERTIFICATION_DIRECTORY = 'delendai-certify/passed';

/** How many recent pull requests are searched for a head with the slice's tree. */
export const CLOSE_GATE_PULL_REQUEST_SEARCH_LIMIT = 50;
