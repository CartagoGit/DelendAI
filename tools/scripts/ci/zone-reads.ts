/**
 * zone-reads.ts — which test zones a change outside every workspace can
 * break, from what each zone was observed to read.
 *
 * The module graph answers this for code inside the workspaces. It cannot
 * for a file a spec READS instead of importing: the proposals under
 * `docs/delendai/proposals`, `AGENT-BOOTSTRAP.md`, a root config. Until
 * now any such change ran every zone, so a pull request that only edited a
 * proposal paid for all eleven shards. The map records, per zone, the root
 * files it read and the root directories it listed during a full run, and
 * a change reaches a zone only through something that zone touched.
 *
 * Conservative where it could be wrong:
 * - no map, or an unreadable one: run everything;
 * - a file at the repository root, or under `.github/`: run everything
 *   (configuration can affect any zone in ways no read shows);
 * - a changed file reaches a zone that read it;
 * - a file added or removed reaches a zone that listed its directory, so a
 *   new file in a folder a zone scans still reaches that zone;
 * - a file under a zone's own paths reaches that zone.
 *
 * Listing a directory depends on which files it holds, not on what they
 * say. The first map also sent every change to any zone that listed a
 * directory ABOVE it, and `core`, `plugins` and `tools` list `docs/` and
 * `tools/`: a pull request that edited two lint scripts and a proposal ran
 * all eleven shards (#648, 2026-09-29).
 */
import { dirname } from 'node:path';

import type { IRootChange, IZoneReadMap } from './test-zones.interface';

/** A root file or a workflow: nothing can say which zones it reaches. */
export const runsEverything = (path: string): boolean =>
	!path.includes('/') || path.startsWith('.github/');

/**
 * The zones the changed root files can reach, or `undefined` for "run
 * everything".
 */
export const zonesReadingRootFiles = (
	changes: readonly IRootChange[],
	map: IZoneReadMap | undefined,
	ownPaths: Readonly<Record<string, readonly string[]>> = {},
): ReadonlySet<string> | undefined => {
	if (map === undefined) return undefined;
	const zones = new Set<string>();
	for (const change of changes) {
		if (runsEverything(change.path)) return undefined;
		const parent = dirname(change.path);
		for (const [zone, touched] of Object.entries(map.zones)) {
			if (
				touched.read.includes(change.path) ||
				(change.listing && touched.listed.includes(parent))
			) {
				zones.add(zone);
			}
		}
		for (const [zone, paths] of Object.entries(ownPaths)) {
			if (paths.some((dir) => change.path.startsWith(`${dir}/`))) {
				zones.add(zone);
			}
		}
	}
	return zones;
};

/** Parse a committed map; anything unexpected is "no map". */
export const parseZoneReadMap = (
	text: string | undefined,
): IZoneReadMap | undefined => {
	if (text === undefined) return undefined;
	try {
		const parsed = JSON.parse(text) as IZoneReadMap;
		if (
			parsed === null ||
			typeof parsed !== 'object' ||
			typeof parsed.zones !== 'object'
		) {
			return undefined;
		}
		for (const entry of Object.values(parsed.zones)) {
			if (!Array.isArray(entry.read) || !Array.isArray(entry.listed))
				return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
};
