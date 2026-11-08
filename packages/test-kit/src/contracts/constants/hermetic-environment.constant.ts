/** Every variable delendai reads starts with this. */
export const DELENDAI_VARIABLE_PREFIX = 'DELENDAI_';

/**
 * The delendai variables that configure the test runner itself, not the
 * code under test: the reads recorder and the compute lock's test knobs.
 * Clearing them would change how the run is made, not what a spec sees.
 */
export const TEST_RUNNER_VARIABLE_PREFIXES: readonly string[] = [
	'DELENDAI_RECORD_READS',
	'DELENDAI_TEST_',
];
