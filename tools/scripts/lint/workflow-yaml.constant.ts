/**
 * Every key GitHub accepts inside a job. Anything else means the file
 * will be rejected wholesale — see the `unknown key` finding in
 * `workflow-yaml.script.ts`.
 */
export const KNOWN_JOB_KEYS: ReadonlySet<string> = new Set([
	'concurrency',
	'container',
	'continue-on-error',
	'defaults',
	'env',
	'environment',
	'if',
	'name',
	'needs',
	'outputs',
	'permissions',
	'runs-on',
	'secrets',
	'services',
	'steps',
	'strategy',
	'timeout-minutes',
	'uses',
	'with',
]);

/**
 * The longest a job may declare. The slowest job of a full `ci.yml` run
 * took about seven minutes on 2026-09-25; an hour leaves room for a slow
 * runner while still bounding a hung one.
 */
export const MAX_JOB_TIMEOUT_MINUTES = 60;
