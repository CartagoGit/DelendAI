/**
 * section-health.ts — the integration branch is red per section, not as
 * a whole.
 *
 * Measured from 2026-11-02 to 2026-11-08: develop read red for 81 of 141
 * hours, in 16 episodes, one of them 66 hours long, and every red run held
 * the whole queue while the failure sat in one zone (a timing spec in
 * compute-slot, reclaim, maintenance-lease or record-buffer). A section is
 * a test zone. The promotion's full run names the zones it found red in
 * the urgent repair it files; a red zone holds only the candidates whose
 * scope reaches it, and its repair: the candidate whose own run of that
 * zone passed. Every other candidate and train keeps landing. A zone is
 * green again once a pull request that ran it green has landed.
 *
 * Pure: the forge and git are read by the caller.
 */
import type { ISectionCheckRun } from './section-health.interface';

/** The title every urgent repair of a red promotion starts with. */
export const REPAIR_TITLE_PREFIX = 'urgent repair:';

const CHECK_PREFIX = 'tests: ';
const ZONES_LINE = /^red zones: (.*)$/mu;
const FAILED = new Set(['failure', 'timed_out']);

/**
 * The zone a `tests: <zone>` check reports, shards and readers included
 * (`tests: core 2/4`, `tests: core readers`); `undefined` for any other.
 */
export const zoneOfCheck = (name: string): string | undefined =>
	name.startsWith(CHECK_PREFIX)
		? name.slice(CHECK_PREFIX.length).split(' ')[0] || undefined
		: undefined;

const byZone = (
	checks: readonly ISectionCheckRun[],
): ReadonlyMap<string, readonly ISectionCheckRun[]> => {
	const zones = new Map<string, ISectionCheckRun[]>();
	for (const check of checks) {
		const zone = zoneOfCheck(check.name);
		if (zone !== undefined)
			zones.set(zone, [...(zones.get(zone) ?? []), check]);
	}
	return zones;
};

/** The zones with a shard that failed. Sorted. */
export const failedZonesOf = (
	checks: readonly ISectionCheckRun[],
): readonly string[] =>
	[...byZone(checks)]
		.filter(([, runs]) =>
			runs.some((run) => FAILED.has(run.conclusion ?? '')),
		)
		.map(([zone]) => zone)
		.sort();

/** The zones every shard of which ran and passed. */
export const passedZonesOf = (
	checks: readonly ISectionCheckRun[],
): ReadonlySet<string> =>
	new Set(
		[...byZone(checks)]
			.filter(([, runs]) =>
				runs.every((run) => run.conclusion === 'success'),
			)
			.map(([zone]) => zone),
	);

/** The line of a repair's body that names its red zones. */
export const redZonesLine = (zones: readonly string[]): string =>
	`red zones: ${zones.length === 0 ? '(none named)' : zones.join(', ')}`;

/** The red zones a repair's body names. */
export const redZonesOf = (body: string): readonly string[] =>
	(ZONES_LINE.exec(body)?.[1] ?? '')
		.split(',')
		.map((zone) => zone.trim())
		.filter((zone) => zone.length > 0 && zone !== '(none named)');

/**
 * Whether a red zone holds a candidate. `zones` is what its change reaches,
 * `undefined` for every zone; `passed` the zones its own run passed. It is
 * held by the red zones it reaches and did not run green itself.
 */
export const sectionHold = (input: {
	readonly red: ReadonlySet<string>;
	readonly zones: ReadonlySet<string> | undefined;
	readonly passed: ReadonlySet<string>;
}): readonly string[] =>
	[...input.red]
		.filter(
			(zone) =>
				(input.zones === undefined || input.zones.has(zone)) &&
				!input.passed.has(zone),
		)
		.sort();

/** The red zones no landed pull request has run green since. */
export const zonesStillRed = (
	red: readonly string[],
	landed: readonly ReadonlySet<string>[],
): readonly string[] =>
	red.filter((zone) => !landed.some((passed) => passed.has(zone)));

/** A repair's body with its red zones line replaced by `zones`. */
export const withRedZones = (body: string, zones: readonly string[]): string =>
	ZONES_LINE.test(body)
		? body.replace(ZONES_LINE, redZonesLine(zones))
		: `${body}\n\n${redZonesLine(zones)}`;
