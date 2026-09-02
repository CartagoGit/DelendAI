/**
 * Consecutive identical push failures before the automatic path stops.
 *
 * Three: enough that a genuinely flaky remote gets more than one chance,
 * few enough that a policy refusal is caught in minutes rather than
 * being retried for hours.
 */
export const PUSH_CIRCUIT_THRESHOLD = 3;
