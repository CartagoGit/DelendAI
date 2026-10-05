/** The flags `delendai doctor` reads, without `--`. */
export const DOCTOR_FLAGS = ['ci', 'offline', 'deep'] as const;

/**
 * What each `doctor` exit code means for a pipeline. Documented in the
 * `--ci` report so a CI step does not have to read the source to know
 * which codes fail a build.
 */
export const DOCTOR_CI_EXIT_MEANING = {
	ok: 'healthy: no warning and no error section',
	warn: 'warn-only: a non-fatal quality regression (P1)',
	error: 'error: at least one P0 finding',
	'not-applicable': 'healthy: nothing applicable was found unhealthy',
} as const;

/** Finding of a section that was not run because `--offline` is set. */
export const DOCTOR_OFFLINE_SKIP_FINDING =
	'skipped: needs the network and --offline is set';

/** Name of the section that reports the error-reporting self-test. */
export const ERROR_REPORTING_SELF_TEST_SECTION = 'error-reporting-self-test';

/** Module the self-test is imported from, when the plugin is resolvable. */
export const ERROR_REPORTING_PUBLIC_MODULE = '@delendai/error-reporting/public';

/** Prefix of the throwaway directory the self-test writes its probe into. */
export const SELF_TEST_PROBE_DIR_PREFIX = 'delendai-doctor-selftest-';

/** Repository the self-test reads (never writes) when it exercises `gh`. */
export const SELF_TEST_TARGET_REPO = 'CartagoGit/delendai';
