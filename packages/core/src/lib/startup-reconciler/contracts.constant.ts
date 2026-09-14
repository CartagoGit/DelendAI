/**
 * Constants for `./contracts`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `contracts.ts` keeps
 * the behaviour, this file keeps the constants. Re-exported from
 * `contracts.ts`, so no import site changes.
 */

/** The two states a boot may end in. There is deliberately no third. */
export const STARTUP_STATUSES = ['READY', 'DEGRADED'] as const;

/**
 * The phases, in execution order. Exported as data because the report
 * lists them and the tests assert the order — a phase that silently
 * stopped running would otherwise be invisible.
 */
export const STARTUP_PHASES = [
	'mutex',
	'environment',
	'state-database',
	'fetch',
	'work-refs',
	'forge',
	'journal',
	'integration-evidence',
	'leases',
	'checkout',
	'governance',
	'verdict',
] as const;

/** Current `IStartupReconciliationReport.reconcilerVersion`. */
export const STARTUP_RECONCILER_VERSION = 1;
