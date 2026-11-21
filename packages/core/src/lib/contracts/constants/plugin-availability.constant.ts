/**
 * Whether a plugin can work in this project, as one of a fixed set:
 *
 * - `library`: offers nothing callable itself; other plugins build on it.
 * - `needs-configuration`: an option it cannot work without is missing.
 * - `needs-installation`: something outside delendai must be installed.
 * - `needs-host-adapter`: the host lacks a port it needs (a subagent
 *   runtime, a browser), so its tools only plan or refuse.
 * - `registered`: loaded, and nothing has proved it works here yet.
 * - `verified`: its read-only probe passed.
 * - `degraded`: it answered, but with a fault.
 */
export const PLUGIN_AVAILABILITY_STATES = [
	'library',
	'needs-configuration',
	'needs-installation',
	'needs-host-adapter',
	'registered',
	'verified',
	'degraded',
] as const;
