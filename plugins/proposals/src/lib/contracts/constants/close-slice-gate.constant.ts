/** How long one `close_slice` call waits for the gate before answering `pending`. */
export const CLOSE_GATE_DEFAULT_WAIT_MS = 20_000;

/** How long a gate run may take before it is stopped and reported unverifiable. */
export const CLOSE_GATE_DEFAULT_TIMEOUT_MS = 30 * 60_000;
